// tests/regresion73.js — Arthas, la única carta DUAL del juego, que no tenía ninguna suite.
//
// Se escribe ANTES de migrar nada (25-ago-2026): son ocho hooks a mano, ninguno cubierto, y
// varios tocan cauces del motor que no usa ninguna otra carta (el modal de "¿cómo la juegas?",
// el botón morado propio, la vuelta al campo al caer su portador). Sin esta red, cualquier
// retoque suyo es a ciegas.
//
// Los caminos que tiene:
//   · jugarla como Personaje y jugarla como Arma legendaria (el modal de tres botones);
//   · a quién se le puede equipar y a quién no (Karolina, 'Animal salvaje', 'Cosa');
//   · el veto de Karolina al colocarla, y su autodestrucción si Karolina llega después;
//   · el +3 de ATQ mientras la empuñan;
//   · qué pasa con Arthas cuando su portador muere (vuelve al campo, o al descarte si no cabe).
'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'Arthas: se juega como Personaje',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: ['Mini-tigre'], mano: ['Arthas'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { jugar: 'Arthas' }, { opcion: 'INVOCAR' } ],
    },
    {
        nombre: 'Arthas: se juega como Arma legendaria y da +3 de ATQ',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: ['Karlos'], mano: ['Arthas'] },
        p2: { vanguardia: ['Mini-tigre'] },
        // Única divergencia entre bases, y no nace de aquí: el log de equipado ya nombraba la
        // carta con su dueño en la versión viva (norma del proyecto).
        logsIntencionados: [
            { de: '¡Karlos empuña', a: '¡Karlos de J1 (Jugador 1) empuña',
              motivo: 'norma del proyecto: una carta nombrada en el log lleva su dueño' },
        ],
        pasos: [ { jugar: 'Arthas' }, { opcion: 'EQUIPAR' }, { elegir: ['Karlos'] } ],
    },
    {
        nombre: 'Arthas: cancelar el modal lo deja en la mano',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: ['Karlos'], mano: ['Arthas'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { jugar: 'Arthas' }, { opcion: 'CANCELAR' } ],
    },
    {
        nombre: 'Arthas no se coloca con Karolina en la vanguardia',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: ['Karolina'], mano: ['Arthas'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { jugar: 'Arthas' } ],
    },
    {
        nombre: 'Arthas jamás servirá a Karolina ni a un Animal salvaje',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: ['Mini-tigre'], retaguardia: ['Karolina'], mano: ['Arthas'] },
        p2: { vanguardia: ['Mini-tigre'] },
        // Mini-tigre es 'Animal salvaje' y Karolina está vetada por nombre: no queda nadie digno.
        pasos: [ { jugar: 'Arthas' }, { opcion: 'EQUIPAR' } ],
    },
    {
        nombre: 'Arthas se autodestruye si Karolina llega a la vanguardia',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: ['Arthas'], mano: ['Karolina'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { jugar: 'Karolina' } ],
    },
    {
        // Al caer su portador, Arthas recobra su forma y cae en el campo con la Vida restaurada
        // (y ya "usado" ese turno). Es su cauce propio: onUnequip devolviendo true para que el
        // motor NO lo mande al descarte.
        nombre: 'Arthas vuelve al campo cuando cae su portador',
        turno: 2, turnoDe: 'p2', empieza: 'p2',
        p1: { vanguardia: [ { carta: 'Karlos', vida: 1 } ], mano: ['Arthas'] },
        p2: { vanguardia: [ { carta: 'Oso con armadura' } ] },
        logsIntencionados: [
            { de: '¡Karlos empuña', a: '¡Karlos de J1 (Jugador 1) empuña',
              motivo: 'norma del proyecto: una carta nombrada en el log lleva su dueño' },
        ],
        pasos: [
            // Lo equipa en el turno de p1... que empieza pasando el de p2.
            { finTurno: true },
            { jugar: 'Arthas' }, { opcion: 'EQUIPAR' }, { elegir: ['Karlos'] },
            { finTurno: true },
            { atacar: 'Oso con armadura', objetivo: 'Karlos' },
        ],
    },
];

correrSuite('regresion73', escenarios);
