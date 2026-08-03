// tests/regresion51.js — Kami (SACRIFICIO EQUIVALENTE), Némesis (coste de colocación) y
// Muñeca del mal (IMPRECACIÓN) migradas al DSL (31-jul-2026), tras confirmar que ninguna
// necesitaba un op "DESTRUIR" nuevo: `MODIFICAR_STAT` con `vaciar:true` (fija el stat a 0
// exacto) + `comprobarMuerte:true` (+ `sinRetribucion:true` cuando aplica) YA cubre
// "destrucción directa, no daño" — el mismo canal que ya usaba Cañón de positrones
// (regresion40). El propio nombre del flag `sinRetribucion` ya llevaba una nota, desde el
// 30-jul-2026, apuntando a Kami como el precedente que lo justificaba.
//
// Kami: dos ELEGIR secuenciales (1º aliado propio -excluyéndose a sí misma con
// `excluirSelf`-, 2º enemigo), cada uno con su propio MODIFICAR_STAT vaciar+sinRetribucion.
// Diferencia de log aceptada: la vieja anuncia AMBOS sacrificios en una sola línea; la nueva,
// con dos efectos independientes, anuncia cada uno por separado.
//
// Némesis: SOLO el coste de colocación migra (JUGAR requisitos + ANTES_DE_JUGAR, que corre
// ANTES de que Némesis se coloque -así que su propia vanguardia-objetivo son las 4 cartas
// YA en el campo, ella no cuenta todavía-). OBLITERACIÓN y NACIMIENTO DE DIVINIDAD se quedan
// imperativas JUNTAS a propósito: comparten los mismos onValidateTarget/onTargetsReady
// (bifurcan por ctx.name), y NACIMIENTO DE DIVINIDAD depende de getCustomActions -si se
// migrara solo OBLITERACIÓN, el guard genérico del compilador ("si ya existe la función, no
// la toques") dejaría la declaración muerta, sin ejecutarse nunca-. `log` en ANTES_DE_JUGAR
// era una pieza que faltaba (sus hermanos AL_JUGAR/INICIO_TURNO/FIN_TURNO ya la tenían).
//
// Muñeca del mal: TRAS_DEFENDER (mismo trigger de Imp mayor/Gólem multielemental) con
// `si:{campo:"self.hp",op:"<=",valor:0}` ("cuando su Vida llegue a 0") + `ifObjetivo` en la
// MONEDA ("SI el atacante sigue vivo"). Piezas nuevas en MONEDA: `log` (anuncio ANTES de
// lanzar, distinto de logCara/logCruz que anuncian el resultado) y `objetivo` en el fill de
// logCara/logCruz (faltaba).
//
// CAMBIO DE REGLA en Muñeca del mal (betasteo de Toto, 31-jul-2026), no cosmético: ahora lleva
// `sinRetribucion`, así que su víctima NO da Retribución. La vieja pasaba
// `checkDeath(attacker, true)` y la primera migración lo replicó tal cual. Es casi seguro un
// descuido del original: el texto dice "destruye la carta que realizó ese ataque", y la norma
// de Toto define destruir como "a descartes SIN dar retribución" — de las cinco cartas que
// dicen "destruye" (Cañón de positrones, Kami, Némesis, Gárgola y esta), las otras cuatro ya
// pasaban `false`; esta era la única excepción. Los dos efectos van atados por definición: sin
// el flag, el flotante tampoco podía decir DESTRUIDO. Declarado en `diferenciasEsperadas`.
//
// Kami y Némesis comparten la MISMA diferencia de floater ya documentada en Cañón de
// positrones (regresion40): la vieja hace `card.currentHp = 0` a mano (bypass total de
// modifyStat, sin floater); la nueva pasa por MODIFICAR_STAT (vaciar+sinRetribucion), que
// desde el betasteo de Toto (31-jul-2026) muestra "DESTRUIDO/A" en vez de "-N VIDA" -esta
// destrucción no da Retribución, y "-N VIDA" induciría a pensar que sí-. No es una regresión,
// la vieja no anunciaba nada de esto.

'use strict';
const { correrSuite } = require('./harness');

const FLOTANTE_DESTRUIDO = {
    flotantesSoloNueva: [
        { linea: 'DESTRUIDO', motivo: 'destrucción directa sin Retribución: la nueva anuncia "DESTRUIDO" en vez de "-N VIDA"; la vieja no anunciaba nada (ver regresion40)' },
    ],
};

