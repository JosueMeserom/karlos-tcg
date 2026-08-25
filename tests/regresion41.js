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
        // Con pila de Retribución (Toto, 22-ago-2026): sin ella, la muerte del tigre TERMINA la
        // partida a media escena, y el arnés (que no tiene el cartel de fin de partida en su DOM)
        // se lleva por delante lo que checkDeath hiciera después. El escenario quiere ver el daño
        // verdadero a dos objetivos, no un game over.
        p2: { vanguardia: [ { carta: 'Mini-tigre', vida: 1 } ], retaguardia: [ { carta: 'Robot de seguridad SP', vida: 10 } ], retribucion: [ 'Longaniza', 'Longaniza' ] },
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
    // Los dos escenarios de la moneda de Edrielle se han ido (23-ago-2026): esa moneda ya no es
    // suya. Ahora es el ESCONDITE FRÁGIL, una regla universal del juego que se tira al FINAL de
    // tu turno y con otra condición ("el rival no tiene nada a lo que atacar"), así que
    // comparar contra la base congelada aquí no diría nada útil. Su cobertura vive en
    // `tests/oculto.js`, con aserciones.
];

correrSuite('regresion41', escenarios);
