// tests/regresion54.js — Cogorza migrada al DSL (31-jul-2026).
//
// La auditoría del 31-jul-2026 la había marcado como "necesita pieza pequeña nueva" por creer
// que el DSL no sabía lanzar UNA MONEDA POR MIEMBRO de un grupo. Era falso: `_runEffectList` ya
// itera el pool y llama a `_doEffect` una vez por objetivo, así que un `MONEDA` con `target` de
// grupo tira una moneda por cada uno y sus ramas (`cara`/`cruz`) reciben ESE objetivo como
// fallback. Segundo diagnóstico de auditoría desmentido leyendo el código de cerca, después del
// de Frikazo — conviene no fiarse de esas etiquetas sin comprobarlas.
//
// Dos piezas nuevas, ambas pequeñas y reutilizables:
//   · `guardaIdsEnSelf` en un efecto normal (ELEGIR ya lo tenía, pero solo para elecciones del
//     jugador): apunta los instanceId del pool que el efecto acaba de resolver. Cogorza lo
//     necesita porque su +2 DEF y su curación al expirar son "para los que bebieron", no "para
//     quien esté en vanguardia en ese momento".
//   · `stats: {atk, def}` en AURA: bono continuo, además de los campos que ya sabía marcar.
//     Idempotente porque updatePassives resetea currentAtk/currentDef a la base en cada pasada.
//
// La curación al expirar usa MODIFICAR_STAT y no CURAR a propósito: CURAR siempre pinta su
// propio flotante ('CURADO') y la vieja no lo hacía; con MODIFICAR_STAT sale solo el "+1 VIDA"
// automático, igual que antes. `ifObjetivo` cubre el "solo si está herido" (mismo patrón que
// CHUPAALMAS de Valafar).
//
// Diferencias intencionadas:
//   · Orden de FLOTANTES cuando hay más de un aliado. La vieja recorre aliado a aliado
//     (flotante, moneda, resultado, siguiente aliado); la nueva resuelve el efecto de flotantes
//     sobre TODO el pool y luego el de las monedas, así que los "+2 DEF" salen agrupados al
//     principio y las "CONFUSIÓN" después. Los LOGS mantienen el orden aliado-a-aliado en ambas.
//   · Concordancia de género en el log de cruz ({objetivoG?Confuso|Confusa}) — norma del
//     proyecto; la vieja decía siempre "Confuso". Requirió añadir `objetivoG` al fill de
//     logCara/logCruz de MONEDA.
//   · El nombre del aliado pasa al formato completo con dueño en los tres logs (norma de 3ª
//     persona); la vieja usaba `ally.name` a secas.

'use strict';
const { correrSuite } = require('./harness');

// Mismo texto en ambas bases, distinta posición (ver nota de cabecera): se retira como PAR.
const FLOTANTES_REORDENADOS = {
    flotantesSoloVieja: [
        { linea: '+2 DEF', motivo: 'orden vieja: intercalado aliado a aliado con las monedas' },
        { linea: 'CONFUSIÓN', motivo: 'orden vieja: justo tras la moneda de ESE aliado' },
    ],
    flotantesSoloNueva: [
        { linea: '+2 DEF', motivo: 'orden nueva: todos los flotantes del pool antes de la primera moneda' },
        { linea: 'CONFUSIÓN', motivo: 'orden nueva: después de todos los "+2 DEF"' },
    ],
};

