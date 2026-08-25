// tests/regresion72.js — Sadame (RAÍCES NINJA + ZOMBIFICAR), que no tenía ninguna suite propia.
//
// Se escribe al migrarla al DSL. Era, con Silhouette, de las cartas con más código a mano del
// fichero: ocho hooks, ninguno comprobado. Los caminos que tiene:
//   · RAÍCES NINJA, sus dos mitades: +1 de Furor cuando el Furor viene de una CARTA (no de la
//     fase) y la expansión de Vida máxima al curarse de más CON UNA AYUDA (hasta 6).
//   · ZOMBIFICAR anexando, ZOMBIFICAR deshaciendo, y el modal que pregunta cuál de las dos
//     cuando las dos son posibles.
//   · La regeneración de 2 al zombi al final de su turno.
//
// LO QUE NO ENTRA: `getAbilityWarning` (el aviso del diálogo de confirmación) — sigue siendo un
// hook a mano idéntico al de la base congelada, así que no hay nada que comparar.
'use strict';
const { correrSuite } = require('./harness');

// La base congelada nombra a Sadame a secas en estos logs; la norma del proyecto es que todo log
// visible por ambos lleve el dueño de la carta, y es lo que rellenan {carta}/{objetivo} en el DSL.
const NOMBRE = {
    logsIntencionados: [
        { de: 'Sadame anexa a', a: 'Sadame de J1 (Jugador 1) anexa a',
          motivo: 'la vieja escribía card.name a secas; la norma es getCardNameWithOwner' },
        { de: '¡RAÍCES NINJA otorga +1 Furor extra a Sadame!',
          a: '¡RAÍCES NINJA otorga +1 Furor extra a Sadame de J1 (Jugador 1)!', motivo: 'ídem' },
        { de: 'Sadame expande su Vida máxima a', a: 'Sadame de J1 (Jugador 1) expande su Vida máxima a',
          motivo: 'ídem' },
        { de: 'Sadame deshace todos sus anexos.', a: 'Sadame de J1 (Jugador 1) deshace todos sus anexos.',
          motivo: 'ídem' },
        // Diferencia que NO nace de esta migración: Karlos ya estaba migrado, y el anuncio de
        // pasiva desactivada usa desde entonces la frase genérica del compilador (ver regresion25).
        { de: 'MEGADRENALINA (Karlos de J1 (Jugador 1)) desactivada.',
          a: 'Habilidad pasiva de Karlos de J1 (Jugador 1): MEGADRENALINA desactivada.',
          motivo: 'anuncio estandarizado de PASIVA_CONTINUA, ajeno a Sadame' },
        { de: 'Longaniza da 1 de Furor', a: 'Longaniza [1] de J1 (Jugador 1) da 1 de Furor',
          motivo: 'ídem: Longaniza ya estaba migrada y nombra su carta con dueño' },
        { de: 'Manzanahoria cura 2 de Vida', a: 'Manzanahoria [1] de J1 (Jugador 1) cura 2 de Vida',
          motivo: 'ídem con Manzanahoria' },
    ],
};

// Solo para los escenarios en los que el zombi llega a regenerar: el flotante de esa curación
// nombra ahora a quien la causa. Fuera de NOMBRE a propósito, que si no reescribiría también
// el "+2 VIDA" de una Manzanahoria, que no viene de Sadame.
const REGEN = {
    flotantesIntencionados: [
        { de: '+2 VIDA · ft-green', a: '+2 VIDA (Sadame) · ft-green',
          motivo: 'el flotante automático nombra la carta que causa el cambio desde el 5-ago-2026: un "+2" suelto no decía de dónde salía' },
    ],
};

// `esZombi` (la marca que le cierra las Ayudas de curación al anexado) no existe en la base
// congelada: se añadió a la Sadame viva después de tomarse la foto. Solo aparece si al terminar
// el escenario queda algún zombi puesto.
const ZOMBI = {
    diferenciasEsperadas: [
        { contiene: '.esZombi', motivo: 'campo posterior a la base congelada; marca al zombi para que no pueda recibir Ayudas de curación' },
    ],
};

// Al deshacer los anexos, la nueva anuncia la Habilidad como cualquier otra Activa del DSL; la
// vieja solo sacaba ese cartel al anexar.
const DESHACE = {
    flotantesSoloNueva: [
        // Los tres carteles de estos escenarios, en orden: el del anexo (sobre Sadame), el de
        // la regeneración del zombi (sobre él) y el de deshacer. Los dos primeros salen en las
        // dos bases; el tercero es el que añade el compilador de ACTIVA al anunciar la Habilidad
        // también en la rama de deshacer, que la vieja no anunciaba.
        { linea: 'ZOMBIFICAR · ft-ability', ocurrencia: 3,
          motivo: 'el compilador de ACTIVA anuncia la Habilidad también al deshacer los anexos' },
    ],
};