const escenarios = [
    // ---------------- Kami (SACRIFICIO EQUIVALENTE) ----------------
    // Sin escenario de ÉXITO dual-base aquí, a propósito — ver la nota larga sobre el bug real
    // encontrado, justo antes de la carta en cartas.js. La vieja se queda atascada para siempre
    // tras el 1er objetivo (nunca completa la Habilidad); reproducirla fielmente solo para
    // demostrar que se queda atascada no compensa. Verificado aparte con un probe standalone
    // (no en esta suite) que la NUEVA completa el flujo íntegro correctamente: Kami se queda en
    // vanguardia, el aliado sacrificado y el enemigo destruido van a descartes, NINGUNO de los
    // dos da Retribución (pilas de retribution vacías tras la Habilidad).
    {
        nombre: 'SACRIFICIO EQUIVALENTE rechazado: Kami es la única aliada en vanguardia',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Kami', furor: 1 }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { habilidad: 'Kami' } ],
    },
    {
        nombre: 'SACRIFICIO EQUIVALENTE rechazado: no hay enemigos a los que aniquilar',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Kami', furor: 1 }, 'Mini-tigre'] },
        p2: {},
        pasos: [ { habilidad: 'Kami' } ],
    },

    // ---------------- Némesis (coste de colocación) ----------------
    {
        nombre: 'Némesis: al colocarse con la vanguardia llena, destruye a las 4 sin darles Retribución',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: ['Mini-tigre', 'Robot de seguridad SP', 'Oso con armadura', 'Achmay'], mano: ['Némesis'] },
        p2: {},
        pasos: [ { jugar: 'Némesis' } ],
        ...FLOTANTE_DESTRUIDO,
    },
    {
        nombre: 'Némesis rechazada: la vanguardia no está llena',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: ['Mini-tigre', 'Robot de seguridad SP'], mano: ['Némesis'] },
        p2: {},
        pasos: [ { jugar: 'Némesis' } ],
    },

    // ---------------- Muñeca del mal (IMPRECACIÓN) ----------------
    {
        nombre: 'IMPRECACIÓN: la Muñeca muere por el golpe, moneda CARA destruye al atacante (con Retribución)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Mini-tigre', vida: 20 }] },
        p2: { vanguardia: [{ carta: 'Muñeca del mal', vida: 1 }] },
        monedas: ['cara'],
        pasos: [ { atacar: 'Mini-tigre', objetivo: 'Muñeca del mal' } ],
        logsIntencionados: [
            { de: 'Moneda: CARA - ¡La maldición atrapa a Mini-tigre y lo destruye!',
              a: 'Moneda: CARA - ¡La maldición atrapa a Mini-tigre [1] de J1 (Jugador 1) y lo destruye!',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba attacker.name a secas; la nueva rellena {objetivo} con DSL._nombre (pieza nueva en MONEDA)' },
        ],
        flotantesSoloNueva: [
            { linea: 'DESTRUIDO', motivo: 'destrucción explícita: la nueva anuncia DESTRUIDO/A (ver cambio de regla arriba); la vieja no pintaba nada, ponía currentHp=0 a mano' },
        ],
        diferenciasEsperadas: [
            { contiene: 'estado.p1.hp',
              motivo: 'CAMBIO DE REGLA deliberado (ver cabecera): la vieja daba Retribución al destruir al atacante -aquí p1 se queda sin pila y su hp cae a 0-; la nueva, al ser una destrucción explícita, no la da y p1 conserva su hp' },
        ],
    },
    {
        nombre: 'IMPRECACIÓN: la Muñeca muere por el golpe, moneda CRUZ y el atacante sobrevive',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Mini-tigre', vida: 20 }] },
        p2: { vanguardia: [{ carta: 'Muñeca del mal', vida: 1 }] },
        monedas: ['cruz'],
        pasos: [ { atacar: 'Mini-tigre', objetivo: 'Muñeca del mal' } ],
    },
    {
        nombre: 'IMPRECACIÓN no se dispara si la Muñeca sobrevive al golpe',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Mini-tigre', vida: 20 }] },
        p2: { vanguardia: [{ carta: 'Muñeca del mal', vida: 20 }] },
        pasos: [ { atacar: 'Mini-tigre', objetivo: 'Muñeca del mal' } ],
    },
];

correrSuite('regresion51', escenarios);
