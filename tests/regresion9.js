// tests/regresion9.js — Técnicas/arma con marcas temporales y evento de reemplazo:
//   Infusión de maná (1026, AL_USAR_AYUDA + onEquipUpdate),
//   Rezo en grupo (1053, AL_CONSUMIR con 2 pagadores),
//   Canceladora (1047, AL_CONSUMIR + onStartTurnTempEffect que agota),
//   Giro de guion (1019, evento canReplaceEvent que destruye el del rival).
//
// FIX aplicado en cartas.js: a Rezo en grupo le faltaba inclusoSinValidas en
// su barajarDespues. El texto de la carta dice "Baraja tu mazo" sin
// condición y la vieja siempre barajaba (llamada incondicional, fuera del
// if de resultado de búsqueda); sin el flag, la nueva NO barajaba cuando no
// había Dios/Diosa en el mazo — divergencia de estado real, no solo de log.
// Se corrigió añadiendo el flag (mismo patrón que ya usa Hexagrama).

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'Infusión de maná: paga 2 de Furor y equipa treatAttacksAsSpecial',
        p1: { vanguardia: [{ carta: 'Oso con armadura', furor: 2 }], mano: ['Infusión de maná'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Infusión de maná' },
            { seleccionar: 'Oso con armadura' },
        ],
        logsIntencionados: [
            { de: '¡Oso con armadura canaliza maná puro', a: '¡Oso con armadura [1] (J1 (Jugador 1)) canaliza maná puro',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
    },
    {
        nombre: 'Rezo en grupo: dos pagadores distintos y busca a la única Diosa del mazo',
        semilla: 6,
        p1: {
            vanguardia: [{ carta: 'Oso con armadura', furor: 1 }, { carta: 'Mini-tigre', furor: 1 }],
            mano: ['Rezo en grupo'],
            mazo: ['Robot de seguridad SP', 'Némesis', 'Droide antidisturbios'],
        },
        p2: { vanguardia: ['Droide antidisturbios'] },
        pasos: [
            { jugar: 'Rezo en grupo' },
            { elegir: ['Oso con armadura', 'Mini-tigre'] },
            { elegir: ['Némesis'] },
        ],
        logsIntencionados: [
            { de: '¡La deidad Némesis acude a tu mano!', a: '¡La deidad Némesis (J1 (Jugador 1)) acude a la mano de J1 (Jugador 1)!',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño/jugador): la vieja usaba nombres a secas o 2ª persona; la nueva usa DSL._nombre / {jugador}' },
        ],
        logsSoloNueva: [
            { linea: 'Barajando el mazo de J1 (Jugador 1)...',
              motivo: 'la vieja logueaba el barajado con game.logError (privado, fuera del historial); la nueva usa logMsg público. Visibilidad ampliada por la migración, contenido idéntico.' },
        ],
    },
    {
        nombre: 'Rezo en grupo sin Dioses/Diosas en el mazo: falla la búsqueda pero baraja igualmente',
        semilla: 6,
        p1: {
            vanguardia: [{ carta: 'Oso con armadura', furor: 1 }, { carta: 'Mini-tigre', furor: 1 }],
            mano: ['Rezo en grupo'],
            mazo: ['Robot de seguridad SP', 'Droide antidisturbios'],
        },
        p2: { vanguardia: ['Droide antidisturbios'] },
        pasos: [
            { jugar: 'Rezo en grupo' },
            { elegir: ['Oso con armadura', 'Mini-tigre'] },
        ],
        logsSoloNueva: [
            { linea: 'No quedan Dioses ni Diosas en el mazo de J1 (Jugador 1).',
              motivo: 'la vieja logueaba este aviso con game.logError (privado, fuera del historial); la nueva usa logMsg público. Visibilidad ampliada por la migración, contenido idéntico.' },
            { linea: 'Barajando el mazo de J1 (Jugador 1)...',
              motivo: 'la vieja logueaba el barajado con game.logError (privado, fuera del historial); la nueva usa logMsg público. Visibilidad ampliada por la migración, contenido idéntico.' },
        ],
    },
    {
        nombre: 'Canceladora: el Usuario de VP enemigo pierde su siguiente turno',
        turnoDe: 'p1',
        p1: { vanguardia: ['Oso con armadura'], mano: ['Canceladora'] },
        p2: { vanguardia: ['Alumno con VP', 'Mini-tigre'], mazo: ['Longaniza'] },
        pasos: [
            { jugar: 'Canceladora' },
            { elegir: ['Alumno con VP'] },
            { finTurno: true }, // pasa a p2: al empezar, la Canceladora lo agota
        ],
        logsIntencionados: [
            { de: '¡La Canceladora golpea a Alumno con VP! Perderá', a: '¡La Canceladora golpea a Alumno con VP [1] (J2 (Jugador 2))! Perderá',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
    },
    {
        nombre: 'Giro de guion: sustituye el propio evento y destruye el del rival',
        p1: {
            vanguardia: ['Oso con armadura'],
            evento: { carta: 'De compras', duracion: 2 },
            mano: ['Giro de guion'],
        },
        p2: { vanguardia: ['Mini-tigre'], evento: { carta: 'Infundir desesperación', duracion: 3 } },
        pasos: [
            { jugar: 'Giro de guion' },
        ],
    },
];

correrSuite('regresion9', escenarios);
