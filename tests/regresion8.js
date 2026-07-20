// tests/regresion8.js — Eventos "preview-only" migrados a DSL:
//   Entrenamiento arduo (1000), Época de estudio (1064),
//   Plan de equipo (1041), Deuda con la mafia (1078).
// Estas cuatro cartas SOLO migraron su texto de vista previa (trigger
// PREVIEW_GLOBAL) al DSL; el resto de su lógica (canPlayCard, onPlay,
// onUpdatePassive, onExpire, onGlobalBeforeAttack, onBeforePlayAsync...)
// sigue siendo imperativo y es BYTE-IDÉNTICO entre las dos bases (verificado
// con diff). Por eso los escenarios se centran en la lógica funcional
// compartida (activación, requisitos, efecto de campo) y no persiguen cada
// rama (expiración con evolución/robo no se cubre aquí: bajo riesgo al ser
// código sin tocar por la migración).

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'Entrenamiento arduo rechazado sin Zoe en el campo',
        p1: { vanguardia: ['Oso con armadura'], mano: ['Entrenamiento arduo'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Entrenamiento arduo' },
        ],
    },
    {
        nombre: 'Entrenamiento arduo: Zoe queda Oculta y agotada mientras esté en juego',
        p1: { vanguardia: ['Zoe', 'Oso con armadura'], mano: ['Entrenamiento arduo'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Entrenamiento arduo' },
        ],
    },
    {
        nombre: 'Época de estudio rechazada sin ningún aliado Estudioso',
        p1: { vanguardia: ['Oso con armadura'], mano: ['Época de estudio'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Época de estudio' },
        ],
    },
    {
        nombre: 'Época de estudio: el Estudioso queda Oculto y no gana Furor, el resto sí',
        turnoDe: 'p1',
        p1: {
            vanguardia: [{ carta: 'Alumno con VP', furor: 0 }, { carta: 'Oso con armadura', furor: 0 }],
            mano: ['Época de estudio'],
        },
        p2: { vanguardia: ['Mini-tigre'], mazo: ['Longaniza'] },
        pasos: [
            { jugar: 'Época de estudio' },
            { finTurno: true }, // pasa a p2
            { finTurno: true }, // vuelve a p1: fase de Furor propia
        ],
    },
    {
        nombre: 'Plan de equipo rechazado si ya se atacó este turno',
        p1: { vanguardia: [{ carta: 'Oso con armadura', furor: 0 }, 'Mini-tigre'], mano: ['Plan de equipo'] },
        p2: { vanguardia: ['Droide antidisturbios'] },
        pasos: [
            { atacar: 'Oso con armadura', objetivo: 'Droide antidisturbios' },
            { jugar: 'Plan de equipo' },
        ],
    },
    {
        nombre: 'Plan de equipo: el ataque combinado suma el Atq de los 2 aliados elegidos',
        p1: {
            vanguardia: [{ carta: 'Oso con armadura', furor: 0 }, { carta: 'Mini-tigre', furor: 0 }, { carta: 'Robot de seguridad SP', furor: 0 }],
            mano: ['Plan de equipo'],
        },
        p2: { vanguardia: [{ carta: 'Droide antidisturbios', vida: 4 }] },
        pasos: [
            { jugar: 'Plan de equipo' },
            { atacar: 'Oso con armadura', objetivo: 'Droide antidisturbios' },
            { elegir: ['Mini-tigre', 'Robot de seguridad SP'] }, // suma de Atq para el ataque
        ],
    },
    {
        nombre: 'Deuda con la mafia rechazada sin ningún aliado en el campo',
        p1: { mano: ['Deuda con la mafia'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Deuda con la mafia' },
        ],
    },
    {
        nombre: 'Deuda con la mafia: el aliado elegido queda Silenciado y sin ganar Furor',
        turnoDe: 'p1',
        p1: {
            vanguardia: [{ carta: 'Oso con armadura', furor: 0 }, { carta: 'Mini-tigre', furor: 0 }],
            mano: ['Deuda con la mafia'],
        },
        p2: { vanguardia: ['Droide antidisturbios'], mazo: ['Longaniza'] },
        pasos: [
            { jugar: 'Deuda con la mafia' },
            { elegir: ['Oso con armadura'] }, // onBeforePlayAsync: elige quién contrae la deuda
            { finTurno: true }, // pasa a p2
            { finTurno: true }, // vuelve a p1: fase de Furor propia
        ],
    },
];

correrSuite('regresion8', escenarios);
