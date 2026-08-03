// tests/regresion6.js — Equipables con AL_EQUIPAR:
//   Furia berserker (1011), Shichishito (1021),
//   Chaqueta metálica defensiva de la muerte (1045).
// Ejercitan: ELEGIR con coste de Furor previo al EQUIPAR, onEquipUpdate vía
// updatePassives, MARCAR_JUGADOR (hasUsedShichishito) y su bloqueo de reuso.

'use strict';
const { correrSuite } = require('./harness');

// Bug de motor real y preexistente corregido el 31-jul-2026 (Toto, betasteo de Poder Legado):
// el pipeline de jugar una Ayuda con `onPlay` propio (motor, card.type==='Ayuda') NUNCA llamaba
// a assignCopyId, a diferencia de Personaje/Esbirro/Evento y del otro pipeline de Ayudas
// (AL_USAR_AYUDA -> executeAyuda). Con 2+ copias de la misma Ayuda equipable en juego (Furia
// berserker, Shichishito, Chaqueta metálica, Súper Evolución, Poder Legado), "Afectado por:"
// nunca podía distinguir cuál -copyId se quedaba en null para siempre-. Arreglado en el op
// EQUIPAR (el único punto por el que pasan todas), así que aparece aquí aunque estas tres cartas
// no sean parte de la tanda de equipos: comparten el mismo pipeline de juego.
const COPY_ID_NACE = [
    { contiene: 'copyId', motivo: 'bug de motor preexistente: assignCopyId nunca se llamaba al jugar una Ayuda con onPlay propio; arreglado en el op EQUIPAR' },
    { contiene: 'cardCounts', motivo: 'consecuencia de lo mismo: el contador por el que assignCopyId reparte los números' },
];

const escenarios = [
    {
        nombre: 'Furia berserker: -2 Furor al Draconiano y +3 Atq equipado',
        p1: {
            vanguardia: [{ carta: 'Gladiador', furor: 3 }, 'Oso con armadura'],
            mano: ['Furia berserker'],
        },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Furia berserker' },
            { elegir: ['Gladiador'] }, // vieja: modal visual · nueva: selección-en-tablero
        ],
        logsIntencionados: [
            { de: 'Gladiador se equipa con', a: 'Gladiador de J1 (Jugador 1) se equipa con',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
        diferenciasEsperadas: COPY_ID_NACE,
    },
    {
        nombre: 'Shichishito: Karlos la empuña y la segunda copia queda bloqueada',
        p1: {
            vanguardia: ['Karlos'],
            mano: ['Shichishito', { carta: 'Shichishito' }],
        },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Shichishito', indice: 0 },
            { elegir: ['Karlos'] },
            // Segunda copia: canPlayCard/requisito hasUsedShichishito la rechaza
            // (logError privado, no entra en el historial); debe seguir en mano.
            { jugar: 'Shichishito' },
        ],
        logsIntencionados: [
            { de: 'Karlos empuña la legendaria', a: 'Karlos de J1 (Jugador 1) empuña la legendaria',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
        diferenciasEsperadas: COPY_ID_NACE,
    },
    {
        nombre: 'Chaqueta metálica: +3 Def / -3 Atq al aliado elegido',
        p1: {
            vanguardia: ['Oso con armadura', 'Mini-tigre'],
            mano: ['Chaqueta metálica defensiva de la muerte'],
        },
        p2: { vanguardia: ['Droide antidisturbios'] },
        pasos: [
            { jugar: 'Chaqueta metálica defensiva de la muerte' },
            { elegir: ['Mini-tigre'] },
        ],
        logsIntencionados: [
            { de: 'Mini-tigre se pone la Chaqueta', a: 'Mini-tigre [1] de J1 (Jugador 1) se pone la Chaqueta',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
        diferenciasEsperadas: COPY_ID_NACE,
    },
];

correrSuite('regresion6', escenarios);
