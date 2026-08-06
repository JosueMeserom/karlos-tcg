// tests/regresion63.js — el op `CUENTA_ATRAS` (5-ago-2026): Diego Antonio y Meca EBA.
//
// Las tres cartas con "reloj propio" (Diego Antonio, Meca EBA y K.I.N.O.) llevaban cada una su
// copia del mismo bucle a mano: bajar una unidad al final de tu turno, mirar si ha llegado a 0,
// matar a la carta. `CUENTA_ATRAS` es esa pieza, con dos variantes que salieron de las propias
// cartas:
//   · sobre un CONTADOR con nombre (Diego Antonio: "Turnos de Cólera", que el jugador ve como
//     insignia en la carta),
//   · sobre un STAT (Meca EBA: su reloj ES el Furor, no un contador aparte).
// Y con la puerta que las dos necesitaban por motivos distintos: `salvoSi`, una condición que
// congela el tic de ese turno -PACIFISMO en Diego, tener piloto emplazado en el Meca-, más
// `consumirTrasSaltar` para las banderas que valen UN turno y se gastan al usarse.
//
// NO se migra K.I.N.O., que era la tercera candidata: su reloj sí encaja, pero lo que hace al
// llegar a 0 es FORZAR UN INTERCAMBIO con la retaguardia, y la familia "swap" es de las
// irreducibles del §6 del doc de diseño (la comparten Mill, Xanadu y Silhouette). Migrarle solo
// el tic la dejaría peor: el contador se gestionaría desde dos sitios a la vez. Si algún día se
// construye `INTERCAMBIAR_POSICION`, K.I.N.O. entra con las otras tres de una tacada.
//
// Lo que se queda imperativo en las dos migradas, y por qué:
//   · Diego Antonio: el veto de colocación mira un EVENTO en juego ('Una buena razón') y los
//     `requisitos` del DSL solo saben contar CARTAS en zonas; y la inversión de daño
//     (onBeforeTakeDamage) no tiene trigger — es la única carta del juego que la usa.
//   · Meca EBA: el veto de ganancia pasiva de Furor (onBeforeGainFuror, sin trigger) y EMPLAZAR
//     PILOTO (swap, misma familia irreducible que arriba).

'use strict';
const { correrSuite } = require('./harness');

// La imperativa avisaba del rechazo con logMsg (público, entra en el historial); el requisito
// genérico de coste del compilador usa logError (privado, no historiado) — misma estandarización
// a "sin prompt público" ya aplicada en Aniceto, Hechicero y Gólem de tierra.
const RECHAZO_PRIVADO = [
    { linea: 'Falta Furor (3).', motivo: 'la vieja lo anunciaba en público con logMsg; el rechazo genérico del DSL es privado (logError)' },
];
// Norma del proyecto: todo log visible por ambos va en 3ª persona con el nombre completo. Las
// imperativas usaban `card.name` a secas; el DSL rellena {carta} con DSL._nombre.
const LOG_TERCERA_PERSONA = [
    { de: '¡PACIFISMO! Diego Antonio no pierde contador', a: '¡PACIFISMO! Diego Antonio de J1 (Jugador 1) no pierde contador',
      motivo: 'norma de logs en 3ª persona con dueño: la vieja usaba card.name a secas, el DSL rellena {carta} con DSL._nombre' },
];
const LOG_TERCERA_PERSONA_MECA = [
    { de: '¡A Meca EBA se le agotó la energía por completo y se desploma!', a: '¡A Meca EBA [1] de J1 (Jugador 1) se le agotó la energía por completo y se desploma!',
      motivo: 'norma de logs en 3ª persona con dueño' },
];
// La muerte por reloj agotado pasa ahora por el mismo cauce que el resto de destrucciones sin
// Retribución del DSL (vaciar + sinRetribucion), que pinta "DESTRUIDO". Las imperativas asignaban
// currentHp = 0 a pelo y no avisaban de nada.
const FLOTANTE_DESTRUIDO = [
    { linea: 'DESTRUIDO', motivo: 'las imperativas mataban la carta en silencio; el op comparte el aviso de las demás destrucciones sin Retribución' },
];

const escenarios = [
    {
        // El tic: baja 1 al final de SU turno y nada en el del rival.
        nombre: 'Diego Antonio: el reloj baja 1 al final de su turno, no del rival',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Diego Antonio', furor: 3, campos: { counters: { diego_timer: { count: 3, name: 'Turnos de Cólera', icon: '⏳' } } } }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { finTurno: true }, { finTurno: true } ],
    },
    {
        // PACIFISMO congela el tic de ESE turno, y la bandera se gasta al usarse.
        nombre: 'Diego Antonio: PACIFISMO congela el reloj un turno y se consume',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Diego Antonio', furor: 3, campos: { counters: { diego_timer: { count: 3, name: 'Turnos de Cólera', icon: '⏳' } } } }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { habilidad: 'Diego Antonio' }, { confirmar: true },
            { finTurno: true }, { finTurno: true },   // congelado: sigue en 3
            { finTurno: true }, { finTurno: true },   // bandera gastada: baja a 2
        ],
        logsIntencionados: LOG_TERCERA_PERSONA,
    },
    {
        nombre: 'Diego Antonio: PACIFISMO rechazado sin Furor suficiente',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Diego Antonio', furor: 2, campos: { counters: { diego_timer: { count: 3, name: 'Turnos de Cólera', icon: '⏳' } } } }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { habilidad: 'Diego Antonio' } ],
        logsSoloVieja: RECHAZO_PRIVADO,
    },
    {
        // Meca EBA: misma pieza, variante sobre un STAT (su reloj ES el Furor).
        nombre: 'Meca EBA: entra con 1 de Furor y lo consume al final de cada turno propio',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { mano: ['Meca EBA'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { jugar: 'Meca EBA' } ],
    },
    {
        nombre: 'Meca EBA: al quedarse sin Furor se desploma, sin dar Retribución',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Meca EBA', furor: 2 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 20 }] },
        pasos: [
            { finTurno: true }, { finTurno: true },   // 2 -> 1
            { finTurno: true }, { finTurno: true },   // 1 -> 0, se desploma
        ],
        logsIntencionados: LOG_TERCERA_PERSONA_MECA,
        flotantesSoloNueva: FLOTANTE_DESTRUIDO,
    },
];

correrSuite('regresion63', escenarios);
