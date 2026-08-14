// tests/regresion52.js — Frikazo (FIJACIÓN) y Gárgola (PRUEBA DE CARÁCTER) migradas al DSL
// (31-jul-2026).
//
// FIJACIÓN ancla al REVÉS que Gladiador/Kazuo: el Personaje protegido guarda `attachments`
// (el bucle de interceptores en index.html recorre `currentDefender.attachments` buscando
// `onInterceptAttack`), Frikazo guarda `attachedTo` — nuevo flag `reverse` en el op ANEXAR,
// que también limpia el anexo ANTERIOR de self si lo hubiera (FIJACIÓN es "Reusable"; ni
// Gladiador ni Kazuo lo necesitaban por ser de un solo uso al colocarse).
//
// El redirigir el golpe usa un trigger nuevo, `INTERCEPTOR_ATAQUE` -> `onInterceptAttack`: NO
// es una variante de REACCION (sin prompt ni moneda), sino un hook YA genérico en el motor
// (el bucle de "Interceptores de Daño Pasivos" en index.html recorre CUALQUIER carta anexada
// que lo implemente; hoy solo Frikazo). Sin condición ni confirmación: mientras el vínculo
// esté activo, SIEMPRE redirige.
//
// Gárgola (PRUEBA DE CARÁCTER): el elegir enemigo para drenar pasa del modal genérico a
// ELEGIR/pickBoardTargets (norma de targeting en tablero). Pieza nueva: `siNoElegido` en
// ELEGIR — rama "de lo contrario" que corre si el pool está vacío O si el jugador declina;
// hacía falta para "tributa 2 Furor de un aliado O Gárgola se destruye" (mismo canal
// vaciar+sinRetribucion+comprobarMuerte que Kami/Némesis/Muñeca del mal, regresion51).
// Simplificación de log aceptada: la vieja distingue "Nadie pagó el tributo" (declinas
// teniendo pagadores válidos) de "No hay aliados con suficiente Furor" (no los hay);
// `siNoElegido` no distingue la causa, así que la nueva usa un único texto para ambos casos.
// Duplicado real en la VIEJA, no un bug de la migración (mismo patrón ya documentado varias
// veces esta sesión, p. ej. Gul guerrero/regresion45): al drenar Furor, la vieja llama a
// game.modifyStat (que YA muestra su propio flotante automático "-2 FUR") Y ADEMÁS llama a
// showFloatingText("-2 FUR") a mano — dos flotantes idénticos por el mismo evento. La nueva
// se queda solo con el automático; se retira como PAR completo (mismo texto que el del
// tributo, no se puede declarar solo-vieja a secas).

'use strict';
const { correrSuite } = require('./harness');

// FIJACIÓN usa ELEGIR (pickBoardTargets) para el objetivo, a diferencia del camino RAW de
// abilityContext.targets que usaba la vieja — mismo patrón ya visto en Gólem de tierra/SEÍSMO
// (regresion33) y Gladiador/Kazuo (ANEXAR). Con maxTargets:1 en la vieja, el propio clic
// completa el cupo de inmediato: solo aparece el aviso final, sin el intermedio "Objetivo 1
// fijado" (ese solo sale cuando falta más de un objetivo por elegir).
const AVISO_SISTEMA_VIEJA = {
    linea: 'Objetivos listos. ¡Ejecutando habilidad!',
    motivo: 'aviso genérico de handleAbilityTargetSelection (mecanismo abilityContext.targets de la vieja); la nueva resuelve el objetivo con ELEGIR/pickBoardTargets, que no pasa por ahí',
};

const FUR_DUPLICADO = {
    flotantesSoloVieja: [ { linea: '-2 FUR', motivo: 'la vieja lo emite dos veces al drenar (automático de modifyStat + a mano)' } ],
    flotantesSoloNueva: [ { linea: '-2 FUR', motivo: 'la nueva lo emite solo automático (game.modifyStat)' } ],
};

