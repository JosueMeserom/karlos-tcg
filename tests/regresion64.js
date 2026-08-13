// tests/regresion64.js — las búsquedas IMPERATIVAS que quedan: Garret, La Bestia e Igniz.
//
// CARACTERIZACIÓN, no cobertura nueva. Estas tres cartas buscan en una pila con código a mano en
// vez de con el op BUSCAR, y la idea es migrarlas. Toto preguntó lo correcto: "¿estás seguro de
// que se comportarán EXACTAMENTE igual?". La respuesta honesta era no, y no lo era por una razón
// concreta: sus búsquedas NO TENÍAN NINGUNA SUITE. Garret sale en regresion38 pero solo por su
// tributo y su Activa; La Bestia solo en nuevas1 (aserción); Igniz en ninguna.
//
// Esto es la red que faltaba. Se escribe ANTES de migrar y fija el comportamiento de HOY. Cuando
// las tres pasen a BUSCAR, esta suite dirá exactamente qué cambia, y cada diferencia se decide a
// mano: mejora (se documenta) o regresión (se arregla). Sin esto, migrar sería a ciegas.
//
// Lo que ya se sabe que cambiará, y por qué la migración NO es gratis:
//   · Garret busca por id FIJO (26) y coge el primero que encuentra: ni visor, ni elección de
//     cuál. BUSCAR abre el visor de la pila y deja elegir — mejor, pero es otro flujo.
//   · Los logs son propios de cada carta; BUSCAR tiene los suyos (`log`, `logNoValidas`).
//   · Garret pregunta con un modal de tres opciones (mazo / descartes / nada) que BUSCAR no
//     replica tal cual: sería `confirmar` + `en: ["MAZO","DESCARTES"]`.
'use strict';
const { correrSuite } = require('./harness');

// Divergencias que YA existían antes de escribir esta suite, de la migración del tributo de
// Garret al DSL (ANTES_DE_JUGAR + esCoste). No son de la búsqueda, pero contaminan sus
// escenarios, así que se declaran una vez y se comparten.
const MV = 'MIGRACION A BUSCAR (13-ago-2026): la vieja cogia el primer Escudo magico por id fijo, sin ensenar nada. La nueva abre el VISOR del mazo y te deja elegir cual, como el resto de busquedas del juego. Un paso mas, a proposito';
const ML = 'MIGRACION A BUSCAR: los dos logs por zona que tenia la vieja ("anade del mazo" / "recupera de los descartes") se funden en el del op, en 3a persona con el jugador. Decision de Toto: que la carta se comporte igual que sus hermanas pesa mas que conservar cada mensaje';
const _MOT_ORDEN = 'el tributo se cobra ANTES de colocar la carta desde que Garret lo declara en ANTES_DE_JUGAR con esCoste; la vieja lo cobraba despues. Mismas lineas, otro orden';
const YD_VIEJA = [
        { linea: 'entrega su Furor como tributo para Garret', motivo: _MOT_ORDEN },
    { linea: 'juega Garret de J1 (Jugador 1) en la vanguardia', motivo: _MOT_ORDEN },
];
const YD_NUEVA = [
    { linea: 'entrega su Furor como tributo para Garret', motivo: _MOT_ORDEN },
    { linea: 'juega Garret de J1 (Jugador 1) en la vanguardia', motivo: _MOT_ORDEN },
];
const YA_DIVERGIA = {
    logsIntencionados: [
        { de: 'Barajando el mazo...', a: 'Barajando el mazo de J1 (Jugador 1)...',
          motivo: 'norma del proyecto: todo log visible por ambos va en 3a persona CON el nombre del jugador' },
    ],
    flotantesIntencionados: [
        { de: '-4 FUR ·', a: '-4 FUR (Garret) ·',
          motivo: 'la nueva firma el flotante con la carta que causa el cambio (_fuenteFlotante); la vieja no lo hacia' },
    ],
};

