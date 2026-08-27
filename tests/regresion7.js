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
        // ORDEN del descarte (§14, 8-ago-2026): en el punto de compromiso la carta entra en su
        // zona ANTES de que corra el efecto, así que Dobla la ropa encabeza la pila y las 3
        // descartadas van detrás. La vieja la metía al final. Mismas cartas, distinto orden — y
        // el nuevo es el que describe la norma: la jugaste antes de descartar nada.
        diferenciasEsperadas: [
            { contiene: 'estado.p1.discard', motivo: '§14: la carta entra en su pila en el punto de compromiso, antes del efecto, así que encabeza el descarte en vez de cerrarlo' },
        ],


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
            { de: 'Dobla la ropa', a: 'Dobla la ropa de J1 (Jugador 1)', motivo: 'NORMA DEL PROYECTO aplicada al {carta} del DSL (14-ago-2026): un log que nombra una carta dice de quien es, con el formato de siempre. La vieja usaba el nombre pelado. Mismo mensaje, nombre completo' },
            { de: 'activada: Robas 3 cartas.', a: 'activada: J1 (Jugador 1) roba 3 cartas.',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño/jugador): la vieja usaba nombres a secas o 2ª persona; la nueva usa DSL._nombre / {jugador}' },
        ],
    },
    {
        nombre: 'PEM: paga 1 Furor y paraliza a la única Máquina enemiga',
        diferenciasEsperadas: [
            { contiene: 'tempEffects.0.badge', motivo: 'las marcas que hacen perder el turno llevan chapa de oficio desde el 27-ago-2026 (la pone el op MARCAR_TEMPORAL, no la carta): una marca que decide un turno futuro tiene que verse' },
            { contiene: 'tempEffects.0.pierdeSuTurno', motivo: 'la marca ahora LLEVA ESCRITO lo que antes hacía un hook a mano de la carta: el motor ya tenía handlers genéricos para `pierdeSuTurno`, así que la carta solo tiene que declararlo' },
        ],
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