const escenarios = [
    {
        nombre: 'FIJACIÓN: anexa a Karlos y el ataque dirigido a él golpea a Frikazo en su lugar',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Frikazo', furor: 1 }, 'Karlos'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { habilidad: 'Frikazo' }, { confirmar: true }, { elegir: ['Karlos'] },
            { finTurno: true },
            { atacar: 'Mini-tigre', objetivo: 'Karlos' },
        ],
        logsSoloVieja: [ AVISO_SISTEMA_VIEJA ],
        logsIntencionados: [
            { de: 'fan número 1 de Agah y', a: 'fan número 1 de Agah de J1 (Jugador 1) y', motivo: 'NORMA DEL PROYECTO aplicada al {carta} del DSL (14-ago-2026): un log que nombra una carta dice de quien es. La vieja usaba el nombre pelado' },
                    { de: 'fan número 1 de Karlos y', a: 'fan número 1 de Karlos de J1 (Jugador 1) y', motivo: 'NORMA DEL PROYECTO aplicada al {carta} del DSL (14-ago-2026): un log que nombra una carta dice de quien es, con el formato de siempre. La vieja usaba el nombre pelado' },
            { de: '[ability] ¡Frikazo', a: '[ability] ¡Frikazo [1] de J1 (Jugador 1)', motivo: 'NORMA DEL PROYECTO aplicada al {carta} del DSL (14-ago-2026): un log que nombra una carta dice de quien es, con el formato de siempre. La vieja usaba el nombre pelado. Mismo mensaje, nombre completo' },
            { de: '¡Frikazo se vuelve el fan número 1 de Karlos y lo protegerá con su vida!',
              a: '¡Frikazo se vuelve el fan número 1 de Karlos de J1 (Jugador 1) y lo protegerá con su vida!',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
            { de: '¡FIJACIÓN! Frikazo se lanza cual guardaespaldas a recibir el golpe en lugar de Karlos.',
              a: '¡FIJACIÓN! Frikazo se lanza cual guardaespaldas a recibir el golpe en lugar de Karlos de J1 (Jugador 1).',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba defender.name a secas; la nueva rellena {defensor} con DSL._nombre' },
        ],
    },
    {
        nombre: 'FIJACIÓN rechazada: no hay Personajes aliados a los que proteger',
        logsIntencionados: [ { de: 'fan número 1 de Karlos y', a: 'fan número 1 de Karlos de J1 (Jugador 1) y', motivo: 'NORMA DEL PROYECTO aplicada al {carta} del DSL (14-ago-2026): un log que nombra una carta dice de quien es, con el formato de siempre. La vieja usaba el nombre pelado' } ],
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Frikazo', furor: 1 }, 'Mini-tigre'] },
        p2: {},
        pasos: [ { habilidad: 'Frikazo' } ],
    },
    {
        nombre: 'FIJACIÓN reusable: re-anexar a otro Personaje suelta el vínculo anterior',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Frikazo', furor: 2 }, 'Karlos', 'Agah'] },
        p2: {},
        pasos: [
            { habilidad: 'Frikazo' }, { confirmar: true }, { elegir: ['Karlos'] },
            { finTurno: true }, { finTurno: true },
            { habilidad: 'Frikazo' }, { confirmar: true }, { elegir: ['Agah'] },
        ],
        logsSoloVieja: [ AVISO_SISTEMA_VIEJA ],
        logsIntencionados: [
            { de: 'fan número 1 de Karlos y', a: 'fan número 1 de Karlos de J1 (Jugador 1) y', motivo: 'NORMA DEL PROYECTO aplicada al {carta} del DSL (14-ago-2026): un log que nombra una carta dice de quien es, con el formato de siempre. La vieja usaba el nombre pelado' },
            { de: '[ability] ¡Frikazo', a: '[ability] ¡Frikazo [1] de J1 (Jugador 1)', motivo: 'NORMA DEL PROYECTO aplicada al {carta} del DSL (14-ago-2026): un log que nombra una carta dice de quien es, con el formato de siempre. La vieja usaba el nombre pelado. Mismo mensaje, nombre completo' },
            { de: '¡Frikazo se vuelve el fan número 1 de Karlos y lo protegerá con su vida!',
              a: '¡Frikazo se vuelve el fan número 1 de Karlos de J1 (Jugador 1) y lo protegerá con su vida!',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño)' },
            { de: 'fan número 1 de Agah y lo protegerá',
              a: 'fan número 1 de Agah de J1 (Jugador 1) y lo protegerá',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño)' },
        ],
    },

    // ---------------- Gárgola (PRUEBA DE CARÁCTER) ----------------
    {
        nombre: 'PRUEBA DE CARÁCTER: CARA drena Furor a un enemigo elegido, CRUZ paga el tributo con un aliado',
        logsIntencionados: [ { de: 'fan número 1 de Karlos y', a: 'fan número 1 de Karlos de J1 (Jugador 1) y', motivo: 'NORMA DEL PROYECTO aplicada al {carta} del DSL (14-ago-2026): un log que nombra una carta dice de quien es, con el formato de siempre. La vieja usaba el nombre pelado' } ],
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 3 }], mano: ['Gárgola'] },
        p2: { vanguardia: [{ carta: 'Robot de seguridad SP', furor: 5 }] },
        monedas: ['cara', 'cruz'],
        pasos: [
            { jugar: 'Gárgola' },
            { elegir: ['Robot de seguridad SP'] },
            { elegir: ['Mini-tigre'] },
        ],
        ...FUR_DUPLICADO,
    },
    {
        nombre: 'PRUEBA DE CARÁCTER: CARA+CARA — drena Furor y Gárgola queda satisfecha (sin tributo)',
        logsIntencionados: [ { de: 'fan número 1 de Karlos y', a: 'fan número 1 de Karlos de J1 (Jugador 1) y', motivo: 'NORMA DEL PROYECTO aplicada al {carta} del DSL (14-ago-2026): un log que nombra una carta dice de quien es, con el formato de siempre. La vieja usaba el nombre pelado' } ],
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 3 }], mano: ['Gárgola'] },
        p2: { vanguardia: [{ carta: 'Robot de seguridad SP', furor: 5 }] },
        monedas: ['cara', 'cara'],
        pasos: [
            { jugar: 'Gárgola' },
            { elegir: ['Robot de seguridad SP'] },
        ],
        ...FUR_DUPLICADO,
    },
    {
        nombre: 'PRUEBA DE CARÁCTER: CRUZ+CRUZ sin aliados con Furor suficiente — Gárgola se destruye sola',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 0 }], mano: ['Gárgola'] },
        p2: { vanguardia: ['Robot de seguridad SP'] },
        monedas: ['cruz', 'cruz'],
        pasos: [ { jugar: 'Gárgola' } ],
        logsIntencionados: [
            { de: 'fan número 1 de Karlos y', a: 'fan número 1 de Karlos de J1 (Jugador 1) y', motivo: 'NORMA DEL PROYECTO aplicada al {carta} del DSL (14-ago-2026): un log que nombra una carta dice de quien es, con el formato de siempre. La vieja usaba el nombre pelado' },
            { de: '¡No hay aliados con suficiente Furor! Gárgola se hace pedazos.',
              a: '¡Nadie paga el tributo! Gárgola se hace pedazos.',
              motivo: 'simplificación aceptada (ver nota de cabecera): siNoElegido no distingue "sin pagadores válidos" de "declinas la elección", un único texto para ambos casos' },
            // Diferencia de DATO de carta, no de migración: Toto añadió `gender:"F"` a Gárgola
            // en cartas.js tras el betasteo (la base vieja está congelada y no lo tiene), así
            // que el log genérico de muerte del motor concuerda en femenino solo en la nueva.
            { de: 'Gárgola [1] de J1 (Jugador 1) ha sido destruido.',
              a: 'Gárgola [1] de J1 (Jugador 1) ha sido destruida.',
              motivo: 'gender:"F" añadido a la ficha de Gárgola en la base nueva; la vieja (congelada) no lo tiene' },
        ],
        flotantesSoloNueva: [
            { linea: 'DESTRUIDA', motivo: 'destrucción directa sin Retribución: la nueva anuncia "DESTRUIDO/A" en vez de "-N VIDA"; la vieja no anunciaba nada (ver regresion40/51)' },
        ],
    },
    {
        nombre: 'PRUEBA DE CARÁCTER: CRUZ+CRUZ con pagador válido pero el jugador declina — Gárgola se destruye igual',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 5 }], mano: ['Gárgola'] },
        p2: { vanguardia: ['Robot de seguridad SP'] },
        monedas: ['cruz', 'cruz'],
        pasos: [ { jugar: 'Gárgola' }, { cancelar: true } ],
        logsIntencionados: [
            { de: 'fan número 1 de Karlos y', a: 'fan número 1 de Karlos de J1 (Jugador 1) y', motivo: 'NORMA DEL PROYECTO aplicada al {carta} del DSL (14-ago-2026): un log que nombra una carta dice de quien es, con el formato de siempre. La vieja usaba el nombre pelado' },
            { de: '¡Nadie pagó el tributo! Gárgola se hace pedazos.',
              a: '¡Nadie paga el tributo! Gárgola se hace pedazos.',
              motivo: 'simplificación aceptada (ver nota de cabecera): mismo texto único de siNoElegido' },
            { de: 'Gárgola [1] de J1 (Jugador 1) ha sido destruido.',
              a: 'Gárgola [1] de J1 (Jugador 1) ha sido destruida.',
              motivo: 'gender:"F" añadido a la ficha de Gárgola en la base nueva; la vieja (congelada) no lo tiene' },
        ],
        flotantesSoloNueva: [
            { linea: 'DESTRUIDA', motivo: 'destrucción directa sin Retribución: la nueva anuncia "DESTRUIDO/A" en vez de "-N VIDA"; la vieja no anunciaba nada (ver regresion40/51)' },
        ],
    },
];

correrSuite('regresion52', escenarios);
