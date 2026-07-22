// tests/regresion22.js — Tanda de equipos, fase 2: Espada V migrada por completo
// al DSL (canPlayCard/onPlay/onValidateTarget/onExecuteAyuda/onEquipUpdate ->
// JUGAR requisitos + AL_USAR_AYUDA + mientrasEquipado). Selección de objetivo por
// tablero en AMBAS bases (onValidateTarget/SELECT_AYUDA_TARGET ya era reborde
// verde en la vieja, no un modal): la migración no cambia el mecanismo de elegir,
// solo quién genera el hook.
//
// Nota de motor (23-jul-2026): el pipeline onValidateTarget+onExecuteAyuda
// (executeAyuda en index.html) movía SIEMPRE la carta jugada a descartes cuando
// onExecuteAyuda devolvía true, incluso si el efecto la había anexado — así que un
// equipo jugado por este pipeline (Espada V, Infusión de maná) quedaba a la vez
// equipado Y físicamente en descartes (carta fantasma). Toto pidió arreglarlo: ahora
// executeAyuda, si la carta quedó con equippedTo, la deja en location:'equipped' y NO
// la descarta. Como es motor COMPARTIDO por ambas bases, la comparación viejo-vs-nuevo
// sigue en verde (ambas cambian igual). Sin flotantes al equipar (la vieja
// onExecuteAyuda de Espada V nunca llamaba a showFloatingText).
//
// De paso, esta suite es la prueba de fuego del nuevo campo `mientrasEquipado`
// (declarable en AL_EQUIPAR o en AL_USAR_AYUDA, compilado a onEquipUpdate):
// Furia berserker, Shichishito y Chaqueta metálica defensiva de la muerte —ya
// migradas antes, con su AL_EQUIPAR declarativo pero el buff aún imperativo—
// pasan también a usar `mientrasEquipado` en esta misma tanda. Su cobertura de
// comportamiento (targeting, ELEGIR, MARCAR_JUGADOR, buff resultante) ya vive en
// regresion6; que siga en verde confirma que el buff declarativo replica
// exactamente `target.currentAtk/currentDef +=` de antes.

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'Espada V: Agah la empuña y gana +2 Atq',
        p1: {
            vanguardia: ['Agah'],
            mano: ['Espada V'],
        },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Espada V' },
            { elegir: ['Agah'] }, // selección-en-tablero en ambas bases (SELECT_AYUDA_TARGET)
        ],
        logsIntencionados: [
            { de: '¡Agah empuña la mítica Espada V!', a: 'Agah (J1 (Jugador 1)) empuña la mítica Espada V.',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño, sin exclamación): la vieja usaba target.name a secas con "¡...!"; la nueva rellena {objetivo} con DSL._nombre, sin exclamación (coherente con Shichishito)' },
        ],
    },
    {
        nombre: 'Espada V: segunda copia queda bloqueada tras usar la primera',
        p1: {
            vanguardia: ['Karlos'],
            mano: ['Espada V', { carta: 'Espada V' }],
        },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Espada V', indice: 0 },
            { elegir: ['Karlos'] },
            // Segunda copia: requisito espadaV_Used la rechaza (logError privado,
            // no entra en el historial compartido); debe seguir en mano.
            { jugar: 'Espada V' },
        ],
        logsIntencionados: [
            { de: '¡Karlos empuña la mítica Espada V!', a: 'Karlos (J1 (Jugador 1)) empuña la mítica Espada V.',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño, sin exclamación): la vieja usaba target.name a secas con "¡...!"; la nueva rellena {objetivo} con DSL._nombre, sin exclamación' },
        ],
    },
    {
        nombre: 'Espada V: rechazada sin ningún Karlos ni Agah en el campo',
        p1: {
            vanguardia: ['Mini-tigre'],
            mano: ['Espada V'],
        },
        p2: { vanguardia: ['Oso con armadura'] },
        pasos: [
            { jugar: 'Espada V' },
        ],
        logsIntencionados: [],
    },
];

correrSuite('regresion22', escenarios);
