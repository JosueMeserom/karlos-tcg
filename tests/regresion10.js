// tests/regresion10.js — Eventos con reglas globales (GLOBAL_MODIFICAR_FUROR,
// GLOBAL_INICIO_TURNO) y auras de entrada (AL_ENTRAR):
//   Investigar y desarrollar (1074), Apuesta (1087),
//   Escape con bomba de humo (1079), Llamada del deber (1068).
//
// Nota: los bloques "abilities" de Apuesta y de la parte GLOBAL_MODIFICAR_FUROR
// de Investigar y desarrollar son BYTE-IDÉNTICOS entre las dos bases (ya
// vivían en el intérprete DSL temprano documentado en CLAUDE.md). Se cubren
// igualmente porque el propio intérprete (_runEffectList, onGlobalBeforeGainFuror,
// onGlobalStartTurn) es parte del "motor común" que sí compara viejo-vs-nuevo
// a través del harness.

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'Investigar y desarrollar: el Científico gana Furor extra en la fase propia',
        turnoDe: 'p1',
        p1: {
            vanguardia: [{ carta: 'Ayudante perturbada', furor: 0 }, { carta: 'Oso con armadura', furor: 0 }],
            mano: ['Investigar y desarrollar'],
        },
        p2: { vanguardia: ['Mini-tigre'], mazo: ['Longaniza'] },
        pasos: [
            { jugar: 'Investigar y desarrollar' },
            { finTurno: true }, // pasa a p2
            { finTurno: true }, // vuelve a p1: fase de Furor propia
        ],
    },
    {
        nombre: 'Investigar y desarrollar caduca: roba 3 y recupera un Esbirro válido del descarte',
        turnoDe: 'p1',
        p1: {
            vanguardia: ['Oso con armadura'],
            evento: { carta: 'Investigar y desarrollar', duracion: 3 },
            descartes: ['Experimento fallido'],
            mazo: ['Mini-tigre', 'Robot de seguridad SP', 'Droide antidisturbios', 'Longaniza'],
        },
        p2: { vanguardia: ['Mini-tigre'], mazo: ['Longaniza', 'Té helado', 'Manzanahoria'] },
        pasos: [
            { finTurno: true }, { finTurno: true }, // ronda 1: duración 3→2
            { finTurno: true }, { finTurno: true }, // ronda 2: duración 2→1
            { finTurno: true },                     // p1→p2
            { finTurno: true },                     // p2→p1: duración 1→0, caduca
            { opcion: 'RECUPERAR ESBIRRO DEL DESCARTE' },
            { elegir: ['Experimento fallido'] },
        ],
        logsIntencionados: [
            { de: 'Experimento fallido es reanimado y se añade a la mano.', a: 'Experimento fallido de J1 (Jugador 1) es reanimado y se añade a la mano.',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
    },
    {
        nombre: 'Apuesta: cruz penaliza el Furor rival, cara no, y al caducar cobra por cada cruz',
        semilla: 9,
        monedas: ['cruz', 'cara'],
        turnoDe: 'p1',
        p1: {
            vanguardia: [{ carta: 'Oso con armadura', furor: 0 }],
            evento: { carta: 'Apuesta', duracion: 2 },
            mazo: ['Longaniza'],
        },
        p2: {
            vanguardia: [{ carta: 'Mini-tigre', furor: 0 }, { carta: 'Robot de seguridad SP', furor: 0 }],
            mazo: ['Longaniza', 'Té helado'],
        },
        pasos: [
            { finTurno: true }, // p1→p2: cruz, Personajes de p2 no ganan Furor
            { finTurno: true }, // p2→p1: duración 2→1
            { finTurno: true }, // p1→p2: cara, Furor normal
            { finTurno: true }, // p2→p1: duración 1→0, caduca: vanguardia de p1 cobra +1 Furor
        ],
    },
    {
        nombre: 'Escape con bomba de humo: retirada gratis mientras dura, cura a los Ninja al expirar',
        turnoDe: 'p1',
        p1: {
            vanguardia: [{ carta: 'Unmei', vida: 2 }],
            retaguardia: ['Oso con armadura'],
            mano: ['Escape con bomba de humo'],
        },
        p2: { vanguardia: ['Mini-tigre'], mazo: ['Longaniza'] },
        pasos: [
            { jugar: 'Escape con bomba de humo' },
            { seleccionar: 'Unmei' },          // vanguardia: entra en SELECT_TARGET
            { seleccionar: 'Oso con armadura' }, // retaguardia: propone la retirada
            { confirmar: true },
            { finTurno: true }, // p1→p2
            { finTurno: true }, // p2→p1: duración 1→0, caduca: cura 3 a Unmei (Ninja, en retaguardia ahora)
        ],
    },
    {
        nombre: 'Llamada del deber: el Guardia Real que entra gana Furor, y al fin de turno se recluta otro',
        semilla: 8,
        turnoDe: 'p1',
        p1: {
            evento: { carta: 'Llamada del deber', duracion: 2 },
            mano: ['Capitán Guardia Real'],
            mazo: ['Águila', 'Mini-tigre', 'Robot de seguridad SP'],
        },
        p2: { vanguardia: ['Mini-tigre'], mazo: ['Longaniza'] },
        pasos: [
            { jugar: 'Capitán Guardia Real' }, // AL_ENTRAR: +1 Furor inmediato
            { finTurno: true },                // FIN_TURNO propio de p1: busca otro Guardia Real
            { opcion: 'BUSCAR GUARDIA REAL EN MAZO' },
            { elegir: ['Águila'] },
            { finTurno: true }, // p2→p1: duración 2→1
            { finTurno: true }, // p1→p2: FIN_TURNO propio, ya no hay Guardia Real en el mazo (sin modal)
            { finTurno: true }, // p2→p1: duración 1→0, caduca
        ],
        logsIntencionados: [
            { de: 'Barajando el mazo...', a: 'Barajando el mazo de J1 (Jugador 1)...',
              motivo: 'atribución de jugador pedida por Toto (21-jul-2026): los logs de zonas ocultas dicen de quién son; la vieja decía "Barajando el mazo..." a secas' },
            { de: '¡Llamada del deber inspira a Capitán Guardia Real!', a: '¡Llamada del deber inspira a Capitán Guardia Real [1] de J1 (Jugador 1)!',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba c.name a secas; la nueva rellena {objetivo} con DSL._nombre (incluye el [n] de copia, ya asignado al salir de la mano)' },
            { de: 'Reclutas a Águila desde tu cuartel.', a: 'J1 (Jugador 1) recluta a Águila de J1 (Jugador 1) desde su cuartel.',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño/jugador): la vieja hablaba en 2ª persona con target.name a secas; la nueva usa {jugador} y DSL._nombre' },
        ],
    },
];

correrSuite('regresion10', escenarios);
