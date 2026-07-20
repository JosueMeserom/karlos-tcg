// tests/regresion6.js — Equipables con AL_EQUIPAR:
//   Furia berserker (1011), Shichishito (1021),
//   Chaqueta metálica defensiva de la muerte (1045).
// Ejercitan: ELEGIR con coste de Furor previo al EQUIPAR, onEquipUpdate vía
// updatePassives, MARCAR_JUGADOR (hasUsedShichishito) y su bloqueo de reuso.

'use strict';
const { correrSuite } = require('./harness');

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
            { de: 'Gladiador se equipa con', a: 'Gladiador (J1 (Jugador 1)) se equipa con',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
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
            { de: 'Karlos empuña la legendaria', a: 'Karlos (J1 (Jugador 1)) empuña la legendaria',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
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
            { de: 'Mini-tigre se pone la Chaqueta', a: 'Mini-tigre (J1 (Jugador 1)) se pone la Chaqueta',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
    },
];

correrSuite('regresion6', escenarios);
