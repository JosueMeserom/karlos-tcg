// tests/regresion46.js — Imp mayor (DEMONIO VIL) y Dáedra migrados al DSL (31-jul-2026).
//
// Imp mayor estrena el trigger `TRAS_DEFENDER` -> onAfterDefend, el gancho de la carta QUE
// DEFIENDE para efectos que son CONSECUENCIA de ser atacada. A propósito NO se migró
// reutilizando GLOBAL_ANTES_DE_ATAQUE con un hipotético soloDefensor:"SELF": ese trigger solo
// se dispara vía collectAttackInterceptors, que SOLO llama performAttack (el ataque normal) —
// un ataque ESPECIAL (ruta directa del op ATACAR) no habría drenado Furor al atacante, un
// hueco real de cobertura frente al texto ("Cada vez que sea atacado"). onAfterDefend en
// cambio lo llama dealDamage siempre que el golpe conecta, sea cual sea la ruta.
//
// Betasteo de Toto (31-jul-2026, mismo día): el primer intento usaba ANTES_DE_DEFENDER
// (onBeforeDefend), que corre ANTES de dealDamage por completo — el flotante de "-1 FUR"
// salía nada más EMPEZAR la animación de ataque, no al volver el atacante a su sitio.
// onAfterDefend corre DESPUÉS de la animación Y del "recibe N daño", que es el momento
// correcto para un efecto descrito como consecuencia del ataque. Regla general acordada: si
// la carta no dice explícitamente "antes", un efecto por ser atacado va en TRAS_DEFENDER.
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

// Reordenamiento de logs, no solo cambio de texto (mismo patrón que el tributo de Garret en
// regresion38): la vieja anuncia el drenaje EN onBeforeDefend, ANTES del "recibe N daño"; la
// nueva lo hace en onAfterDefend, DESPUÉS. La línea existe en ambas, en distinta posición — se
// declara como PAR solo-vieja/solo-nueva (cada una con su texto exacto) para que la única
// línea que sí coincide en índice ("recibe N daño") se pueda comparar.
const LOG_DEMONIO_VIL = (nombreAtacante, conDueno) => ({
    logsSoloVieja: [
        { linea: `¡DEMONIO VIL! El aura del Imp drena 1 de Furor de ${nombreAtacante}.`,
          motivo: 'la vieja anuncia el drenaje ANTES del golpe (onBeforeDefend); nombre a secas' },
    ],
    logsSoloNueva: [
        { linea: `¡DEMONIO VIL! El aura del Imp drena 1 de Furor de ${conDueno}.`,
          motivo: 'la nueva lo anuncia DESPUÉS del golpe -onAfterDefend, betasteo de Toto: el flotante debe salir al volver el atacante a su sitio, no al empezar la animación- y con DSL._nombre (formato "de JX")' },
    ],
});

const escenarios = [
    // ---------------- Imp mayor: DEMONIO VIL (TRAS_DEFENDER) ----------------
    {
        nombre: 'DEMONIO VIL: ataque normal contra Imp mayor drena 1 Furor al atacante',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 3 }] },
        p2: { vanguardia: [{ carta: 'Imp mayor', vida: 6 }] },
        pasos: [ { atacar: 'Mini-tigre', objetivo: 'Imp mayor' } ],
        ...LOG_DEMONIO_VIL('Mini-tigre', 'Mini-tigre [1] de J1 (Jugador 1)'),
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
        // Con exactamente el Furor justo para pagar CHIRIBITA (1F), al atacante no le queda
        // Furor tras el coste: ninguna base drena (la vieja porque nunca comprueba
        // onBeforeDefend en CHIRIBITA -bug ya documentado en regresion28-, la nueva porque
        // ifObjetivo:furor>0 falla). Coinciden, pero por motivos distintos cada una.
        nombre: 'DEMONIO VIL no dispara tras CHIRIBITA si el coste agota el Furor del atacante',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Hechicero', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Imp mayor', vida: 8 }] },
        pasos: [ { habilidad: 'Hechicero' }, { confirmar: true }, { elegir: ['Imp mayor'] } ],
    },
    {
        // Con Furor de sobra tras pagar CHIRIBITA, SOLO la nueva drena: mismo bug de la vieja
        // ya documentado en regresion28 (Hechicero) — la vieja CHIRIBITA nunca llama a
        // onBeforeDefend/onAfterDefend en absoluto (a diferencia de Karolina/Raiju, que sí lo
        // hacían en su propio ataque especial a mano), así que ninguna pasiva de "al defender"
        // podía dispararse contra ella. El op ATACAR (especial:true) SÍ llama a dealDamage, que
        // SIEMPRE llama a onAfterDefend si el golpe conecta — la nueva corrige esto de encima,
        // no es un efecto buscado de esta migración de Imp mayor en particular.
        nombre: 'DEMONIO VIL SÍ dispara tras CHIRIBITA con Furor de sobra (bug de la vieja, ya documentado en regresion28)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Hechicero', furor: 2 }] },
        p2: { vanguardia: [{ carta: 'Imp mayor', vida: 8 }] },
        pasos: [ { habilidad: 'Hechicero' }, { confirmar: true }, { elegir: ['Imp mayor'] } ],
        logsSoloNueva: [
            { linea: '¡DEMONIO VIL! El aura del Imp drena 1 de Furor de Hechicero [1] de J1 (Jugador 1).',
              motivo: 'la vieja CHIRIBITA nunca comprueba onBeforeDefend/onAfterDefend (bug ya documentado en regresion28); la nueva sí, a través del op ATACAR' },
        ],
        // "-1 FUR" aparece en AMBAS bases por el COSTE de CHIRIBITA (1F) -eso no es una
        // diferencia-, pero la nueva tiene un SEGUNDO "-1 FUR" (el drenaje de DEMONIO VIL) que
        // la vieja no llega a emitir. El emparejamiento solo-vieja/solo-nueva no sirve aquí
        // (no es un duplicado del mismo evento, es un evento de más): se retiran TODAS las
        // ocurrencias de "-1 FUR" de ambos lados -mismo criterio que el flotante duplicado de
        // Gul guerrero, aplicado al caso inverso- y se deja que `diferenciasEsperadas` sobre
        // el Furor final cubra la diferencia real.
        flotantesSoloVieja: [
            { linea: '-1 FUR', motivo: 'retirado para poder alinear posiciones: en la vieja es solo el coste; en la nueva son coste+drenaje' },
        ],
        flotantesSoloNueva: [
            { linea: '-1 FUR', motivo: 'retirado (coste + drenaje de DEMONIO VIL, ausente en la vieja); ver diferenciasEsperadas para el Furor final' },
        ],
        diferenciasEsperadas: [
            { contiene: 'estado.p1.vanguard.0.furor',
              motivo: 'consecuencia del mismo bug: la vieja termina en 1 (2 inicial - 1 de coste); la nueva en 0 (- 1 más de DEMONIO VIL)' },
        ],
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