const escenarios = [
    {
        nombre: 'Cogorza: +2 DEF a la vanguardia y una moneda por aliado (cruz = Confusión)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: ['Mini-tigre', 'Ayudante perturbada'], mano: ['Cogorza'] },
        p2: {},
        monedas: ['cruz', 'cara'], // Mini-tigre se emborracha, Ayudante perturbada aguanta
        pasos: [ { jugar: 'Cogorza' } ],
        logsIntencionados: [
            { de: 'Cogorza para Mini-tigre...', a: 'Cogorza para Mini-tigre [1] de J1 (Jugador 1)...',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba ally.name a secas' },
            { de: 'Cogorza para Ayudante perturbada...', a: 'Cogorza para Ayudante perturbada [1] de J1 (Jugador 1)...',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño)' },
            { de: '¡CRUZ! Mini-tigre se emborracha y queda Confuso.', a: '¡CRUZ! Mini-tigre [1] de J1 (Jugador 1) se emborracha y queda Confuso.',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño)' },
            { de: '¡CARA! Ayudante perturbada aguanta', a: '¡CARA! Ayudante perturbada [1] de J1 (Jugador 1) aguanta',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño)' },
        ],
        ...FLOTANTES_REORDENADOS,
        // CAMBIO DE COMPORTAMIENTO, no cosmético (betasteo de Toto, 31-jul-2026): la vieja
        // pasaba `card.name` (string plano) como fuente del estado de Confusión, así que
        // "Afectado por:" salía como "fuente: Cogorza" en vez del formato completo con dueño
        // y copyId — exactamente el mismo bug que Toto ya nos hizo corregir para los flotantes
        // de destrucción (DESTRUIDO/A). La nueva, sin `fuente` explícita en APLICAR_ESTADO,
        // usa por defecto la propia carta Cogorza (sourceCard), que deja sourceInstanceId
        // puesto y por tanto refCarta() construye "evento Cogorza [n] de Jx (nombre)".
        diferenciasEsperadas: [
            { contiene: 'status.confusion.source', motivo: 'la vieja guardaba un string plano (card.name); la nueva guarda la carta real, con formato completo en "Afectado por:"' },
            { contiene: 'status.confusion.sourceInstanceId', motivo: 'consecuencia de lo mismo: null en la vieja, el instanceId real de Cogorza en la nueva' },
        ],
    },
    {
        nombre: 'Cogorza: la CRUZ sobre una aliada femenina concuerda en género (norma del proyecto)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: ['Ayudante perturbada'], mano: ['Cogorza'] },
        p2: {},
        monedas: ['cruz'],
        pasos: [ { jugar: 'Cogorza' } ],
        logsIntencionados: [
            { de: 'Cogorza para Ayudante perturbada...', a: 'Cogorza para Ayudante perturbada [1] de J1 (Jugador 1)...',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño)' },
            { de: '¡CRUZ! Ayudante perturbada se emborracha y queda Confuso.',
              a: '¡CRUZ! Ayudante perturbada [1] de J1 (Jugador 1) se emborracha y queda Confusa.',
              motivo: 'nombre con dueño + concordancia de género (norma del proyecto); la vieja decía siempre "Confuso"' },
        ],
        // Ver la nota larga del escenario anterior: la vieja guardaba `card.name` (string) como
        // fuente del estado, la nueva la carta real.
        diferenciasEsperadas: [
            { contiene: 'status.confusion.source', motivo: 'la vieja guardaba un string plano (card.name); la nueva guarda la carta real, con formato completo en "Afectado por:"' },
            { contiene: 'status.confusion.sourceInstanceId', motivo: 'consecuencia de lo mismo: null en la vieja, el instanceId real de Cogorza en la nueva' },
        ],
    },
    {
        // Con un solo aliado no hay reordenamiento posible de flotantes, así que este escenario
        // compara la secuencia completa (jugar -> +2 DEF continuo -> expirar -> curar) sin
        // declarar nada de orden: es el control de que el ciclo entero coincide.
        nombre: 'Cogorza: el +2 DEF dura mientras el Evento vive, y al expirar cura 1 al afectado',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Mini-tigre', vida: 1 }], mano: ['Cogorza'] },
        p2: {},
        monedas: ['cara'],
        pasos: [
            { jugar: 'Cogorza' },
            { finTurno: true }, { finTurno: true }, // duración 2 -> 1
            { finTurno: true }, { finTurno: true }, // 1 -> 0: caduca y cura
        ],
        logsIntencionados: [
            { de: 'Cogorza para Mini-tigre...', a: 'Cogorza para Mini-tigre [1] de J1 (Jugador 1)...',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño)' },
            { de: '¡CARA! Mini-tigre aguanta', a: '¡CARA! Mini-tigre [1] de J1 (Jugador 1) aguanta',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño)' },
            { de: 'Mini-tigre se recupera de la resaca', a: 'Mini-tigre [1] de J1 (Jugador 1) se recupera de la resaca',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño)' },
        ],
    },
    {
        nombre: 'Cogorza: un aliado que ENTRA después no queda afectado (ni +2 DEF ni curación)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Mini-tigre', vida: 1 }], mano: ['Cogorza', 'Oso con armadura'] },
        p2: {},
        monedas: ['cara'],
        pasos: [ { jugar: 'Cogorza' }, { jugar: 'Oso con armadura' } ],
        logsIntencionados: [
            { de: 'Cogorza para Mini-tigre...', a: 'Cogorza para Mini-tigre [1] de J1 (Jugador 1)...',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño)' },
            { de: '¡CARA! Mini-tigre aguanta', a: '¡CARA! Mini-tigre [1] de J1 (Jugador 1) aguanta',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño)' },
        ],
    },
];

correrSuite('regresion54', escenarios);
