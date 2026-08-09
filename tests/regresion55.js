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

// La carta se referencia por ID (1049), no por nombre: en la base VIEJA se llama "Super
// Evolución" y en la NUEVA "Súper Evolución" (Toto la renombró el 31-jul-2026 para que
// concuerde con la etiqueta "Usuario de Súper Evolución" y con sus propios textos, que ya
// iban acentuados). `cartas_antes_de_dsl.js` no se toca NUNCA, así que el nombre viejo se
// queda ahí para siempre y un escenario por nombre solo resolvería en una de las dos bases.
const SUPER_EVO = 1049;
const MAZO_LARGO = ['Longaniza', 'Longaniza', 'Longaniza', 'Longaniza', SUPER_EVO, 'Longaniza'];

// Nombre de la carta en cada base, para los pasos que la eligen por nombre y para los mapas
// de logs. Toda diferencia de esta suite que sea solo "Super" vs "Súper" viene de aquí.
const NOM_VIEJO = 'Super Evolución';
const NOM_NUEVO = 'Súper Evolución';

// El entrenamiento sube 1 por turno PROPIO, así que hacen falta 6 finTurno para llegar a 3.
const SEIS_TURNOS = [
    { finTurno: true }, { finTurno: true }, { finTurno: true },
    { finTurno: true }, { finTurno: true }, { finTurno: true },
];

// Pedido explícito de Toto (betasteo, 31-jul-2026): un flotante con el nombre de la Pasiva en
// CADA subida del contador (3 veces por cada SEIS_TURNOS), cosa que ni la vieja ni el primer
// intento de esta migración hacían. Pieza nueva: `floating` en MODIFICAR_CONTADORES.
const FLOTANTE_PRACTICA = { linea: 'PRÁCTICA CONSTANTE', motivo: 'flotante nuevo, pedido por Toto, en cada tick del contador de entrenamiento (3 veces por SEIS_TURNOS); la vieja no pintaba nada en ese momento' };

