// tests/regresion4.js — Ayudas Mágicas con AL_USAR_AYUDA y coste de Furor:
//   Flash de maná (1031), Granada de maná (1032), Hexagrama (1033).
// Ejercitan: deltaCondicional (descuento Eris), APLICAR_ESTADO en área,
// ELEGIR sobre enemigos con hastaCantidad, BUSCAR en mazo con barajado
// (el barajado consume Math.random: la semilla compartida garantiza el
// mismo orden en ambas bases si consumen el mismo número de tiradas).

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'Flash de maná: paga 2 de Furor y ciega la vanguardia enemiga',
        p1: { vanguardia: [{ carta: 'Oso con armadura', furor: 3 }], mano: ['Flash de maná'] },
        p2: { vanguardia: ['Mini-tigre', 'Droide antidisturbios'], retaguardia: ['Robot de seguridad SP'] },
        pasos: [
            { jugar: 'Flash de maná' },
            { seleccionar: 'Oso con armadura' },
        ],
        logsIntencionados: [
            { de: '¡Oso con armadura desata', a: '¡Oso con armadura [1] (J1 (Jugador 1)) desata',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño/jugador): la vieja usaba nombres a secas o 2ª persona; la nueva usa DSL._nombre / {jugador}' },
        ],
    },
    {
        nombre: 'Flash de maná pagado por Eris: descuento a 1 de Furor (deltaCondicional)',
        p1: { vanguardia: [{ carta: 'Eris', furor: 1 }], mano: ['Flash de maná'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Flash de maná' },
            { seleccionar: 'Eris' },
        ],
        logsIntencionados: [
            { de: '¡Eris desata', a: '¡Eris (J1 (Jugador 1)) desata',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño/jugador): la vieja usaba nombres a secas o 2ª persona; la nueva usa DSL._nombre / {jugador}' },
        ],
    },
    {
        nombre: 'Flash de maná sin enemigos en vanguardia (logSiVacio)',
        p1: { vanguardia: [{ carta: 'Oso con armadura', furor: 2 }], mano: ['Flash de maná'] },
        p2: { retaguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Flash de maná' },
            { seleccionar: 'Oso con armadura' },
        ],
        logsIntencionados: [
            { de: '¡Oso con armadura desata', a: '¡Oso con armadura [1] (J1 (Jugador 1)) desata',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño/jugador): la vieja usaba nombres a secas o 2ª persona; la nueva usa DSL._nombre / {jugador}' },
        ],
    },
    {
        nombre: 'Granada de maná: elige 2 enemigos, daño verdadero y una muerte',
        p1: { vanguardia: [{ carta: 'Oso con armadura', furor: 2 }], mano: ['Granada de maná'] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 1 }, 'Droide antidisturbios'] },
        pasos: [
            { jugar: 'Granada de maná' },
            { seleccionar: 'Oso con armadura' },
            { elegir: ['Mini-tigre', 'Droide antidisturbios'] }, // vieja: modal visual · nueva: tablero
        ],
        logsIntencionados: [
            { de: '¡Oso con armadura hace explotar', a: '¡Oso con armadura [1] (J1 (Jugador 1)) hace explotar',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño/jugador): la vieja usaba nombres a secas o 2ª persona; la nueva usa DSL._nombre / {jugador}' },
        ],
    },
    {
        nombre: 'Hexagrama: tributa 1 Furor, busca la Invocación y baraja',
        semilla: 11,
        p1: {
            vanguardia: [{ carta: 'Mini-tigre', furor: 1 }],
            mano: ['Hexagrama'],
            mazo: ['Oso con armadura', 'Gólem multielemental', 'Longaniza', 'Robot de seguridad SP'],
        },
        p2: { vanguardia: ['Droide antidisturbios'] },
        pasos: [
            { jugar: 'Hexagrama' },
            { seleccionar: 'Mini-tigre' },
            { elegir: ['Gólem multielemental'] },
        ],
        logsIntencionados: [
            { de: 'El Hexagrama brilla y te permite buscar en tu mazo...', a: 'El Hexagrama brilla y permite a J1 (Jugador 1) buscar en su mazo...',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño/jugador): la vieja usaba nombres a secas o 2ª persona; la nueva usa DSL._nombre / {jugador}' },
            { de: 'Añades Gólem multielemental a tu mano.', a: 'J1 (Jugador 1) añade Gólem multielemental (J1 (Jugador 1)) a su mano.',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño/jugador): la vieja usaba nombres a secas o 2ª persona; la nueva usa DSL._nombre / {jugador}' },
        ],
    },
    {
        nombre: 'Hexagrama sin Invocaciones en el mazo: fracasa pero baraja igualmente',
        semilla: 11,
        p1: {
            vanguardia: [{ carta: 'Mini-tigre', furor: 1 }],
            mano: ['Hexagrama'],
            mazo: ['Oso con armadura', 'Longaniza', 'Robot de seguridad SP'],
        },
        p2: { vanguardia: ['Droide antidisturbios'] },
        pasos: [
            { jugar: 'Hexagrama' },
            { seleccionar: 'Mini-tigre' },
        ],
        logsIntencionados: [
            { de: "No quedan cartas de 'Invocación' en tu mazo.", a: "No quedan cartas de 'Invocación' en el mazo de J1 (Jugador 1).",
              motivo: 'norma del proyecto (logs en 3ª persona con dueño/jugador): la vieja usaba nombres a secas o 2ª persona; la nueva usa DSL._nombre / {jugador}' },
        ],
    },
];

correrSuite('regresion4', escenarios);