const escenarios = [
    {
        // Garret busca en el MAZO. Su modal ofrece descartes solo si hay un Escudo allí, así que
        // aquí salen dos opciones: mazo y "no buscar".
        nombre: 'Garret: DESBORDE DE MANÁ busca el Escudo mágico en el mazo',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: {
            vanguardia: [{ carta: 'Aniceto', furor: 4 }],
            mano: ['Garret'],
            mazo: ['Escudo mágico', 'Mini-tigre', 'Longaniza'],
        },
        p2: { vanguardia: ['Mini-tigre'] },
        ...YA_DIVERGIA,
        pasos: [
            { jugar: 'Garret' },
            { elegir: ['Aniceto'] },                 // tributo de 4 Furor
            { opcion: 'BUSCAR EN EL MAZO' },
            { elegir: ['Escudo mágico'], soloEn: 'nueva' },   // la nueva abre el visor del mazo
        ],
        logsSoloVieja: [ ...YD_VIEJA, { linea: 'Garret añade Escudo mágico del mazo a la mano.', motivo: ML } ],
        logsSoloNueva: [ ...YD_NUEVA, { linea: 'Garret atrae un Escudo mágico a la mano', motivo: ML } ],
    },
    {
        // Con un Escudo en los DESCARTES aparece la tercera opción. Es la única forma de que
        // Garret lo recupere de ahí, y hoy no la cubría nada.
        nombre: 'Garret: recupera el Escudo mágico de los descartes',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: {
            vanguardia: [{ carta: 'Aniceto', furor: 4 }],
            mano: ['Garret'],
            mazo: ['Mini-tigre', 'Longaniza'],
            descartes: ['Escudo mágico'],
        },
        p2: { vanguardia: ['Mini-tigre'] },
        ...YA_DIVERGIA,
        pasos: [
            { jugar: 'Garret' },
            { elegir: ['Aniceto'] },
            { opcion: 'BUSCAR EN DESCARTES' },
        ],
        logsSoloVieja: [ ...YD_VIEJA, { linea: 'Garret recupera Escudo mágico de los descartes.', motivo: ML } ],
        logsSoloNueva: [ ...YD_NUEVA, { linea: 'Garret atrae un Escudo mágico a la mano', motivo: ML } ],
    },
    {
        // Declinar la búsqueda: Garret entra igual y no se toca ninguna pila.
        nombre: 'Garret: declina la búsqueda y entra igualmente',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: {
            vanguardia: [{ carta: 'Aniceto', furor: 4 }],
            mano: ['Garret'],
            mazo: ['Escudo mágico', 'Mini-tigre'],
        },
        p2: { vanguardia: ['Mini-tigre'] },
        ...YA_DIVERGIA,
        logsSoloVieja: YD_VIEJA,
        logsSoloNueva: YD_NUEVA,
        pasos: [
            { jugar: 'Garret' },
            { elegir: ['Aniceto'] },
            { opcion: 'NO BUSCAR NADA' },
        ],
    },
    {
        // Busca en el mazo y NO hay: el mazo se baraja igualmente (lo hace su propio código, y
        // es el detalle que más fácil se pierde al migrar).
        nombre: 'Garret: busca en el mazo sin Escudo mágico y baraja igual',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        semilla: 7,
        p1: {
            vanguardia: [{ carta: 'Aniceto', furor: 4 }],
            mano: ['Garret'],
            mazo: ['Mini-tigre', 'Longaniza', 'Manzanahoria'],
        },
        p2: { vanguardia: ['Mini-tigre'] },
        ...YA_DIVERGIA,
        pasos: [
            { jugar: 'Garret' },
            { elegir: ['Aniceto'] },
            { opcion: 'BUSCAR EN EL MAZO' },
            { elegir: [], soloEn: 'nueva' },   // el visor se abre igual, vacio y con su aviso dentro
        ],
        logsSoloVieja: [ ...YD_VIEJA, { linea: 'No se encontró ningún Escudo mágico en el mazo.', motivo: MV + '; el aviso lo lleva ahora el propio visor' } ],
        logsSoloNueva: YD_NUEVA,
    },
    // La Bestia NO entra aquí: su búsqueda es de 'Fusión de planos', una carta que NO EXISTE en
    // la base vieja (es de la serie 2), así que no hay nada con lo que comparar. Su búsqueda se
    // caracteriza por aserción en tests/costes_presenta.js.
];

correrSuite('regresion64', escenarios);
