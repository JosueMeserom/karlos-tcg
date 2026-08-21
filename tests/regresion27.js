// tests/regresion27.js — Poción revitalizante migrada al DSL (27-jul-2026).
//
// Única violación conocida que quedaba de la norma de targeting en tablero (ver
// [[norma-targeting-en-tablero]]): la imperativa elegía el aliado a revitalizar con
// el modal genérico (openVisualSearchModal), en vez de selección en tablero.
//
// Piezas nuevas del intérprete en esta migración:
//   · `duracion` en MARCAR_TEMPORAL (opt-in): estampa `duration`/`turnApplied` en la
//     marca al crearla. Decrementar la cuenta atrás sigue siendo del propio
//     onEndTurnTempEffect imperativo de la carta — no hay (ni compensa crear para una
//     sola carta) un trigger DSL genérico de cuenta atrás de varios turnos.
//   · `sinMarcaTemporalPropia` en `requisitos`/`ELEGIR` YA EXISTÍA (Rebobinar la usaba);
//     esta carta es la primera en usarla en AMBOS sitios a la vez (gate de colocación +
//     filtro del pool), para el "no acumulable en el mismo aliado".
//
// Diferencias intencionadas: elegir el aliado pasa del modal genérico a selección en
// tablero (reborde verde, cancelable — la vieja también dejaba cancelar, así que esto
// no cambia). El log de "bebe la Poción" y el de "se han desvanecido" pasan a nombrar
// al aliado con DSL._nombre (formato "de JX (Nick)"), igual que el resto del log tras
// el cambio de formato unificado de esta sesión — la vieja usaba target.name a secas.

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'Bebe la Poción: +1 Atq/+1 Def durante 3 turnos',
        diferenciasEsperadas: [
            { contiene: 'tempEffects.0.stats', motivo: 'la marca ahora LLEVA ESCRITO el +1/+1 (`stats`) en vez de aplicarlo un onUpdateTempEffect a mano de la carta (21-ago-2026). Mismo bono; cambia dónde está dicho' },
            { contiene: 'tempEffects.0.caduca', motivo: 'y su caducidad va declarada (`caduca`): esta carta descuenta al FIN del turno de quien la jugó, y el despachador de fases la descuenta ahí. El escenario de "expira tras 3 turnos" pasa idéntico, que es la prueba de que se comporta igual' },
        ],
        p1: { vanguardia: ['Mini-tigre'], mano: ['Poción revitalizante'] },
        p2: { vanguardia: ['Robot de seguridad SP'] },
        pasos: [
            { jugar: 'Poción revitalizante' },
            { elegir: ['Mini-tigre'] },
        ],
        logsIntencionados: [
            { de: '¡Mini-tigre bebe la Poción revitalizante! (+1 Atq, +1 Def por 3 turnos).',
              a: '¡Mini-tigre [1] de J1 (Jugador 1) bebe la Poción revitalizante! (+1 Atq, +1 Def por 3 turnos).',
              motivo: 'la vieja usaba target.name a secas; la nueva rellena {objetivo} con DSL._nombre (formato "de JX" tras el cambio de esta sesión)' },
        ],
    },
    {
        nombre: 'Elección cancelada: la carta no se consume',
        p1: { vanguardia: ['Mini-tigre'], mano: ['Poción revitalizante'] },
        p2: { vanguardia: ['Robot de seguridad SP'] },
        pasos: [
            { jugar: 'Poción revitalizante' },
            { cancelar: true },
        ],
    },
    {
        nombre: 'Rechazada si el único aliado ya tiene el efecto activo',
        diferenciasEsperadas: [
            { contiene: 'tempEffects.0.stats', motivo: 'la marca ahora LLEVA ESCRITO el +1/+1 (`stats`) en vez de aplicarlo un onUpdateTempEffect a mano de la carta (21-ago-2026). Mismo bono; cambia dónde está dicho' },
            { contiene: 'tempEffects.0.caduca', motivo: 'y su caducidad va declarada (`caduca`): esta carta descuenta al FIN del turno de quien la jugó, y el despachador de fases la descuenta ahí. El escenario de "expira tras 3 turnos" pasa idéntico, que es la prueba de que se comporta igual' },
        ],
        p1: { vanguardia: ['Mini-tigre'], mano: ['Poción revitalizante', 'Poción revitalizante'] },
        p2: { vanguardia: ['Robot de seguridad SP'] },
        pasos: [
            { jugar: 'Poción revitalizante', indice: 0 },
            { elegir: ['Mini-tigre'] },
            { jugar: 'Poción revitalizante', indice: 0 }, // segunda copia: canPlayCard la rechaza
        ],
        logsIntencionados: [
            { de: '¡Mini-tigre bebe la Poción revitalizante! (+1 Atq, +1 Def por 3 turnos).',
              a: '¡Mini-tigre [1] de J1 (Jugador 1) bebe la Poción revitalizante! (+1 Atq, +1 Def por 3 turnos).',
              motivo: 'idem: cambio de formato de nombre' },
        ],
    },
    {
        nombre: 'No acumulable: con dos aliados, uno ya marcado, el pool excluye al marcado',
        diferenciasEsperadas: [
            { contiene: 'tempEffects.0.stats', motivo: 'la marca ahora LLEVA ESCRITO el +1/+1 (`stats`) en vez de aplicarlo un onUpdateTempEffect a mano de la carta (21-ago-2026). Mismo bono; cambia dónde está dicho' },
            { contiene: 'tempEffects.0.caduca', motivo: 'y su caducidad va declarada (`caduca`): esta carta descuenta al FIN del turno de quien la jugó, y el despachador de fases la descuenta ahí. El escenario de "expira tras 3 turnos" pasa idéntico, que es la prueba de que se comporta igual' },
        ],
        p1: { vanguardia: ['Mini-tigre', 'Oso con armadura'], mano: ['Poción revitalizante', 'Poción revitalizante'] },
        p2: { vanguardia: ['Robot de seguridad SP'] },
        pasos: [
            { jugar: 'Poción revitalizante', indice: 0 },
            { elegir: ['Mini-tigre'] },
            { jugar: 'Poción revitalizante', indice: 0 },
            { elegir: ['Oso con armadura'] }, // Mini-tigre ya no es opción válida
        ],
        logsIntencionados: [
            { de: '¡Mini-tigre bebe la Poción revitalizante! (+1 Atq, +1 Def por 3 turnos).',
              a: '¡Mini-tigre [1] de J1 (Jugador 1) bebe la Poción revitalizante! (+1 Atq, +1 Def por 3 turnos).',
              motivo: 'idem: cambio de formato de nombre' },
            { de: '¡Oso con armadura bebe la Poción revitalizante! (+1 Atq, +1 Def por 3 turnos).',
              a: '¡Oso con armadura [1] de J1 (Jugador 1) bebe la Poción revitalizante! (+1 Atq, +1 Def por 3 turnos).',
              motivo: 'idem: cambio de formato de nombre' },
        ],
    },
    {
        nombre: 'Expira tras 3 turnos propios: stats vuelven a la base y se anuncia',
        p1: { vanguardia: ['Mini-tigre'], mano: ['Poción revitalizante'] },
        p2: { vanguardia: ['Robot de seguridad SP'] },
        pasos: [
            { jugar: 'Poción revitalizante' },
            { elegir: ['Mini-tigre'] },
            { finTurno: true }, // p1 -> p2 (mismo turno de aplicación: no descuenta)
            { finTurno: true }, // p2 -> p1
            { finTurno: true }, // p1 -> p2: 1er turno propio tras aplicarlo, duración 3->2
            { finTurno: true }, // p2 -> p1
            { finTurno: true }, // p1 -> p2: duración 2->1
            { finTurno: true }, // p2 -> p1
            { finTurno: true }, // p1 -> p2: duración 1->0, expira
        ],
        logsIntencionados: [
            { de: '¡Mini-tigre bebe la Poción revitalizante! (+1 Atq, +1 Def por 3 turnos).',
              a: '¡Mini-tigre [1] de J1 (Jugador 1) bebe la Poción revitalizante! (+1 Atq, +1 Def por 3 turnos).',
              motivo: 'idem: cambio de formato de nombre' },
            { de: 'Los efectos de la Poción revitalizante sobre Mini-tigre se han desvanecido.',
              a: 'Los efectos de la Poción revitalizante sobre Mini-tigre [1] de J1 (Jugador 1) se han desvanecido.',
              motivo: 'idem: cambio de formato de nombre (también en el log de expiración, que se queda imperativo)' },
        ],
    },
];

correrSuite('regresion27', escenarios);
