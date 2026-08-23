// tests/regresion61.js — AL-FÉNIX (Activa de Zoe calcinante) migrada al DSL (31-jul-2026).
//
// Era "la siguiente candidata obvia" desde hacía varias tandas, bloqueada por UNA pieza: la
// parada anticipada. Aquí es LEGÍTIMA, a diferencia de COMA/SANCIÓN/CASTIGO, donde el
// `canStopEarly` de la imperativa estaba mal diagnosticado y las cartas en realidad exigían una
// cantidad exacta — el texto de esta dice literalmente "hasta 3 en Van. y 1 en Ret.".
//
// DOS PIEZAS NUEVAS, las dos en el ELEGIR declarativo:
//   · `permitirParar`: saca el botón OK para cerrar la elección antes de llenar el cupo.
//     `hastaCantidad` NO servía: ese ajusta el cupo a los objetivos DISPONIBLES, pero no deja al
//     jugador plantarse cuando quiera teniendo más objetivos a mano, que es justo lo que pide la
//     carta. Se apoya en el canal que ya existía: parar resuelve por el MISMO
//     VISUAL_SEARCH_CONFIRM que completar la elección del todo, así que el rival y cualquier
//     reconectado se enteran sin nada nuevo (y el descriptor de reanudar-perfecto lo lleva, así
//     que al reconectar el botón vuelve a salir).
//   · `maxPorZona`: cupo POR FILA además del total. "3 en vanguardia y 1 en retaguardia" no se
//     puede expresar con un único `cantidad`.
//
// El camino CRUDO (SELECT_ABILITY_TARGETS) ya tenía su botón OK desde siempre; lo que faltaba
// era el equivalente declarativo. Ahora los dos caminos ofrecen parada anticipada.
//
// El resto de la carta se queda imperativo a propósito: la Pasiva JUSTICIERA ABRASADORA (DoT que
// CURA en vez de dañar, vía onDoTTick, más el +2 DEF mientras dure y el DoT a ambos tras
// combatir) no tiene arquetipo declarativo, y el veto de colocación tampoco.

'use strict';
const { correrSuite } = require('./harness');

const ZOE_C = { carta: 'Zoe (calcinante)', furor: 4 };

// La vieja usaba el camino crudo (abilityContext + clics sueltos) y la nueva usa ELEGIR; el paso
// {elegir} del arnés es polimórfico y responde a los dos.
const AVISO_RAW_VIEJA = [
];

// La vieja nombraba a WOLFGANG en el log de cada golpe: un copia-pega del código de otra carta
// que llevaba ahí desde siempre (la Habilidad es de Zoe calcinante, Wolfgang no pinta nada).
// La migración lo arregla de encima al usar el log genérico del op ATACAR.
const LOG_WOLFGANG = [
    { linea: '¡Wolfgang ataca (Golpe 1)!', motivo: 'copia-pega de otra carta en la imperativa: la Habilidad es de Zoe (calcinante) y ahí no interviene ninguna Wolfgang' },
    { linea: '¡Wolfgang ataca (Golpe 2)!', motivo: 'ídem' },
    { linea: '¡Wolfgang ataca (Golpe 3)!', motivo: 'ídem' },
    { linea: '¡Wolfgang ataca (Golpe 4)!', motivo: 'ídem' },
];

// BUG REAL de la carta viva, corregido por la migración: la imperativa comprueba
// `card.furor < activeCost` en canActivateAbility pero NUNCA descuenta el coste — AL-FÉNIX salía
// gratis (solo agotaba a Zoe). El cierre genérico de ACTIVA del compilador sí lo cobra.
const COSTE_NO_COBRADO = [
    { contiene: 'vanguard.0.furor', motivo: 'la vieja se dejaba los 4 de Furor sin cobrar; la nueva los descuenta como manda el texto "(4F)"' },
];

// SEGUNDO bug real de la misma carta, del patrón que ya rompió SABIDURÍA y la Zoe normal: el
// +2 DEF de JUSTICIERA ABRASADORA se aplicaba con un flag-cerrojo (`zoeDefBuffActive`) que solo
// sumaba en la transición sin-DoT -> con-DoT. Como currentDef se resetea a plantilla en CADA
// pasada de updatePassives, bastaba una pasada de más para perder el bono, y el cerrojo impedía
// reponerlo. Migrado a PASIVA_CONTINUA, que lo reaplica siempre.
const DEF_QUE_AHORA_PERSISTE = [
    { contiene: 'vanguard.0.currentDef', motivo: 'el +2 DEF por tener DoT: la vieja lo perdía en cuanto había un recálculo de más; la nueva lo mantiene' },
];

