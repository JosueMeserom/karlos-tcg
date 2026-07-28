// tests/regresion30.js — Aniceto (LUZ VIRTUOSA) migrado a DSL (28-jul-2026, tanda de volumen
// #3). Mismo patrón que Eris (ATACAR especial + chequearEstado), con un MONEDA anidado en
// siExito para decidir el estado alterado (Confusión en cara, Ceguera en cruz) — ninguna pieza
// nueva del intérprete, solo combina lo que ya existía.
//
// Diferencias intencionadas:
//   · El log de activación pasa a nombrar a Aniceto a secas (sin dueño), mismo criterio ya
//     aplicado a Eris/Hawke — el jugador ya sabe qué carta activó.
//   · La vieja mostraba además un prompt PÚBLICO ("Elige objetivo enemigo para LUZ
//     VIRTUOSA.", vía logMsg) al entrar en modo selección de objetivo; el resto de Activas ya
//     migradas (Eris, Hiposaurio...) usaban logError para esto (privado, no comparado) o
//     directamente no tenían prompt — Aniceto era la única con un logMsg público para esto,
//     probablemente un descuido. Se estandariza a "sin prompt", como el resto.
//   · El log de "Confunde/Ciega a X" pasa de target.name a secas a {objetivo} con DSL._nombre
//     (formato "de JX"), igual que el resto del log tras el cambio de formato de esta sesión.
//   · APLICAR_ESTADO dejar rastro de qué Habilidad aplicó el estado (`sourceAbility`); la vieja
//     no lo pasaba (applyStatus con solo 4 argumentos), así que quedaba a null.

'use strict';
const { correrSuite } = require('./harness');

const PROMPT_VIEJA = { linea: 'Elige objetivo enemigo para LUZ VIRTUOSA.', motivo: 'la vieja mostraba un prompt público al entrar en modo selección; se estandariza a "sin prompt", como el resto de Activas ya migradas' };
const LOG_ACTIVACION = { de: '¡Aniceto de J1 (Jugador 1) usa LUZ VIRTUOSA!', a: '¡Aniceto usa LUZ VIRTUOSA!', motivo: 'log de activación de ACTIVA sin dueño, mismo criterio que Eris/Hawke' };

const escenarios = [
    {
        nombre: 'Aniceto: LUZ VIRTUOSA con éxito y cara — Confunde al objetivo',
        p1: { vanguardia: [{ carta: 'Aniceto', furor: 3 }] },
        p2: { vanguardia: [{ carta: 'Oso con armadura', vida: 3 }] },
        pasos: [ { habilidad: 'Aniceto' }, { confirmar: true }, { elegir: ['Oso con armadura'] } ],
        monedas: ['cara'],
        logsSoloVieja: [ PROMPT_VIEJA ],
        logsIntencionados: [
            LOG_ACTIVACION,
            { de: 'Moneda: CARA - ¡Luz Virtuosa Confunde a Oso con armadura!',
              a: 'Moneda: CARA - ¡Luz Virtuosa Confunde a Oso con armadura [1] de J2 (Jugador 2)!',
              motivo: 'cambio de formato de nombre en el log' },
        ],
        diferenciasEsperadas: [
            { contiene: 'status.confusion.sourceAbility', motivo: 'la vieja no pasaba la Habilidad a applyStatus (4 argumentos); la nueva sí, vía APLICAR_ESTADO' },
        ],
    },
    {
        nombre: 'Aniceto: LUZ VIRTUOSA con éxito y cruz — Ciega al objetivo',
        p1: { vanguardia: [{ carta: 'Aniceto', furor: 3 }] },
        p2: { vanguardia: [{ carta: 'Oso con armadura', vida: 3 }] },
        pasos: [ { habilidad: 'Aniceto' }, { confirmar: true }, { elegir: ['Oso con armadura'] } ],
        monedas: ['cruz'],
        logsSoloVieja: [ PROMPT_VIEJA ],
        logsIntencionados: [
            LOG_ACTIVACION,
            { de: 'Moneda: CRUZ - ¡Luz Virtuosa Ciega a Oso con armadura!',
              a: 'Moneda: CRUZ - ¡Luz Virtuosa Ciega a Oso con armadura [1] de J2 (Jugador 2)!',
              motivo: 'cambio de formato de nombre en el log' },
        ],
        diferenciasEsperadas: [
            { contiene: 'status.ceguera.sourceAbility', motivo: 'idem: la vieja no pasaba la Habilidad a applyStatus' },
        ],
    },
    {
        nombre: 'Aniceto: LUZ VIRTUOSA letal no aplica estado (el objetivo muere)',
        p1: { vanguardia: [{ carta: 'Aniceto', furor: 3 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 1 }] },
        pasos: [ { habilidad: 'Aniceto' }, { confirmar: true }, { elegir: ['Mini-tigre'] } ],
        logsSoloVieja: [ PROMPT_VIEJA ],
        logsIntencionados: [ LOG_ACTIVACION ],
    },
    {
        nombre: 'Aniceto: LUZ VIRTUOSA rechazada sin enemigos en vanguardia',
        p1: { vanguardia: [{ carta: 'Aniceto', furor: 3 }] },
        p2: { retaguardia: ['Mini-tigre'] },
        pasos: [ { habilidad: 'Aniceto' } ],
    },
    {
        // uncounterable (SAPIENCIA MÁGICA) sigue intacto: onBeforeDefend de Águila lo comprueba
        // ANTES que isSpecial, así que Águila ni se plantea esquivar (ni lo habría hecho de
        // todas formas, al ser un ataque especial).
        nombre: 'Aniceto: LUZ VIRTUOSA contra Águila — uncounterable, ni se plantea esquivar',
        p1: { vanguardia: [{ carta: 'Aniceto', furor: 3 }] },
        p2: { vanguardia: ['Águila'] },
        pasos: [ { habilidad: 'Aniceto' }, { confirmar: true }, { elegir: ['Águila'] } ],
        monedas: ['cara'],
        logsSoloVieja: [ PROMPT_VIEJA ],
        logsIntencionados: [
            LOG_ACTIVACION,
            { de: 'Moneda: CARA - ¡Luz Virtuosa Confunde a Águila!',
              a: 'Moneda: CARA - ¡Luz Virtuosa Confunde a Águila de J2 (Jugador 2)!',
              motivo: 'cambio de formato de nombre en el log' },
        ],
        diferenciasEsperadas: [
            { contiene: 'status.confusion.sourceAbility', motivo: 'idem: la vieja no pasaba la Habilidad a applyStatus' },
        ],
    },
];

correrSuite('regresion30', escenarios);
