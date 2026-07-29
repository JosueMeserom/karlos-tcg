// tests/regresion37.js — Raiju (FOSFORESCENCIA) migrada al DSL (30-jul-2026).
//
// Mismo esqueleto que Gólem de tierra/SEÍSMO (regresion33): ELEGIR de cantidad
// EXACTA 2 + ATACAR anidado — pero con especial:true (no especial ausente) y con
// APLICAR_ESTADO (Ceguera 2 turnos) en siExito. A diferencia de SEÍSMO, la vieja
// Raiju NO excluye Ocultos en ningún sitio (ni canActivateAbility ni
// onValidateTarget), así que la migración tampoco lo hace — fidelidad, no
// generalización del patrón de Gólem de tierra. El tributo de colocación
// (DSL.tributoFuror) se queda imperativo, mismo criterio que Ángel/Domador: no
// hay op DSL para "elige pagador genérico" y no compensa para una sola carta.
//
// Diferencias intencionadas, mismo patrón que Gólem de tierra: los dos avisos de
// sistema del camino RAW de selección de objetivos (regresion33) no tienen
// equivalente en el ELEGIR de la nueva; y el log "¡Raiju desata..." se dispara en
// un punto distinto del flujo (activa.log corre ANTES del ELEGIR, la vieja lo
// registraba en onTargetsReady, DESPUÉS de completar la elección) — el efecto
// neto en logHistory es el mismo una vez fuera los dos avisos de sistema.

'use strict';
const { correrSuite } = require('./harness');

const LOGS_SISTEMA_VIEJA = [
    { linea: 'Objetivo 1 fijado. Elige al siguiente objetivo.',
      motivo: 'aviso genérico de handleAbilityTargetSelection (mecanismo abilityContext.targets de la vieja); la nueva resuelve los 2 objetivos con ELEGIR/pickBoardTargets, que no pasa por ahí' },
    { linea: 'Objetivos listos. ¡Ejecutando habilidad!',
      motivo: 'mismo mecanismo que la anterior: aviso genérico al completar el cupo de objetivos' },
];

const escenarios = [
    {
        nombre: 'FOSFORESCENCIA: 2 ataques especiales a enemigos distintos, ciega a los que sobreviven',
        p1: { vanguardia: [{ carta: 'Raiju', furor: 1 }] },
        p2: { vanguardia: ['Mini-tigre', 'Robot de seguridad SP'] },
        pasos: [
            { habilidad: 'Raiju' },
            { confirmar: true },
            { elegir: ['Mini-tigre', 'Robot de seguridad SP'] },
        ],
        logsSoloVieja: LOGS_SISTEMA_VIEJA,
        logsIntencionados: [
            { de: 'El fogonazo ciega a Mini-tigre.', a: 'El fogonazo ciega a Mini-tigre [1] de J2 (Jugador 2).',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
        diferenciasEsperadas: [
            { contiene: 'status.ceguera.source',
              motivo: 'la vieja llamaba a applyStatus con el NOMBRE de la carta (source: "Raiju"); APLICAR_ESTADO deja la carta fuente completa (sourceInstanceId) y la Habilidad (sourceAbility), mismo criterio ya aplicado en Limo artificial/Investigador demente (regresion32)' },
        ],
    },
    {
        nombre: 'FOSFORESCENCIA rechazada: solo hay un enemigo en vanguardia',
        p1: { vanguardia: [{ carta: 'Raiju', furor: 1 }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { habilidad: 'Raiju' } ],
    },
    {
        // La vieja NO excluye Ocultos (a diferencia de SEÍSMO): con 2 enemigos, uno
        // Oculto, debe poder elegirlo igualmente como uno de los dos objetivos.
        nombre: 'FOSFORESCENCIA sí puede elegir a un enemigo Oculto (fiel a la vieja)',
        p1: { vanguardia: [{ carta: 'Raiju', furor: 1 }] },
        p2: { vanguardia: ['Mini-tigre', { carta: 'Robot de seguridad SP', campos: { stealth: true } }] },
        pasos: [
            { habilidad: 'Raiju' },
            { confirmar: true },
            { elegir: ['Mini-tigre', 'Robot de seguridad SP'] },
        ],
        logsSoloVieja: LOGS_SISTEMA_VIEJA,
        logsIntencionados: [
            { de: 'El fogonazo ciega a Mini-tigre.', a: 'El fogonazo ciega a Mini-tigre [1] de J2 (Jugador 2).',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
        diferenciasEsperadas: [
            { contiene: 'status.ceguera.source',
              motivo: 'la vieja llamaba a applyStatus con el NOMBRE de la carta (source: "Raiju"); APLICAR_ESTADO deja la carta fuente completa (sourceInstanceId) y la Habilidad (sourceAbility), mismo criterio ya aplicado en Limo artificial/Investigador demente (regresion32)' },
        ],
    },
    {
        // Un objetivo letal no debe ser cegado (el op ATACAR ya lo garantiza vía
        // siExito: target.currentHp < startHp && target.currentHp > 0).
        nombre: 'FOSFORESCENCIA: un golpe letal no aplica Ceguera a ese objetivo (el otro sí)',
        p1: { vanguardia: [{ carta: 'Raiju', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 1 }, { carta: 'Robot de seguridad SP', vida: 10 }] },
        pasos: [
            { habilidad: 'Raiju' },
            { confirmar: true },
            { elegir: ['Mini-tigre', 'Robot de seguridad SP'] },
        ],
        logsSoloVieja: LOGS_SISTEMA_VIEJA,
        logsIntencionados: [
            { de: 'El fogonazo ciega a Robot de seguridad SP.', a: 'El fogonazo ciega a Robot de seguridad SP [1] de J2 (Jugador 2).',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
        diferenciasEsperadas: [
            { contiene: 'status.ceguera.source',
              motivo: 'la vieja llamaba a applyStatus con el NOMBRE de la carta (source: "Raiju"); APLICAR_ESTADO deja la carta fuente completa (sourceInstanceId) y la Habilidad (sourceAbility), mismo criterio ya aplicado en Limo artificial/Investigador demente (regresion32)' },
        ],
    },
];

correrSuite('regresion37', escenarios);
