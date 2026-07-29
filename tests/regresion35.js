// tests/regresion35.js — Domador migrada al DSL (29-jul-2026).
//
// Mismo patrón que Poción revitalizante (JUGAR requisitos + AL_CONSUMIR con ELEGIR
// en tablero, ver regresion27), pero con el bono PERMANENTE en vez de temporal:
// usa `stats` en MARCAR_TEMPORAL (Capitán Guardia Real, LIDERAZGO) sin ningún flag
// de caducidad (duracion/hastaFinDeTurnoPropio/hastaInicioTurnoLanzador), así que
// ninguno de los tres puntos de expiración genéricos retira la marca nunca —
// replica el `return true` a mano que tenía la vieja en onStartTurnTempEffect/
// onEndTurnTempEffect ("Supervivencia infinita"). `tempEffectText` en la plantilla
// conserva el texto rico del antiguo onGetPreviewEffects para "Afectado por:".
//
// Diferencia intencionada: el log de "ha sido domado" pasa de target.name a secas
// a {objetivo} vía DSL._nombre (formato "de JX (Nick)"), igual que el resto del
// log tras el cambio de formato unificado de esta sesión (ver regresion27).

'use strict';
const { correrSuite } = require('./harness');

const DIFF_MARCA = { contiene: 'tempEffects.0',
    motivo: 'estructura de la marca: la vieja guarda campos ad-hoc (duration:999, isDomador:true) y aplica el bono con su propio onUpdateTempEffect; la nueva usa el campo genérico `stats:{atk,def}` (mismo mecanismo que LIDERAZGO) sin duration — el efecto es idéntico (permanente), solo cambia cómo se representa la marca' };

const escenarios = [
    {
        nombre: 'Domador: +2 Atq/+2 Def permanentes a un Animal salvaje elegido en tablero',
        p1: { vanguardia: ['Mini-tigre'], mano: ['Domador'] },
        p2: { vanguardia: ['Robot de seguridad SP'] },
        pasos: [
            { jugar: 'Domador' },
            { elegir: ['Mini-tigre'] },
        ],
        logsIntencionados: [
            { de: '¡Mini-tigre ha sido domado y recibe +2 Atq y +2 Def!',
              a: '¡Mini-tigre [1] de J1 (Jugador 1) ha sido domado y recibe +2 Atq y +2 Def!',
              motivo: 'la vieja usaba target.name a secas; la nueva rellena {objetivo} con DSL._nombre (formato "de JX")' },
        ],
        diferenciasEsperadas: [ DIFF_MARCA ],
    },
    {
        nombre: 'Domador rechazado: sin ningún Animal salvaje en el campo',
        p1: { vanguardia: ['Robot de seguridad SP'], mano: ['Domador'] },
        p2: { vanguardia: ['Robot de seguridad SP'] },
        pasos: [ { jugar: 'Domador' } ],
    },
    {
        // El bono es PERMANENTE ("mientras siga en juego"): a diferencia de LIDERAZGO
        // (hastaFinDeTurnoPropio) o Poción (duracion:3), aquí no hay ningún flag de
        // caducidad — debe sobrevivir a varios ciclos de fin/inicio de turno intactos.
        nombre: 'Domador sobrevive a varios cambios de turno (permanente de verdad)',
        turnoDe: 'p1',
        p1: { vanguardia: ['Mini-tigre'], mano: ['Domador'] },
        p2: { vanguardia: ['Robot de seguridad SP'] },
        pasos: [
            { jugar: 'Domador' },
            { elegir: ['Mini-tigre'] },
            { finTurno: true }, // p1 -> p2
            { finTurno: true }, // p2 -> p1
            { finTurno: true }, // p1 -> p2 otra vez
        ],
        logsIntencionados: [
            { de: '¡Mini-tigre ha sido domado y recibe +2 Atq y +2 Def!',
              a: '¡Mini-tigre [1] de J1 (Jugador 1) ha sido domado y recibe +2 Atq y +2 Def!',
              motivo: 'ver escenario 1' },
        ],
        diferenciasEsperadas: [ DIFF_MARCA ],
    },
];

correrSuite('regresion35', escenarios);
