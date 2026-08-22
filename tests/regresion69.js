// tests/regresion69.js — POCA PACIENCIA (K.I.N.O.), que no tenía ninguna suite.
//
// Se escribe al migrarla al DSL: dos piezas nuevas, las dos genéricas -el trigger
// AL_CAMBIAR_DE_ZONA, que lleva él la cuenta de la última fila, y el op INTERCAMBIAR_POSICION- y
// ninguna forma de saber si el comportamiento seguía siendo el mismo. Los cuatro caminos que
// tiene la Pasiva: entrar a vanguardia, retirarse a retaguardia, agotar la paciencia con alguien
// detrás (intercambio forzoso) y agotarla sin nadie (se destruye).
'use strict';
const { correrSuite } = require('./harness');

// Un contador ya puesto, para no tener que pasar tres turnos hasta llegar a 0. `lastLocation`
// va con él: si no, la carta se cree recién llegada y se regala otros 2 Contadores.
const conPaciencia = (n) => ({
    carta: 'K.I.N.O.',
    campos: {
        lastLocation: 'vanguard',
        counters: { kino_paciencia: { name: 'Contadores', count: n, source: 'K.I.N.O.', icon: '⚙️' } },
    },
});

// La base congelada escribía "K.I.N.O." a secas en sus logs; la norma del proyecto es nombrar
// cualquier carta del log con su dueño, y eso es lo que rellena {carta} en el DSL. Mismo texto.
// (La versión imperativa VIVA ya lo hacía así: esta divergencia no nace de la migración.)
const NOMBRE = {
    logsIntencionados: [
        { de: 'K.I.N.O. pierde 1 Contador', a: 'K.I.N.O. de J1 (Jugador 1) pierde 1 Contador', motivo: 'norma del proyecto: una carta nombrada en el log lleva su dueño' },
        { de: '¡A K.I.N.O. se le ha agotado', a: '¡A K.I.N.O. de J1 (Jugador 1) se le ha agotado', motivo: 'idem' },
        { de: '¡K.I.N.O. se auto-destruye!', a: '¡K.I.N.O. de J1 (Jugador 1) se auto-destruye!', motivo: 'idem' },
        { de: 'K.I.N.O. entra a vanguardia', a: 'K.I.N.O. de J1 (Jugador 1) entra a vanguardia', motivo: 'idem' },
        { de: 'K.I.N.O. se retira y pierde', a: 'K.I.N.O. de J1 (Jugador 1) se retira y pierde', motivo: 'idem' },
        { de: 'K.I.N.O. fuerza un intercambio', a: 'K.I.N.O. de J1 (Jugador 1) fuerza un intercambio', motivo: 'idem' },
        { de: 'intercambio con Mini-tigre.', a: 'intercambio con Mini-tigre [1] de J1 (Jugador 1).', motivo: 'idem, aplicado a la otra carta del intercambio' },
    ],
    flotantesIntencionados: [
        { de: 'DESTRUIDO · ft-red-stat', a: 'DESTRUIDO · ft-red',
          motivo: 'el flotante de destrucción sale ahora del helper único del motor (floatingDestruido), que usa el rojo de siempre; K.I.N.O. tenía a mano el rojo de STATS, que es el de "-1 FUR"' },
    ],
};

const escenarios = [
    {
        // Al entrar en vanguardia gana sus 2 Contadores. Sin pasos: lo hace updatePassives al
        // montar la mesa, que es exactamente cuando la carta "llega".
        nombre: 'K.I.N.O. entra a vanguardia y gana 2 Contadores',
        p1: { vanguardia: ['K.I.N.O.'] },
        p2: { vanguardia: ['Mini-tigre'] },
        ...NOMBRE,
        pasos: [],
    },
    {
        // Con 2 Contadores, al final de su turno baja a 1 y no pasa nada más.
        nombre: 'K.I.N.O. pierde 1 Contador al final de su turno',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [conPaciencia(2)] },
        p2: { vanguardia: ['Mini-tigre'] },
        ...NOMBRE,
        pasos: [ { finTurno: true } ],
    },
    {
        // El último Contador: con alguien en retaguardia, intercambio OBLIGATORIO.
        nombre: 'K.I.N.O. agota la paciencia y fuerza el intercambio',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [conPaciencia(1)], retaguardia: ['Mini-tigre'] },
        p2: { vanguardia: ['Oso con armadura'] },
        ...NOMBRE,
        // `elegir` y no `elegirTablero`: la VIEJA abre el modal genérico de búsqueda y la nueva
        // pide la carta EN EL TABLERO (norma de UX de Toto, ya aplicada a la imperativa viva el
        // 7-ago-2026). `elegir` responde a las dos, que para eso existe.
        pasos: [
            { finTurno: true },
            { elegir: ['Mini-tigre'] },
        ],
    },
    {
        // Y sin nadie detrás a quien empujar, se destruye. Sin Retribución: no es una muerte en
        // combate (por eso p1 conserva sus dos cartas de retribución al terminar).
        nombre: 'K.I.N.O. sin retaguardia se auto-destruye',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [conPaciencia(1)], retribucion: ['Longaniza', 'Longaniza'] },
        p2: { vanguardia: ['Oso con armadura'] },
        ...NOMBRE,
        pasos: [ { finTurno: true } ],
    },
];

correrSuite('regresion69', escenarios);
