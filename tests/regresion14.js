// tests/regresion14.js — Feria del cómic (evento imperativo → DSL, fase
// interceptores). Nueva maquinaria cubierta: trigger AURA (marca continua
// vía updatePassives, sin exención de Avatar, fiel a la imperativa),
// FIN_TURNO con MONEDA (logs con {jugador}) y BUSCAR con confirmar.
// Nota visual (no comparable por el harness, render anulado): el texto de
// hover pasa de "Silenciado, fuente: Feria del cómic (Evento activo)" a
// "Silenciado, fuente: Feria del cómic (Evento de J1 ...)" — revisar en
// navegador si el matiz importa.

'use strict';
const { correrSuite } = require('./harness');

const M3 = 'norma del proyecto (logs en 3ª persona con {jugador}/dueño): la vieja hablaba en 2ª persona o con nombres a secas';

const escenarios = [
    {
        nombre: 'Feria del cómic silencia a los no-Otaku de ambos campos (el Otaku se libra)',
        p1: { vanguardia: ['Frikazo', 'Oso con armadura'], mano: ['Feria del cómic'] },
        p2: { vanguardia: ['Mini-tigre'], retaguardia: ['Droide antidisturbios'] },
        pasos: [
            { jugar: 'Feria del cómic' },
        ],
    },
    {
        nombre: 'Fin de turno con cara: compra la carta Otaku del mazo y baraja',
        semilla: 13,
        monedas: ['cara'],
        turnoDe: 'p1',
        p1: {
            vanguardia: ['Oso con armadura'],
            evento: { carta: 'Feria del cómic', duracion: 2 },
            mazo: ['Mini-tigre', 'Lolita', 'Robot de seguridad SP'],
        },
        p2: { vanguardia: ['Mini-tigre'], mazo: ['Longaniza'] },
        pasos: [
            { finTurno: true },
            { opcion: 'COMPRAR MERCHANDISING (BUSCAR OTAKU)' },
            { elegir: ['Lolita'] },
        ],
        logsIntencionados: [
            { de: 'Moneda: CARA - ¡Has encontrado algo genial en la Feria!', a: 'Moneda: CARA - ¡J1 (Jugador 1) ha encontrado algo genial en la Feria!', motivo: M3 },
            { de: 'Añades Lolita a tu mano.', a: 'J1 (Jugador 1) añade Lolita (J1 (Jugador 1)) a su mano.', motivo: M3 },
        ],
    },
    {
        nombre: 'Fin de turno con cara pero declinando la compra: sin búsqueda ni barajado',
        semilla: 13,
        monedas: ['cara'],
        turnoDe: 'p1',
        p1: {
            vanguardia: ['Oso con armadura'],
            evento: { carta: 'Feria del cómic', duracion: 2 },
            mazo: ['Mini-tigre', 'Lolita'],
        },
        p2: { vanguardia: ['Mini-tigre'], mazo: ['Longaniza'] },
        pasos: [
            { finTurno: true },
            { opcion: 'NO COMPRAR' },
        ],
        logsIntencionados: [
            { de: 'Moneda: CARA - ¡Has encontrado algo genial en la Feria!', a: 'Moneda: CARA - ¡J1 (Jugador 1) ha encontrado algo genial en la Feria!', motivo: M3 },
        ],
    },
    {
        nombre: 'Fin de turno con cruz: manos vacías, sin modales',
        monedas: ['cruz'],
        turnoDe: 'p1',
        p1: {
            vanguardia: ['Oso con armadura'],
            evento: { carta: 'Feria del cómic', duracion: 2 },
            mazo: ['Lolita'],
        },
        p2: { vanguardia: ['Mini-tigre'], mazo: ['Longaniza'] },
        pasos: [
            { finTurno: true },
        ],
        logsIntencionados: [
            { de: 'Moneda: CRUZ - Había demasiada cola y te fuiste con las manos vacías.', a: 'Moneda: CRUZ - Había demasiada cola y J1 (Jugador 1) se fue con las manos vacías.', motivo: M3 },
        ],
    },
    {
        nombre: 'Cara sin Otakus en el mazo: solo el aviso, sin barajar',
        monedas: ['cara'],
        turnoDe: 'p1',
        p1: {
            vanguardia: ['Oso con armadura'],
            evento: { carta: 'Feria del cómic', duracion: 2 },
            mazo: ['Mini-tigre', 'Robot de seguridad SP'],
        },
        p2: { vanguardia: ['Mini-tigre'], mazo: ['Longaniza'] },
        pasos: [
            { finTurno: true },
        ],
        logsIntencionados: [
            { de: 'Moneda: CARA - ¡Has encontrado algo genial en la Feria!', a: 'Moneda: CARA - ¡J1 (Jugador 1) ha encontrado algo genial en la Feria!', motivo: M3 },
            { de: 'Has mirado en todos los puestos, pero no quedan cartas Otaku en tu mazo.', a: 'J1 (Jugador 1) ha mirado en todos los puestos, pero no quedan cartas Otaku en su mazo.', motivo: M3 },
        ],
    },
    {
        nombre: 'La Feria caduca y cierra sus puertas (los silenciados se liberan)',
        turnoDe: 'p2',
        p1: {
            vanguardia: ['Oso con armadura'],
            evento: { carta: 'Feria del cómic', duracion: 1 },
            mazo: ['Longaniza'],
        },
        p2: { vanguardia: ['Mini-tigre'], mazo: ['Longaniza'] },
        pasos: [
            { finTurno: true }, // p2 pasa → inicio p1: duración 1→0, caduca
        ],
    },
];

correrSuite('regresion14', escenarios);
