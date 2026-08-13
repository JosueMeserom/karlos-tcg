// tests/regresion62.js — Bancarrota migrada al DSL (31-jul-2026). Era la ÚLTIMA de las
// "pieza pequeña" que quedaban de la auditoría, y necesitaba las tres que se le habían estimado:
//
//   · Ops `SECUESTRAR_STAT` / `DEVOLVER_STAT`: guardan un stat "en el bolsillo" dejándolo a un
//     valor fijo, y lo reponen. Van SIEMPRE en pareja — sin el segundo, el original se perdería.
//     El campo donde se guarda viaja en el estado exportado, así que DEVOLVER_STAT lo borra para
//     no dejar rastro una vez usado (igual que hacía la imperativa con su `delete`).
//   · Trigger `GLOBAL_ANTES_DE_CAMBIO_STAT` -> onGlobalBeforeStatChange: intercepta CUALQUIER
//     cambio de stat mientras el Evento viva. No confundir con `GLOBAL_MODIFICAR_FUROR`, que solo
//     mira la ganancia de la fase de Furor: esta carta tiene que atajar también las subidas y
//     bajadas que vengan de efectos de carta, y esas pasan por modifyStat.
//   · `valorCampo` en PREVIEW_GLOBAL: mete en {valor} un campo de la carta AFECTADA, para que la
//     línea del detalle diga el Furor original de CADA una. Hasta ahora el texto de una línea
//     global solo sabía interpolar el género, que es el mismo para todas.
//
// AL_DESTRUIR repite el efecto de AL_CADUCAR: si la destruyen antes de tiempo (Giro de guion), el
// Furor tiene que volver igual. La imperativa lo resolvía llamando a su propio onExpire.
//
// INCOHERENCIA DE LA CARTA, UNIFICADA a petición de Toto (5-ago-2026): el secuestro y el bloqueo
// alcanzaban a TODAS las cartas, incluidas las inmunes a Eventos enemigos, mientras que la línea
// del detalle SÍ las excluía — la carta decía "no te afecto" y te vaciaba el Furor igual. Ahora
// el veto vive en DSL._pool (punto único por el que pasan todos los objetivos de un Evento) y en
// el interceptor GLOBAL_ANTES_DE_CAMBIO_STAT, así que vale para cualquier Evento, presente o
// futuro, sin que cada carta tenga que acordarse. Ver el escenario de Eris.

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        // El secuestro: al colocarla, todo el mundo a 0 y el original guardado.
        nombre: 'Bancarrota: al colocarse, congela el Furor de AMBOS jugadores a 0',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Karlos', furor: 3 }, { carta: 'Mini-tigre', furor: 1 }], mano: ['Bancarrota'] },
        p2: { vanguardia: [{ carta: 'Oso con armadura', furor: 2 }], retaguardia: [{ carta: 'Guardia', furor: 4 }] },
        pasos: [ { jugar: 'Bancarrota' } ],
    },
    {
        // El bloqueo: mientras está en juego, la fase de Furor no da nada.
        nombre: 'Bancarrota: nadie gana Furor mientras esté en juego',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Karlos', furor: 3 }], mano: ['Bancarrota'] },
        p2: { vanguardia: [{ carta: 'Oso con armadura', furor: 2 }] },
        pasos: [
            { jugar: 'Bancarrota' },
            { finTurno: true }, { finTurno: true }, // dos fases de Furor completas
        ],
    },
    {
        // El ciclo entero: 3 turnos de duración y el Furor vuelve a su dueño al expirar.
        nombre: 'Bancarrota: al expirar, cada carta recupera su Furor original',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Karlos', furor: 3 }], mano: ['Bancarrota'] },
        p2: { vanguardia: [{ carta: 'Oso con armadura', furor: 2 }] },
        pasos: [
            { jugar: 'Bancarrota' },
            { finTurno: true }, { finTurno: true },
            { finTurno: true }, { finTurno: true },
            { finTurno: true }, { finTurno: true }, // agota los 3 turnos de duración
        ],
    },
    {
        // Destrucción prematura: Giro de guion destruye los Eventos de AMBOS jugadores. El Furor
        // debe volver igual que al expirar (AL_DESTRUIR repite el mismo efecto que AL_CADUCAR).
        // Giro de guion exige tener ya un Evento propio, de ahí el Apagón de p2: es solo el
        // billete de entrada, lo que se prueba es que la Bancarrota de p1 suelte el Furor.
        // INCOHERENCIA UNIFICADA (Toto, 5-ago-2026), ya no replicada: Eris declara "Inmune a
        // Eventos enemigos" y la vieja se lo congelaba igual — solo la línea del detalle la
        // respetaba, o sea que la carta decía "no te afecto" mientras le vaciaba el Furor. El
        // veto se ha puesto en DSL._pool (todo target de un Evento pasa por ahí) y en el
        // interceptor GLOBAL_ANTES_DE_CAMBIO_STAT, así que alcanza a cualquier Evento futuro,
        // no solo a esta carta. El Oso, que no es inmune, sí se congela: es el control.
        nombre: 'Bancarrota NO congela a un enemigo inmune a Eventos enemigos (Eris)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Karlos', furor: 3 }], mano: ['Bancarrota'] },
        p2: { vanguardia: [{ carta: 'Eris', furor: 2 }, { carta: 'Oso con armadura', furor: 2 }] },
        pasos: [ { jugar: 'Bancarrota' } ],
        diferenciasEsperadas: [
            { contiene: 'p2.vanguard.0.furor', motivo: 'la vieja congelaba a Eris a 0 pese a su inmunidad a Eventos enemigos; la nueva se la respeta' },
            { contiene: 'p2.vanguard.0.bankruptStoredFuror', motivo: 'ídem: la vieja le guardaba el Furor en el bolsillo, la nueva ni la toca' },
        ],
    },
    {
        nombre: 'Bancarrota: si la destruyen antes de tiempo, el Furor vuelve igualmente',
        turno: 2, turnoDe: 'p2', empieza: 'p1',
        p1: { vanguardia: [{ carta: 'Karlos', furor: 3 }], evento: 'Bancarrota' },
        p2: { vanguardia: [{ carta: 'Oso con armadura', furor: 2 }], evento: 'Apagón', mano: ['Giro de guion'] },
        pasos: [ { jugar: 'Giro de guion' } ],
        logsSoloVieja: [
            { linea: '¡Giro de guion! ¡El tablero cambia drásticamente!', motivo: 'REORDENAMIENTO INTENCIONADO (Toto, 13-ago-2026): Giro de guion dice "Antes de colocarla" y su codigo lo hacia DESPUES (destruia el Evento rival en AL_JUGAR). Movido a ANTES_DE_JUGAR, su anuncio y las destrucciones van ahora ANTES del "juega el Evento". Mismas lineas, otro orden: se retiran como par completo' },
            { linea: 'ha sido destruido prematuramente', motivo: 'REORDENAMIENTO INTENCIONADO (Toto, 13-ago-2026): Giro de guion dice "Antes de colocarla" y su codigo lo hacia DESPUES (destruia el Evento rival en AL_JUGAR). Movido a ANTES_DE_JUGAR, su anuncio y las destrucciones van ahora ANTES del "juega el Evento". Mismas lineas, otro orden: se retiran como par completo' },
            { linea: 'juega el Evento: Giro de guion', motivo: 'REORDENAMIENTO INTENCIONADO (Toto, 13-ago-2026): Giro de guion dice "Antes de colocarla" y su codigo lo hacia DESPUES (destruia el Evento rival en AL_JUGAR). Movido a ANTES_DE_JUGAR, su anuncio y las destrucciones van ahora ANTES del "juega el Evento". Mismas lineas, otro orden: se retiran como par completo' },
        ],
        logsSoloNueva: [
            { linea: '¡Giro de guion! ¡El tablero cambia drásticamente!', motivo: 'REORDENAMIENTO INTENCIONADO (Toto, 13-ago-2026): Giro de guion dice "Antes de colocarla" y su codigo lo hacia DESPUES (destruia el Evento rival en AL_JUGAR). Movido a ANTES_DE_JUGAR, su anuncio y las destrucciones van ahora ANTES del "juega el Evento". Mismas lineas, otro orden: se retiran como par completo' },
            { linea: 'ha sido destruido prematuramente', motivo: 'REORDENAMIENTO INTENCIONADO (Toto, 13-ago-2026): Giro de guion dice "Antes de colocarla" y su codigo lo hacia DESPUES (destruia el Evento rival en AL_JUGAR). Movido a ANTES_DE_JUGAR, su anuncio y las destrucciones van ahora ANTES del "juega el Evento". Mismas lineas, otro orden: se retiran como par completo' },
            { linea: 'juega el Evento: Giro de guion', motivo: 'REORDENAMIENTO INTENCIONADO (Toto, 13-ago-2026): Giro de guion dice "Antes de colocarla" y su codigo lo hacia DESPUES (destruia el Evento rival en AL_JUGAR). Movido a ANTES_DE_JUGAR, su anuncio y las destrucciones van ahora ANTES del "juega el Evento". Mismas lineas, otro orden: se retiran como par completo' },
        ],
    },
];

correrSuite('regresion62', escenarios);
