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
            { de: 'Barajando el mazo...', a: 'Barajando el mazo de J1 (Jugador 1)...',
              motivo: 'atribución de jugador pedida por Toto (21-jul-2026): los logs de zonas ocultas dicen de quién son; la vieja decía "Barajando el mazo..." a secas' },
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
        // CAMBIO DE DISEÑO pedido por Toto (21-jul-2026): la pregunta de compra va
        // ANTES de mirar si hay Otakus (preguntarSiempre); si aceptas y no hay, se
        // avisa y se baraja igualmente. La vieja ni preguntaba ni barajaba.
        nombre: 'Cara sin Otakus en el mazo: la nueva pregunta igualmente y baraja al aceptar',
        semilla: 3, // elegida para que el barajado REORDENE el mazo de 3 (con 19 quedaba igual y el contrato estricto lo detectó)
        monedas: ['cara'],
        turnoDe: 'p1',
        p1: {
            vanguardia: ['Oso con armadura'],
            evento: { carta: 'Feria del cómic', duracion: 2 },
            mazo: ['Mini-tigre', 'Robot de seguridad SP', 'Droide antidisturbios'],
        },
        p2: { vanguardia: ['Mini-tigre'], mazo: ['Longaniza'] },
        pasos: [
            { finTurno: true },
            { soloEn: 'nueva', opcion: 'COMPRAR MERCHANDISING (BUSCAR OTAKU)' },
        ],
        logsIntencionados: [
            { de: 'Moneda: CARA - ¡Has encontrado algo genial en la Feria!', a: 'Moneda: CARA - ¡J1 (Jugador 1) ha encontrado algo genial en la Feria!', motivo: M3 },
            { de: 'Has mirado en todos los puestos, pero no quedan cartas Otaku en tu mazo.', a: 'J1 (Jugador 1) ha mirado en todos los puestos, pero no quedan cartas Otaku en su mazo.', motivo: M3 },
        ],
        diferenciasEsperadas: [
            { contiene: 'log[', motivo: 'la nueva añade el log del barajado tras aceptar la compra sin válidas; la vieja no barajaba' },
            { contiene: 'estado.p1.deck', motivo: 'la nueva baraja el mazo al aceptar sin válidas; la vieja lo dejaba intacto' },
        ],
    },
    {
        nombre: 'Cara sin Otakus, declinando la compra: sin barajado (nuevo flujo, la vieja ni pregunta)',
        semilla: 19,
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
            { soloEn: 'nueva', opcion: 'NO COMPRAR' },
        ],
        logsIntencionados: [
            { de: 'Moneda: CARA - ¡Has encontrado algo genial en la Feria!', a: 'Moneda: CARA - ¡J1 (Jugador 1) ha encontrado algo genial en la Feria!', motivo: M3 },
        ],
        diferenciasEsperadas: [
            { contiene: 'log[', motivo: 'la vieja emite su aviso de "no quedan Otakus" sin preguntar; la nueva pregunta y, al declinar, no avisa de nada' },
        ],
    },
    {
        // Cubre el fix del motor (21-jul-2026): el reseteo de updatePassives iba
        // intercalado por jugador y borraba las marcas de auras cruzadas sobre el
        // segundo jugador; además activateAbility no comprobaba el silencio (solo
        // se ocultaba el botón en el render). Ambas bases comparten el fix.
        nombre: 'El silencio de la Feria alcanza al campo ENEMIGO y bloquea su habilidad',
        turnoDe: 'p2',
        p1: {
            vanguardia: ['Frikazo', 'Oso con armadura'],
            evento: { carta: 'Feria del cómic', duracion: 2 },
            mazo: ['Longaniza'],
        },
        p2: { vanguardia: [{ carta: 'Alumno con VP', furor: 2 }], mazo: ['Longaniza'] },
        pasos: [
            { habilidad: 'Alumno con VP', jugador: 'p2' }, // vetada por silencio: sin logs públicos, furor intacto
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
