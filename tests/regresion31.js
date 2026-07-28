// tests/regresion31.js — Clarise (PESANTEZ MUTUA) migrada a DSL (28-jul-2026).
//
// Piezas nuevas del intérprete, ambas simétricas a las que estrenó LIDERAZGO:
//   · `vetoAtaqueNormal` en MARCAR_TEMPORAL: la carta marcada no puede hacer ataques
//     NORMALES mientras la marca dure (donde `stats` es un bono continuo, esto es un veto
//     continuo). Compila a un onBeforeAttackTempEffect genérico.
//   · `hastaInicioTurnoLanzador`: la marca caduca al EMPEZAR el turno de quien la puso
//     (marca.ownerId), o sea que cubre exactamente el turno del rival. Distinto de
//     `hastaFinDeTurnoPropio`, que mira al dueño de la carta MARCADA. Compila a un
//     onStartTurnTempEffect genérico.
//   · `tempEffectVetoLog` / `tempEffectExpiraLog` en plantilla: los textos de esos dos
//     hooks. Van en plantilla (no en el op) por la misma razón que el `tempEffectText` del
//     preview: los hooks reciben la MARCA, no el op, y meter strings en la marca los haría
//     viajar en el estado exportado.
//
// El texto de la carta distingue tres casos, y los tres se cubren aquí: ataque normal
// directo (vetado), Habilidad que declara `ataqueNormal` (vetada: "fallarán si involucran
// ataques"), y Habilidad de ataque ESPECIAL (permitida: "sí Habilidades").
//
// Diferencias intencionadas:
//   · El log de "sufre Pesantez Mutua" pasa target.name a {objetivo} con DSL._nombre
//     (formato "de JX (Nick)"), igual que el resto del log tras el cambio de esta sesión.
//   · "está inmovilizado" concuerda ahora con el género de la carta marcada (norma del
//     proyecto); la imperativa decía siempre "inmovilizado".
//   · La marca ya no lleva `type: 'pesantez'` (bookkeeping a medida) sino los flags
//     genéricos, más `duration`/`turnApplied` para que el detalle muestre los turnos
//     restantes — la imperativa no mostraba NADA en "Afectado por:" sobre la Pesantez.

'use strict';
const { correrSuite } = require('./harness');

const LOG_MARCA = {
    de: '¡Mini-tigre sufre Pesantez Mutua! Sus piernas pesan toneladas.',
    a: '¡Mini-tigre [1] de J2 (Jugador 2) sufre Pesantez Mutua! Sus piernas pesan toneladas.',
    motivo: 'la vieja usaba target.name a secas; la nueva rellena {objetivo} con DSL._nombre (formato "de JX")',
};
const DIFS_MARCA = [
    { contiene: 'tempEffects.0.type', motivo: 'la vieja marcaba con `type:"pesantez"` para que sus hooks a mano distinguieran la marca; los hooks genéricos usan los flags declarativos y no lo necesitan' },
    { contiene: 'tempEffects.0.vetoAtaqueNormal', motivo: 'flag nuevo: sustituye al `type` como forma de decir "esta marca veta ataques normales"' },
    { contiene: 'tempEffects.0.hastaInicioTurnoLanzador', motivo: 'flag nuevo: sustituye a la comprobación a mano de `currentTurnPlayerId === effect.ownerId` en el onStartTurnTempEffect imperativo' },
    { contiene: 'tempEffects.0.duration', motivo: 'nuevo: para que "Afectado por:" muestre "(1 turno restante)"; la imperativa no mostraba nada del efecto en el detalle' },
    { contiene: 'tempEffects.0.turnApplied', motivo: 'idem: acompaña a duration, mismo mecanismo que Poción revitalizante/LIDERAZGO' },
];

