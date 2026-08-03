// tests/regresion55.js — Karlitos migrado al DSL POR COMPLETO (31-jul-2026).
//
// La auditoría lo tenía como "dos piezas pequeñas compartidas con Honsow". Al mirarlo de cerca
// eran TRES, pero todas reutilizables y ninguna grande — y el trozo que parecía más caro (el
// encadenado "equipa un arma y luego ataca") no necesitó NADA nuevo: son dos `ELEGIR` seguidos
// (uno de MANO, otro de ENEMIGOS) con `ATACAR` al final, el patrón de Gólem de tierra/Raiju.
//
// Piezas nuevas:
//   · `_field` admite RUTAS CON PUNTOS ("counters.karlitos_entrenamiento.count"). Los contadores
//     viven anidados, así que hasta ahora NINGUNA carta podía condicionar por su valor. Devuelve
//     undefined en cuanto un tramo falta, en vez de reventar.
//   · `BUSCAR` admite un ARRAY en `en` (aquí mazo Y descartes a la vez, que es lo que pide el
//     texto). Cada carta sale de la zona en la que estuviera de verdad, y solo se baraja si el
//     MAZO iba incluido. Multi-zona cae al modal visual en vez del visor de mazo completo —el
//     visor enseña UN mazo entero, no tiene sentido con una unión—, que es justo lo que usaba la
//     imperativa. Es la pieza que comparte con Honsow (allí, mano+mazo).
//   · `EQUIPAR` gana `invertido`: al revés del caso de siempre —aquí el OBJETIVO es el arma y la
//     carta FUENTE quien la lleva—. Sin pasar por requisitos, como dice el texto ("ignorando
//     requisitos"). También compartida con Honsow.
//   · `FLOTANTE` gana `log`, que le faltaba a diferencia de casi todos los demás ops.
//
// Diferencias intencionadas, todas de la misma familia (norma de logs en 3ª persona con dueño):
// el arma equipada, la carta encontrada y el mazo barajado pasan a nombrarse con su dueño.
// Ninguna es de comportamiento.
//
// Detalle de orden que NO cambia el resultado: la vieja borra el contador ANTES de la búsqueda;
// aquí se retira DESPUÉS, porque las condiciones de los efectos siguientes lo consultan (si se
// limpiara antes, dejarían de cumplirse). El estado final es el mismo: contador retirado.

'use strict';
const { correrSuite } = require('./harness');

const MAZO_LARGO = ['Longaniza', 'Longaniza', 'Longaniza', 'Longaniza', 'Super Evolución', 'Longaniza'];

// El entrenamiento sube 1 por turno PROPIO, así que hacen falta 6 finTurno para llegar a 3.
const SEIS_TURNOS = [
    { finTurno: true }, { finTurno: true }, { finTurno: true },
    { finTurno: true }, { finTurno: true }, { finTurno: true },
];

// Pedido explícito de Toto (betasteo, 31-jul-2026): un flotante con el nombre de la Pasiva en
// CADA subida del contador (3 veces por cada SEIS_TURNOS), cosa que ni la vieja ni el primer
// intento de esta migración hacían. Pieza nueva: `floating` en MODIFICAR_CONTADORES.
const FLOTANTE_PRACTICA = { linea: 'PRÁCTICA CONSTANTE', motivo: 'flotante nuevo, pedido por Toto, en cada tick del contador de entrenamiento (3 veces por SEIS_TURNOS); la vieja no pintaba nada en ese momento' };

