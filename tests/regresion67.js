// tests/regresion67.js — Guardaespaldas: YO SIEMPRE TE AMARÉ (interceptor de daño letal).
//
// La carta no tenía NINGUNA suite de su Pasiva: salía en otras solo como cuerpo al que pegar
// (equipos_serie1, hueco_vanguardia). Se escribe al migrarla al DSL (trigger INTERCEPTOR_LETAL)
// para que la comparación viejo-vs-nuevo diga si la sustitución se comporta igual, que es lo
// único que importaba: el compilador hace ahora la muerte por sustitución que antes hacía a mano
// `onLethalDamageIntercept`.
//
// Los tres casos que tiene la Pasiva: aceptar (muere él y el golpe se anula entero), declinar (el
// aliado muere como si nada) y el que decide el MOTOR y no la carta: Guardaespaldas no se ofrece
// para salvarse a sí mismo.
'use strict';
const { correrSuite } = require('./harness');

// Las dos divergencias del log, las dos en la misma dirección: la base congelada nombraba las
// cartas a secas y hoy la norma es nombrarlas con getCardNameWithOwner (nombre [copia] + dueño).
// El texto es el mismo palabra por palabra. La del ATACANTE ya divergía antes de esta migración
// (se arregló en su día sobre la carta imperativa); la del propio Guardaespaldas la trae el DSL,
// donde ese nombre completo es el relleno {cartaRef}.
const LOG_NOMBRE = {
    logsIntencionados: [
        { de: '! Guardaespaldas se arroja', a: '! Guardaespaldas [1] de J1 (Jugador 1) se arroja',
          motivo: 'norma del proyecto: una carta nombrada en el log lleva su dueño (getCardNameWithOwner)' },
        { de: 'ataque de Mini-tigre.', a: 'ataque de Mini-tigre [1] de J2 (Jugador 2).',
          motivo: 'misma norma, aplicada al atacante; ya divergía antes de migrar la carta al DSL' },
    ],
};

const escenarios = [
    {
        // El Mini-tigre de J1 tiene 1 de Vida y recibe un golpe que lo mata: el Guardaespaldas se
        // ofrece a morir por él. Al aceptar, el golpe se anula ENTERO (el tigre no pierde ni 1) y
        // la Retribución se la lleva el rival, como dice el texto de la carta.
        nombre: 'Guardaespaldas: acepta el sacrificio y anula el golpe',
        turno: 2, turnoDe: 'p2', empieza: 'p1',
        p1: { vanguardia: ['Guardaespaldas', { carta: 'Mini-tigre', vida: 1 }] },
        p2: { vanguardia: ['Mini-tigre'] },
        ...LOG_NOMBRE,
        pasos: [
            { atacar: 'Mini-tigre', objetivo: 'Mini-tigre' },
            { opcion: 'SÍ' },
        ],
    },
    {
        // Mismo golpe, misma pregunta, respuesta contraria: el aliado muere y el Guardaespaldas
        // se queda tan tranquilo. Sin esto, un interceptor que se sacrificara SIEMPRE pasaría
        // igual de verde que el correcto.
        nombre: 'Guardaespaldas: declina y el aliado muere',
        turno: 2, turnoDe: 'p2', empieza: 'p1',
        p1: { vanguardia: ['Guardaespaldas', { carta: 'Mini-tigre', vida: 1 }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { atacar: 'Mini-tigre', objetivo: 'Mini-tigre' },
            { opcion: 'NO' },
        ],
    },
    {
        // El golpe letal va contra el PROPIO Guardaespaldas: no hay pregunta que hacer (morirse
        // para no morirse no es una opción). Lo garantiza el motor, que se salta la carta cuya
        // instancia es la del defensor; el escenario está aquí para que siga siendo verdad.
        nombre: 'Guardaespaldas: no se sacrifica por sí mismo',
        turno: 2, turnoDe: 'p2', empieza: 'p1',
        p1: { vanguardia: [{ carta: 'Guardaespaldas', vida: 1 }] },
        p2: { vanguardia: ['Aniceto'] },
        pasos: [
            { atacar: 'Aniceto', objetivo: 'Guardaespaldas' },
        ],
    },
];

correrSuite('regresion67', escenarios);
