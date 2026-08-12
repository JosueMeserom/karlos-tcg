// tests/regresion7.js — Técnicas consumibles con coste de Furor y AL_CONSUMIR:
//   Pago por adelantado (1012), Dobla la ropa (1016), PEM (1017), Rebobinar (1018).
// Nota sobre Rebobinar: se comprobó empíricamente (no solo por lectura) que,
// pese a que MARCAR_TEMPORAL usa hastaFinDeTurnoPropio (se limpia en el propio
// confirmEndTurn) mientras la vieja usaba onStartTurnTempEffect (se limpia al
// INICIO del turno siguiente, sea de quien sea), ambos puntos de limpieza caen
// en el mismo hueco del ciclo de turno: para cuando empieza el turno rival la
// marca ya ha desaparecido en ambas bases. Sin divergencia observable.

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'Pago por adelantado: paga 2 de Furor y contrata al único Mercenario del mazo',
        semilla: 2,
        p1: {
            vanguardia: [{ carta: 'Oso con armadura', furor: 2 }],
            mano: ['Pago por adelantado'],
            mazo: ['Mini-tigre', 'Karlos', 'Robot de seguridad SP'],
        },
        p2: { vanguardia: ['Droide antidisturbios'] },
        pasos: [
            { jugar: 'Pago por adelantado' },
            { elegir: ['Oso con armadura'] }, // pagador
            { elegir: ['Karlos'] },           // mercenario buscado
        ],
        logsIntencionados: [
            { de: 'Barajando el mazo...', a: 'Barajando el mazo de J1 (Jugador 1)...',
              motivo: 'atribución de jugador pedida por Toto (21-jul-2026): los logs de zonas ocultas dicen de quién son; la vieja decía "Barajando el mazo..." a secas' },
            { de: 'Contratas a Karlos desde tu mazo.', a: 'J1 (Jugador 1) contrata a Karlos de J1 (Jugador 1) desde su mazo.',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño/jugador): la vieja usaba nombres a secas o 2ª persona; la nueva usa DSL._nombre / {jugador}' },
        ],
    },
    {
        nombre: 'Pago por adelantado sin Mercenarios en el mazo: el pago se pierde igualmente',
        semilla: 2,
        p1: {
            vanguardia: [{ carta: 'Oso con armadura', furor: 2 }],
            mano: ['Pago por adelantado'],
            mazo: ['Mini-tigre', 'Robot de seguridad SP'],
        },
        p2: { vanguardia: ['Droide antidisturbios'] },
        pasos: [
            { jugar: 'Pago por adelantado' },
            { elegir: ['Oso con armadura'] },
            { soloEn: 'nueva', cancelar: true }, // cierra el visor de mazo vacío (solo la nueva lo abre)
        ],
        logsIntencionados: [
            { de: 'Barajando el mazo...', a: 'Barajando el mazo de J1 (Jugador 1)...',
              motivo: 'atribución de jugador pedida por Toto (21-jul-2026): los logs de zonas ocultas dicen de quién son; la vieja decía "Barajando el mazo..." a secas' },
            { de: 'No quedan Mercenarios en tu mazo.', a: 'No quedan Mercenarios en el mazo de J1 (Jugador 1).',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño/jugador): la vieja usaba nombres a secas o 2ª persona; la nueva usa DSL._nombre / {jugador}' },
        ],
    },
    {
        nombre: 'Dobla la ropa: descarta 3 cartas elegidas y roba 3',

        semilla: 4,
        p1: {
            vanguardia: ['Oso con armadura'],
            mano: ['Dobla la ropa', 'Manzanahoria', 'Longaniza', 'Té helado'],
            mazo: ['Mini-tigre', 'Robot de seguridad SP', 'Droide antidisturbios'],
        },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Dobla la ropa' },
            { elegir: ['Manzanahoria', 'Longaniza', 'Té helado'] },
        ],
        logsIntencionados: [
            { de: 'Dobla la ropa activada: Robas 3 cartas.', a: 'Dobla la ropa activada: J1 (Jugador 1) roba 3 cartas.',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño/jugador): la vieja usaba nombres a secas o 2ª persona; la nueva usa DSL._nombre / {jugador}' },
        ],
    },
    {
        nombre: 'PEM: paga 1 Furor y paraliza a la única Máquina enemiga',
        p1: { vanguardia: [{ carta: 'Oso con armadura', furor: 1 }], mano: ['PEM'] },
        p2: { vanguardia: ['Robot de seguridad SP', 'Mini-tigre'] },
        pasos: [
            { jugar: 'PEM' },
            { elegir: ['Oso con armadura'] },
            { elegir: ['Robot de seguridad SP'] },
        ],
        logsIntencionados: [
            { de: '¡El PEM fríe los circuitos de Robot de seguridad SP! Se saltará', a: '¡El PEM fríe los circuitos de Robot de seguridad SP [1] de J2 (Jugador 2)! Se saltará',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
        logsSoloVieja: [
            { linea: 'Objetivos listos. ¡Ejecutando habilidad!',
              motivo: 'mensaje genérico del motor viejo emitido solo por el flujo SELECT_ABILITY_TARGETS/handleAbilityTargetSelection (habilidades antiguas con abilityContext); el flujo DSL de selección en tablero (_dslPickClick/pickBoardTargets) es un mecanismo distinto que nunca lo emite. Estructural, no específico de esta carta.' },
        ],
    },
    {
        nombre: 'Rebobinar: paga 3 Furor del agotado y le devuelve la acción',
        p1: {
            vanguardia: [{ carta: 'Oso con armadura', furor: 4, agotada: true }, 'Mini-tigre'],
            mano: ['Rebobinar'],
        },
        p2: { vanguardia: ['Droide antidisturbios'] },
        pasos: [
            { jugar: 'Rebobinar' },
            { elegir: ['Oso con armadura'] },
        ],
        logsIntencionados: [
            { de: '¡Oso con armadura rebobina su tiempo', a: '¡Oso con armadura [1] de J1 (Jugador 1) rebobina su tiempo',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño/jugador): la vieja usaba nombres a secas o 2ª persona; la nueva usa DSL._nombre / {jugador}' },
        ],
    },
    {
        nombre: 'Rebobinar rechazado: el único agotado no llega a 3 de Furor',
        p1: {
            vanguardia: [{ carta: 'Oso con armadura', furor: 2, agotada: true }],
            mano: ['Rebobinar'],
        },
        p2: { vanguardia: ['Droide antidisturbios'] },
        pasos: [
            { jugar: 'Rebobinar' },
        ],
    },
];

correrSuite('regresion7', escenarios);
