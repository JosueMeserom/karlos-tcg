// tests/regresion70.js — DOMINIO (Erasmo): el control mental, que no tenía suite.
//
// Se escribe al migrarla al DSL (op ORDENAR_ATAQUE): la Activa era imperativa entera y nadie
// comprobaba ni que el ataque forzado ocurriera ni a quién se le puede ordenar. Los caminos:
// ordenar a un enemigo que ataque a un aliado tuyo, ordenarle que ataque a OTRO enemigo (que es
// lo jugoso de la carta), y el rechazo cuando no hay marioneta posible.
//
// SEGUIMIENTO no entra aquí: sigue siendo imperativo (expone la mano rival en cada pasada de
// pasivas y saca un botón para mirar el mazo), y esta suite cubre lo migrado.
'use strict';
const { correrSuite } = require('./harness');

// La base congelada nombra las cartas a secas en este log; la norma es nombrarlas con su dueño,
// que es lo que rellenan {carta}/{atacante}/{objetivo} en el DSL. Mismo texto palabra por palabra.
const NOMBRE = (marioneta, victima) => ({
    logsIntencionados: [
        { de: '¡Erasmo toma el control de ' + marioneta + ' y le obliga a atacar a ' + victima + '!',
          a: '¡Erasmo de J1 (Jugador 1) toma el control de ' + marioneta + ' [1] de J2 (Jugador 2) y le obliga a atacar a ' + victima + ' [1] de J1 (Jugador 1)!',
          motivo: 'norma del proyecto: una carta nombrada en el log lleva su dueño' },
    ],
});

const escenarios = [
    {
        // El uso natural: le quitas el turno a un enemigo haciéndole pegar a quien tú quieras.
        nombre: 'DOMINIO: el enemigo controlado ataca a un aliado tuyo',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Erasmo', furor: 2 }, { carta: 'Mini-tigre', vida: 9 }] },
        p2: { vanguardia: [{ carta: 'Oso con armadura' }] },
        ...NOMBRE('Oso con armadura', 'Mini-tigre'),
        pasos: [
            { habilidad: 'Erasmo' }, { confirmar: true },
            { elegir: ['Oso con armadura'] },   // la marioneta
            { elegir: ['Mini-tigre'] },         // la víctima
        ],
    },
    {
        // Y lo que de verdad la hace temible: enemigo contra enemigo.
        nombre: 'DOMINIO: enemigo contra enemigo',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Erasmo', furor: 2 }] },
        p2: { vanguardia: [{ carta: 'Oso con armadura' }, { carta: 'Mini-tigre', vida: 9 }] },
        logsIntencionados: [
            { de: '¡Erasmo toma el control de Oso con armadura y le obliga a atacar a Mini-tigre!',
              a: '¡Erasmo de J1 (Jugador 1) toma el control de Oso con armadura [1] de J2 (Jugador 2) y le obliga a atacar a Mini-tigre [1] de J2 (Jugador 2)!',
              motivo: 'norma del proyecto: una carta nombrada en el log lleva su dueño' },
        ],
        pasos: [
            { habilidad: 'Erasmo' }, { confirmar: true },
            { elegir: ['Oso con armadura'] },
            { elegir: ['Mini-tigre'] },
        ],
    },
    {
        // Sin enemigos en el campo no hay a quién controlar: se rechaza al pulsar.
        nombre: 'DOMINIO rechazado: no hay enemigos controlables',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Erasmo', furor: 2 }] },
        p2: {},
        pasos: [ { habilidad: 'Erasmo' } ],
    },
];

correrSuite('regresion70', escenarios);
