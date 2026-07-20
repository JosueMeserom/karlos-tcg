// tests/regresion5.js — Eventos con ciclo de vida (jugar → disparos → caducar):
//   De compras (1014, FIN_TURNO), Caza del tesoro (1027, AL_JUGAR/AL_CADUCAR),
//   Infundir desesperación (30, bloqueo de Furor + AL_CADUCAR).
// Ejercitan el ciclo completo de turnos del harness: decremento de duración en
// la fase de inicio del dueño, disparos de FIN_TURNO y expiración con modales.
//
// De compras: la vieja tenía un onExpire decorativo ("Termina tu día De
// compras.") que la migración eliminó; se declara en logsSoloVieja.
// PENDIENTE DE CONFIRMAR con Toto que la eliminación fue a propósito.

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'De compras: compra un Ingerible, luego no encuentra nada, y caduca',
        semilla: 3,
        turnoDe: 'p1',
        p1: {
            vanguardia: ['Oso con armadura'],
            evento: { carta: 'De compras', duracion: 2 },
            // De abajo a arriba del array interno; la búsqueda escanea en orden
            mazo: ['Mini-tigre', 'Longaniza', 'Robot de seguridad SP', 'Droide antidisturbios', 'Gallina del infinito'],
        },
        p2: { vanguardia: ['Mini-tigre'], mazo: ['Oso con armadura', 'Longaniza', 'Robot de seguridad SP'] },
        pasos: [
            { finTurno: true }, // FIN_TURNO p1: compra la Longaniza y baraja → turno p2
            { finTurno: true }, // p2 pasa → inicio p1: roba, duración 2→1
            { finTurno: true }, // FIN_TURNO p1: ya no hay Ingeribles → "no quedaba nada" → turno p2
            { finTurno: true }, // p2 pasa → inicio p1: duración 1→0 → caduca
        ],
        logsIntencionados: [
            { de: 'Has comprado: Longaniza.', a: 'J1 (Jugador 1) ha comprado: Longaniza (J1 (Jugador 1)).',
              motivo: 'norma del proyecto (3ª persona con {jugador}): la vieja hablaba en 2ª persona' },
            { de: 'Has mirado toda la tienda y no quedaba nada de eso.', a: 'J1 (Jugador 1) ha mirado toda la tienda y no quedaba nada de eso.',
              motivo: 'norma del proyecto (3ª persona con {jugador}): la vieja hablaba en 2ª persona' },
        ],
        logsSoloVieja: [
            { linea: 'Termina tu día De compras.',
              motivo: 'la migración eliminó el onExpire decorativo; la nueva solo emite el log genérico de expiración del motor (pendiente de confirmar con Toto)' },
        ],
    },
    {
        nombre: 'Caza del tesoro caduca: p1 busca su recompensa, p2 declina',
        semilla: 5,
        turnoDe: 'p2',
        p1: {
            vanguardia: ['Oso con armadura'],
            evento: { carta: 'Caza del tesoro', duracion: 1 },
            mazo: ['Mini-tigre', 'Espada V', 'Canceladora', 'Robot de seguridad SP'],
        },
        p2: {
            vanguardia: ['Droide antidisturbios'],
            mazo: ['Chaqueta metálica defensiva de la muerte', 'Mini-tigre', 'Longaniza'],
        },
        pasos: [
            { finTurno: true },                    // p2 pasa → inicio p1: duración 1→0 → caduca
            { opcion: 'SÍ, BUSCAR EN EL MAZO' },   // p1 acepta
            { elegir: ['Espada V'] },              // p1 elige entre Espada V y Canceladora
            { opcion: 'NO BUSCAR' },               // p2 declina
        ],
    },
    {
        nombre: 'Infundir desesperación bloquea el Furor del rival en su fase',
        turnoDe: 'p1',
        p1: {
            vanguardia: [{ carta: 'Oso con armadura', furor: 1 }],
            evento: { carta: 'Infundir desesperación', duracion: 3 },
            mazo: ['Mini-tigre'],
        },
        p2: {
            vanguardia: [{ carta: 'Mini-tigre', furor: 0 }, { carta: 'Droide antidisturbios', furor: 2 }],
            mazo: ['Longaniza'],
        },
        pasos: [
            { finTurno: true }, // turno de p2: su fase de Furor queda bloqueada por el evento de p1
        ],
    },
    {
        nombre: 'Infundir desesperación caduca: +3 de Furor a los enemigos de vanguardia',
        turnoDe: 'p2',
        p1: {
            vanguardia: ['Oso con armadura'],
            evento: { carta: 'Infundir desesperación', duracion: 1 },
            mazo: ['Mini-tigre'],
        },
        p2: {
            vanguardia: [{ carta: 'Mini-tigre', furor: 1 }],
            retaguardia: ['Droide antidisturbios'], // en retaguardia: no debe recibir Furor
            mazo: ['Longaniza'],
        },
        pasos: [
            { finTurno: true }, // p2 pasa → inicio p1: duración 1→0 → caduca → +3 Furor a la vanguardia de p2
        ],
    },
];

correrSuite('regresion5', escenarios);
