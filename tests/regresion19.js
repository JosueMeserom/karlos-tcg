// tests/regresion19.js — Tanda AL_MORIR (muerte propia declarativa).
//
// Incluso En El KG migrada al trigger REACCION-hermano AL_MORIR: al morir, en vez
// de irse al descarte, se DEVUELVE A LA MANO y la muerte se suprime. El contrato
// del motor (checkDeath): si onDeath devuelve true, no hay descarte/animación/log
// "ha sido destruido", solo Retribución. La habilidad declara `gestionada: true`
// (→ onDeath devuelve true) y `VOLVER_A_MANO` (mueve la carta a la mano y resetea
// su Vida). No hay diferencias de log ni de estado: la migración replica la vieja
// exactamente (mismo texto, mismo movimiento de zona, mismo reseteo de currentHp).
//
// Goodman (id 24, otra carta de onDeath) se deja IMPERATIVA a propósito: su flujo
// de búsqueda en el mazo (logIntro antes de la pregunta, deck-vacío con return sin
// barajar, "Añades" en 2ª persona) no encaja con el orden del op BUSCAR genérico y
// forzarlo generaría divergencias; no compensa contorsionarlo.

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'Incluso En El KG: al morir en combate vuelve a la mano en vez de al descarte',
        p1: { vanguardia: ['Droide antidisturbios'] },   // atk 5: mata al Incluso (def 2, hp 2)
        p2: { vanguardia: ['Incluso En El KG'] },
        pasos: [
            { atacar: 'Droide antidisturbios', objetivo: 'Incluso En El KG' },
        ],
        logsIntencionados: [],
    },
    {
        nombre: 'Incluso En El KG: al volver a la mano solo se resetea la Vida (conserva el Furor)',
        p1: { vanguardia: ['Droide antidisturbios'] },
        p2: { vanguardia: [{ carta: 'Incluso En El KG', furor: 2, vida: 1 }] },
        pasos: [
            { atacar: 'Droide antidisturbios', objetivo: 'Incluso En El KG' },
        ],
        // Sin logsIntencionados: la nueva replica la vieja EXACTAMENTE (VOLVER_A_MANO
        // solo toca currentHp, como la vieja); el Furor 2 se conserva en ambas.
        logsIntencionados: [],
    },
];

correrSuite('regresion19', escenarios);
