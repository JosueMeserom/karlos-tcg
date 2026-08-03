// tests/regresion45.js — Gul guerrero (DEMONIO BELICOSO) y Oni ancho (YŌKAI VIOLENTO)
// migrados al DSL (31-jul-2026) con DOS TRIGGERS NUEVOS.
//
// Hasta ahora no existía ningún trigger para los ganchos de la carta QUE ATACA
// (onBeforeAttack/onAfterAttack): los GLOBAL_* son de ámbito Evento/tablero, y eso era
// justo lo que dejaba estas dos cartas a medias. Se añaden:
//   · `ANTES_DE_ATACAR` -> onBeforeAttack. Con `soloAtaqueNormal` (replica el
//     `!game.abilityContext || isNormalAttack` que hacían a mano Oni ancho y Clarise) y
//     veto del ataque si los efectos devuelven ok:false.
//   · `TRAS_ATACAR` -> onAfterAttack. Con `soloSiDaño` (el compilador lleva por su cuenta
//     la foto de la Vida enemiga antes/después que Gul guerrero llevaba a mano en
//     _enemyHpBefore) y `siObjetivo` (condición sobre el DEFENSOR — el `if` genérico de los
//     efectos se evalúa contra la carta fuente, que aquí es el atacante).
// Y el op `BONO_ATAQUE`, que modifica el Atq solo durante el ataque en curso y cuya
// contabilidad lleva el compilador (recompute con updatePassives), en vez de que cada
// carta se lo reste a mano — ese "restar a mano" es el patrón que produjo el bug de doble
// resta en Hiposaurio/Hawke/Guardia/Megalimo.
//
// IMPORTANTE, corrección de un diagnóstico previo: Oni ancho NO tenía ese bug. El orden
// real dentro de performAttack es updatePassives -> onBeforeAttack -> dealDamage ->
// onAfterAttack -> updatePassives, así que su += y su -= viven ambos DENTRO del ataque,
// antes del recompute final, y se compensaban. El caso de Megalimo era distinto porque su
// -= corría DESPUÉS de que performAttack ya hubiera recomputado.

'use strict';
const { correrSuite } = require('./harness');

// La vieja pintaba el "-1 FUR" a mano CON showFloatingText ADEMÁS del que game.modifyStat ya
// genera solo para cualquier cambio de Furor: al jugador le salía DOS VECES seguidas sobre la
// misma carta. La nueva se queda solo con el automático, como el resto de cartas migradas
// (precedente: Té helado; y es el mismo error que se cazó y corrigió en el tributo de Garret).
//
// Se declara como PAR solo-vieja/solo-nueva, no como "solo vieja": el harness filtra TODAS las
// líneas que casan, no una sola ocurrencia, así que declararlo en un único lado dejaría el otro
// descuadrado. Declarándolo en ambos se retiran todas de cada base y el resto de flotantes
// vuelve a comparar en posición.
const FLOTANTE_FUR_DUPLICADO = {
    flotantesSoloVieja: [
        { linea: '-1 FUR', motivo: 'la vieja lo emite DOS veces (el automático de modifyStat + uno a mano); se retiran todas para poder comparar el resto en posición' },
    ],
    flotantesSoloNueva: [
        { linea: '-1 FUR', motivo: 'la nueva lo emite UNA vez (solo el automático de modifyStat); se retira para casar con la retirada del lado viejo' },
    ],
};

// Águila (PSEUDO-PREVASIÓN) migrada al DSL el 31-jul-2026 (ver regresion53): su log de esquiva
// nombraba al ATACANTE a secas (`attacker.name`); ahora usa DSL._nombre, como manda la norma de
// logs en 3ª persona con dueño. Afecta a toda suite donde alguien ataca a Águila y falla.
const ESQUIVA_NOMBRE_ATACANTE = (plano, conDueno) => ({
    de: `ESQUIVÓ el ataque de ${plano}!`, a: `ESQUIVÓ el ataque de ${conDueno}!`,
    motivo: 'norma del proyecto (logs en 3ª persona con dueño): la Águila vieja usaba attacker.name a secas; la migrada rellena {objetivo} con DSL._nombre',
});

