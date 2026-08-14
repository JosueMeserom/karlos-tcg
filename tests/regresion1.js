// tests/regresion1.js — Ingeribles con AL_USAR_AYUDA:
//   Manzanahoria (12), Longaniza (13), Té helado (22), Tortilla de patatas (23).
// Nota: en la base VIEJA, Manzanahoria y Longaniza ya llevan bloque DSL (el
// esqueleto temprano documentado en CLAUDE.md): su comparación valida la
// evolución del intérprete. Té helado y Tortilla sí son imperativas en la vieja.

'use strict';
const { correrSuite } = require('./harness');

// El Té helado cambió de mecánica a mano de Toto (13-ago-2026): cura AL QUE TRIBUTA, no a un
// tercero. Las dos bases divergen a propósito en sus dos escenarios; el motivo va aquí para
// no repetirlo cuatro veces.
const MOTIVO_TE_HELADO = 'el Té helado cura ahora al aliado que tributó (texto de la carta, 13-ago-2026); la vieja elegía pagador aparte y el log nombraba dos veces a la misma carta';

const escenarios = [
    {
        nombre: 'Manzanahoria cura 2 a un aliado dañado',
        p1: { vanguardia: [{ carta: 'Oso con armadura', vida: 1 }], mano: ['Manzanahoria'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Manzanahoria' },
            { seleccionar: 'Oso con armadura' },
        ],
        logsIntencionados: [
            { de: '[ability] Manzanahoria', a: '[ability] Manzanahoria [1] de J1 (Jugador 1)', motivo: 'NORMA DEL PROYECTO aplicada al {carta} del DSL (14-ago-2026): un log que nombra una carta dice de quien es, con el formato de siempre. La vieja usaba el nombre pelado. Mismo mensaje, nombre completo' },
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
        logsIntencionados: [
            { de: '[ability] Longaniza', a: '[ability] Longaniza [1] de J1 (Jugador 1)', motivo: 'NORMA DEL PROYECTO aplicada al {carta} del DSL (14-ago-2026): un log que nombra una carta dice de quien es, con el formato de siempre. La vieja usaba el nombre pelado. Mismo mensaje, nombre completo' },
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
        nombre: 'Té helado: paga y se cura el MISMO aliado (mecánica nueva)',
        p1: {
            vanguardia: [{ carta: 'Oso con armadura', vida: 1, furor: 2 }],
            retaguardia: [{ carta: 'Mini-tigre', furor: 1 }],
            mano: ['Té helado'],
        },
        p2: { vanguardia: ['Robot de seguridad SP'] },
        pasos: [
            { jugar: 'Té helado' },
            { seleccionar: 'Oso con armadura' },
            // La VIEJA pregunta además quién paga; la nueva ya no, porque paga el señalado.
            { elegir: ['Mini-tigre'], soloEn: 'vieja' },
        ],
        logsSoloVieja: [
            { linea: 'usa 1 Furor de Mini-tigre y cura a Oso con armadura', motivo: MOTIVO_TE_HELADO },
        ],
        // El "-1 FUR" es el mismo flotante, pero sale de OTRA carta: el pagador ha cambiado.
        flotantesSoloVieja: [ { linea: '-1 FUR', motivo: MOTIVO_TE_HELADO + ': lo pintaba el Mini-tigre' } ],
        flotantesSoloNueva: [ { linea: '-1 FUR', motivo: MOTIVO_TE_HELADO + ': ahora lo pinta el Oso, que es quien paga' } ],
        logsSoloNueva: [
            { linea: 'tributa 1 de Furor y se refresca con Té helado', motivo: MOTIVO_TE_HELADO },
        ],
        diferenciasEsperadas: [
            { contiene: 'vanguard.0.furor', motivo: MOTIVO_TE_HELADO + ': paga el Oso (2 -> 1), no el Mini-tigre' },
            { contiene: 'rearguard.0.furor', motivo: MOTIVO_TE_HELADO + ': el Mini-tigre conserva su Furor' },
        ],
    },
    {
        nombre: 'Té helado: si el señalado no tiene Furor, no se puede usar en él',
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
        logsSoloVieja: [
            { linea: 'usa 1 Furor de Oso con armadura y cura', motivo: MOTIVO_TE_HELADO },
        ],
        logsSoloNueva: [
            { linea: 'tributa 1 de Furor y se refresca con Té helado', motivo: MOTIVO_TE_HELADO },
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
            { de: 'Tortilla de patatas', a: 'Tortilla de patatas [1] de J1 (Jugador 1)', motivo: 'NORMA DEL PROYECTO aplicada al {carta} del DSL (14-ago-2026): un log que nombra una carta dice de quien es, con el formato de siempre. La vieja usaba el nombre pelado. Mismo mensaje, nombre completo' },
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
