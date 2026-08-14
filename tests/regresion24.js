// tests/regresion24.js — Segunda tanda PASIVA_CONTINUA: pasivas que NO son un
// delta de Atq/Def puro. Kyle, Berry, Súcubo y Sadame (retornada).
//
// Piezas nuevas del intérprete en esta tanda:
//   · Op `MARCAR` dentro de PASIVA_CONTINUA -> pone un campo de la propia carta de
//     forma continua (Berry: siempre Oculta; Súcubo: sostiene el Oculto que le
//     encendió su Activa). Antes MARCAR solo existía para efectos "de una vez".
//   · Op `SUELO_STAT` -> impide que un stat baje de su valor base de plantilla
//     ("stats no bajan de base" de Sadame retornada).
//   · `DSL._passiveExtras` — ejecuta los efectos NO-delta de una pasiva (MARCAR /
//     SUELO_STAT) tras aplicar los deltas, con la misma recursión de if/then/else.
//   · Flag `retrasoSiRecienJugada` -> retrasa SOLO el anuncio (log + flotantes) N ms
//     si la carta acaba de entrar en juego, para no pisar la animación de colocación.
//     Kyle lo hacía a mano con un setTimeout(450); se conserva como flag genérico.
//
// Diferencias de anuncio intencionadas (Kyle): la vieja escribía su propio aviso,
// con un texto distinto al genérico ("... activa! (+2 ATQ y +2 DEF)" en vez de
// "... tiene lugar! (+2 de Def, +2 de Atq)") y UN solo flotante (el nombre de la
// pasiva). El genérico de PASIVA_CONTINUA emite el nombre MÁS un flotante por stat
// cambiado, que es como ya se anuncian Karlos/Zoe. Se estandariza a propósito,
// igual que se hizo con Karlos (KL) en la tanda anterior a petición de Toto.
//
// Berry, Súcubo y Sadame (retornada) van `silencioso: true`: sus pasivas viejas no
// anunciaban nada (solo marcaban un campo o corregían stats), así que no se les
// inventa un aviso que antes no existía.

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        // El escenario arranca con Kyle por DEBAJO del umbral y lo cura DENTRO del guion:
        // así el anuncio (log + flotantes) cae en la parte comparada. Si la pasiva ya
        // estuviera activa al construir el estado, el harness limpia el log y los
        // flotantes del setup y no se compararía nada.
        nombre: 'Kyle: ENTEREZA DEL INGENUO se anuncia al curarse hasta Vida >= 4',
        p1: { vanguardia: [{ carta: 'Kyle', vida: 3 }], mano: ['Manzanahoria'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Manzanahoria' },
            { seleccionar: 'Kyle' }, // cura 2 -> Vida 3->5: activa la pasiva
        ],
        logsIntencionados: [
            { de: '[ability] Manzanahoria', a: '[ability] Manzanahoria [1] de J1 (Jugador 1)', motivo: 'NORMA DEL PROYECTO aplicada al {carta} del DSL (14-ago-2026): un log que nombra una carta dice de quien es, con el formato de siempre. La vieja usaba el nombre pelado. Mismo mensaje, nombre completo' },
            { de: '¡Habilidad pasiva de Kyle de J1 (Jugador 1): ENTEREZA DEL INGENUO activa! (+2 ATQ y +2 DEF)',
              a: '¡Habilidad pasiva de Kyle de J1 (Jugador 1): ENTEREZA DEL INGENUO tiene lugar! (+2 de Def, +2 de Atq)',
              motivo: 'el anuncio pasa al genérico de PASIVA_CONTINUA (mismo formato que Karlos/Zoe), con los stats en orden Def -> Atq como en la cara de la carta' },
        ],
        flotantesSoloNueva: [
            { linea: '+2 DEF · ft-green', motivo: 'el anuncio genérico añade un flotante por cada stat cambiado; la vieja solo sacaba el del nombre de la pasiva' },
            { linea: '+2 ATQ · ft-green', motivo: 'idem, flotante del Atq' },
        ],
    },
    {
        nombre: 'Kyle: pasiva inactiva con Vida < 4',
        p1: { vanguardia: [{ carta: 'Kyle', vida: 3 }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [],
        logsIntencionados: [],
    },
    {
        nombre: 'Berry: IDOL A DISTANCIA la mantiene siempre Oculta (sin anuncio)',
        p1: { vanguardia: ['Karlos', 'Mini-tigre', 'Oso con armadura', 'Droide antidisturbios'], retaguardia: ['Berry'] },
        p2: { vanguardia: ['Robot de seguridad SP'] },
        pasos: [],
        logsIntencionados: [],
    },
    {
        nombre: 'Súcubo: sin permanentStealth, la pasiva no hace nada',
        p1: { vanguardia: ['Súcubo'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [],
        logsIntencionados: [],
    },
    {
        nombre: 'Súcubo: con permanentStealth encendido (por su Activa), sostiene el Oculto',
        p1: { vanguardia: [{ carta: 'Súcubo', campos: { permanentStealth: true } }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [],
        logsIntencionados: [],
    },
    {
        nombre: 'Sadame (retornada): SUELO_STAT devuelve los stats rebajados a su base',
        p1: { vanguardia: [{ carta: 'Sadame (retornada)', atk: 1, def: 1 }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [],
        logsIntencionados: [],
    },
    {
        // CAMBIO DE COMPORTAMIENTO PEDIDO POR TOTO (27-jul-2026). En la vieja, el "stats no
        // bajan de base" se aplicaba DENTRO de la pasiva de la carta, y como los equipos se
        // procesan DESPUÉS, la Chaqueta metálica (-3 ATQ) sí conseguía bajarle el ATQ a 4.
        // Ahora el suelo es un CLAMP FINAL (tras equipos/eventos/temporales y del tope 0-9):
        // "si no pueden bajar, es que no pueden, bajo ningún concepto". Además se anuncia.
        nombre: 'Sadame (retornada): la Chaqueta metálica ya NO puede bajarle el ATQ (clamp final)',
        p1: { vanguardia: ['Sadame (retornada)'], mano: ['Chaqueta metálica defensiva de la muerte'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Chaqueta metálica defensiva de la muerte' },
            { elegir: ['Sadame (retornada)'] },
        ],
        logsIntencionados: [
            { de: 'Sadame (retornada) se pone la Chaqueta', a: 'Sadame (retornada) de J1 (Jugador 1) se pone la Chaqueta',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
        diferenciasEsperadas: [
            { contiene: 'estado.p1.vanguard.0.currentAtk',
              motivo: 'la vieja dejaba el ATQ en 4 (la Chaqueta se aplicaba después del suelo); la nueva lo devuelve a su base 7 con el clamp final, que es lo que significa "no bajan de base"' },
            // copyId/cardCounts (31-jul-2026): bug de motor preexistente corregido -assignCopyId
            // nunca se llamaba al jugar una Ayuda con onPlay propio-, ver la nota de regresion6.
            { contiene: 'copyId', motivo: 'bug de motor preexistente: assignCopyId nunca se llamaba al jugar una Ayuda con onPlay propio; arreglado en el op EQUIPAR' },
            { contiene: 'cardCounts', motivo: 'consecuencia de lo mismo: el contador por el que assignCopyId reparte los números' },
            // _sueloAvisado ya NO aparece aquí: pasó a ser una excepción GLOBAL de diff
            // inerte en harness.js (tanda de contadores/acumuladores, 27-jul-2026), porque
            // el mismo bookkeeping se repite en cualquier carta con SUELO_STAT/TECHO_STAT.
            { contiene: 'ÚLTIMA MISIÓN',
              motivo: 'aviso nuevo pedido por Toto (log + flotante del nombre de la pasiva): cuando el suelo IMPIDE de verdad una bajada, se avisa' },
            { contiene: 'STATS PROTEGIDAS',
              motivo: 'flotante nuevo del mismo aviso' },
        ],
    },
];

correrSuite('regresion24', escenarios);
