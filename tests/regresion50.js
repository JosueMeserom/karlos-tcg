// tests/regresion50.js — Ayudante perturbada (MANO PARÁSITA), Matón (PANDILLA) y Gólem
// multielemental (CAMBIO DE COLOR) migradas al DSL (31-jul-2026), tras el reto de Toto de
// re-auditar la cola de imperativas con la lección de COMA/SANCIÓN/CASTIGO fresca.
//
// MANO PARÁSITA: mismo esqueleto exacto que Oni ancho (ANTES_DE_ATACAR + MONEDA + BONO_ATAQUE)
// — el bono ya no se resta a mano tras el ataque (bug de doble resta ya documentado varias
// veces esta sesión), sino que ANTES_DE_ATACAR lo deshace con updatePassives (recompute
// completo). Estrena `requiereObjetivo` en ANTES_DE_ATACAR: performDirectAttack llama a
// onBeforeAttack con defender=null (ataque directo al jugador rival, sin carta objetivo) — la
// vieja comprobaba esto a mano ("si es ataque directo, no hay defensor, saltamos la moneda");
// ahora es un flag genérico y reutilizable.
//
// PANDILLA: sin arquitectura nueva de verdad, pero sí tres piezas pequeñas y genéricas: `_zone`
// admite zona:"mano" (para contar copias en la mano propia); `if` de un efecto admite un ARRAY
// de condiciones (AND) y `campoJugador` (condición sobre un campo de game.players[owner], no
// de la carta — el contador "matones colocados este turno" es del JUGADOR, no de ninguna carta
// concreta); MARCAR_JUGADOR admite `delta` (incrementar) y `log`. Además, un op nuevo,
// MARCAR_PARTIDA (hermano de MARCAR_JUGADOR pero para campos de `game` en sí, no de un jugador
// ni de una carta): hacía falta para tocar `game.placedUnitThisTurn`, el candado de "1 unidad
// por turno", que es global y no vive en `players[x]`.
//
// CAMBIO DE COLOR: TRAS_DEFENDER, NO ANTES_DE_DEFENDER aunque la vieja usaba onBeforeDefend —
// el texto dice "al ser atacado" (consecuencia, sin "antes" explícito), la misma regla ya
// aplicada a Imp mayor/DEMONIO VIL (si la carta no dice "antes", va en TRAS_DEFENDER). Usa
// `stat:"def"` (BASE, no currentDef) en MODIFICAR_STAT para que el +1 sea PERMANENTE — currentDef
// se resetea en cada updatePassives, así que un bono ahí habría desaparecido en la siguiente
// pasada. Esto exigió extender `game.modifyStat` (index.html) con un fallback genérico para
// stats fuera de currentHp/furor/currentAtk/currentDef (ver el propio archivo). Piezas nuevas
// también en `_cond`: `no:true` (niega el resultado de la comparación) para poder escribir
// "NO defBoosts>=3" en vez de "defBoosts<3", que con el contador aún sin inicializar
// (undefined) habría dado `undefined<3 === false` y bloqueado la PRIMERA activación. Y `si` en
// los compiladores de TRAS_DEFENDER/ANTES_DE_DEFENDER, que sorprendentemente no lo tenían
// (sus hermanos ANTES_DE_ATACAR/TRAS_ATACAR sí) — gap de consistencia real, no específico de
// esta carta, corregido para los dos triggers a la vez.
//
// Diferencias de wording DECLARADAS a propósito (no de comportamiento): el flotante automático
// de game.modifyStat para un stat "genérico" (aquí, 'def') sale como "+1 DEF" en vez del
// "+1 DEF BASE" que la vieja escribía a mano — declarar un `floating` propio en el efecto
// habría duplicado el flotante (mismo patrón ya visto con Achmay/YOLOLO), así que se deja solo
// el automático. El log de CAMBIO DE COLOR pierde el sufijo "(lleva N/3)" — no hay forma de
// referenciar el contador recién incrementado desde el texto de log de TRAS_DEFENDER/
// MODIFICAR_STAT sin una pieza más; se acepta el texto simplificado.
//
// Experimento fallido (ABOMINACIÓN AFABLE) se revisó pero NO cambia: ya es solo
// `onBeforePlayAsync` con `DSL.tributoFuror`, la forma mínima ya aceptada como imperativa en
// Ángel/Domador/Raiju/Imp mayor/Garret/Serafín — no hay nada más que declarar.

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    // ---------------- Ayudante perturbada (MANO PARÁSITA) ----------------
    {
        nombre: 'MANO PARÁSITA: moneda CARA da +2 Atq solo durante ese ataque',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Ayudante perturbada' }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 20 }] },
        monedas: ['cara'],
        pasos: [ { atacar: 'Ayudante perturbada', objetivo: 'Mini-tigre' } ],
    },
    {
        nombre: 'MANO PARÁSITA: moneda CRUZ no da ningún bono',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Ayudante perturbada' }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 20 }] },
        monedas: ['cruz'],
        pasos: [ { atacar: 'Ayudante perturbada', objetivo: 'Mini-tigre' } ],
    },
    {
        nombre: 'MANO PARÁSITA no se dispara en un ataque directo (sin defensor, requiereObjetivo)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Ayudante perturbada' }] },
        p2: { retribucion: ['Mini-tigre', 'Mini-tigre'] }, // evita processRetribution -> hp=0 -> gameOver
        pasos: [ { ataqueDirecto: 'Ayudante perturbada' } ],
    },

    // ---------------- Matón (PANDILLA) ----------------
    {
        nombre: 'PANDILLA: coloca un 2º Matón el mismo turno porque queda un 3º en la mano',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Matón' }], mano: ['Matón', 'Matón'] },
        p2: {},
        pasos: [ { jugar: 'Matón', indice: 0 } ],
    },
    {
        nombre: 'PANDILLA: al colocar el 3º Matón del turno, el candado NO se vuelve a levantar',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Matón' }, { carta: 'Matón' }], mano: ['Matón', 'Mini-tigre'] },
        p2: {},
        pasos: [ { jugar: 'Matón' } ],
    },
    {
        nombre: 'PANDILLA: coloca un Matón sin más copias en la mano, el candado no se levanta',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [], mano: ['Matón'] },
        p2: {},
        pasos: [ { jugar: 'Matón' } ],
    },
    {
        nombre: 'PANDILLA: el contador de Matones colocados se resetea al empezar el turno',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Matón' }, { carta: 'Matón' }], mano: ['Matón'] },
        p2: {},
        pasos: [ { jugar: 'Matón' }, { finTurno: true }, { finTurno: true } ],
    },

    // ---------------- Gólem multielemental (CAMBIO DE COLOR) ----------------
    {
        // Reordenamiento completo (mismo patrón que Imp mayor, regresion46): la vieja usaba
        // onBeforeDefend (ANTES del golpe/animación), así que su log/flotantes de la Habilidad
        // salen ANTES del "recibe N daño"; la nueva usa TRAS_DEFENDER (DESPUÉS), que es el
        // timing correcto para "al ser atacado" (betasteo de Toto en Imp mayor, mismo criterio
        // aplicado aquí). Los TRES flotantes y las DOS líneas de log cambian de posición entre
        // bases, así que se retiran TODOS como pares -incluida "recibe N daño", con el MISMO
        // texto en ambos lados- para que no quede nada que comparar por índice.
        nombre: 'CAMBIO DE COLOR: +1 Def BASE permanente al ser atacado (1ª vez)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Mini-tigre', vida: 20 }] },
        p2: { vanguardia: [{ carta: 'Gólem multielemental', vida: 20 }] },
        pasos: [ { atacar: 'Mini-tigre', objetivo: 'Gólem multielemental' } ],
        logsSoloVieja: [
            { linea: '¡CAMBIO DE COLOR se activa! (+1 Defensa permanente, lleva 1/3).', motivo: 'la vieja anuncia ANTES del golpe (onBeforeDefend) y con el sufijo "lleva N/3"' },
            { linea: 'recibe 1 daño', motivo: 'mismo texto que la nueva, pero en posición distinta (ver nota arriba)' },
        ],
        logsSoloNueva: [
            { linea: 'recibe 1 daño', motivo: 'mismo texto que la vieja, pero en posición distinta (ver nota arriba)' },
            { linea: '¡CAMBIO DE COLOR se activa! (+1 Defensa permanente).', motivo: 'la nueva anuncia DESPUÉS del golpe (TRAS_DEFENDER, timing correcto) y sin el sufijo "lleva N/3" (no hay forma de referenciar el contador recién incrementado desde el log del efecto)' },
        ],
        flotantesSoloVieja: [
            { linea: 'CAMBIO DE COLOR', motivo: 'mismo texto que la nueva, posición distinta' },
            { linea: '+1 DEF BASE', motivo: 'la vieja escribía a mano un flotante custom con ese texto' },
            { linea: '-1 VIDA', motivo: 'mismo texto que la nueva, posición distinta' },
        ],
        flotantesSoloNueva: [
            { linea: '-1 VIDA', motivo: 'mismo texto que la vieja, posición distinta' },
            { linea: 'CAMBIO DE COLOR', motivo: 'mismo texto que la vieja, posición distinta' },
            { linea: '+1 DEF', motivo: 'flotante automático genérico de game.modifyStat (mismo patrón "+N STAT" que currentAtk/currentDef); declarar uno propio habría duplicado el flotante' },
        ],
    },
    {
        nombre: 'CAMBIO DE COLOR: se detiene al llegar a +3 Def (4ª vez seguida, sin nuevo bono ni log)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Mini-tigre', vida: 30 }] },
        p2: { vanguardia: [{ carta: 'Gólem multielemental', vida: 30, campos: { defBoosts: 3 } }] },
        pasos: [ { atacar: 'Mini-tigre', objetivo: 'Gólem multielemental' } ],
    },
];

correrSuite('regresion50', escenarios);
