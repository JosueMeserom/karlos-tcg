// tests/regresion53.js — Águila (PSEUDO-PREVASIÓN) migrada al DSL (31-jul-2026).
//
// Es la carta por la que Toto pidió NO borrar `ANTES_DE_DEFENDER` cuando se quedó sin usuario
// (ver el comentario del trigger en cartas.js): era su usuario natural, y migrarla es lo que
// ha traído las piezas que le faltaban al trigger.
//
// Pieza nueva principal: el op **`ESQUIVAR`**. Hasta ahora ANTES_DE_DEFENDER solo sabía
// esquivar SIEMPRE (`esquiva: true` en la Habilidad); esta carta necesita que la esquiva
// dependa de una moneda. El op se limita a levantar un flag que el compilador lee al final, así
// que puede colgar de una MONEDA, de un `if` o de lo que haga falta — y de paso lanza
// `animateDodge` y su propio log, que es donde la vieja los tenía. El flag vive en `game`, no
// en la carta: es transitorio de UNA resolución y `exportGameState` no serializa campos sueltos
// de `game`, así que no ensucia el estado que compara el arnés.
//
// Dos gates más, que la vieja hacía a mano y ahora son campos reutilizables del trigger:
//   · `soloAtaqueNormal` — el texto dice "cada vez que es atacado por un ataque normal". Aquí
//     el `isSpecial` que llega es el GENUINO (lo pasan los 9 puntos del motor que llaman a
//     onBeforeDefend), no una heurística sobre abilityContext como en ANTES_DE_ATACAR.
//   · `salvoIncontrarrestable` + `logIncontrarrestable` — Aniceto (SAPIENCIA MÁGICA,
//     `uncounterable`) atraviesa la esquiva. Comprueba `uncounterable` directamente y NO
//     DSL._vetoAtaqueAplica, que además exime a `treatAttacksAsSpecial`: ese caso ya lo cubre
//     soloAtaqueNormal (esos ataques llegan con isSpecial=true) y colaría un log equivocado.
//
// Diferencia intencionada, la de siempre: el log de esquiva nombraba al ATACANTE a secas
// (`attacker.name`); ahora usa DSL._nombre (norma de 3ª persona con dueño). Como Águila es
// objetivo de escenarios de esquiva en otras cuatro suites (regresion32/42/45/48), el mismo
// mapa está declarado también allí.
//
// ESPÍA se queda imperativa: encadena un modal propio de elección de TIPO de carta
// (inputState 'SELECT_CARD_TYPE' + onTypeSelected), el visor de la mano rival
// (onHandViewClosed) y solo entonces una selección de objetivo, contando cartas de ese tipo en
// la mano del rival. Son tres pantallas encadenadas con estado propio; no hay patrón que lo
// cubra hoy ni compensa construirlo para una sola carta.

'use strict';
const { correrSuite } = require('./harness');

const ESQUIVA_NOMBRE_ATACANTE = (plano, conDueno) => ({
    de: `ESQUIVÓ el ataque de ${plano}!`, a: `ESQUIVÓ el ataque de ${conDueno}!`,
    motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba attacker.name a secas; la migrada rellena {objetivo} con DSL._nombre',
});

const escenarios = [
    {
        nombre: 'PSEUDO-PREVASIÓN: moneda CARA esquiva el ataque normal (sin daño)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Mini-tigre', vida: 20 }] },
        p2: { vanguardia: ['Águila'] },
        monedas: ['cara'],
        pasos: [ { atacar: 'Mini-tigre', objetivo: 'Águila' } ],
        logsIntencionados: [ ESQUIVA_NOMBRE_ATACANTE('Mini-tigre', 'Mini-tigre [1] de J1 (Jugador 1)') ],
    },
    {
        nombre: 'PSEUDO-PREVASIÓN: moneda CRUZ no esquiva y Águila recibe el golpe',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Mini-tigre', vida: 20 }] },
        p2: { vanguardia: ['Águila'] },
        monedas: ['cruz'],
        pasos: [ { atacar: 'Mini-tigre', objetivo: 'Águila' } ],
    },
    {
        // El texto dice "por un ataque normal": ante uno ESPECIAL ni se intenta la esquiva, así
        // que no se anuncia la Pasiva ni se gasta moneda (de ahí que el escenario no declare
        // ninguna: si el gate fallara, el arnés reventaría por pedir una moneda sin guionizar).
        nombre: 'PSEUDO-PREVASIÓN no se intenta ante un ataque ESPECIAL (CHIRIBITA)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Hechicero', furor: 1 }] },
        p2: { vanguardia: ['Águila'] },
        pasos: [ { habilidad: 'Hechicero' }, { confirmar: true }, { elegir: ['Águila'] } ],
    },
    {
        // Aniceto (SAPIENCIA MÁGICA, `uncounterable`) atraviesa la esquiva: solo el aviso de
        // sistema, sin moneda (misma comprobación que arriba).
        nombre: 'PSEUDO-PREVASIÓN: Aniceto la atraviesa por ser incontrarrestable',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Aniceto', vida: 20 }] },
        p2: { vanguardia: ['Águila'] },
        pasos: [ { atacar: 'Aniceto', objetivo: 'Águila' } ],
        logsIntencionados: [
            { de: 'Aniceto ignora las defensas evasivas', a: 'Aniceto de J1 (Jugador 1) ignora las defensas evasivas',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba attacker.name a secas' },
        ],
    },
];

correrSuite('regresion53', escenarios);
