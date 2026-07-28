// tests/regresion29.js — Tanda de volumen #2 (28-jul-2026, Sonnet): Lolita, Hawke, Eris y
// Capitán Guardia Real migrados a DSL sobre el op ATACAR ya ampliado en la tanda anterior,
// más una pieza nueva en MARCAR_TEMPORAL.
//
// Piezas nuevas del intérprete en esta tanda:
//   · `ignorarDefensa: true` en ATACAR especial (Eris, TIRO FINAL): daño = Atq puro, sin
//     restar Def. El suelo 0.5/1 sigue aplicando si el Atq es <= 0.
//   · `chequearEstado: true` en ATACAR especial (Eris): comprueba Confusión/Ceguera/Sueño
//     propios (game.checkAttackStatus) antes de golpear — opt-in porque Hechicero/Lolita
//     nunca lo comprobaban en la vieja y no se les quiere cambiar el comportamiento.
//   · `stats` en MARCAR_TEMPORAL (Capitán Guardia Real, LIDERAZGO): bono continuo de
//     Atq/Def mientras la marca dure, sin onUpdateTempEffect escrito a mano.
//
// Diferencias intencionadas:
//   · Lolita (NOCIONES DE OCULTISMO): mismo bug corregido que Hechicero — la vieja no
//     comprobaba onBeforeDefend antes de golpear.
//   · Hawke (PUÑO DE NEUTRONES): mismo bug de Hiposaurio — performAttack ya resetea
//     currentAtk vía su propio updatePassives interno, así que el "card.currentAtk -= 2"
//     a mano tras el ataque lo resta DOS VECES. La nueva usa updatePassives() (recompute
//     completo) y siempre acaba en la base correcta.
//   · Eris (TIRO FINAL): el log de activación pasa a nombrar a Eris a secas (sin dueño),
//     mismo criterio que el resto de auto-referencias de ACTIVA en el DSL (el jugador ya
//     sabe qué carta activó; el dueño importa para nombrar a quien RECIBE el efecto).
//   · Capitán Guardia Real (LIDERAZGO): el log de "X motiva a Y" pasa Y a DSL._nombre
//     (formato "de JX (Nick)"); antes era target.name a secas.

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'Lolita: NOCIONES DE OCULTISMO (ataque especial + 2 Atq)',
        p1: { vanguardia: [{ carta: 'Lolita', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Robot de seguridad SP', vida: 4 }] },
        pasos: [ { habilidad: 'Lolita' }, { confirmar: true }, { elegir: ['Robot de seguridad SP'] } ],
    },
    {
        // Betasteo de Toto (28-jul-2026): Águila solo esquiva "ante ataques normales"; los
        // especiales nunca debieron poder esquivarse. onBeforeDefend ahora recibe `isSpecial`
        // y Águila declina en silencio cuando es true (ver Hechicero en regresion28 para el
        // detalle completo). La vieja tampoco llega nunca a llamar a onBeforeDefend en su
        // ataque especial (el primer bug, ya documentado en el escenario anterior de esta
        // suite) — el resultado neto es idéntico en ambas bases.
        nombre: 'Lolita: NOCIONES DE OCULTISMO contra Águila — nunca esquiva un ataque especial',
        p1: { vanguardia: [{ carta: 'Lolita', furor: 1 }] },
        p2: { vanguardia: ['Águila'] },
        pasos: [ { habilidad: 'Lolita' }, { confirmar: true }, { elegir: ['Águila'] } ],
    },
    {
        // BUG de la vieja encontrado y corregido, no replicado (mismo que Hiposaurio en la
        // tanda anterior): performAttack ya resetea currentAtk internamente, así que el
        // "-= 2" a mano tras el ataque lo resta dos veces.
        nombre: 'Hawke: PUÑO DE NEUTRONES (ataque normal + 2 Atq)',
        p1: { vanguardia: [{ carta: 'Hawke', furor: 1 }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { habilidad: 'Hawke' }, { confirmar: true }, { elegir: ['Mini-tigre'] } ],
        diferenciasEsperadas: [
            { contiene: 'estado.p1.vanguard.0.currentAtk',
              motivo: 'bug de la vieja (resta el bono dos veces tras el ataque, igual que Hiposaurio en la tanda anterior); la nueva devuelve correctamente el Atq a su base' },
        ],
        flotantesSoloVieja: [
            { linea: '-2 ATQ · ft-red-stat', motivo: 'la vieja mostraba un tercer flotante al revertir el bono a mano; el genérico de ATACAR no lo emite (mismo criterio que Hiposaurio/CABREO)' },
        ],
    },
    {
        nombre: 'Eris: TIRO FINAL ignora la Def del objetivo',
        p1: { vanguardia: [{ carta: 'Eris', furor: 2 }] },
        p2: { vanguardia: [{ carta: 'Oso con armadura', vida: 3 }] }, // Def 5: un ataque normal no le haría nada
        pasos: [ { habilidad: 'Eris' }, { confirmar: true }, { elegir: ['Oso con armadura'] } ],
        logsIntencionados: [
            { de: '¡Eris de J1 (Jugador 1) usa TIRO FINAL! (Ignora Defensa)',
              a: '¡Eris usa TIRO FINAL! (Ignora Defensa)',
              motivo: 'el log de activación de ACTIVA nombra a la propia carta a secas (sin dueño), mismo criterio que el resto de auto-referencias del DSL (Hawke, etc.)' },
        ],
    },
    {
        // chequearEstado: Eris confundida no debe poder atacar sin lanzar antes la moneda de
        // Confusión (mismo gate que performAttack usa para el ataque normal).
        nombre: 'Eris: TIRO FINAL con Confusión propia, pierde el ataque por checkAttackStatus',
        p1: { vanguardia: [{ carta: 'Eris', furor: 2, estado: { confusion: { duration: 2 } } }] },
        p2: { vanguardia: ['Oso con armadura'] },
        pasos: [ { habilidad: 'Eris' }, { confirmar: true }, { elegir: ['Oso con armadura'] } ],
        monedas: ['cruz'], // Confusión, cruz = se ataca a sí misma
        logsIntencionados: [
            { de: '¡Eris de J1 (Jugador 1) usa TIRO FINAL! (Ignora Defensa)',
              a: '¡Eris usa TIRO FINAL! (Ignora Defensa)',
              motivo: 'idem: log de activación sin dueño' },
        ],
    },
    {
        nombre: 'Capitán Guardia Real: LIDERAZGO da +2 Atq hasta el final del turno',
        p1: { vanguardia: [{ carta: 'Capitán Guardia Real', furor: 1 }, 'Mini-tigre'] },
        p2: { vanguardia: ['Robot de seguridad SP'] },
        pasos: [ { habilidad: 'Capitán Guardia Real' }, { confirmar: true }, { elegir: ['Mini-tigre'] } ],
        logsIntencionados: [
            { de: 'Capitán Guardia Real motiva profundamente a Mini-tigre. (+2 ATQ temporal)',
              a: 'Capitán Guardia Real motiva profundamente a Mini-tigre [1] de J1 (Jugador 1). (+2 ATQ temporal)',
              motivo: 'la vieja usaba target.name a secas; la nueva rellena {objetivo} con DSL._nombre (formato "de JX")' },
        ],
        diferenciasEsperadas: [
            { contiene: 'tempEffects.0.type', motivo: 'bookkeeping interno: la vieja discriminaba el tempEffect con `type:"liderazgo"` (por si el mismo hook servía a más de un efecto); el genérico `stats` de MARCAR_TEMPORAL no lo necesita' },
            { contiene: 'tempEffects.0.stats', motivo: 'idem: representación nueva del mismo bono (+2 Atq), vía el campo genérico `stats` en vez de un type a medida' },
            { contiene: 'tempEffects.0.duration', motivo: 'nuevo (28-jul-2026, betasteo de Toto): `duracion:1` estampa duration/turnApplied SOLO para que "Afectado por:" muestre "(1 turno restante)" — nada lo decrementa, la expiración real la sigue gobernando hastaFinDeTurnoPropio' },
            { contiene: 'tempEffects.0.turnApplied', motivo: 'idem: acompaña a duration, mismo mecanismo ya usado por Poción revitalizante' },
        ],
    },
    {
        nombre: 'Capitán Guardia Real: LIDERAZGO expira al final del turno propio, con aviso',
        p1: { vanguardia: [{ carta: 'Capitán Guardia Real', furor: 1 }, 'Mini-tigre'] },
        p2: { vanguardia: ['Robot de seguridad SP'] },
        pasos: [
            { habilidad: 'Capitán Guardia Real' }, { confirmar: true }, { elegir: ['Mini-tigre'] },
            { finTurno: true }, // p1 -> p2: el Liderazgo (hastaFinDeTurnoPropio) caduca aquí mismo
        ],
        logsIntencionados: [
            { de: 'Capitán Guardia Real motiva profundamente a Mini-tigre. (+2 ATQ temporal)',
              a: 'Capitán Guardia Real motiva profundamente a Mini-tigre [1] de J1 (Jugador 1). (+2 ATQ temporal)',
              motivo: 'idem: cambio de formato de nombre' },
            { de: 'El Liderazgo sobre Mini-tigre expira.',
              a: 'El Liderazgo sobre Mini-tigre [1] de J1 (Jugador 1) expira.',
              motivo: 'idem: cambio de formato de nombre en el log de expiración' },
        ],
    },
    {
        nombre: 'Capitán Guardia Real: LIDERAZGO rechazado si el único aliado en vanguardia ya atacó',
        p1: { vanguardia: [{ carta: 'Capitán Guardia Real', furor: 1 }, { carta: 'Mini-tigre', agotada: true, campos: { hasAttackedThisTurn: true } }] },
        p2: { vanguardia: ['Robot de seguridad SP'] },
        pasos: [ { habilidad: 'Capitán Guardia Real' }, { confirmar: true } ],
    },
];

correrSuite('regresion29', escenarios);