const escenarios = [
    // ---------------- Gul guerrero: DEMONIO BELICOSO (TRAS_ATACAR) ----------------
    {
        nombre: 'DEMONIO BELICOSO: ataque normal con daño drena 1 Furor al enemigo',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Gul guerrero', furor: 0 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 10, furor: 3 }] },
        pasos: [ { atacar: 'Gul guerrero', objetivo: 'Mini-tigre' } ],
        logsIntencionados: [
            { de: '¡DEMONIO BELICOSO! El Gul desgarra la energía de Mini-tigre.',
              a: '¡DEMONIO BELICOSO! El Gul desgarra la energía de Mini-tigre [1] de J2 (Jugador 2).',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba defender.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
        ...FLOTANTE_FUR_DUPLICADO,
    },
    {
        // Sin Furor que quitar no debe anunciarse siquiera (guard `siObjetivo`).
        nombre: 'DEMONIO BELICOSO no se anuncia si al enemigo no le queda Furor',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Gul guerrero', furor: 0 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 10, furor: 0 }] },
        pasos: [ { atacar: 'Gul guerrero', objetivo: 'Mini-tigre' } ],
    },
    {
        // Ataque esquivado (Águila, PSEUDO-PREVASIÓN) = 0 daño -> soloSiDaño no dispara.
        nombre: 'DEMONIO BELICOSO no dispara si el ataque es esquivado (sin daño)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Gul guerrero', furor: 0 }] },
        p2: { vanguardia: [{ carta: 'Águila', furor: 3 }] },
        monedas: ['cara'], // la esquiva de PSEUDO-PREVASIÓN
        logsIntencionados: [ ESQUIVA_NOMBRE_ATACANTE('Gul guerrero', 'Gul guerrero [1] de J1 (Jugador 1)') ],
        pasos: [ { atacar: 'Gul guerrero', objetivo: 'Águila' } ],
    },
    {
        // SANGRE MALDITA (Activa, ya migrada) es un ataque normal: DEMONIO BELICOSO también
        // debe dispararse ahí, porque el texto dice "al atacar con éxito", sin distinguir.
        nombre: 'DEMONIO BELICOSO dispara también tras SANGRE MALDITA (Activa de ataque normal)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Gul guerrero', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 10, furor: 3 }] },
        pasos: [ { habilidad: 'Gul guerrero' }, { confirmar: true }, { elegir: ['Mini-tigre'] } ],
        logsIntencionados: [
            { de: '¡DEMONIO BELICOSO! El Gul desgarra la energía de Mini-tigre.',
              a: '¡DEMONIO BELICOSO! El Gul desgarra la energía de Mini-tigre [1] de J2 (Jugador 2).',
              motivo: 'ver primer escenario' },
            { de: 'La sangre maldita infecta a Mini-tigre.',
              a: 'La sangre maldita infecta a Mini-tigre [1] de J2 (Jugador 2).',
              motivo: 'de SANGRE MALDITA, ya migrada en la tanda de volumen (ver regresion28): mismo cambio de formato de nombre' },
        ],
        ...FLOTANTE_FUR_DUPLICADO,
        diferenciasEsperadas: [
            { contiene: 'estado.p2.vanguard.0.status.dot.source',
              motivo: 'de SANGRE MALDITA, ya declarado en regresion28: la vieja pasaba card.name (string) a applyStatus; APLICAR_ESTADO deja la carta completa y la Habilidad (cubre source, sourceAbility y sourceInstanceId)' },
        ],
    },

    // ---------------- Oni ancho: YŌKAI VIOLENTO (ANTES_DE_ATACAR) ----------------
    {
        nombre: 'YŌKAI VIOLENTO: cara - ataca con +1 Atq y el bono se deshace después',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Oni ancho', furor: 0 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 12 }] },
        monedas: ['cara'],
        pasos: [ { atacar: 'Oni ancho', objetivo: 'Mini-tigre' } ],
    },
    {
        nombre: 'YŌKAI VIOLENTO: cruz - ataca con -1 Atq y el malus se deshace después',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Oni ancho', furor: 0 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 12 }] },
        monedas: ['cruz'],
        pasos: [ { atacar: 'Oni ancho', objetivo: 'Mini-tigre' } ],
    },
    {
        // Dos ataques normales en turnos distintos: comprueba que el bono no se acumula ni
        // deja residuo en el Atq entre un ataque y el siguiente.
        nombre: 'YŌKAI VIOLENTO dos veces (cara y luego cruz): el Atq no acumula residuo',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Oni ancho', furor: 0 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 30 }] },
        monedas: ['cara', 'cruz'],
        pasos: [
            { atacar: 'Oni ancho', objetivo: 'Mini-tigre' },
            { finTurno: true },
            { finTurno: true },
            { atacar: 'Oni ancho', objetivo: 'Mini-tigre' },
        ],
    },
];

correrSuite('regresion45', escenarios);
