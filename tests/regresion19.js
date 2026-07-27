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
    {
        nombre: 'Goodman: muere con Furor y busca una carta en el mazo (acepta y elige)',
        p1: { vanguardia: ['Droide antidisturbios'] },
        p2: { vanguardia: [{ carta: 'Goodman', furor: 2 }], mazo: ['Mini-tigre', 'Oso con armadura'] },
        pasos: [
            { atacar: 'Droide antidisturbios', objetivo: 'Goodman' },
            { opcion: 0 },                 // SÍ, buscar (preguntarSiempre)
            { elegir: ['Mini-tigre'] },    // visor de mazo (vieja) / visor de mazo (nueva): mismo tipo
        ],
        logsIntencionados: [
            { de: 'Añades Mini-tigre a la mano desde el mazo.',
              a: 'J2 (Jugador 2) añade Mini-tigre de J2 (Jugador 2) a su mano desde el mazo.',
              motivo: 'norma del proyecto (3ª persona con jugador/dueño): la vieja usaba "Añades {name}" (2ª persona); la nueva rellena {jugador}/{objetivo} con getDisplayName/DSL._nombre' },
            { de: 'Barajando el mazo...', a: 'Barajando el mazo de J2 (Jugador 2)...',
              motivo: 'normalización estándar de barajarDespues (como el resto de cartas migradas): la vieja decía el genérico "Barajando el mazo..."; la nueva incluye el jugador con {jugador}' },
        ],
    },
    {
        nombre: 'Goodman: muere con Furor pero declina buscar',
        p1: { vanguardia: ['Droide antidisturbios'] },
        p2: { vanguardia: [{ carta: 'Goodman', furor: 1 }], mazo: ['Mini-tigre'] },
        pasos: [
            { atacar: 'Droide antidisturbios', objetivo: 'Goodman' },
            { opcion: 1 },                 // NO buscar
        ],
        // Sin logsIntencionados: "{carta} muere, pero decides no buscar información."
        // se rellena con sourceCard.name ("Goodman", sin dueño), idéntico a la vieja.
        logsIntencionados: [],
    },
    {
        nombre: 'Goodman: muere sin Furor — INFORMACIÓN VALIOSA no se dispara',
        p1: { vanguardia: ['Droide antidisturbios'] },
        p2: { vanguardia: [{ carta: 'Goodman', furor: 0 }], mazo: ['Mini-tigre'] },
        pasos: [
            { atacar: 'Droide antidisturbios', objetivo: 'Goodman' },
        ],
        // El gate `si: furor>=1` falla (como el `if (card.furor >= 1)` viejo): muerte normal
        // sin modales ni logs de búsqueda. Idéntico en ambas.
        logsIntencionados: [],
    },
];

correrSuite('regresion19', escenarios);
