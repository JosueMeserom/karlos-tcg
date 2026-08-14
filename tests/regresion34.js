// tests/regresion34.js — Xanadu (REPULSIÓN ABSOLUTA): corrige el bug hermano del
// de Águila (ver regresion28/estado-migracion-dsl). La vieja usaba `!abilityName`
// como proxy de "es un ataque normal", que falla en los dos sentidos: un ataque
// normal CON nombre de Habilidad (BOMBAZO, CABREO...) no ofrecía la repulsión
// aunque el texto de Xanadu la exige ("al recibir ataque normal"), y cualquier
// ataque especial SIN nombre sí la habría ofrecido. onBeforeDefend ahora recibe
// el 5º parámetro `isSpecial` (mismos 9 puntos del motor del fix de Águila) y lo
// comprueba en vez de `abilityName`. De paso gana la exención de Aniceto
// (uncounterable / SAPIENCIA MÁGICA) que Águila ya tenía y Xanadu no.
// No es una migración: Xanadu sigue imperativa (getCustomActions en ESTORNUDO
// DEVASTADOR), esta suite solo cubre el hook tocado (onBeforeDefend), no la carta
// entera.

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        // BUG real corregido, no replicado: un ataque NORMAL con nombre de Habilidad
        // (BOMBAZO) no activaba la repulsión en la vieja porque `abilityName` venía
        // truthy y la condición era `!abilityName`. La nueva sí la ofrece (y aquí se
        // declina, para no arrastrar la rama de "repele con éxito" a esta suite).
        nombre: 'BOMBAZO (normal, con nombre) contra Xanadu: la nueva SÍ ofrece REPULSIÓN ABSOLUTA',
        monedas: ['cara'], // BOMBAZO: cara = sin retroceso, fuera de foco de este escenario
        p1: { vanguardia: [{ carta: 'Contendiente', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Xanadu', furor: 1 }] },
        pasos: [
            { habilidad: 'Contendiente' },
            { confirmar: true },
            { elegir: ['Xanadu'] },
            { soloEn: 'nueva', opcion: 'NO' }, // la vieja nunca llega a ofrecer el modal
        ],
    },
    {
        // Segundo bug corregido de encima: Xanadu no comprobaba `uncounterable`
        // (SAPIENCIA MÁGICA de Aniceto: "sus ataques y Habilidades son imparables").
        // Un ataque NORMAL PLANO (sin Activa) de Aniceto: la vieja sí ofrecía el modal
        // de repulsión (bug, Aniceto debería ser inmune); la nueva lo bloquea en
        // silencio salvo por el aviso de sistema.
        nombre: 'Ataque normal de Aniceto contra Xanadu: uncounterable bloquea la repulsión',
        p1: { vanguardia: [{ carta: 'Aniceto', furor: 0 }] },
        p2: { vanguardia: [{ carta: 'Xanadu', furor: 1 }] },
        pasos: [
            { atacar: 'Aniceto', objetivo: 'Xanadu' },
            { soloEn: 'vieja', opcion: 'NO' }, // la nueva nunca llega a ofrecer el modal
        ],
        logsSoloNueva: [
            { linea: 'ignora las defensas evasivas gracias a su pasiva.',
              motivo: 'exención de uncounterable (SAPIENCIA MÁGICA) que Xanadu no comprobaba; Águila ya la tenía desde el 28-jul-2026' },
        ],
    },
    {
        // Control de no-regresión: un ataque ESPECIAL con nombre (CHIRIBITA) ya
        // declinaba la repulsión en ambas bases (la vieja por `abilityName` truthy,
        // la nueva por `isSpecial`) — incluido para dejar constancia de que el
        // resultado neto sigue siendo el mismo pese al cambio de mecanismo, mismo
        // patrón que "Hechicero: CHIRIBITA contra Águila" en regresion28.
        nombre: 'CHIRIBITA (especial) contra Xanadu: sigue sin ofrecer repulsión en ninguna base',
        p1: { vanguardia: [{ carta: 'Hechicero', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Xanadu', furor: 1 }] },
        pasos: [ { habilidad: 'Hechicero' }, { confirmar: true }, { elegir: ['Xanadu'] } ],
    },
];

correrSuite('regresion34', escenarios);
