// tests/regresion46.js — Imp mayor (DEMONIO VIL) y Dáedra migrados al DSL (31-jul-2026).
//
// Imp mayor estrena el trigger NUEVO `ANTES_DE_DEFENDER` -> onBeforeDefend, el gancho de la
// carta QUE DEFIENDE. A propósito NO se migró reutilizando GLOBAL_ANTES_DE_ATAQUE con un
// hipotético soloDefensor:"SELF": ese trigger solo se dispara vía collectAttackInterceptors,
// que SOLO llama performAttack (el ataque normal) — un ataque ESPECIAL (ruta directa del op
// ATACAR, sin pasar por collectAttackInterceptors) no habría drenado Furor al atacante, un
// hueco real de cobertura frente al texto ("Cada vez que sea atacado"). onBeforeDefend en
// cambio lo llaman TODOS los caminos de ataque (9 puntos de disparo en el motor).
//
// Pieza nueva: `ifObjetivo` en los efectos de _runEffectList — condición evaluada sobre EL
// OBJETIVO (aquí, el atacante) en vez de la carta fuente (aquí, quien defiende). El `if`
// genérico ya existente solo mira la fuente; hacía falta un canal aparte para "drena Furor
// SOLO SI al atacante le queda Furor".
//
// Dáedra solo necesitaba una pieza: `accion.multiplicar` en GLOBAL_MODIFICAR_FUROR, hermana
// de `fijar`/`sumar` (que ya existían). El resto (si.objetivoDe, si.algunaEtiqueta, log con
// {objetivo}, preview) ya estaba construido por cartas previas (Mesa de apuestas, etc.).

'use strict';
const { correrSuite } = require('./harness');

// Mismo patrón de flotante duplicado que Gul guerrero (regresion45): la vieja pintaba el
// "-1 FUR" a mano ADEMÁS del automático de modifyStat. Se declara como PAR (el harness
// filtra TODAS las líneas que casan, no una ocurrencia).
const FLOTANTE_FUR_DUPLICADO = {
    flotantesSoloVieja: [
        { linea: '-1 FUR', motivo: 'la vieja lo emite DOS veces (el automático de modifyStat + uno a mano)' },
    ],
    flotantesSoloNueva: [
        { linea: '-1 FUR', motivo: 'la nueva lo emite UNA vez (solo el automático de modifyStat)' },
    ],
};

const escenarios = [
    // ---------------- Imp mayor: DEMONIO VIL (ANTES_DE_DEFENDER) ----------------
    {
        nombre: 'DEMONIO VIL: ataque normal contra Imp mayor drena 1 Furor al atacante',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 3 }] },
        p2: { vanguardia: [{ carta: 'Imp mayor', vida: 6 }] },
        pasos: [ { atacar: 'Mini-tigre', objetivo: 'Imp mayor' } ],
        logsIntencionados: [
            { de: '¡DEMONIO VIL! El aura del Imp drena 1 de Furor de Mini-tigre.',
              a: '¡DEMONIO VIL! El aura del Imp drena 1 de Furor de Mini-tigre [1] de J1 (Jugador 1).',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba attacker.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
        ...FLOTANTE_FUR_DUPLICADO,
    },
    {
        nombre: 'DEMONIO VIL no drena (ni se anuncia) si el atacante ya no tiene Furor',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 0 }] },
        p2: { vanguardia: [{ carta: 'Imp mayor', vida: 6 }] },
        pasos: [ { atacar: 'Mini-tigre', objetivo: 'Imp mayor' } ],
    },
    {
        // Cobertura real de ANTES_DE_DEFENDER frente a un hipotético soloDefensor en
        // GLOBAL_ANTES_DE_ATAQUE: un ataque ESPECIAL (Hechicero, CHIRIBITA) va por la ruta
        // directa del op ATACAR, que NO pasa por collectAttackInterceptors, pero SÍ llama a
        // onBeforeDefend. Imp mayor debe drenar Furor también aquí.
        nombre: 'DEMONIO VIL también drena Furor tras un ataque ESPECIAL (CHIRIBITA de Hechicero)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Hechicero', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Imp mayor', vida: 8 }] },
        pasos: [ { habilidad: 'Hechicero' }, { confirmar: true }, { elegir: ['Imp mayor'] } ],
        logsIntencionados: [
            { de: '¡DEMONIO VIL! El aura del Imp drena 1 de Furor de Hechicero.',
              a: '¡DEMONIO VIL! El aura del Imp drena 1 de Furor de Hechicero [1] de J1 (Jugador 1).',
              motivo: 'ver primer escenario' },
        ],
        ...FLOTANTE_FUR_DUPLICADO,
    },

    // ---------------- Dáedra (GLOBAL_MODIFICAR_FUROR) ----------------
    {
        nombre: 'Dáedra: un Usuario de magia propio recibe el doble de Furor al inicio de turno',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { evento: 'Dáedra', vanguardia: [{ carta: 'Hechicero', furor: 0 }] },
        p2: {},
        pasos: [ { finTurno: true }, { finTurno: true } ],
    },
    {
        nombre: 'Dáedra: un aliado SIN esas etiquetas recibe el Furor normal (no doblado)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { evento: 'Dáedra', vanguardia: [{ carta: 'Mini-tigre', furor: 0 }] },
        p2: {},
        pasos: [ { finTurno: true }, { finTurno: true } ],
    },
    {
        nombre: 'Dáedra: un Monstruo ENEMIGO no recibe el bono (solo aliados propios)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { evento: 'Dáedra' },
        p2: { vanguardia: [{ carta: 'Imp mayor', furor: 0 }] },
        pasos: [ { finTurno: true }, { finTurno: true }, { finTurno: true } ],
    },
];

correrSuite('regresion46', escenarios);
