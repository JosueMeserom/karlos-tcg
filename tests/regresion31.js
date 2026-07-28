// tests/regresion31.js — Clarise (PESANTEZ MUTUA) migrada a DSL (28-jul-2026).
//
// Piezas nuevas del intérprete, ambas simétricas a las que estrenó LIDERAZGO:
//   · `vetoAtaqueNormal` en MARCAR_TEMPORAL: la carta marcada no puede hacer ataques
//     NORMALES mientras la marca dure (donde `stats` es un bono continuo, esto es un veto
//     continuo). Compila a un onBeforeAttackTempEffect genérico.
//   · `hastaInicioTurnoLanzador`: la marca caduca al EMPEZAR el turno de quien la puso
//     (marca.ownerId), o sea que cubre exactamente el turno del rival. Distinto de
//     `hastaFinDeTurnoPropio`, que mira al dueño de la carta MARCADA. Compila a un
//     onStartTurnTempEffect genérico.
//   · `tempEffectVetoLog` / `tempEffectExpiraLog` en plantilla: los textos de esos dos
//     hooks. Van en plantilla (no en el op) por la misma razón que el `tempEffectText` del
//     preview: los hooks reciben la MARCA, no el op, y meter strings en la marca los haría
//     viajar en el estado exportado.
//
// El texto de la carta distingue tres casos, y los tres se cubren aquí: ataque normal
// directo (vetado), Habilidad que declara `ataqueNormal` (vetada: "fallarán si involucran
// ataques"), y Habilidad de ataque ESPECIAL (permitida: "sí Habilidades").
//
// Diferencias intencionadas:
//   · El log de "sufre Pesantez Mutua" pasa target.name a {objetivo} con DSL._nombre
//     (formato "de JX (Nick)"), igual que el resto del log tras el cambio de esta sesión.
//   · "está inmovilizado" concuerda ahora con el género de la carta marcada (norma del
//     proyecto); la imperativa decía siempre "inmovilizado".
//   · La marca ya no lleva `type: 'pesantez'` (bookkeeping a medida) sino los flags
//     genéricos, más `duration`/`turnApplied` para que el detalle muestre los turnos
//     restantes — la imperativa no mostraba NADA en "Afectado por:" sobre la Pesantez.

'use strict';
const { correrSuite } = require('./harness');

const LOG_MARCA = {
    de: '¡Mini-tigre sufre Pesantez Mutua! Sus piernas pesan toneladas.',
    a: '¡Mini-tigre [1] de J2 (Jugador 2) sufre Pesantez Mutua! Sus piernas pesan toneladas.',
    motivo: 'la vieja usaba target.name a secas; la nueva rellena {objetivo} con DSL._nombre (formato "de JX")',
};
const DIFS_MARCA = [
    { contiene: 'tempEffects.0.type', motivo: 'la vieja marcaba con `type:"pesantez"` para que sus hooks a mano distinguieran la marca; los hooks genéricos usan los flags declarativos y no lo necesitan' },
    { contiene: 'tempEffects.0.vetoAtaqueNormal', motivo: 'flag nuevo: sustituye al `type` como forma de decir "esta marca veta ataques normales"' },
    { contiene: 'tempEffects.0.hastaInicioTurnoLanzador', motivo: 'flag nuevo: sustituye a la comprobación a mano de `currentTurnPlayerId === effect.ownerId` en el onStartTurnTempEffect imperativo' },
    { contiene: 'tempEffects.0.duration', motivo: 'nuevo: para que "Afectado por:" muestre "(1 turno restante)"; la imperativa no mostraba nada del efecto en el detalle' },
    { contiene: 'tempEffects.0.turnApplied', motivo: 'idem: acompaña a duration, mismo mecanismo que Poción revitalizante/LIDERAZGO' },
];