const ANUNCIO_PASIVA = [
    { linea: 'JUSTICIERA ABRASADORA tiene lugar! (+2 de Def)',
      motivo: 'anuncio genérico de PASIVA_CONTINUA; la imperativa solo pintaba flotantes, sin línea de log' },
];

const escenarios = [
    {
        nombre: 'AL-FÉNIX: golpea a 3 de vanguardia y 1 de retaguardia (cupo lleno)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [ZOE_C] },
        p2: {
            vanguardia: [{ carta: 'Oso con armadura', vida: 20 }, { carta: 'Mini-tigre', vida: 20 }, { carta: 'Droide antidisturbios', vida: 20 }],
            retaguardia: [{ carta: 'Guardia', vida: 20 }],
        },
        pasos: [
            { habilidad: 'Zoe (calcinante)' }, { confirmar: true },
            { elegir: ['Oso con armadura'] }, { elegir: ['Mini-tigre'] },
            { elegir: ['Droide antidisturbios'] }, { elegir: ['Guardia'] },
        ],
        logsSoloVieja: [...AVISO_RAW_VIEJA, ...LOG_WOLFGANG],
        // El coste y el anuncio de la Activa: la vieja NO cobraba el Furor (ver COSTE_NO_COBRADO)
        // y no anunciaba la Habilidad; el cierre genérico de ACTIVA hace las dos cosas.
        logsSoloNueva: ANUNCIO_PASIVA,
        flotantesSoloNueva: [
            { linea: '-4 FUR', motivo: 'la vieja comprobaba el Furor pero NUNCA lo descontaba: bug real que la migración corrige' },
            { linea: 'AL-FÉNIX', motivo: 'anuncio genérico de la Activa, que la imperativa no pintaba' },
        ],
        diferenciasEsperadas: [...COSTE_NO_COBRADO, ...DEF_QUE_AHORA_PERSISTE],
    },
    {
        // LA PIEZA NUEVA: pararse antes de llenar el cupo teniendo objetivos de sobra. Es lo que
        // bloqueaba esta migración, y lo que `hastaCantidad` no sabía hacer.
        nombre: 'AL-FÉNIX: parada anticipada — golpea solo a los elegidos y deja al resto',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [ZOE_C] },
        p2: {
            vanguardia: [{ carta: 'Oso con armadura', vida: 20 }, { carta: 'Mini-tigre', vida: 20 }, { carta: 'Droide antidisturbios', vida: 20 }],
            retaguardia: [{ carta: 'Guardia', vida: 20 }],
        },
        pasos: [
            { habilidad: 'Zoe (calcinante)' }, { confirmar: true },
            { elegir: ['Oso con armadura'] },
            { pararEleccion: true },   // quedan 3 objetivos libres y aun así se planta
        ],
        logsSoloVieja: [
            { linea: 'Selección de objetivos terminada anticipadamente.', motivo: 'aviso del botón OK del camino RAW; el del DSL resuelve por VISUAL_SEARCH_CONFIRM, sin línea propia' },
            { linea: '¡Wolfgang ataca (Golpe 1)!', motivo: 'copia-pega de otra carta en la imperativa (ver arriba)' },
        ],
        logsSoloNueva: ANUNCIO_PASIVA,
        flotantesSoloNueva: [
            { linea: '-4 FUR', motivo: 'la vieja nunca cobraba el coste' },
            { linea: 'AL-FÉNIX', motivo: 'anuncio genérico de la Activa' },
        ],
        diferenciasEsperadas: [...COSTE_NO_COBRADO, ...DEF_QUE_AHORA_PERSISTE],
    },
    {
        nombre: 'AL-FÉNIX rechazada: no hay enemigos en vanguardia sin Ocultarse',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [ZOE_C] },
        p2: { retaguardia: ['Guardia'] }, // solo retaguardia: el requisito pide vanguardia
        pasos: [ { habilidad: 'Zoe (calcinante)' } ],
    },
    {
        nombre: 'AL-FÉNIX rechazada: falta Furor',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Zoe (calcinante)', furor: 3 }] },
        p2: { vanguardia: ['Oso con armadura'] },
        pasos: [ { habilidad: 'Zoe (calcinante)' } ],
    },
];

correrSuite('regresion61', escenarios);
