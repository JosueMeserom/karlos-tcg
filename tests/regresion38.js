// tests/regresion38.js — Garret migrado al DSL (30-jul-2026): tributo (ANTES_DE_JUGAR)
// + ANDANADA METEÓRICA.
//
// El tributo NO usa DSL.tributoFuror (ese helper elige entre CUALQUIER aliado con
// Furor suficiente): el pagador debe ser Sadame, Aniceto o Hawke por NOMBRE, así
// que va por ANTES_DE_JUGAR + ELEGIR con un filtro `o` de 3 nombres, mismo
// mecanismo que el deudor de Deuda con la mafia. La vieja delegaba el descuento de
// Furor y su log a un mecanismo genérico del motor (card.tributeSourceId, con -4
// hardcodeado); aquí un MODIFICAR_STAT anidado hace lo mismo explícitamente.
//
// ANDANADA METEÓRICA es un calco de Raiju/Gólem de tierra: ELEGIR de cantidad
// EXACTA 2 + ATACAR especial:true, excluyendo Ocultos (a diferencia de Raiju, esta
// SÍ los excluye, fiel a la vieja).
//
// Se quedan imperativos: la búsqueda de Escudo mágico (mazo O descartes, BUSCAR no
// soporta elegir zona) y los dos ganchos globales (+1 Furor extra en fase de
// Furor, inmune a daño especial).

'use strict';
const { correrSuite } = require('./harness');

const LOGS_SISTEMA_VIEJA = [
    { linea: 'Objetivo 1 fijado. Elige al siguiente objetivo.',
      motivo: 'aviso genérico de handleAbilityTargetSelection (mecanismo abilityContext.targets de la vieja); la nueva resuelve los 2 objetivos con ELEGIR/pickBoardTargets, que no pasa por ahí' },
    { linea: 'Objetivos listos. ¡Ejecutando habilidad!',
      motivo: 'mismo mecanismo que la anterior: aviso genérico al completar el cupo de objetivos' },
];

const escenarios = [
    {
        nombre: 'Garret: coloca pagando el tributo con Aniceto (-4 Furor)',
        flotantesIntencionados: [
            { de: '-4 FUR ·', a: '-4 FUR (Garret) ·',
              motivo: 'el flotante automatico nombra ahora la carta origen cuando el cambio lo causa OTRA carta (Toto, 5-ago-2026): un "-N" suelto no decia de donde salia. No afecta al dano de combate (dealDamage no pasa fuente) ni al coste de tu propia Habilidad' },
        ],
        p1: { mano: ['Garret'], vanguardia: [ { carta: 'Aniceto', furor: 4 } ] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Garret' },
            { elegir: ['Aniceto'] },
            { opcion: 'NO BUSCAR NADA' }, // DESBORDE DE MANÁ: búsqueda de Escudo mágico, sin tocar (imperativa en ambas bases)
        ],
        // Reordenamiento, no solo cambio de texto: ANTES_DE_JUGAR corre el tributo
        // ANTES de la colocación (para poder abortarla si se cancela la elección);
        // la vieja delegaba el descuento a un mecanismo genérico del motor que
        // corre DESPUÉS de colocar la carta. El log existe en ambas, en distinta
        // posición — se declara como "solo vieja" / "solo nueva" (con su propio
        // texto exacto) para que ambas comparaciones posicionales queden en el
        // único log que sí coincide en índice ("juega Garret...").
        logsSoloVieja: [
            { linea: 'Aniceto entrega su Furor como tributo para Garret.',
              motivo: 'la vieja registra el tributo DESPUÉS de colocar la carta (mecanismo genérico del motor, nombre a secas); ver logsSoloNueva para el equivalente' },
        ],
        logsSoloNueva: [
            { linea: 'Aniceto de J1 (Jugador 1) entrega su Furor como tributo para Garret.',
              motivo: 'la nueva registra el tributo ANTES de colocar la carta (ANTES_DE_JUGAR, para poder abortar la colocación si se cancela la elección) y con DSL._nombre en vez del nombre a secas' },
        ],
    },
    {
        nombre: 'Garret rechazado: ningún pagador válido (Furor insuficiente)',
        p1: { mano: ['Garret'], vanguardia: [ { carta: 'Aniceto', furor: 3 } ] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { jugar: 'Garret' } ],
    },
    {
        nombre: 'ANDANADA METEÓRICA: ataque especial a 2 enemigos distintos',
        p1: { vanguardia: [ { carta: 'Garret', furor: 3 } ] },
        p2: { vanguardia: ['Mini-tigre', 'Robot de seguridad SP'] },
        pasos: [
            { habilidad: 'Garret' },
            { confirmar: true },
            { elegir: ['Mini-tigre', 'Robot de seguridad SP'] },
        ],
        logsSoloVieja: LOGS_SISTEMA_VIEJA,
    },
    {
        nombre: 'ANDANADA METEÓRICA rechazada: solo hay un enemigo Oculto en vanguardia',
        p1: { vanguardia: [ { carta: 'Garret', furor: 3 } ] },
        p2: { vanguardia: ['Mini-tigre', { carta: 'Robot de seguridad SP', campos: { stealth: true } }] },
        pasos: [ { habilidad: 'Garret' } ],
    },
];

correrSuite('regresion38', escenarios);
