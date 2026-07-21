// tests/regresion15.js — Deuda con la mafia (evento imperativo → DSL, fase
// interceptores). Nueva maquinaria cubierta: ANTES_DE_JUGAR (elección previa
// cancelable que aborta la colocación), guardaIdEnSelf (ancla el instanceId
// del elegido en la propia carta: mismo campo mafiaTargetId que la
// imperativa, estado exportado idéntico), AURA soloSelfId y la regla de
// Furor con objetivoSelfId. r10 conserva sus escenarios previos de esta
// carta (con el mapa de 3ª persona añadido); aquí va el ciclo completo.

'use strict';
const { correrSuite } = require('./harness');

const MAPA_ENDEUDADO = {
    de: '¡Oso con armadura se ha endeudado con la mafia! Queda silenciado y sin cobrar Furor.',
    a: '¡Oso con armadura [1] (J1 (Jugador 1)) se ha endeudado con la mafia! Queda silenciado y sin cobrar Furor.',
    motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas; la nueva rellena {deudor} con DSL._nombre',
};

const escenarios = [
    {
        nombre: 'Colocación eligiendo deudor entre dos: silenciado y sin Furor en su fase',
        turnoDe: 'p1',
        p1: {
            vanguardia: [{ carta: 'Oso con armadura', furor: 0 }, { carta: 'Mini-tigre', furor: 0 }],
            mano: ['Deuda con la mafia'],
            mazo: ['Longaniza'],
        },
        p2: { vanguardia: ['Droide antidisturbios'], mazo: ['Longaniza'] },
        pasos: [
            { jugar: 'Deuda con la mafia' },
            { elegir: ['Oso con armadura'] }, // modal ANTES de colocarse, en ambas bases
            { finTurno: true }, // pasa a p2
            { finTurno: true }, // vuelve a p1: el deudor no gana Furor, el otro sí
        ],
        logsIntencionados: [MAPA_ENDEUDADO],
    },
    {
        nombre: 'Elección cancelada: la carta no se coloca y sigue en la mano',
        p1: { vanguardia: ['Oso con armadura'], mano: ['Deuda con la mafia'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Deuda con la mafia' },
            { cancelar: true }, // botón Cancelar del modal de elección
        ],
    },
    {
        nombre: 'Al caducar: p1 cobra el favor (busca Mafia y baraja), p2 declina',
        semilla: 17,
        turnoDe: 'p2',
        p1: {
            vanguardia: [{ carta: 'Oso con armadura', furor: 0 }],
            evento: { carta: 'Deuda con la mafia', duracion: 1 },
            // OJO: el Guardaespaldas NO va en la cima: p1 roba una carta en su
            // fase de robo ANTES de que el evento caduque en la fase de efectos.
            mazo: ['Mini-tigre', 'Guardaespaldas', 'Longaniza'],
        },
        p2: { vanguardia: ['Droide antidisturbios'], mazo: ['Guardaespaldas', 'Longaniza'] },
        pasos: [
            { finTurno: true }, // p2 pasa → inicio p1: roba, duración 1→0, caduca
            { opcion: 'BUSCAR MAFIA EN EL MAZO' }, // p1
            { elegir: ['Guardaespaldas'] },
            { opcion: 'NO BUSCAR' },               // p2
        ],
        logsIntencionados: [
            { de: 'J1 (Jugador 1) recibe a Guardaespaldas desde el submundo.', a: 'J1 (Jugador 1) recibe a Guardaespaldas (J1 (Jugador 1)) desde el submundo.',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba c.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
    },
    {
        nombre: 'Al caducar sin Mafias en el mazo de p1: silencio para él, p2 sí cobra',
        semilla: 17,
        turnoDe: 'p2',
        p1: {
            vanguardia: [{ carta: 'Oso con armadura', furor: 0 }],
            evento: { carta: 'Deuda con la mafia', duracion: 1 },
            mazo: ['Mini-tigre', 'Longaniza'],
        },
        p2: { vanguardia: ['Droide antidisturbios'], mazo: ['Guardaespaldas', 'Longaniza'] },
        pasos: [
            { finTurno: true },
            { opcion: 'BUSCAR MAFIA EN EL MAZO' }, // p2 (único con Mafias)
            { elegir: ['Guardaespaldas'] },
        ],
        logsIntencionados: [
            { de: 'J2 (Jugador 2) recibe a Guardaespaldas desde el submundo.', a: 'J2 (Jugador 2) recibe a Guardaespaldas (J2 (Jugador 2)) desde el submundo.',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba c.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
    },
];

correrSuite('regresion15', escenarios);
