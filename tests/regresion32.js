// tests/regresion32.js — Limo artificial y Investigador demente migrados a DSL (28-jul-2026).
//
// Ambas usan la MISMA pieza nueva: `especial: false` en ATACAR — la ruta directa (sin
// performAttack) que Hechicero/Eris/Aniceto ya usaban con `especial: true`, pero marcando el
// golpe como NORMAL en dealDamage. Hacía falta la ruta directa porque las dos necesitan
// resolver una moneda CONDICIONADA al golpe (no un ataque especial de verdad): Limo artificial
// decide el estado DESPUÉS de golpear (MONEDA dentro de siExito); Investigador demente decide
// SI ATACA antes de golpear (MONEDA envuelve a ATACAR).
//
// Diferencias intencionadas:
//   · Ambas mostraban un prompt PÚBLICO al entrar en modo selección de objetivo (vía logMsg,
//     no logError) — mismo hallazgo que con Aniceto (regresion30): se estandariza a "sin
//     prompt", como el resto de Activas ya migradas.
//   · Los logs de "Confunde a X"/aplicación de estado pasan de target.name a secas a
//     {objetivo} con DSL._nombre (formato "de JX").
//   · APLICAR_ESTADO deja sourceAbility (la vieja llamaba a applyStatus con solo 3/4
//     argumentos, sin la Habilidad ni, en el caso de Investigador demente, sin fuente real —
//     pasaba `card.name` como string en vez de la carta).
//
// BUG real encontrado y corregido, no replicado: la Limo artificial VIEJA nunca llamaba a
// game.checkDeath(target) tras el golpe letal — el objetivo se quedaba en el tablero con 0 de
// Vida, sin ir a la pila de descartes y sin que su dueño perdiera retribución. El op ATACAR sí
// llama a checkDeath (lo hace desde que existe el modo especial:true), así que la migración lo
// arregla de encima, sin proponérselo.

'use strict';
const { correrSuite } = require('./harness');

const PROMPT_LIMO = { linea: 'Elige objetivo para ABRAZO PEGAJOSO.', motivo: 'prompt público de la vieja al entrar en modo selección; se estandariza a "sin prompt"' };

// Águila (PSEUDO-PREVASIÓN) migrada al DSL el 31-jul-2026 (ver regresion53): su log de esquiva
// nombraba al ATACANTE a secas (`attacker.name`); ahora usa DSL._nombre, como manda la norma de
// logs en 3ª persona con dueño. Afecta a toda suite donde alguien ataca a Águila y falla.
const ESQUIVA_NOMBRE_ATACANTE = (plano, conDueno) => ({
    de: `ESQUIVÓ el ataque de ${plano}!`, a: `ESQUIVÓ el ataque de ${conDueno}!`,
    motivo: 'norma del proyecto (logs en 3ª persona con dueño): la Águila vieja usaba attacker.name a secas; la migrada rellena {objetivo} con DSL._nombre',
});

