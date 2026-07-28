// tests/regresion33.js — Gólem de tierra (SEÍSMO): ataque normal a dos enemigos
// distintos elegidos en tablero. Migración vía ELEGIR (cantidad exacta 2, sin
// hastaCantidad) + ATACAR sin `especial` (performAttack íntegro, igual que la
// vieja). Ángel (SANCIÓN) queda fuera de esta tanda: ya se decidió (27-jul-2026,
// comentario en cartas.js junto a la carta) dejarla imperativa porque admite
// parar en 1 objetivo (canStopEarly), arquitectura que ELEGIR no cubre y que no
// compensaba construir para una sola carta.
//
// Diferencias intencionadas, ambas por el CAMBIO DE MECANISMO de selección (no por
// nada del efecto en sí): la vieja usa el abilityContext.targets genérico
// (target.cantidad), que handleAbilityTargetSelection (index.html) anuncia con dos
// logs de sistema fijos; la nueva usa ELEGIR (pickBoardTargets/dslPick), que no
// pasa por ahí. Efecto colateral en el escenario de cancelación: la vieja paga el
// Furor de SEÍSMO en onTargetsReady, DESPUÉS de completar la elección; la nueva
// (como toda Activa del compilador genérico) lo paga ANTES de correr sus efectos,
// incluido el ELEGIR — mismo patrón ya aceptado en ACERTIJO y el 2º ELEGIR de PEM
// (regresion17): el ELEGIR post-coste se marca `cancelable: false` y cancelar se
// ignora (con su propio aviso de sistema, ausente en la vieja). No cambia el
// estado final de ningún escenario (el Furor gastado es el mismo si la elección
// se completa).

'use strict';
const { correrSuite } = require('./harness');

const LOGS_SISTEMA_VIEJA = [
    { linea: 'Elige al primer objetivo del Seísmo.',
      motivo: 'la vieja logueaba el prompt de selección con logMsg (tipo system, entra en logHistory); la nueva usa el título del ELEGIR, que pickBoardTargets muestra vía logError (privado, skipHistory) y no entra en el historial comparado' },
    { linea: 'Objetivo 1 fijado. Elige al siguiente objetivo.',
      motivo: 'aviso genérico de handleAbilityTargetSelection (mecanismo abilityContext.targets de la vieja); la nueva resuelve los 2 objetivos con ELEGIR/pickBoardTargets, que no pasa por ahí' },
    { linea: 'Objetivos listos. ¡Ejecutando habilidad!',
      motivo: 'mismo mecanismo que la anterior: aviso genérico de handleAbilityTargetSelection al completar el cupo de objetivos' },
];

const escenarios = [
    {
        nombre: 'SEÍSMO: ataque normal a dos enemigos distintos elegidos en tablero',
        p1: { vanguardia: [{ carta: 'Gólem de tierra', furor: 1 }] },
        p2: { vanguardia: ['Mini-tigre', 'Robot de seguridad SP'] },
        pasos: [
            { habilidad: 'Gólem de tierra' },
            { confirmar: true },
            { elegir: ['Mini-tigre', 'Robot de seguridad SP'] },
        ],
        logsSoloVieja: LOGS_SISTEMA_VIEJA,
    },
    {
        nombre: 'SEÍSMO rechazado: un enemigo Provocando exige objetivo único',
        p1: { vanguardia: [{ carta: 'Gólem de tierra', furor: 1 }] },
        p2: { vanguardia: ['Achmay', 'Mini-tigre'] },
        pasos: [ { habilidad: 'Gólem de tierra' } ],
    },
    {
        nombre: 'SEÍSMO rechazado: solo hay un enemigo válido en vanguardia',
        p1: { vanguardia: [{ carta: 'Gólem de tierra', furor: 1 }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { habilidad: 'Gólem de tierra' } ],
    },
    {
        nombre: 'SEÍSMO ignora al enemigo Oculto: ni cuenta ni es seleccionable',
        p1: { vanguardia: [{ carta: 'Gólem de tierra', furor: 1 }] },
        p2: { vanguardia: ['Mini-tigre', 'Robot de seguridad SP', { carta: 'Oso con armadura', campos: { stealth: true } }] },
        pasos: [
            { habilidad: 'Gólem de tierra' },
            { confirmar: true },
            { elegir: ['Mini-tigre', 'Robot de seguridad SP'] },
        ],
        logsSoloVieja: LOGS_SISTEMA_VIEJA,
    },
    {
        nombre: 'SEÍSMO: intentar cancelar tras confirmar (Furor ya comprometido) se ignora',
        p1: { vanguardia: [{ carta: 'Gólem de tierra', furor: 1 }] },
        p2: { vanguardia: ['Mini-tigre', 'Robot de seguridad SP'] },
        pasos: [
            { habilidad: 'Gólem de tierra' },
            { confirmar: true },
            { soloEn: 'nueva', cancelar: true }, // intento de cancelar tras pagar el Furor: ignorado
            { elegir: ['Mini-tigre', 'Robot de seguridad SP'] },
        ],
        logsSoloVieja: LOGS_SISTEMA_VIEJA,
        logsSoloNueva: [
            { linea: 'Ya te has comprometido: no puedes cancelar esta elección.',
              motivo: 'aviso genérico que el motor emite al rechazar cancelAction() sobre un ELEGIR cancelable:false; la vieja no pasa por ELEGIR para SEÍSMO y no tiene este aviso' },
        ],
    },
];

correrSuite('regresion33', escenarios);
