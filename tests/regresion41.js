// tests/regresion41.js — Edrielle migrada al DSL (30-jul-2026): TORMENTA PERFECTA.
//
// ACTIVA sin objetivo (sinObjetivo:true, la propia carta es el "objetivo" implícito):
// MODIFICAR_STAT con target:{quien:"ENEMIGO"} (sin zona = vanguardia+retaguardia) aplica
// el daño verdadero a TODO el pool resuelto de una tacada — _runEffectList itera solo,
// sin necesitar ningún flag "a todos". DSL._pool excluye Avatares por defecto (mismo
// criterio que el `!isAvatar` a mano de la vieja: Kami, intocable, queda fuera).
//
// Se queda imperativo: el tributo de invocación (DSL.tributoFuror) y los dos ganchos de
// BELLEZA INCOMPARABLE (onStartTurn con lanzamiento de moneda, onUpdatePassive).

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'TORMENTA PERFECTA: daño verdadero a los 2 enemigos (vanguardia+retaguardia), uno muere',
        p1: { vanguardia: [ { carta: 'Edrielle', furor: 4 } ] },
        p2: { vanguardia: [ { carta: 'Mini-tigre', vida: 1 } ], retaguardia: [ { carta: 'Robot de seguridad SP', vida: 10 } ] },
        pasos: [ { habilidad: 'Edrielle' }, { confirmar: true } ],
    },
    {
        nombre: 'TORMENTA PERFECTA rechazada: falta Furor',
        p1: { vanguardia: [ { carta: 'Edrielle', furor: 3 } ] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { habilidad: 'Edrielle' } ],
    },
    {
        nombre: 'TORMENTA PERFECTA rechazada: no hay enemigos en el campo',
        p1: { vanguardia: [ { carta: 'Edrielle', furor: 4 } ] },
        p2: {},
        pasos: [ { habilidad: 'Edrielle' } ],
    },
];

correrSuite('regresion41', escenarios);
