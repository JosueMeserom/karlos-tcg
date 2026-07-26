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
            { de: '¡Habilidad pasiva de Kyle (J1 (Jugador 1)): ENTEREZA DEL INGENUO activa! (+2 ATQ y +2 DEF)',
              a: '¡Habilidad pasiva de Kyle (J1 (Jugador 1)): ENTEREZA DEL INGENUO tiene lugar! (+2 de Def, +2 de Atq)',
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
];

correrSuite('regresion24', escenarios);