const escenarios = [
    // --- Limo artificial: ABRAZO PEGAJOSO ---
    {
        nombre: 'Limo artificial: ABRAZO PEGAJOSO con éxito y cara — Confunde',
        p1: { vanguardia: [{ carta: 'Limo artificial', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 3 }] },
        pasos: [ { habilidad: 'Limo artificial' }, { confirmar: true }, { elegir: ['Mini-tigre'] } ],
        monedas: ['cara'],
        logsSoloVieja: [ PROMPT_LIMO ],
        logsIntencionados: [
            { de: '> Moneda: CARA - ¡Confunde a Mini-tigre!',
              a: '> Moneda: CARA - ¡Confunde a Mini-tigre [1] de J2 (Jugador 2)!',
              motivo: 'cambio de formato de nombre' },
        ],
        diferenciasEsperadas: [
            { contiene: 'status.confusion.sourceAbility', motivo: 'APLICAR_ESTADO deja la Habilidad; la vieja llamaba a applyStatus sin ese argumento' },
        ],
    },
    {
        nombre: 'Limo artificial: ABRAZO PEGAJOSO con éxito y cruz — sin estado',
        p1: { vanguardia: [{ carta: 'Limo artificial', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 3 }] },
        pasos: [ { habilidad: 'Limo artificial' }, { confirmar: true }, { elegir: ['Mini-tigre'] } ],
        monedas: ['cruz'],
        logsSoloVieja: [ PROMPT_LIMO ],
    },
    {
        nombre: 'Limo artificial: ABRAZO PEGAJOSO esquivado — sin daño, sin moneda de confusión',
        p1: { vanguardia: [{ carta: 'Limo artificial', furor: 1 }] },
        p2: { vanguardia: ['Águila'] },
        pasos: [ { habilidad: 'Limo artificial' }, { confirmar: true }, { elegir: ['Águila'] } ],
        monedas: ['cara'], // única moneda del escenario: la esquiva de PSEUDO-PREVASIÓN
        logsSoloVieja: [ PROMPT_LIMO ],
        logsIntencionados: [ ESQUIVA_NOMBRE_ATACANTE('Limo artificial', 'Limo artificial [1] de J1 (Jugador 1)') ],
    },
    {
        nombre: 'Limo artificial: ABRAZO PEGAJOSO letal (BUG corregido: la vieja no mataba de verdad)',
        p1: { vanguardia: [{ carta: 'Limo artificial', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 1 }] },
        pasos: [ { habilidad: 'Limo artificial' }, { confirmar: true }, { elegir: ['Mini-tigre'] } ],
        logsSoloVieja: [ PROMPT_LIMO ],
        logsSoloNueva: [
            { linea: 'ha sido destruido', motivo: 'consecuencia del mismo bug: solo la nueva llama a checkDeath, así que solo ella anuncia la muerte' },
        ],
        diferenciasEsperadas: [
            { contiene: 'estado.p2.hp',
              motivo: 'BUG de la vieja: nunca llamaba a checkDeath tras el golpe, así que Mini-tigre se quedaba en el tablero con 0 de Vida y su dueño no perdía retribución (hp se queda en 6). La nueva sí llama a checkDeath -lo hace el propio op ATACAR-, así que p2 pierde 1 retribución (hp a 0, único punto de retribución en el escenario)' },
            { contiene: 'estado.p2.vanguard.0', motivo: 'la vieja deja a Mini-tigre vivo (0 Vida) en el tablero; la nueva lo retira correctamente' },
            { contiene: 'estado.p2.discard.0', motivo: 'la nueva lo manda a la pila de descartes, como corresponde a una muerte real; la vieja nunca lo hace' },
        ],
    },
    {
        nombre: 'Limo artificial: ABRAZO PEGAJOSO rechazado sin enemigos en vanguardia',
        p1: { vanguardia: [{ carta: 'Limo artificial', furor: 1 }] },
        p2: { retaguardia: ['Mini-tigre'] },
        pasos: [ { habilidad: 'Limo artificial' } ],
    },

    // --- Investigador demente: INYECCIÓN DE MEJUNJE ---
    {
        nombre: 'Investigador demente: INYECCIÓN cara — ataque normal y duerme',
        p1: { vanguardia: [{ carta: 'Investigador demente', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Oso con armadura', vida: 3 }] },
        pasos: [ { habilidad: 'Investigador demente' }, { confirmar: true }, { elegir: ['Oso con armadura'] } ],
        monedas: ['cara'],
        diferenciasEsperadas: [
            { contiene: 'status.sueno.sourceAbility', motivo: 'APLICAR_ESTADO deja la Habilidad; la vieja no la pasaba' },
            { contiene: 'status.sueno.source', motivo: 'la vieja pasaba card.name (string) como fuente a applyStatus; APLICAR_ESTADO usa por defecto la carta completa, con el formato estándar "de JX"' },
        ],
    },
    {
        nombre: 'Investigador demente: INYECCIÓN cara pero esquivada — sin daño, sin sueño',
        p1: { vanguardia: [{ carta: 'Investigador demente', furor: 1 }] },
        p2: { vanguardia: ['Águila'] },
        pasos: [ { habilidad: 'Investigador demente' }, { confirmar: true }, { elegir: ['Águila'] } ],
        monedas: ['cara', 'cara'], // 1ª: INYECCIÓN sale cara; 2ª: PSEUDO-PREVASIÓN esquiva
        logsIntencionados: [ ESQUIVA_NOMBRE_ATACANTE('Investigador demente', 'Investigador demente [1] de J1 (Jugador 1)') ],
    },
    {
        nombre: 'Investigador demente: INYECCIÓN cara pero Confundido — pierde el ataque por checkAttackStatus',
        p1: { vanguardia: [{ carta: 'Investigador demente', furor: 1, estado: { confusion: { duration: 2 } } }] },
        p2: { vanguardia: ['Oso con armadura'] },
        pasos: [ { habilidad: 'Investigador demente' }, { confirmar: true }, { elegir: ['Oso con armadura'] } ],
        monedas: ['cara', 'cruz'], // 1ª: INYECCIÓN sale cara; 2ª: Confusión, cruz = se ataca a sí mismo
    },
    {
        nombre: 'Investigador demente: INYECCIÓN cruz — solo Daño por tiempo, sin atacar',
        p1: { vanguardia: [{ carta: 'Investigador demente', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Oso con armadura', vida: 3 }] },
        pasos: [ { habilidad: 'Investigador demente' }, { confirmar: true }, { elegir: ['Oso con armadura'] } ],
        monedas: ['cruz'],
        diferenciasEsperadas: [
            { contiene: 'status.dot.sourceAbility', motivo: 'idem: APLICAR_ESTADO deja la Habilidad' },
            { contiene: 'status.dot.source', motivo: 'idem: la vieja pasaba card.name (string) en vez de la carta completa' },
            { contiene: 'status.dot.sourceInstanceId', motivo: 'consecuencia del punto anterior: con la carta completa como fuente, applyStatus también anota su instanceId' },
        ],
    },
    {
        nombre: 'Investigador demente: INYECCIÓN rechazada sin enemigos en vanguardia',
        p1: { vanguardia: [{ carta: 'Investigador demente', furor: 1 }] },
        p2: { retaguardia: ['Mini-tigre'] },
        pasos: [ { habilidad: 'Investigador demente' } ],
    },
];

correrSuite('regresion32', escenarios);
