// tests/regresion40.js — Cañón de positrones migrado al DSL (30-jul-2026).
//
// El pagador (Karlos) pasa del modal genérico (violaba la norma de targeting en
// tablero) al objetivo de AL_USAR_AYUDA (reborde verde, como Espada V); el
// enemigo se elige con un ELEGIR anidado — SELECT_AYUDA_TARGET solo admite
// aliados como objetivo (comprobado en el motor), así que no puede ser al revés.
// "Destruye" usa MODIFICAR_STAT con vaciar+comprobarMuerte (el mismo canal de
// "daño verdadero" de Granada de maná) más el nuevo flag `sinRetribucion`: la
// vieja llamaba a checkDeath(target, false) a mano para NO dar Retribución por
// ser destrucción directa, no muerte en combate — sin el flag, la víctima habría
// dado Retribución de más.

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'Cañón de positrones: Karlos paga y destruye a un enemigo sin darle Retribución',
        p1: { mano: ['Cañón de positrones'], vanguardia: [ { carta: 'Karlos', furor: 2 } ] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Cañón de positrones' },
            { elegir: ['Karlos'] },
            { elegir: ['Mini-tigre'] },
        ],
        // La vieja usa el flujo RAW de objetivos (abilityContext.targets, maxTargets:1):
        // con cupo 1, el propio clic ya completa el cupo y solo emite el aviso final
        // "Objetivos listos...", sin el intermedio "Objetivo 1 fijado..." (ese solo
        // aparece cuando faltan más objetivos por elegir, ver Garret/Raiju). La nueva
        // resuelve el objetivo con ELEGIR/pickBoardTargets, que no pasa por ahí.
        logsSoloVieja: [
            { linea: 'Objetivos listos. ¡Ejecutando habilidad!',
              motivo: 'aviso genérico de handleAbilityTargetSelection (mecanismo abilityContext.targets de la vieja); con cupo 1 no hay "Objetivo 1 fijado" previo' },
        ],
        logsIntencionados: [
            { de: '¡BZZZZT! El Cañón de positrones impacta de lleno en Mini-tigre.',
              a: '¡BZZZZT! El Cañón de positrones impacta de lleno en Mini-tigre [1] de J2 (Jugador 2).',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
        // La vieja pone target.currentHp = 0 directamente (bypass total de modifyStat) y
        // llama a checkDeath(target,false) a mano: nunca pasa por el canal que genera el
        // floater automático de Vida. La nueva usa MODIFICAR_STAT (vaciar:true), que SÍ
        // pasa por game.modifyStat -> floater automático "-N VIDA", igual que cualquier
        // otro cambio de currentHp del DSL (mismo canal que el "DAÑO VERDADERO" extra de
        // Granada de maná, que sí se muestra en ambas). No es un regresión: es la vieja
        // saltándose el canal común por ser código ad hoc, no una feature que se pierda.
        flotantesSoloNueva: [
            { linea: 'VIDA', motivo: 'la nueva pasa por game.modifyStat (floater automático de Vida); la vieja pone currentHp=0 a mano sin pasar por ese canal' },
        ],
        diferenciasEsperadas: [
            { contiene: 'estado.p1.discard.0.copyId',
              motivo: 'mismo desajuste que regresion16: la vieja mueve la carta a descartes a mano (splice+push), sin pasar por el mecanismo genérico de AL_USAR_AYUDA que asigna copyId al descartar; la nueva sí completa ese flujo estándar' },
            { contiene: 'estado.p1.cardCounts', motivo: 'consecuencia del mismo desajuste: la nueva asigna copyId al descartar, la vieja no llega a esa rama' },
        ],
    },
    {
        nombre: 'Cañón de positrones rechazado: ningún Karlos con Furor suficiente',
        p1: { mano: ['Cañón de positrones'], vanguardia: [ { carta: 'Karlos', furor: 1 } ] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { jugar: 'Cañón de positrones' } ],
    },
    {
        nombre: 'Cañón de positrones rechazado: no hay enemigos a los que destruir',
        p1: { mano: ['Cañón de positrones'], vanguardia: [ { carta: 'Karlos', furor: 2 } ] },
        p2: {},
        pasos: [ { jugar: 'Cañón de positrones' } ],
    },
];

correrSuite('regresion40', escenarios);