const escenarios = [
    {
        // Un solo aliado apto y ningún anexo: no hay nada que preguntar, va directo a anexar.
        nombre: 'ZOMBIFICAR anexa a un aliado Ser vivo',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [ { carta: 'Sadame', furor: 2 }, { carta: 'Karlos', vida: 3 } ] },
        p2: { vanguardia: ['Mini-tigre'] },
        ...NOMBRE, ...ZOMBI,
        pasos: [
            { habilidad: 'Sadame' }, { confirmar: true },
            { elegir: ['Karlos'] },
        ],
    },
    {
        // Y al final de SU turno, el zombi regenera 2 (Karlos entra a 3 de 6).
        nombre: 'El zombi regenera 2 al final del turno de Sadame',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [ { carta: 'Sadame', furor: 2 }, { carta: 'Karlos', vida: 3 } ] },
        p2: { vanguardia: ['Mini-tigre'] },
        ...NOMBRE, ...ZOMBI, ...REGEN,
        pasos: [
            { habilidad: 'Sadame' }, { confirmar: true },
            { elegir: ['Karlos'] },
            { finTurno: true },
        ],
    },
    {
        // Cancelar la elección no cuesta Furor ni la acción: todavía no ha cambiado nada.
        nombre: 'ZOMBIFICAR: cancelar la elección no cuesta nada',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [ { carta: 'Sadame', furor: 2 }, 'Karlos' ] },
        p2: { vanguardia: ['Mini-tigre'] },
        // La vieja no abre una elección del DSL, sino su propia selección de objetivos: el paso
        // es solo para la nueva. El estado final es el mismo en las dos: nadie ha pagado nada.
        diferenciasEsperadas: [
            { contiene: 'pendingAbilityTarget', motivo: 'la vieja deja su selección abierta; la nueva la ha cancelado' },
        ],
        pasos: [
            { habilidad: 'Sadame' }, { confirmar: true },
            { soloEn: 'nueva', cancelar: true },
        ],
    },
    {
        // Sin nadie más a quien zombificar y con un anexo puesto, deshace sin preguntar.
        nombre: 'ZOMBIFICAR deshace los anexos cuando no queda a quién zombificar',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [ { carta: 'Sadame', furor: 2 }, { carta: 'Karlos', vida: 3 } ] },
        p2: { vanguardia: ['Mini-tigre'] },
        ...NOMBRE, ...DESHACE, ...REGEN,
        pasos: [
            { habilidad: 'Sadame' }, { confirmar: true },
            { elegir: ['Karlos'] },     // Karlos queda zombificado
            { finTurno: true }, { finTurno: true },
            { habilidad: 'Sadame' }, { confirmar: true },   // ya no hay otro Ser vivo: deshace
        ],
    },
    {
        // Con las dos cosas posibles, pregunta. Aquí se elige DESHACER.
        nombre: 'ZOMBIFICAR pregunta cuando puede anexar y deshacer',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [ { carta: 'Sadame', furor: 3 }, { carta: 'Karlos', vida: 3 }, { carta: 'Kyle', vida: 2 } ] },
        p2: { vanguardia: ['Mini-tigre'] },
        ...NOMBRE, ...DESHACE, ...REGEN,
        pasos: [
            { habilidad: 'Sadame' }, { confirmar: true },
            { elegir: ['Karlos'] },
            { finTurno: true }, { finTurno: true },
            { habilidad: 'Sadame' }, { confirmar: true },
            { opcion: 'DESHACER' },
        ],
    },
    {
        // ...y aquí se elige ANEXAR al segundo.
        nombre: 'ZOMBIFICAR pregunta y se anexa a un segundo aliado',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [ { carta: 'Sadame', furor: 3 }, { carta: 'Karlos', vida: 3 }, { carta: 'Kyle', vida: 2 } ] },
        p2: { vanguardia: ['Mini-tigre'] },
        ...NOMBRE, ...ZOMBI, ...REGEN,
        pasos: [
            { habilidad: 'Sadame' }, { confirmar: true },
            { elegir: ['Karlos'] },
            { finTurno: true }, { finTurno: true },
            { habilidad: 'Sadame' }, { confirmar: true },
            { opcion: 'ANEXAR' },
            { elegir: ['Kyle'] },
        ],
    },
    {
        // La otra mitad de RAÍCES NINJA: curarse de MÁS con una Ayuda le sube la Vida máxima
        // (hasta 6). Herida a 1 de 2, Manzanahoria cura 2: le sobra una, y ahí es donde crece.
        // (A Vida llena no vale: Manzanahoria solo cura aliados heridos, en las dos bases.)
        nombre: 'RAÍCES NINJA: la Ayuda que cura de más le expande la Vida máxima',
        flotantesSoloNueva: [
            { linea: 'RAÍCES NINJA · ft-ability', motivo: 'el SOBRECURACION genérico anuncia la Pasiva con su cartel, además del "+N VIDA MÁX."; la vieja solo pintaba el número' },
        ],
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [ { carta: 'Sadame', vida: 1 } ], mano: ['Manzanahoria'] },
        p2: { vanguardia: ['Mini-tigre'] },
        ...NOMBRE,
        pasos: [
            { jugar: 'Manzanahoria' },
            { elegir: ['Sadame'] },
        ],
    },
    {
        // RAÍCES NINJA: el Furor que viene de una CARTA (aquí Bebida energética) trae +1.
        nombre: 'RAÍCES NINJA: +1 de Furor extra de las cartas',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [ { carta: 'Sadame', furor: 0 } ], mano: ['Longaniza'] },
        p2: { vanguardia: ['Mini-tigre'] },
        ...NOMBRE,
        pasos: [
            { jugar: 'Longaniza' },
            { elegir: ['Sadame'] },
        ],
    },
];

correrSuite('regresion72', escenarios);
