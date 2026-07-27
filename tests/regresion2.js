// tests/regresion2.js — Ingeribles con AL_CONSUMIR:
//   Líquido mortal (28), Jarabe amargo (1042), Salsa de curry (1043),
//   Barritas energéticas (1044).
// Las cuatro se juegan directamente desde la mano (onPlay en la vieja,
// trigger AL_CONSUMIR compilado en la nueva); no pasan por SELECT_AYUDA_TARGET.
//
// Líquido mortal: la base vieja tenía un BUG LATENTE ya presente en la foto
// pre-migración: su onPlay trataba el resultado de openVisualSearchModal como
// carta suelta (chosen.instanceId) cuando el motor de la época ya resolvía un
// ARRAY (verificado contra antiguos/raíz - antes de migrar a Claude Code/
// public/index.html). Resultado viejo: nunca recuperaba nada y aun así
// consumía la Ayuda. La versión DSL (BUSCAR con abortaSiCancelas) lo corrige.
// Se documenta como diferencia de comportamiento esperada, no se normaliza.
// (Backlog: escenario de cancelación — la semántica de cancelar un ELEGIR
// en tablero no está clara ni en el motor; no se modela hasta aclararla.)

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'Líquido mortal recupera un Ser vivo del descarte (bug viejo documentado)',
        p1: { mano: ['Líquido mortal'], vanguardia: ['Oso con armadura'], descartes: ['Mini-tigre'] },
        p2: { vanguardia: ['Robot de seguridad SP'] },
        pasos: [
            { jugar: 'Líquido mortal' },
            { elegir: ['Mini-tigre'] },
        ],
        diferenciasEsperadas: [
            { contiene: 'log[0]',
              motivo: 'la vieja no logueaba la recuperación porque nunca la ejecutaba (chosen.instanceId sobre un array)' },
            { contiene: 'estado.p1.hand',
              motivo: 'la nueva devuelve el Ser vivo a la mano; la vieja no recuperaba nada' },
            { contiene: 'estado.p1.discard',
              motivo: 'vieja: descartes quedan [Mini-tigre, Líquido mortal]; nueva: [Líquido mortal] tras recuperar' },
        ],
    },
    {
        nombre: 'Jarabe amargo limpia Sueño/Confusión/Ceguera de todos los aliados',
        p1: {
            vanguardia: [
                { carta: 'Oso con armadura', estado: { sueno: { duration: 2 }, ceguera: { duration: 1 } } },
                { carta: 'Mini-tigre', estado: { confusion: { duration: 3 } } },
            ],
            retaguardia: ['Robot de seguridad SP'], // limpio: no debe recibir flotante
            mano: ['Jarabe amargo'],
        },
        p2: { vanguardia: ['Droide antidisturbios'] },
        pasos: [
            { jugar: 'Jarabe amargo' },
        ],
    },
    {
        nombre: 'Salsa de curry: elige pagador y purifica todos los estados (incluido DoT)',
        p1: {
            vanguardia: [
                { carta: 'Oso con armadura', furor: 2, estado: { dot: { duration: 2 }, confusion: { duration: 1 } } },
                { carta: 'Mini-tigre', furor: 1, estado: { sueno: { duration: 1 } } },
            ],
            mano: ['Salsa de curry'],
        },
        p2: { vanguardia: ['Droide antidisturbios'] },
        pasos: [
            { jugar: 'Salsa de curry' },
            { elegir: ['Mini-tigre'] }, // vieja: modal visual · nueva: selección-en-tablero
        ],
    },
    {
        nombre: 'Barritas energéticas curan 1 de Vida a dos aliados elegidos',
        p1: {
            vanguardia: [
                { carta: 'Oso con armadura', vida: 1 },
                { carta: 'Mini-tigre', vida: 2 },
            ],
            retaguardia: [{ carta: 'Robot de seguridad SP', vida: 3 }],
            mano: ['Barritas energéticas'],
        },
        p2: { vanguardia: ['Droide antidisturbios'] },
        pasos: [
            { jugar: 'Barritas energéticas' },
            { elegir: ['Oso con armadura', 'Mini-tigre'] },
        ],
        logsIntencionados: [
            { de: '¡Oso con armadura y Mini-tigre comen', a: '¡Oso con armadura [1] de J1 (Jugador 1) y Mini-tigre [1] de J1 (Jugador 1) comen',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba chosen[n].name a secas; la nueva rellena {elegidos} con DSL._nombre' },
        ],
        diferenciasEsperadas: [
            { contiene: 'flotante[',
              motivo: 'orden cosmético invertido por objetivo: la vieja emitía +1 VIDA (modifyStat) y después BARRITAS; la primitiva CURAR de la nueva emite BARRITAS y después la curación. Mismo contenido, distinto orden.' },
        ],
    },
];

correrSuite('regresion2', escenarios);
