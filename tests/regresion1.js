// tests/regresion1.js — Ingeribles con AL_USAR_AYUDA:
//   Manzanahoria (12), Longaniza (13), Té helado (22), Tortilla de patatas (23).
// Nota: en la base VIEJA, Manzanahoria y Longaniza ya llevan bloque DSL (el
// esqueleto temprano documentado en CLAUDE.md): su comparación valida la
// evolución del intérprete. Té helado y Tortilla sí son imperativas en la vieja.

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'Manzanahoria cura 2 a un aliado dañado',
        p1: { vanguardia: [{ carta: 'Oso con armadura', vida: 1 }], mano: ['Manzanahoria'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Manzanahoria' },
            { seleccionar: 'Oso con armadura' },
        ],
    },
    {
        nombre: 'Manzanahoria sobre aliado con la Vida completa',
        p1: { vanguardia: ['Oso con armadura'], mano: ['Manzanahoria'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Manzanahoria' },
            { seleccionar: 'Oso con armadura' },
        ],
    },
    {
        nombre: 'Longaniza da 1 de Furor',
        p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 2 }], mano: ['Longaniza'] },
        p2: { vanguardia: ['Oso con armadura'] },
        pasos: [
            { jugar: 'Longaniza' },
            { seleccionar: 'Mini-tigre' },
        ],
    },
    {
        nombre: 'Longaniza rechazada con Furor al máximo (la carta no se consume)',
        p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 4 }], mano: ['Longaniza'] },
        p2: { vanguardia: ['Oso con armadura'] },
        pasos: [
            { jugar: 'Longaniza' },
            { seleccionar: 'Mini-tigre' },
        ],
    },
    {
        nombre: 'Té helado con dos pagadores posibles: elige quién paga',
        p1: {
            vanguardia: [{ carta: 'Oso con armadura', vida: 1, furor: 2 }],
            retaguardia: [{ carta: 'Mini-tigre', furor: 1 }],
            mano: ['Té helado'],
        },
        p2: { vanguardia: ['Robot de seguridad SP'] },
        pasos: [
            { jugar: 'Té helado' },
            { seleccionar: 'Oso con armadura' },
            { elegir: ['Mini-tigre'] }, // vieja: modal de búsqueda visual · nueva: selección-en-tablero
        ],
        logsIntencionados: [
            { de: 'usa 1 Furor de Mini-tigre y', a: 'usa 1 Furor de Mini-tigre [1] de J1 (Jugador 1) y',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja logueaba payer.name a secas; la nueva usa getCardNameWithOwner vía DSL._nombre' },
        ],
    },
    {
        nombre: 'Té helado con pagador único: se paga solo (autoSiUnica)',
        p1: {
            vanguardia: [{ carta: 'Oso con armadura', vida: 1, furor: 2 }],
            retaguardia: ['Mini-tigre'],
            mano: ['Té helado'],
        },
        p2: { vanguardia: ['Robot de seguridad SP'] },
        pasos: [
            { jugar: 'Té helado' },
            { seleccionar: 'Oso con armadura' },
        ],
        logsIntencionados: [
            { de: 'usa 1 Furor de Oso con armadura y cura', a: 'usa 1 Furor de Oso con armadura [1] de J1 (Jugador 1) y cura',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja logueaba payer.name a secas; la nueva usa getCardNameWithOwner vía DSL._nombre' },
        ],
    },
    {
        nombre: 'Tortilla de patatas: +2 Furor y agota al objetivo',
        p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 1 }], mano: ['Tortilla de patatas'] },
        p2: { vanguardia: ['Oso con armadura'] },
        pasos: [
            { jugar: 'Tortilla de patatas' },
            { seleccionar: 'Mini-tigre' },
        ],
        logsIntencionados: [
            { de: 'a Mini-tigre y consume', a: 'a Mini-tigre [1] de J1 (Jugador 1) y consume',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja logueaba target.name a secas; la nueva usa getCardNameWithOwner vía DSL._nombre' },
        ],
    },
    {
        nombre: 'Tortilla de patatas rechazada sobre aliado agotado',
        p1: {
            vanguardia: [{ carta: 'Mini-tigre', furor: 1, agotada: true }, 'Oso con armadura'],
            mano: ['Tortilla de patatas'],
        },
        p2: { vanguardia: ['Robot de seguridad SP'] },
        pasos: [
            { jugar: 'Tortilla de patatas' },
            { seleccionar: 'Mini-tigre' },
        ],
    },
];

correrSuite('regresion1', escenarios);