const escenarios = [
    {
        nombre: 'Clarise: PESANTEZ MUTUA marca a un enemigo de vanguardia',
        p1: { vanguardia: [{ carta: 'Clarise', furor: 1 }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { habilidad: 'Clarise' }, { confirmar: true }, { elegir: ['Mini-tigre'] } ],
        logsIntencionados: [ LOG_MARCA ],
        diferenciasEsperadas: DIFS_MARCA,
    },
    {
        nombre: 'Clarise: PESANTEZ MUTUA también alcanza la retaguardia enemiga',
        p1: { vanguardia: [{ carta: 'Clarise', furor: 1 }] },
        p2: { vanguardia: ['Oso con armadura'], retaguardia: ['Mini-tigre'] },
        pasos: [ { habilidad: 'Clarise' }, { confirmar: true }, { elegir: ['Mini-tigre'] } ],
        logsIntencionados: [ LOG_MARCA ],
        diferenciasEsperadas: DIFS_MARCA,
    },
    {
        nombre: 'Clarise: PESANTEZ MUTUA rechazada sin enemigos en el campo',
        p1: { vanguardia: [{ carta: 'Clarise', furor: 1 }] },
        p2: {},
        pasos: [ { habilidad: 'Clarise' } ],
    },
    {
        // Caso 1 del texto: ataque NORMAL directo desde el tablero -> vetado.
        nombre: 'El marcado NO puede hacer un ataque normal en el turno del rival',
        p1: { vanguardia: [{ carta: 'Clarise', furor: 1 }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { habilidad: 'Clarise' }, { confirmar: true }, { elegir: ['Mini-tigre'] },
            { finTurno: true }, // p1 -> p2: la marca sigue activa durante TODO el turno de p2
            { atacar: 'Mini-tigre', objetivo: 'Clarise' }, // vetado por la Pesantez
        ],
        logsIntencionados: [
            LOG_MARCA,
            { de: '¡PESANTEZ MUTUA! Mini-tigre está inmovilizado y no puede realizar ataques físicos.',
              a: '¡PESANTEZ MUTUA! Mini-tigre [1] de J2 (Jugador 2) está inmovilizado y no puede realizar ataques físicos.',
              motivo: 'cambio de formato de nombre; el género sigue en masculino porque Mini-tigre es de género neutro (no "F")' },
        ],
        diferenciasEsperadas: DIFS_MARCA,
    },
    {
        // Caso 2 del texto: Habilidad que SÍ involucra un ataque normal -> también vetada.
        nombre: 'El marcado tampoco puede usar una Habilidad de ataque normal (CABREO)',
        p1: { vanguardia: [{ carta: 'Clarise', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Hiposaurio', furor: 3 }] },
        pasos: [
            { habilidad: 'Clarise' }, { confirmar: true }, { elegir: ['Hiposaurio'] },
            { finTurno: true },
            { habilidad: 'Hiposaurio' }, { confirmar: true }, { elegir: ['Clarise'] },
        ],
        logsIntencionados: [
            { de: '¡Hiposaurio sufre Pesantez Mutua! Sus piernas pesan toneladas.',
              a: '¡Hiposaurio [1] de J2 (Jugador 2) sufre Pesantez Mutua! Sus piernas pesan toneladas.',
              motivo: 'cambio de formato de nombre' },
            { de: '¡PESANTEZ MUTUA! Hiposaurio está inmovilizado y no puede realizar ataques físicos.',
              a: '¡PESANTEZ MUTUA! Hiposaurio [1] de J2 (Jugador 2) está inmovilizado y no puede realizar ataques físicos.',
              motivo: 'idem: cambio de formato de nombre' },
        ],
        diferenciasEsperadas: DIFS_MARCA.concat([
            { contiene: 'estado.p2.vanguard.0.currentAtk',
              motivo: 'bug de la Hiposaurio VIEJA, ya documentado en regresion28 y corregido por su propia migración: sumaba el bono a mano, llamaba a performAttack (que internamente resetea los stats con updatePassives) y luego restaba el bono otra vez, dejando el Atq por debajo de su base. Aflora aquí porque el ataque queda vetado por la Pesantez a mitad del proceso; la nueva recalcula con updatePassives y acaba correctamente en su base (2)' },
        ]),
    },
    {
        // Caso 3 del texto: Habilidad de ataque ESPECIAL -> permitida ("sí Habilidades").
        nombre: 'El marcado SÍ puede usar una Habilidad de ataque especial (CHIRIBITA)',
        p1: { vanguardia: [{ carta: 'Clarise', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Hechicero', furor: 1 }] },
        pasos: [
            { habilidad: 'Clarise' }, { confirmar: true }, { elegir: ['Hechicero'] },
            { finTurno: true },
            { habilidad: 'Hechicero' }, { confirmar: true }, { elegir: ['Clarise'] },
        ],
        logsIntencionados: [
            { de: '¡Hechicero sufre Pesantez Mutua! Sus piernas pesan toneladas.',
              a: '¡Hechicero [1] de J2 (Jugador 2) sufre Pesantez Mutua! Sus piernas pesan toneladas.',
              motivo: 'cambio de formato de nombre' },
        ],
        diferenciasEsperadas: DIFS_MARCA,
    },
    {
        // La marca cubre el turno del rival y se limpia al volver el turno del lanzador.
        nombre: 'La Pesantez caduca al empezar de nuevo el turno de quien la lanzó',
        p1: { vanguardia: [{ carta: 'Clarise', furor: 1 }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { habilidad: 'Clarise' }, { confirmar: true }, { elegir: ['Mini-tigre'] },
            { finTurno: true }, // p1 -> p2 (marca activa)
            { finTurno: true }, // p2 -> p1: al empezar el turno de p1 (el lanzador), caduca
        ],
        logsIntencionados: [
            LOG_MARCA,
            { de: 'La Pesantez Mutua sobre Mini-tigre desaparece.',
              a: 'La Pesantez Mutua sobre Mini-tigre [1] de J2 (Jugador 2) desaparece.',
              motivo: 'cambio de formato de nombre en el log de expiración' },
        ],
    },
];

correrSuite('regresion31', escenarios);
