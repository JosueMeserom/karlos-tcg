// tests/humo.js — Suite de humo: valida el HARNESS, no cartas DSL.
// Usa solo cartas vanilla (sin hooks ni abilities) para que cualquier
// diferencia viejo-vs-nuevo señale un problema del harness o del motor,
// nunca de una carta. Debe estar en verde antes de escribir regresiones.

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'humo: jugar un esbirro de la mano a la vanguardia',
        p1: { mano: ['Mini-tigre'], vanguardia: ['Oso con armadura'] },
        p2: { vanguardia: ['Robot de seguridad SP'] },
        pasos: [
            { jugar: 'Mini-tigre' },
        ],
    },
    {
        nombre: 'humo: ataque normal entre esbirros (con muerte y descarte)',
        p1: { vanguardia: [{ carta: 'Gallina del infinito', furor: 2 }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { atacar: 'Gallina del infinito', objetivo: 'Mini-tigre' },
        ],
    },
    {
        nombre: 'humo: fin de turno completo (efectos finales, cartel, robo y furor del rival)',
        p1: { vanguardia: ['Oso con armadura'] },
        p2: { vanguardia: ['Droide antidisturbios'], mazo: ['Mini-tigre', 'Robot de seguridad SP'] },
        pasos: [
            { finTurno: true },
        ],
    },
    {
        nombre: 'humo: dos turnos seguidos con ataque en el segundo',
        semilla: 7,
        p1: { vanguardia: [{ carta: 'Oso con armadura', furor: 1 }], mazo: ['Mini-tigre'] },
        p2: { vanguardia: [{ carta: 'Droide antidisturbios', furor: 0 }], mazo: ['Robot de seguridad SP'] },
        pasos: [
            { finTurno: true },
            { atacar: 'Droide antidisturbios', objetivo: 'Oso con armadura' },
            { finTurno: true },
        ],
    },
];

correrSuite('humo', escenarios);
