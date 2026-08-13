// tests/regresion20.js — Tanda de eventos (parte 1): Esfuerzo dividido.
//
// Evento multi-hook migrado al DSL. Estrena varias piezas del intérprete:
//   · ELEGIR guardaIdsEnSelf: guarda los 2 elegidos como lista en la carta.
//   · AURA soloSelfLista + marcar (array): Oculto + agotado a los elegidos.
//   · trigger AL_MORIR_ALIADO: el Evento se destruye si muere un elegido.
//   · trigger AL_DESTRUIR: limpieza al destruirlo (Giro de guion) o al expirar.
//   · op RETRIBUCION y _pool selfLista.
//
// La vieja elegía los 2 aliados con el flujo antiguo SELECT_ABILITY_TARGETS; la
// nueva con reborde verde en tablero (ELEGIR). El {elegir} polimórfico del harness
// conduce ambos. El log de la elección pasa a 3ª persona con dueño (norma).
//
// Cobertura: escenario 1 prueba ELEGIR guardaIdsEnSelf + AURA soloSelfLista+marcar;
// escenario 2 prueba AL_DESTRUIR (limpieza al reemplazar el Evento) + _pool selfLista
// + MARCAR. Pendientes de escenario propio (difíciles de guionizar: los elegidos
// quedan Ocultos y no son atacables normalmente / la expiración es multi-turno):
// AL_MORIR_ALIADO (destruirse si muere un elegido — pero su acción, destroyEvent →
// AL_DESTRUIR, SÍ está cubierta por el escenario 2) y AL_CADUCAR+RETRIBUCION al
// expirar (el op RETRIBUCION es trivial; la limpieza AL_CADUCAR usa los mismos
// MARCAR+selfLista ya cubiertos). Ambos triggers verificados además por inspección.

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'Esfuerzo dividido: escoge 2 aliados y quedan Ocultos y agotados',
        p1: { vanguardia: ['Mini-tigre', 'Oso con armadura', 'Robot de seguridad SP'], mano: ['Esfuerzo dividido'] },
        p2: { vanguardia: ['Droide antidisturbios'] },
        pasos: [
            { jugar: 'Esfuerzo dividido' },
            { elegir: ['Mini-tigre', 'Oso con armadura'] },
        ],
        logsIntencionados: [
            { de: '¡Mini-tigre y Oso con armadura se ocultan para dividir el esfuerzo!',
              a: '¡Mini-tigre [1] de J1 (Jugador 1) y Oso con armadura [1] de J1 (Jugador 1) se ocultan para dividir el esfuerzo!',
              motivo: 'norma del proyecto (3ª persona con dueño): la vieja usaba t1.name/t2.name a secas; la nueva rellena {elegidos} con DSL._nombre (nombre + copyId + dueño)' },
        ],
        logsSoloVieja: [
            { linea: 'Objetivo 1 fijado. Elige al siguiente objetivo.',
              motivo: 'mensaje genérico del flujo viejo SELECT_ABILITY_TARGETS (como en r7/r17); la nueva elige con ELEGIR/tablero, que no lo emite' },
            { linea: 'Objetivos listos. ¡Ejecutando habilidad!',
              motivo: 'igual: mensaje genérico del motor viejo al completar la selección de objetivos' },
        ],
    },
    {
        nombre: 'Esfuerzo dividido: al destruirla (Giro de guion la reemplaza) se limpia Oculto/agotamiento',
        p1: { vanguardia: ['Mini-tigre', 'Oso con armadura', 'Robot de seguridad SP'],
              mano: ['Esfuerzo dividido', 'Giro de guion'] },
        p2: { vanguardia: ['Droide antidisturbios'] },
        pasos: [
            { jugar: 'Esfuerzo dividido' },
            { elegir: ['Mini-tigre', 'Oso con armadura'] },
            { jugar: 'Giro de guion' }, // canReplaceEvent -> destruye Esfuerzo -> AL_DESTRUIR limpia a los elegidos
        ],
        logsIntencionados: [
            { de: '¡Mini-tigre y Oso con armadura se ocultan para dividir el esfuerzo!',
              a: '¡Mini-tigre [1] de J1 (Jugador 1) y Oso con armadura [1] de J1 (Jugador 1) se ocultan para dividir el esfuerzo!',
              motivo: 'norma del proyecto (3ª persona con dueño), igual que el escenario anterior' },
        ],
        logsSoloVieja: [
            { linea: '¡Giro de guion! ¡El tablero cambia drásticamente!', motivo: 'REORDENAMIENTO INTENCIONADO (Toto, 13-ago-2026): Giro de guion dice "Antes de colocarla" y su codigo lo hacia DESPUES (destruia el Evento rival en AL_JUGAR). Movido a ANTES_DE_JUGAR, su anuncio y las destrucciones van ahora ANTES del "juega el Evento". Mismas lineas, otro orden: se retiran como par completo' },
            { linea: 'ha sido destruido prematuramente', motivo: 'REORDENAMIENTO INTENCIONADO (Toto, 13-ago-2026): Giro de guion dice "Antes de colocarla" y su codigo lo hacia DESPUES (destruia el Evento rival en AL_JUGAR). Movido a ANTES_DE_JUGAR, su anuncio y las destrucciones van ahora ANTES del "juega el Evento". Mismas lineas, otro orden: se retiran como par completo' },
            { linea: 'juega el Evento: Giro de guion', motivo: 'REORDENAMIENTO INTENCIONADO (Toto, 13-ago-2026): Giro de guion dice "Antes de colocarla" y su codigo lo hacia DESPUES (destruia el Evento rival en AL_JUGAR). Movido a ANTES_DE_JUGAR, su anuncio y las destrucciones van ahora ANTES del "juega el Evento". Mismas lineas, otro orden: se retiran como par completo' },
            { linea: 'Objetivo 1 fijado. Elige al siguiente objetivo.',
              motivo: 'mensaje genérico del flujo viejo SELECT_ABILITY_TARGETS' },
            { linea: 'Objetivos listos. ¡Ejecutando habilidad!',
              motivo: 'igual: mensaje genérico del motor viejo' },
        ],
        logsSoloNueva: [
            { linea: '¡Giro de guion! ¡El tablero cambia drásticamente!', motivo: 'REORDENAMIENTO INTENCIONADO (Toto, 13-ago-2026): Giro de guion dice "Antes de colocarla" y su codigo lo hacia DESPUES (destruia el Evento rival en AL_JUGAR). Movido a ANTES_DE_JUGAR, su anuncio y las destrucciones van ahora ANTES del "juega el Evento". Mismas lineas, otro orden: se retiran como par completo' },
            { linea: 'ha sido destruido prematuramente', motivo: 'REORDENAMIENTO INTENCIONADO (Toto, 13-ago-2026): Giro de guion dice "Antes de colocarla" y su codigo lo hacia DESPUES (destruia el Evento rival en AL_JUGAR). Movido a ANTES_DE_JUGAR, su anuncio y las destrucciones van ahora ANTES del "juega el Evento". Mismas lineas, otro orden: se retiran como par completo' },
            { linea: 'juega el Evento: Giro de guion', motivo: 'REORDENAMIENTO INTENCIONADO (Toto, 13-ago-2026): Giro de guion dice "Antes de colocarla" y su codigo lo hacia DESPUES (destruia el Evento rival en AL_JUGAR). Movido a ANTES_DE_JUGAR, su anuncio y las destrucciones van ahora ANTES del "juega el Evento". Mismas lineas, otro orden: se retiran como par completo' },
        ],
    },
];

correrSuite('regresion20', escenarios);
