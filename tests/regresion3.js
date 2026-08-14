// tests/regresion3.js — Tecnología con AL_CONSUMIR:
//   Lupa (29), Cápsula de bio-regeneración (1013), Overclock (1020).
//
// Cápsula: la base vieja comparte el bug de array de Líquido mortal, AGRAVADO:
// sin la guarda idx !== -1, hace p.discard.splice(-1, 1) y "regenera" la
// ÚLTIMA carta del descarte ignorando la elección del jugador. Cuando el
// descarte tiene una única carta válida y es la última, el resultado coincide
// por accidente con la nueva; con más cartas, diverge (escenario documentado).

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'Lupa revela la mano enemiga',
        p1: { vanguardia: ['Oso con armadura'], mano: ['Lupa'] },
        p2: { vanguardia: ['Mini-tigre'], mano: ['Droide antidisturbios', 'Longaniza'] },
        pasos: [
            { jugar: 'Lupa' },
        ],
    },
    {
        nombre: 'Cápsula regenera con descarte de una sola carta (coincidencia accidental viejo-nuevo)',
        p1: {
            vanguardia: ['Oso con armadura', 'Mini-tigre', 'Droide antidisturbios', 'Gallina del infinito'],
            descartes: ['Incluso En El KG'],
            mano: ['Cápsula de bio-regeneración'],
        },
        p2: { vanguardia: ['Robot de seguridad SP'] },
        pasos: [
            { jugar: 'Cápsula de bio-regeneración' },
            { elegir: ['Incluso En El KG'] },
        ],
        logsIntencionados: [
            { de: 'a Incluso En El KG en la retaguardia', a: 'a Incluso En El KG de J1 (Jugador 1) en la retaguardia',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba recovered.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
    },
    {
        nombre: 'Cápsula con dos cartas en el descarte: la vieja regenera la última, no la elegida (bug documentado)',
        p1: {
            vanguardia: ['Oso con armadura', 'Mini-tigre', 'Droide antidisturbios', 'Gallina del infinito'],
            // De arriba a abajo en la lista; la ÚLTIMA de p.discard es 'Longaniza' (Ayuda, ni siquiera Ser vivo)
            descartes: ['Incluso En El KG', 'Longaniza'],
            mano: ['Cápsula de bio-regeneración'],
        },
        p2: { vanguardia: ['Robot de seguridad SP'] },
        pasos: [
            { jugar: 'Cápsula de bio-regeneración' },
            { elegir: ['Incluso En El KG'] },
        ],
        diferenciasEsperadas: [
            { contiene: 'log[0]',
              motivo: 'la vieja loguea que regenera a Longaniza (la última del descarte, por el splice(-1,1) sin guarda); la nueva regenera la carta elegida' },
            { contiene: 'estado.p1.rearguard.0',
              motivo: 'vieja: entra Longaniza (una Ayuda) en retaguardia; nueva: entra Incluso En El KG, el Ser vivo elegido' },
            { contiene: 'estado.p1.discard',
              motivo: 'los descartes resultantes difieren: la vieja saca la última carta, la nueva la elegida' },
        ],
    },
    {
        nombre: 'Overclock: +2/+2 temporal a una Máquina elegida entre dos',
        p1: {
            vanguardia: [{ carta: 'Robot de seguridad SP', furor: 1 }, 'Droide antidisturbios', 'Oso con armadura'],
            mano: ['Overclock'],
        },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Overclock' },
            { elegir: ['Robot de seguridad SP'] }, // vieja: modal visual · nueva: selección-en-tablero
        ],
        logsIntencionados: [
            { de: '¡Robot de seguridad SP recibe Overclock!', a: '¡Robot de seguridad SP [1] de J1 (Jugador 1) recibe Overclock!',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
    },
    {
        nombre: 'Overclock expira al inicio del propio turno (dos fines de turno)',
        p1: { vanguardia: ['Robot de seguridad SP'], mano: ['Overclock'], mazo: ['Mini-tigre'] },
        p2: { vanguardia: ['Oso con armadura'], mazo: ['Longaniza'] },
        turnoDe: 'p1',
        pasos: [
            { jugar: 'Overclock' },
            { elegir: ['Robot de seguridad SP'] },
            { finTurno: true },   // pasa a p2 (roba Longaniza)
            { finTurno: true },   // vuelve a p1 (roba Mini-tigre): el Overclock se apaga
        ],
        logsIntencionados: [
            { de: 'de seguridad SP', a: 'de seguridad SP [1] de J1 (Jugador 1)', motivo: 'NORMA DEL PROYECTO aplicada al {carta} del DSL (14-ago-2026): un log que nombra una carta dice de quien es, con el formato de siempre. La vieja usaba el nombre pelado. Mismo mensaje, nombre completo' },
            { de: '¡Robot de seguridad SP recibe Overclock!', a: '¡Robot de seguridad SP [1] de J1 (Jugador 1) recibe Overclock!',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
    },
];

correrSuite('regresion3', escenarios);
