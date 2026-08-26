// tests/regresion74.js — Tengu orgulloso (DOMINANCIA ILUSORIA), la última carta que quedaba en la
// lista de migración... y que tampoco tenía suite.
//
// Se escribe al migrarla. Lo que le faltaba al DSL era saber CONTAR CARAS: una MONEDA con
// `cantidad` mayor que 1 deja el recuento en una var (`guardaCaras`) y sus ramas pasan a leerse
// "salió al menos una" / "ninguna". Con eso, el resto ya existía: un ELEGIR cuyo cupo sale de esa
// var y dos ATACAR por elegido.
//
// Los caminos: dos caras (dos ráfagas, a objetivos distintos), una cara (una ráfaga), ninguna
// (las ilusiones se desvanecen y no pasa nada más), y el rechazo cuando el único enemigo de
// vanguardia está Oculto — DOMINANCIA ILUSORIA son ataques NORMALES, así que ahí el Oculto sí tapa.
'use strict';
const { correrSuite } = require('./harness');

// La base congelada nombra al Tengu a secas en el log de la ráfaga; la norma del proyecto es que
// todo log visible por ambos lleve el dueño de la carta.
const NOMBRE = {
    logsIntencionados: [
        { de: '¡Tengu dirige una ráfaga de 2 ataques hacia',
          a: '¡Tengu orgulloso [1] de J1 (Jugador 1) dirige una ráfaga de 2 ataques hacia',
          motivo: 'norma del proyecto: una carta nombrada en el log lleva su dueño (y la vieja lo llamaba "Tengu" a secas)' },
        { de: '¡Tengu orgulloso invoca ilusiones', a: '¡Tengu orgulloso [1] de J1 (Jugador 1) invoca ilusiones', motivo: 'ídem' },
        { de: 'CARAS. Tengu orgulloso realizará', a: 'CARAS. Tengu orgulloso [1] de J1 (Jugador 1) realizará', motivo: 'ídem' },
        { de: 'ráfaga de 2 ataques hacia Mini-tigre!', a: 'ráfaga de 2 ataques hacia Mini-tigre [1] de J2 (Jugador 2)!', motivo: 'ídem, aplicado al objetivo de la ráfaga' },
        { de: 'ráfaga de 2 ataques hacia Robot de seguridad SP!', a: 'ráfaga de 2 ataques hacia Robot de seguridad SP [1] de J2 (Jugador 2)!', motivo: 'ídem' },
    ],
};

const escenarios = [
    {
        // Las dos caras: dos ráfagas de 2 ataques, cada una a un enemigo distinto.
        nombre: 'DOMINANCIA ILUSORIA: 2 caras, 2 ráfagas a enemigos distintos',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [ { carta: 'Tengu orgulloso', furor: 2 } ] },
        p2: { vanguardia: [ { carta: 'Mini-tigre', vida: 9, campos: { maxHp: 9 } },
                            { carta: 'Robot de seguridad SP', vida: 9, campos: { maxHp: 9 } } ] },
        monedas: ['cara', 'cara'],
        ...NOMBRE,
        pasos: [
            { habilidad: 'Tengu orgulloso' }, { confirmar: true },
            { elegir: ['Mini-tigre', 'Robot de seguridad SP'] },
        ],
    },
    {
        // Una cara: una sola ráfaga.
        nombre: 'DOMINANCIA ILUSORIA: 1 cara, 1 ráfaga',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [ { carta: 'Tengu orgulloso', furor: 2 } ] },
        p2: { vanguardia: [ { carta: 'Mini-tigre', vida: 9, campos: { maxHp: 9 } },
                            { carta: 'Robot de seguridad SP', vida: 9, campos: { maxHp: 9 } } ] },
        monedas: ['cara', 'cruz'],
        ...NOMBRE,
        pasos: [
            { habilidad: 'Tengu orgulloso' }, { confirmar: true },
            { elegir: ['Robot de seguridad SP'] },
        ],
    },
    {
        // Ninguna cara: se paga el Furor, se gasta la acción y no ataca nadie.
        nombre: 'DOMINANCIA ILUSORIA: 0 caras, las ilusiones se desvanecen',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [ { carta: 'Tengu orgulloso', furor: 2 } ] },
        p2: { vanguardia: [ { carta: 'Mini-tigre', vida: 9, campos: { maxHp: 9 } } ] },
        monedas: ['cruz', 'cruz'],
        ...NOMBRE,
        pasos: [
            { habilidad: 'Tengu orgulloso' }, { confirmar: true },
        ],
    },
    {
        // El Oculto SÍ tapa aquí: son ataques normales. Sin nadie más en vanguardia, se rechaza
        // al pulsar la Habilidad, sin llegar a echar monedas.
        nombre: 'DOMINANCIA ILUSORIA rechazada: el único enemigo de vanguardia está Oculto',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [ { carta: 'Tengu orgulloso', furor: 2 } ] },
        p2: { vanguardia: [ { carta: 'Mini-tigre', campos: { stealth: true } } ] },
        pasos: [ { habilidad: 'Tengu orgulloso' } ],
    },
];

correrSuite('regresion74', escenarios);