// Bug de motor real y preexistente corregido el 31-jul-2026 (betasteo de Poder Legado): el op
// EQUIPAR nunca llamaba a assignCopyId, así que un arma equipada nunca llevaba su [n] en
// "Afectado por:". Aquí se ve en el propio LOG del ataque, no solo en el estado: ver regresion6
// para la nota completa.
const COPY_ID_NACE = [
    { contiene: 'copyId', motivo: 'bug de motor preexistente: assignCopyId nunca se llamaba al equipar un arma; arreglado en el op EQUIPAR' },
    { contiene: 'cardCounts', motivo: 'consecuencia de lo mismo: el contador por el que assignCopyId reparte los números' },
];

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
            { de: 'se equipa velozmente con Espada V de J1 (Jugador 1) y', a: 'se equipa velozmente con Espada V [1] de J1 (Jugador 1) y',
              motivo: 'consecuencia del mismo bug de copyId: el arma ahora lleva su [n]' },
            { de: 'ataca a Mini-tigre con su nueva arma', a: 'ataca a Mini-tigre [1] de J2 (Jugador 2) con su nueva arma',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas' },
        ],
        // El coste pasa a cobrarse al FINAL (`costeDiferido`, Toto 7-ago-2026): hasta que el arma
        // no se equipa no ha cambiado nada, así que cancelar la elección debe salir gratis. Efecto
        // colateral esperado: el flotante "-1 FUR" ya no abre la secuencia, la cierra. Los mismos
        // flotantes, en otro orden.
        diferenciasEsperadas: COPY_ID_NACE.concat([
            { contiene: 'flotante[', motivo: 'costeDiferido: el "-1 FUR" del coste se pinta al final y no al principio; mismos flotantes, distinto orden' },
        ]),
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
            { de: 'Shichishito de J1 (Jugador 1) y', a: 'Shichishito [1] de J1 (Jugador 1) y',
              motivo: 'consecuencia del mismo bug de copyId: el arma ahora lleva su [n] (regla encadenada sobre la anterior)' },
            { de: 'ataca a Mini-tigre con su nueva arma', a: 'ataca a Mini-tigre [1] de J2 (Jugador 2) con su nueva arma',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño)' },
        ],
        diferenciasEsperadas: COPY_ID_NACE.concat([
            { contiene: 'flotante[', motivo: 'costeDiferido (ver escenario anterior): el "-1 FUR" se pinta al final, no al principio' },
        ]),
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
        nombre: 'PRÁCTICA CONSTANTE: al 3er turno propio busca Súper Evolución en mazo o descartes',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Karlitos', furor: 0 }], mazo: MAZO_LARGO },
        p2: {},
        // confirmarPorZona (31-jul-2026, betasteo de Toto): la vieja combina mazo+descartes en
        // UN modal ("BUSCAR"/"NO BUSCAR"); la nueva pregunta primero EN QUÉ ZONA, y como aquí la
        // carta está en el mazo, la zona MAZO abre el visor de mazo completo (elegir con {elegir},
        // que responde a "visorMazo") en vez del modal genérico de {busqueda}.
        pasos: [
            ...SEIS_TURNOS,
            { soloEn: 'vieja', opcion: 'BUSCAR' }, { soloEn: 'vieja', busqueda: [NOM_VIEJO] },
            { soloEn: 'nueva', opcion: 'BUSCAR EN EL MAZO' }, { soloEn: 'nueva', elegir: [NOM_NUEVO] },
        ],
        logsIntencionados: [
            { de: `Añades ${NOM_VIEJO} a tu mano.`, a: `Añades ${NOM_NUEVO} de J1 (Jugador 1) a tu mano.`,
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas; el acento de "Súper" es el renombrado de Toto (ver cabecera)' },
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
        p1: { vanguardia: [{ carta: 'Karlitos', furor: 0 }], mazo: ['Longaniza', 'Longaniza', 'Longaniza', 'Longaniza'], descartes: [SUPER_EVO] },
        p2: {},
        // confirmarPorZona: eligiendo la zona DESCARTES, la nueva coge la PRIMERA coincidencia
        // sin modal (el orden de los descartes da igual) y sin abrir ni barajar el mazo -motivo
        // exacto del fix pedido por Toto: antes, aceptar "BUSCAR" barajaba el mazo aunque la
        // carta viniera de los descartes, revelando implícitamente que había una copia en el mazo-.
        pasos: [
            ...SEIS_TURNOS,
            { soloEn: 'vieja', opcion: 'BUSCAR' }, { soloEn: 'vieja', busqueda: [NOM_VIEJO] },
            { soloEn: 'nueva', opcion: 'BUSCAR EN LOS DESCARTES' },
        ],
        logsIntencionados: [
            { de: `Añades ${NOM_VIEJO} a tu mano.`, a: `Añades ${NOM_NUEVO} de J1 (Jugador 1) a tu mano.`,
              motivo: 'norma del proyecto (logs en 3ª persona con dueño); el acento de "Súper" es el renombrado de Toto (ver cabecera)' },
        ],
        // CAMBIO DE COMPORTAMIENTO, no cosmético (betasteo de Toto, 31-jul-2026): la vieja (y la
        // nueva antes de este fix) barajaban el mazo tras CUALQUIER búsqueda con éxito, aunque la
        // carta encontrada viniera de los descartes. Ahora la nueva solo baraja si el jugador
        // elige mirar el MAZO; eligiendo DESCARTES, el mazo no se toca ni se revela nada de él.
        logsSoloVieja: [
            { linea: 'Barajando el mazo...', motivo: 'la vieja siempre barajaba tras encontrar, sin importar la zona; la nueva ya no lo hace si la carta vino de los descartes (fix pedido por Toto)' },
        ],
        flotantesSoloNueva: [ FLOTANTE_PRACTICA ],
    },
    {
        // Renombrado (Toto, 7-ago-2026): la nueva SÍ pregunta. El MAZO se ofrece siempre, tenga
        // o no coincidencias, porque ocultar el botón delataría que ahí no queda nada. Lo que
        // desaparece es el botón de DESCARTES, y eso no revela nada: esa pila el jugador la ve.
        nombre: 'PRÁCTICA CONSTANTE: sin Súper Evolución en ninguna zona, el mazo se ofrece igual',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Karlitos', furor: 0 }], mazo: ['Longaniza', 'Longaniza', 'Longaniza', 'Longaniza'] },
        p2: {},
        pasos: [ ...SEIS_TURNOS, { opcion: 'NO BUSCAR', soloEn: 'nueva' } ],
        logsSoloVieja: [
            { linea: 'No quedan cartas de Súper Evolución en el mazo ni en los descartes.',
              motivo: 'la vieja se rendía sola y lo anunciaba; la nueva ofrece igualmente mirar el MAZO (ocultar el botón delataría que ahí no queda nada), así que ya no hay nada que anunciar de antemano' },
        ],
        flotantesSoloNueva: [ FLOTANTE_PRACTICA ],
    },
    {
        // El entrenamiento es de UNA vez: tras completarlo, `karlitosEntrenado` corta la Pasiva
        // y el contador ya no vuelve a subir por muchos turnos que pasen.
        nombre: 'PRÁCTICA CONSTANTE no se repite: tras entrenar, el contador ya no sube',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Karlitos', furor: 0 }], mazo: ['Longaniza', 'Longaniza', 'Longaniza', 'Longaniza'] },
        p2: {},
        pasos: [ ...SEIS_TURNOS, { opcion: 'NO BUSCAR', soloEn: 'nueva' }, { finTurno: true }, { finTurno: true } ],
        logsSoloVieja: [
            { linea: 'No quedan cartas de Súper Evolución en el mazo ni en los descartes.',
              motivo: 'la vieja se rendía sola y lo anunciaba; la nueva ofrece igualmente mirar el MAZO (ocultar el botón delataría que ahí no queda nada), así que ya no hay nada que anunciar de antemano' },
        ],
        flotantesSoloNueva: [ FLOTANTE_PRACTICA ],
    },
];

correrSuite('regresion55', escenarios);
