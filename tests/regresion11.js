// tests/regresion11.js — Última suite antes de Apagón/Sifón de maná (que sí
// tocan performAttack y se dejan para revisión con más cuidado):
//   Sadame (retornada) (1005, solo se cubre INICIO_TURNO/DSL; su ACTIVA y la
//     transformación onBeforePlayAsync son imperativas e idénticas entre
//     bases, así que se coloca directamente en el campo sin pasar por la
//     evolución para centrar la cobertura en lo migrado),
//   Contendiente (1073, ACTIVA con ATACAR+MONEDA — abilities byte-idéntico
//     entre bases, valida el intérprete común),
//   Sra. Kumicho (1081, ACTIVA con ATACAR+siExito — igualmente idéntico).

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'Sadame (retornada): ÚLTIMA MISIÓN restaura toda la Vida al inicio de su turno',
        turnoDe: 'p1',
        p1: { vanguardia: [{ carta: 'Sadame (retornada)', vida: 1 }], mazo: ['Longaniza'] },
        p2: { vanguardia: ['Mini-tigre'], mazo: ['Longaniza'] },
        pasos: [
            { finTurno: true }, // p1→p2
            { finTurno: true }, // p2→p1: INICIO_TURNO propio
        ],
        logsIntencionados: [
            { de: 'MISIÓN! Sadame (retornada)', a: 'MISIÓN! Sadame (retornada) de J1 (Jugador 1)', motivo: 'NORMA DEL PROYECTO aplicada al {carta} del DSL (14-ago-2026): un log que nombra una carta dice de quien es, con el formato de siempre. La vieja usaba el nombre pelado. Mismo mensaje, nombre completo' },
        ],
    },
    {
        nombre: 'Sadame (retornada) ya con la Vida completa: ÚLTIMA MISIÓN no hace nada',
        turnoDe: 'p1',
        p1: { vanguardia: ['Sadame (retornada)'], mazo: ['Longaniza'] },
        p2: { vanguardia: ['Mini-tigre'], mazo: ['Longaniza'] },
        pasos: [
            { finTurno: true },
            { finTurno: true },
        ],
    },
    {
        nombre: 'Contendiente: BOMBAZO con +2 Atq y cruz en la moneda de retroceso (pierde 1 Vida)',
        monedas: ['cruz'],
        p1: { vanguardia: [{ carta: 'Contendiente', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 4 }] },
        pasos: [
            { habilidad: 'Contendiente' },
            { confirmar: true },
            { elegir: ['Mini-tigre'] },
        ],
    },
    {
        nombre: 'Contendiente: BOMBAZO con cara en la moneda de retroceso (sin daño propio)',
        monedas: ['cara'],
        p1: { vanguardia: [{ carta: 'Contendiente', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 4 }] },
        pasos: [
            { habilidad: 'Contendiente' },
            { confirmar: true },
            { elegir: ['Mini-tigre'] },
        ],
    },
    {
        nombre: 'Sra. Kumicho: PUÑALADA con éxito aplica Daño por Tiempo 3 turnos',
        p1: { vanguardia: [{ carta: 'Sra. Kumicho', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 4 }] },
        pasos: [
            { habilidad: 'Sra. Kumicho' },
            { confirmar: true },
            { elegir: ['Mini-tigre'] },
        ],
    },
];

correrSuite('regresion11', escenarios);
