// tests/regresion48.js — Valafar (CHUPAALMAS) migrada al DSL (31-jul-2026).
//
// Estrena `siDanoMinimo` en TRAS_ATACAR: umbral EXACTO de daño hecho, no solo "dañó algo"
// (`soloSiDaño`) — el texto dice literalmente "que quite >= 1 Vida", y el suelo de daño de
// 0.5 (Esbirro-vs-Personaje) podría no llegar a ese umbral en una carta que sí fuera Esbirro
// (Valafar es Personaje, así que su propio suelo es siempre 1 y en la práctica coincide con
// soloSiDaño para ESTA carta — pero el modelado correcto es el del texto literal, no el que
// da la casualidad de coincidir). También usa `target:{quien:"SELF"}` en el efecto (se cura a
// sí mismo, no al defensor, que es el objetivo implícito por defecto de TRAS_ATACAR) y
// `ifObjetivo` para no curar si ya está a Vida completa.
//
// Las tres pruebas salen BYTE-IDÉNTICAS entre bases (comprobado con probe aparte antes de
// escribir esta suite): ni logsIntencionados ni diferenciasEsperadas hacen falta.
//
// Se queda imperativo: el tributo de colocación (modal genérico, ya aceptado como imperativo
// en Ángel/Domador/Raiju) y COMA (Activa con `canStopEarly`, mismo patrón ya evaluado y
// descartado para SANCIÓN — no compensa arquitectura nueva para una carta suelta).

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'CHUPAALMAS: ataque normal con éxito cura 1 de Vida a Valafar',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Valafar', vida: 2, furor: 0 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 10 }] },
        pasos: [ { atacar: 'Valafar', objetivo: 'Mini-tigre' } ],
    },
    {
        nombre: 'CHUPAALMAS no cura si Valafar ya tiene la Vida completa',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Valafar', furor: 0 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 10 }] },
        pasos: [ { atacar: 'Valafar', objetivo: 'Mini-tigre' } ],
    },
    {
        nombre: 'CHUPAALMAS no cura si el ataque es esquivado (sin daño)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Valafar', vida: 2, furor: 0 }] },
        p2: { vanguardia: ['Águila'] },
        monedas: ['cara'], // esquiva de PSEUDO-PREVASIÓN
        pasos: [ { atacar: 'Valafar', objetivo: 'Águila' } ],
    },
];

correrSuite('regresion48', escenarios);