const escenarios = [
    // ---------------- APRENDIZ DE ARMAS (Activa) ----------------
    {
        nombre: 'APRENDIZ DE ARMAS: equipa un Arma de la mano ignorando requisitos y ataca',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Karlitos', furor: 1 }], mano: ['Espada V'] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 20 }] },
        pasos: [
            { habilidad: 'Karlitos' }, { confirmar: true },
            { elegir: ['Espada V'] }, { elegir: ['Mini-tigre'] },
        ],
        logsSoloVieja: [
            { linea: 'Objetivos listos. ¡Ejecutando habilidad!',
              motivo: 'aviso genérico de handleAbilityTargetSelection (camino RAW de abilityContext de la vieja); la nueva elige el enemigo con ELEGIR/pickBoardTargets, que no pasa por ahí' },
        ],
        logsIntencionados: [
            { de: 'se equipa velozmente con Espada V y', a: 'se equipa velozmente con Espada V de J1 (Jugador 1) y',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba weapon.name a secas' },
            { de: 'ataca a Mini-tigre con su nueva arma', a: 'ataca a Mini-tigre [1] de J2 (Jugador 2) con su nueva arma',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas' },
        ],
    },
    {
        nombre: 'APRENDIZ DE ARMAS: también sirve un Arma legendaria (ignora sus condiciones)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Karlitos', furor: 1 }], mano: ['Shichishito'] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 20 }] },
        pasos: [
            { habilidad: 'Karlitos' }, { confirmar: true },
            { elegir: ['Shichishito'] }, { elegir: ['Mini-tigre'] },
        ],
        logsSoloVieja: [
            { linea: 'Objetivos listos. ¡Ejecutando habilidad!', motivo: 'ver escenario anterior' },
        ],
        logsIntencionados: [
            { de: 'se equipa velozmente con Shichishito y', a: 'se equipa velozmente con Shichishito de J1 (Jugador 1) y',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño)' },
            { de: 'ataca a Mini-tigre con su nueva arma', a: 'ataca a Mini-tigre [1] de J2 (Jugador 2) con su nueva arma',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño)' },
        ],
    },
    {
        nombre: 'APRENDIZ DE ARMAS rechazada: no hay armas en la mano',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Karlitos', furor: 1 }], mano: ['Longaniza'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { habilidad: 'Karlitos' } ],
    },
    {
        nombre: 'APRENDIZ DE ARMAS rechazada: no hay enemigos a los que atacar',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Karlitos', furor: 1 }], mano: ['Espada V'] },
        p2: {},
        pasos: [ { habilidad: 'Karlitos' } ],
    },

    // ---------------- PRÁCTICA CONSTANTE (Pasiva) ----------------
    {
        nombre: 'PRÁCTICA CONSTANTE: al 3er turno propio busca Super Evolución en mazo o descartes',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Karlitos', furor: 0 }], mazo: MAZO_LARGO },
        p2: {},
        pasos: [ ...SEIS_TURNOS, { opcion: 'BUSCAR' }, { busqueda: ['Super Evolución'] } ],
        logsIntencionados: [
            { de: 'Añades Super Evolución a tu mano.', a: 'Añades Super Evolución de J1 (Jugador 1) a tu mano.',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas' },
            { de: 'Barajando el mazo...', a: 'Barajando el mazo de J1 (Jugador 1)...',
              motivo: 'norma del proyecto (logs en 3ª persona con jugador), igual que el resto de búsquedas ya migradas (Rezo en grupo, Hexagrama...)' },
        ],
        flotantesSoloNueva: [ FLOTANTE_PRACTICA ],
    },
    {
        nombre: 'PRÁCTICA CONSTANTE: puedes declinar la búsqueda (no se baraja ni se coge nada)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Karlitos', furor: 0 }], mazo: MAZO_LARGO },
        p2: {},
        pasos: [ ...SEIS_TURNOS, { opcion: 'NO BUSCAR' } ],
        flotantesSoloNueva: [ FLOTANTE_PRACTICA ],
    },
    {
        // También la encuentra en los DESCARTES: es lo que exige el texto ("mazo o descarte") y
        // la razón de que BUSCAR necesitara aceptar varias zonas.
        nombre: 'PRÁCTICA CONSTANTE: la encuentra también en los descartes',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Karlitos', furor: 0 }], mazo: ['Longaniza', 'Longaniza', 'Longaniza', 'Longaniza'], descartes: ['Super Evolución'] },
        p2: {},
        pasos: [ ...SEIS_TURNOS, { opcion: 'BUSCAR' }, { busqueda: ['Super Evolución'] } ],
        logsIntencionados: [
            { de: 'Añades Super Evolución a tu mano.', a: 'Añades Super Evolución de J1 (Jugador 1) a tu mano.',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño)' },
            { de: 'Barajando el mazo...', a: 'Barajando el mazo de J1 (Jugador 1)...',
              motivo: 'norma del proyecto (logs en 3ª persona con jugador)' },
        ],
        flotantesSoloNueva: [ FLOTANTE_PRACTICA ],
    },
    {
        nombre: 'PRÁCTICA CONSTANTE: sin Super Evolución en ninguna zona, ni pregunta',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Karlitos', furor: 0 }], mazo: ['Longaniza', 'Longaniza', 'Longaniza', 'Longaniza'] },
        p2: {},
        pasos: [ ...SEIS_TURNOS ],
        flotantesSoloNueva: [ FLOTANTE_PRACTICA ],
    },
    {
        // El entrenamiento es de UNA vez: tras completarlo, `karlitosEntrenado` corta la Pasiva
        // y el contador ya no vuelve a subir por muchos turnos que pasen.
        nombre: 'PRÁCTICA CONSTANTE no se repite: tras entrenar, el contador ya no sube',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Karlitos', furor: 0 }], mazo: ['Longaniza', 'Longaniza', 'Longaniza', 'Longaniza'] },
        p2: {},
        pasos: [ ...SEIS_TURNOS, { finTurno: true }, { finTurno: true } ],
        flotantesSoloNueva: [ FLOTANTE_PRACTICA ],
    },
];

correrSuite('regresion55', escenarios);
