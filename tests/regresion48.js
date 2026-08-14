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
// en Ángel/Domador/Raiju). COMA se migra aparte en regresion49.js (junto con SANCIÓN de
// Ángel): la premisa de "necesita canStopEarly" era un bug del código original, no un
// requisito real de la carta — ver el comentario en cartas.js junto a COMA.

'use strict';
const { correrSuite } = require('./harness');

// Águila (PSEUDO-PREVASIÓN) migrada al DSL el 31-jul-2026 (ver regresion53): su log de esquiva
// nombraba al ATACANTE a secas (`attacker.name`); ahora usa DSL._nombre, como manda la norma de
// logs en 3ª persona con dueño. Afecta a toda suite donde alguien ataca a Águila y falla.
const ESQUIVA_NOMBRE_ATACANTE = (plano, conDueno) => ({
    de: `ESQUIVÓ el ataque de ${plano}!`, a: `ESQUIVÓ el ataque de ${conDueno}!`,
    motivo: 'norma del proyecto (logs en 3ª persona con dueño): la Águila vieja usaba attacker.name a secas; la migrada rellena {objetivo} con DSL._nombre',
});

const escenarios = [
    {
        nombre: 'CHUPAALMAS: ataque normal con éxito cura 1 de Vida a Valafar',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Valafar', vida: 2, furor: 0 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 10 }] },
        pasos: [ { atacar: 'Valafar', objetivo: 'Mini-tigre' } ],
        logsIntencionados: [
            { de: '[healing] ¡CHUPAALMAS! Valafar', a: '[healing] ¡CHUPAALMAS! Valafar de J1 (Jugador 1)', motivo: 'NORMA DEL PROYECTO aplicada al {carta} del DSL (14-ago-2026): un log que nombra una carta dice de quien es, con el formato de siempre. La vieja usaba el nombre pelado. Mismo mensaje, nombre completo' },
        ],
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
        logsIntencionados: [ ESQUIVA_NOMBRE_ATACANTE('Valafar', 'Valafar de J1 (Jugador 1)') ],
        pasos: [ { atacar: 'Valafar', objetivo: 'Águila' } ],
    },
];

correrSuite('regresion48', escenarios);