const escenarios = [
    {
        nombre: 'Clarise: PESANTEZ MUTUA marca a un enemigo de vanguardia',
        p1: { vanguardia: [{ carta: 'Clarise', furor: 1 }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { habilidad: 'Clarise' }, { confirmar: true }, { elegir: ['Mini-tigre'] } ],
        logsIntencionados: [ LOG_MARCA ],
        diferenciasEsperadas: DIFS_MARCA,
    },
    {
        nombre: 'Clarise: PESANTEZ MUTUA también alcanza la retaguardia enemiga',
        p1: { vanguardia: [{ carta: 'Clarise', furor: 1 }] },
        p2: { vanguardia: ['Oso con armadura'], retaguardia: ['Mini-tigre'] },
        pasos: [ { habilidad: 'Clarise' }, { confirmar: true }, { elegir: ['Mini-tigre'] } ],
        logsIntencionados: [ LOG_MARCA ],
        diferenciasEsperadas: DIFS_MARCA,
    },
    {
        nombre: 'Clarise: PESANTEZ MUTUA rechazada sin enemigos en el campo',
        p1: { vanguardia: [{ carta: 'Clarise', furor: 1 }] },
        p2: {},
        pasos: [ { habilidad: 'Clarise' } ],
    },
    {
        // Caso 1 del texto: ataque NORMAL directo desde el tablero -> vetado.
        // Betasteo de Toto (28-jul-2026): el veto sale ahora al CLICAR la carta (§11b), no tras
        // dejarla elegir objetivo y agotarla en balde. Por eso la nueva ni la agota ni le marca
        // hasAttackedThisTurn, y el aviso pasa de log público a logError privado (el mismo trato
        // que el resto de vetos de inicio de ataque del motor).
        nombre: 'El marcado NO puede hacer un ataque normal en el turno del rival',
        p1: { vanguardia: [{ carta: 'Clarise', furor: 1 }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { habilidad: 'Clarise' }, { confirmar: true }, { elegir: ['Mini-tigre'] },
            { finTurno: true }, // p1 -> p2: la marca sigue activa durante TODO el turno de p2
            { atacar: 'Mini-tigre', objetivo: 'Clarise' }, // vetado por la Pesantez
        ],
        logsIntencionados: [ LOG_MARCA ],
        logsSoloVieja: [
            { linea: 'PESANTEZ MUTUA! Mini-tigre',
              motivo: 'la vieja dejaba iniciar el ataque y avisaba por log público justo antes del golpe; la nueva veta al clicar la carta, con logError privado (no comparado), como el resto de vetos de §11b' },
        ],
        diferenciasEsperadas: DIFS_MARCA.concat([
            { contiene: 'estado.p2.vanguard.0.exhausted',
              motivo: 'CORRECCIÓN pedida por Toto: la vieja agotaba la carta pese a no llegar a atacar; la nueva la deja intacta, así que puede hacer otra cosa con ella ese turno' },
            { contiene: 'estado.p2.vanguard.0.hasAttackedThisTurn',
              motivo: 'idem: la vieja la marcaba como "ya atacó" aunque el ataque nunca ocurrió' },
        ]),
    },
    {
        // Caso 2 del texto: Habilidad que SÍ involucra un ataque normal -> también vetada.
        // En la NUEVA el veto corta ya en activateAbility (el gate `abilityUsesAttack` que el
        // compilador pone a las Activas con `ataqueNormal`), así que ni siquiera llega a abrir
        // el modal de confirmación ni a pedir objetivo: de ahí los pasos `soloEn: 'vieja'`.
        nombre: 'El marcado tampoco puede usar una Habilidad de ataque normal (CABREO)',
        p1: { vanguardia: [{ carta: 'Clarise', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Hiposaurio', furor: 3 }] },
        pasos: [
            { habilidad: 'Clarise' }, { confirmar: true }, { elegir: ['Hiposaurio'] },
            { finTurno: true },
            { habilidad: 'Hiposaurio' },
            { soloEn: 'vieja', confirmar: true },
            { soloEn: 'vieja', elegir: ['Clarise'] },
        ],
        logsIntencionados: [
            { de: '¡Hiposaurio sufre Pesantez Mutua! Sus piernas pesan toneladas.',
              a: '¡Hiposaurio [1] de J2 (Jugador 2) sufre Pesantez Mutua! Sus piernas pesan toneladas.',
              motivo: 'cambio de formato de nombre' },
        ],
        // "Objetivos listos" es una línea genérica del motor: sale 2 veces en la vieja (una por
        // el ELEGIR de Clarise, otra al pedir objetivo para CABREO) y 1 en la nueva (solo la de
        // Clarise, porque el gate corta antes). El harness solo sabe filtrar TODAS las
        // ocurrencias de una línea, no "una sola", así que se filtra de ambos lados; lo que de
        // verdad demuestra que la nueva no ejecutó CABREO son los flotantes y el estado de más
        // abajo (Furor sin gastar, acción sin consumir), que sí son inequívocos.
        logsSoloVieja: [
            { linea: 'Objetivos listos', motivo: 'ver comentario: aparece 2x en la vieja, 1x en la nueva' },
            { linea: 'PESANTEZ MUTUA! Hiposaurio',
              motivo: 'idem al escenario anterior: el aviso pasa a logError privado al intentar activar la Habilidad' },
        ],
        logsSoloNueva: [
            { linea: 'Objetivos listos', motivo: 'idem: se filtra también aquí para que la comparación no se desalinee' },
        ],
        flotantesSoloVieja: [
            { linea: '-3 FUR · ft-red-stat', motivo: 'la vieja cobraba el coste de CABREO antes de descubrir que el ataque estaba vetado' },
            { linea: 'CABREO · ft-ability', motivo: 'la vieja llegaba a anunciar la Habilidad; la nueva ni la activa' },
            { linea: '+2 ATQ · ft-green', motivo: 'idem: la vieja aplicaba el bono de CABREO antes del veto' },
        ],
        diferenciasEsperadas: DIFS_MARCA.concat([
            { contiene: 'estado.p2.vanguard.0.hasAttackedThisTurn',
              motivo: 'CORRECCIÓN: la vieja marcaba a Hiposaurio como "ya atacó" pese a que el ataque quedó vetado' },
            { contiene: 'estado.p2.vanguard.0.currentAtk',
              motivo: 'bug de la Hiposaurio VIEJA, ya documentado en regresion28 y corregido por su propia migración: sumaba el bono a mano, llamaba a performAttack (que internamente resetea los stats con updatePassives) y luego restaba el bono otra vez, dejando el Atq por debajo de su base. Aflora aquí porque el ataque queda vetado por la Pesantez a mitad del proceso' },
            { contiene: 'estado.p2.vanguard.0.exhausted',
              motivo: 'CORRECCIÓN: la vieja agotaba a Hiposaurio al vetarle el CABREO; la nueva ni le deja activarlo, así que conserva su acción' },
            { contiene: 'estado.p2.vanguard.0.furor',
              motivo: 'CORRECCIÓN: la vieja le cobraba los 3 de Furor de CABREO antes de descubrir que el ataque estaba vetado; la nueva corta antes de cobrar nada' },
        ]),
    },
    {
        // Caso 3 del texto: Habilidad de ataque ESPECIAL -> permitida ("sí Habilidades").
        nombre: 'El marcado SÍ puede usar una Habilidad de ataque especial (CHIRIBITA)',
        p1: { vanguardia: [{ carta: 'Clarise', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Hechicero', furor: 1 }] },
        pasos: [
            { habilidad: 'Clarise' }, { confirmar: true }, { elegir: ['Hechicero'] },
            { finTurno: true },
            { habilidad: 'Hechicero' }, { confirmar: true }, { elegir: ['Clarise'] },
        ],
        logsIntencionados: [
            { de: '¡Hechicero sufre Pesantez Mutua! Sus piernas pesan toneladas.',
              a: '¡Hechicero [1] de J2 (Jugador 2) sufre Pesantez Mutua! Sus piernas pesan toneladas.',
              motivo: 'cambio de formato de nombre' },
        ],
        diferenciasEsperadas: DIFS_MARCA,
    },
    {
        // Exención de Aniceto (Toto, 28-jul-2026). SAPIENCIA MÁGICA: "No se pueden contrarrestar
        // sus ataques ni su Habilidad activa con Habilidades, ni con cartas de Ayuda o de
        // Evento" — la Pesantez es una Activa enemiga, así que no le alcanza: la marca se le
        // puede poner, pero NO le impide atacar. La vieja sí le bloqueaba el ataque (no miraba
        // `uncounterable` en ninguna parte del veto).
        nombre: 'Aniceto (uncounterable) ignora la Pesantez y ataca con normalidad',
        p1: { vanguardia: [{ carta: 'Clarise', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Aniceto', furor: 0 }] },
        pasos: [
            { habilidad: 'Clarise' }, { confirmar: true }, { elegir: ['Aniceto'] },
            { finTurno: true },
            { atacar: 'Aniceto', objetivo: 'Clarise' }, // la vieja lo veta; la nueva lo deja atacar
        ],
        logsIntencionados: [
            { de: '¡Aniceto sufre Pesantez Mutua! Sus piernas pesan toneladas.',
              a: '¡Aniceto de J2 (Jugador 2) sufre Pesantez Mutua! Sus piernas pesan toneladas.',
              motivo: 'cambio de formato de nombre' },
        ],
        logsSoloVieja: [
            { linea: 'PESANTEZ MUTUA! Aniceto',
              motivo: 'BUG de la vieja: vetaba también a Aniceto, ignorando que su Pasiva dice que no se le puede contrarrestar con Habilidades' },
        ],
        logsSoloNueva: [
            { linea: 'recibe', motivo: 'la nueva le deja atacar de verdad, así que Clarise recibe el golpe' },
        ],
        flotantesSoloNueva: [
            { linea: 'VIDA · ft-red', motivo: 'daño real del ataque que la vieja impedía' },
        ],
        diferenciasEsperadas: DIFS_MARCA.concat([
            { contiene: 'estado.p1.vanguard.0.currentHp',
              motivo: 'CORRECCIÓN: Aniceto sí ataca, así que Clarise pierde Vida; en la vieja el ataque quedaba vetado y no pasaba nada' },
            // `exhausted`/`hasAttackedThisTurn` NO se declaran: acaban igual en ambas bases (la
            // vieja lo agotaba por el veto, la nueva por atacar de verdad). Lo que distingue a
            // una de otra es el daño y el log, ya declarados arriba.
        ]),
    },
    {
        // La marca cubre el turno del rival y se limpia al volver el turno del lanzador.
        nombre: 'La Pesantez caduca al empezar de nuevo el turno de quien la lanzó',
        p1: { vanguardia: [{ carta: 'Clarise', furor: 1 }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { habilidad: 'Clarise' }, { confirmar: true }, { elegir: ['Mini-tigre'] },
            { finTurno: true }, // p1 -> p2 (marca activa)
            { finTurno: true }, // p2 -> p1: al empezar el turno de p1 (el lanzador), caduca
        ],
        logsIntencionados: [
            LOG_MARCA,
            { de: 'La Pesantez Mutua sobre Mini-tigre desaparece.',
              a: 'La Pesantez Mutua sobre Mini-tigre [1] de J2 (Jugador 2) desaparece.',
              motivo: 'cambio de formato de nombre en el log de expiración' },
        ],
    },
];

correrSuite('regresion31', escenarios);
