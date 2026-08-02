// tests/regresion41.js — Edrielle migrada al DSL (30-jul-2026): TORMENTA PERFECTA.
//
// ACTIVA sin objetivo (sinObjetivo:true, la propia carta es el "objetivo" implícito):
// MODIFICAR_STAT con target:{quien:"ENEMIGO"} (sin zona = vanguardia+retaguardia) aplica
// el daño verdadero a TODO el pool resuelto de una tacada — _runEffectList itera solo,
// sin necesitar ningún flag "a todos". DSL._pool excluye Avatares por defecto (mismo
// criterio que el `!isAvatar` a mano de la vieja: Kami, intocable, queda fuera).
//
// Se queda imperativo: el tributo de invocación (DSL.tributoFuror) y los dos ganchos de
// BELLEZA INCOMPARABLE (onStartTurn con lanzamiento de moneda, onUpdatePassive).

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'TORMENTA PERFECTA: daño verdadero a los 2 enemigos (vanguardia+retaguardia), uno muere',
        p1: { vanguardia: [ { carta: 'Edrielle', furor: 4 } ] },
        p2: { vanguardia: [ { carta: 'Mini-tigre', vida: 1 } ], retaguardia: [ { carta: 'Robot de seguridad SP', vida: 10 } ] },
        pasos: [ { habilidad: 'Edrielle' }, { confirmar: true } ],
        // Reordenamiento de flotantes (betasteo de Toto, 31-jul-2026): el flotante "razón"
        // (DAÑO VERDADERO) ahora sale ANTES del flotante del cambio de Vida en sí, no después
        // -mismo criterio aplicado a MALDITO (Muñeca del mal, regresion51)-. Mismo texto en
        // ambas bases para los 2 objetivos, solo cambia el orden: se retira como PAR completo.
        flotantesSoloVieja: [ { linea: '-2 VIDA', motivo: 'orden vieja: -2 VIDA antes de DAÑO VERDADERO (2 objetivos)' } ],
        flotantesSoloNueva: [ { linea: '-2 VIDA', motivo: 'orden nueva: DAÑO VERDADERO antes de -2 VIDA (2 objetivos)' } ],
    },
    {
        nombre: 'TORMENTA PERFECTA rechazada: falta Furor',
        p1: { vanguardia: [ { carta: 'Edrielle', furor: 3 } ] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { habilidad: 'Edrielle' } ],
    },
    {
        nombre: 'TORMENTA PERFECTA rechazada: no hay enemigos en el campo',
        p1: { vanguardia: [ { carta: 'Edrielle', furor: 4 } ] },
        p2: {},
        pasos: [ { habilidad: 'Edrielle' } ],
    },
    {
        // Control de NO-regresión del fix del badge de Oculto (betasteo de Toto,
        // 30-jul-2026). El fix es puramente de REPINTADO: la vieja no refrescaba tras
        // marcar edrielleExposed, así que el badge de Oculto aguantaba puesto hasta la
        // pasada natural de Fase principal aunque el log y el flotante ya cantaran
        // "EXPUESTA". El harness NO puede ver ese bug -solo captura estado final, y ahí
        // ambas bases coinciden porque el updatePassives natural llega igualmente-;
        // verificado aparte con un probe que instrumenta render() (vieja: 0 repintados
        // durante onStartTurn, stealth sigue true al salir; nueva: 1 repintado con
        // stealth ya false). Este escenario existe para garantizar lo que el harness SÍ
        // puede garantizar: que el refresco extra no cambia NADA del estado de juego.
        nombre: 'BELLEZA INCOMPARABLE, cruz: queda expuesta (control de que el fix del badge no toca el estado)',
        turno: 2, turnoDe: 'p2', empieza: 'p1',
        p1: { vanguardia: [ { carta: 'Edrielle', furor: 0 } ] },
        p2: { vanguardia: ['Mini-tigre'] },
        monedas: ['cruz'],
        pasos: [ { finTurno: true } ],
    },
    {
        nombre: 'BELLEZA INCOMPARABLE, cara: se mantiene Oculta',
        turno: 2, turnoDe: 'p2', empieza: 'p1',
        p1: { vanguardia: [ { carta: 'Edrielle', furor: 0 } ] },
        p2: { vanguardia: ['Mini-tigre'] },
        monedas: ['cara'],
        pasos: [ { finTurno: true } ],
    },
];

correrSuite('regresion41', escenarios);
