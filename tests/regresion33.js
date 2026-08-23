// tests/regresion33.js — Gólem de tierra (SEÍSMO): ataque normal a dos enemigos
// distintos elegidos en tablero. Migración vía ELEGIR (cantidad exacta 2, sin
// hastaCantidad) + ATACAR sin `especial` (performAttack íntegro, igual que la
// vieja).
//
// Nota (31-jul-2026): Ángel (SANCIÓN) se migró después, en regresion49.js — la
// decisión de dejarla imperativa (mencionada más abajo en su momento) resultó
// estar basada en una premisa equivocada (que la carta necesitaba parar en 1
// objetivo); ver el comentario junto a SANCIÓN en cartas.js.
//
// Diferencias intencionadas, ambas por el CAMBIO DE MECANISMO de selección (no por
// nada del efecto en sí): la vieja usa el abilityContext.targets genérico
// (target.cantidad), que handleAbilityTargetSelection (index.html) anuncia con dos
// logs de sistema fijos; la nueva usa ELEGIR (pickBoardTargets/dslPick), que no
// pasa por ahí. Efecto colateral en el escenario de cancelación: la vieja paga el
// Furor de SEÍSMO en onTargetsReady, DESPUÉS de completar la elección; la nueva
// (como toda Activa del compilador genérico) lo paga ANTES de correr sus efectos,
// incluido el ELEGIR — mismo patrón ya aceptado en ACERTIJO y el 2º ELEGIR de PEM
// (regresion17): el ELEGIR post-coste se marca `cancelable: false` y cancelar se
// ignora (con su propio aviso de sistema, ausente en la vieja). No cambia el
// estado final de ningún escenario (el Furor gastado es el mismo si la elección
// se completa).

'use strict';
const { correrSuite } = require('./harness');

const LOGS_SISTEMA_VIEJA = [
    { linea: 'Elige al primer objetivo del Seísmo.',
      motivo: 'la vieja logueaba el prompt de selección con logMsg (tipo system, entra en logHistory); la nueva usa el título del ELEGIR, que pickBoardTargets muestra vía logError (privado, skipHistory) y no entra en el historial comparado' },
];

const escenarios = [
    {
        nombre: 'SEÍSMO: ataque normal a dos enemigos distintos elegidos en tablero',
        p1: { vanguardia: [{ carta: 'Gólem de tierra', furor: 1 }] },
        p2: { vanguardia: ['Mini-tigre', 'Robot de seguridad SP'] },
        pasos: [
            { habilidad: 'Gólem de tierra' },
            { confirmar: true },
            { elegir: ['Mini-tigre', 'Robot de seguridad SP'] },
        ],
        logsSoloVieja: LOGS_SISTEMA_VIEJA,
    },
    {
        nombre: 'SEÍSMO rechazado: un enemigo Provocando exige objetivo único',
        p1: { vanguardia: [{ carta: 'Gólem de tierra', furor: 1 }] },
        p2: { vanguardia: ['Achmay', 'Mini-tigre'] },
        pasos: [ { habilidad: 'Gólem de tierra' } ],
    },
    {
        nombre: 'SEÍSMO rechazado: solo hay un enemigo válido en vanguardia',
        p1: { vanguardia: [{ carta: 'Gólem de tierra', furor: 1 }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { habilidad: 'Gólem de tierra' } ],
    },
    {
        nombre: 'SEÍSMO ignora al enemigo Oculto: ni cuenta ni es seleccionable',
        p1: { vanguardia: [{ carta: 'Gólem de tierra', furor: 1 }] },
        p2: { vanguardia: ['Mini-tigre', 'Robot de seguridad SP', { carta: 'Oso con armadura', campos: { stealth: true } }] },
        pasos: [
            { habilidad: 'Gólem de tierra' },
            { confirmar: true },
            { elegir: ['Mini-tigre', 'Robot de seguridad SP'] },
        ],
        logsSoloVieja: LOGS_SISTEMA_VIEJA,
    },
    {
        // CAMBIO DE COMPORTAMIENTO DELIBERADO (Toto, 20-ago-2026). Antes SEÍSMO llevaba
        // `cancelable: false`, que apagaba la norma del coste: cobraba el Furor al confirmar la
        // Habilidad y a partir de ahí ya no se podía uno arrepentir — este escenario fijaba justo
        // eso, que el intento de cancelar se ignoraba. Toto ha decidido que manda la norma:
        // "siempre que tengas que hacer otra cosa antes de que el tablero ya cambie, entonces es
        // cancelable". Ahora cancelar FUNCIONA y no pasa nada: ni Furor, ni agotarse, ni daño.
        // La vieja no puede hacer esto (su SEÍSMO no pasa por ELEGIR), así que la divergencia es
        // total y se declara entera.
        nombre: 'SEÍSMO: cancelar tras confirmar ya NO cuesta nada (la vieja lo ignoraba)',
        p1: { vanguardia: [{ carta: 'Gólem de tierra', furor: 1 }] },
        p2: { vanguardia: ['Mini-tigre', 'Robot de seguridad SP'] },
        pasos: [
            { habilidad: 'Gólem de tierra' },
            { confirmar: true },
            { soloEn: 'nueva', cancelar: true },
            { soloEn: 'vieja', elegir: ['Mini-tigre', 'Robot de seguridad SP'] },
        ],
        // La vieja hace la Habilidad ENTERA (cobra, anuncia y golpea) porque para ella cancelar
        // no existe; la nueva no hace nada de eso. Se declara todo lo que la vieja emite de más.
        logsSoloVieja: LOGS_SISTEMA_VIEJA.concat([
            { linea: 'Mini-tigre [1] de J2 (Jugador 2) recibe 1 daño (3 Vida -> 2).',
              motivo: 'la vieja no puede cancelar y golpea igualmente; la nueva cancela y no ataca a nadie' },
            { linea: 'Robot de seguridad SP [1] de J2 (Jugador 2) recibe 1 daño (4 Vida -> 3).',
              motivo: 'ídem con el segundo objetivo' },
        ]),
        flotantesSoloVieja: [
            { linea: '-1 FUR', motivo: 'la nueva cancela ANTES de cobrar: ese es justo el arreglo' },
            { linea: 'SEÍSMO', motivo: 'el anuncio de la Activa viaja pegado al cobro, así que tampoco sale' },
            { linea: '-1 VIDA', motivo: 'cancelado: nadie recibe el golpe (dos flotantes, uno por objetivo)' },
        ],
        diferenciasEsperadas: [
            { contiene: 'p1.vanguard.0.furor', motivo: 'la nueva cancela y NO cobra el Furor; la vieja lo había cobrado al confirmar' },
            { contiene: 'p1.vanguard.0.exhausted', motivo: 'cancelar no gasta la acción; la vieja ya la había gastado' },
            { contiene: 'p1.vanguard.0.hasAttackedThisTurn', motivo: 'ídem: en la nueva no llega a atacar nadie' },
            { contiene: 'p2.vanguard.0.currentHp', motivo: 'cancelado: el enemigo no recibe el golpe' },
            { contiene: 'p2.vanguard.1.currentHp', motivo: 'cancelado: el segundo enemigo tampoco' },
        ],
    },
];

correrSuite('regresion33', escenarios);
