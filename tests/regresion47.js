// tests/regresion47.js — Achmay migrada al DSL (31-jul-2026): YOLOLO + PÉGAME, PERRA.
//
// YOLOLO reutiliza TRAS_DEFENDER (Imp mayor, regresion46) con la extensión `soloAtaqueNormal`:
// a diferencia de ANTES_DE_ATACAR/TRAS_ATACAR (que infieren "normal" de abilityContext, sin
// isSpecial real), onAfterDefend YA recibe el isSpecial genuino de dealDamage, así que el
// filtro es directo, sin heurística.
//
// PÉGAME, PERRA estrena dos piezas:
//   · `sinAgotar` en ACTIVA — el cierre genérico de cualquier Activa agota SIEMPRE la carta
//     salvo que se pida lo contrario; el texto dice explícitamente "no gasta la acción".
//   · `provocaAtaque` en MARCAR_TEMPORAL — dispara al empezar el turno de LA CARTA MARCADA
//     (no del lanzador, a diferencia de hastaInicioTurnoLanzador), dejando `forcedAttackTarget`
//     -campo YA genérico del motor, leído en la fase "ATAQUES FORZADOS" de inicio de turno-
//     apuntando a `sourceInstanceId`. Se autoconsume (una vez).
//
// De paso, un bug real de MODIFICAR_STAT encontrado y corregido: su `e.log` ignoraba
// `e.logTipo` por completo (hardcodeado a 'ability'), a diferencia de CURAR/APLICAR_ESTADO/DAÑO,
// que sí lo respetan — el log de YOLOLO salía como [ability] en vez de [combat]. Corregido en
// la raíz (mismo canal que usan los demás ops), retrocompatible: ninguna carta migrada hasta
// ahora declaraba logTipo en un MODIFICAR_STAT (el campo se ignoraba en silencio), así que el
// valor por defecto ('ability') no cambia para nadie más.
//
// Se queda imperativo: `canAttackNormally: () => false` (una línea, no compensa arquitectura).

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'YOLOLO: ataque normal contra Achmay se pincha con la barrera (daño verdadero al atacante)',
        flotantesIntencionados: [
            { de: '-1 VIDA ·', a: '-1 VIDA (Achmay) ·',
              motivo: 'el flotante automatico nombra ahora la carta origen cuando el cambio lo causa OTRA carta (Toto, 5-ago-2026): un "-N" suelto no decia de donde salia. No afecta al dano de combate (dealDamage no pasa fuente) ni al coste de tu propia Habilidad' },
        ],
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Mini-tigre', vida: 10 }] },
        p2: { vanguardia: [{ carta: 'Achmay', vida: 8 }] },
        pasos: [ { atacar: 'Mini-tigre', objetivo: 'Achmay' } ],
        logsIntencionados: [
            { de: '¡YOLOLO! Mini-tigre se pincha con la barrera de Achmay.',
              a: '¡YOLOLO! Mini-tigre [1] de J1 (Jugador 1) se pincha con la barrera de Achmay.',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba attacker.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
        // Betasteo de Toto (31-jul-2026): la vieja pintaba "-1 VIDA (Espinas)" a mano ADEMÁS
        // del "-1 VIDA" automático de modifyStat -dos flotantes seguidos por el mismo golpe-.
        // La nueva se queda solo con el automático (sin `floating` en el MODIFICAR_STAT).
        flotantesSoloVieja: [
            { linea: '-1 VIDA (Espinas)', motivo: 'flotante manual redundante con el automático de modifyStat, quitado a petición de Toto' },
        ],
    },
    {
        // Ataque ESPECIAL contra Achmay: YOLOLO NO debe dispararse (soloAtaqueNormal).
        nombre: 'YOLOLO no se dispara tras un ataque ESPECIAL (CHIRIBITA de Hechicero)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Hechicero', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Achmay', vida: 8 }] },
        pasos: [ { habilidad: 'Hechicero' }, { confirmar: true }, { elegir: ['Achmay'] } ],
    },
    {
        nombre: 'PÉGAME, PERRA: provoca a un enemigo sin gastar la acción de Achmay',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Achmay', furor: 2 }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { habilidad: 'Achmay' }, { confirmar: true }, { elegir: ['Mini-tigre'] } ],
        // Sin logsSoloVieja: a diferencia de Garret/Raiju/Guardia (que usan ELEGIR), PÉGAME
        // PERRA declara `target:{quien,cantidad}` -el camino RAW de abilityContext.targets-,
        // el MISMO mecanismo que la vieja usaba a mano. El aviso "Objetivos listos..." lo
        // emite el motor COMPARTIDO (handleAbilityTargetSelection) en AMBAS bases por igual;
        // no es una diferencia de la migración.
        logsIntencionados: [
            { de: '¡Achmay insulta a Mini-tigre! ¡Deberá atacarle en su próximo turno!',
              a: '¡Achmay insulta a Mini-tigre [1] de J2 (Jugador 2)! ¡Deberá atacarle en su próximo turno!',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
        diferenciasEsperadas: [
            { contiene: 'tempEffects.0.achmayId',
              motivo: 'la vieja guarda un campo propio (achmayId) en la marca; MARCAR_TEMPORAL usa el genérico sourceInstanceId (que YA guarda lo mismo, el instanceId de Achmay) — el mecanismo de bookkeeping cambia de nombre, el efecto observable no' },
            { contiene: 'tempEffects.0.provocaAtaque',
              motivo: 'flag propio del compilador declarativo para que onStartTurnTempEffect sepa que esta marca concreta provoca un ataque; la vieja no necesita marcarlo porque su onStartTurnTempEffect está escrito a mano solo para Achmay' },
        ],
    },
    {
        // Flujo completo: activar + pasar turno -> el motor ejecuta el ataque forzado por su
        // cuenta (mecanismo YA genérico, "ATAQUES FORZADOS" en index.html) y ESE ataque
        // también dispara YOLOLO -Achmay se pincha dos veces, la provocación y su propia
        // Pasiva son mecanismos independientes que coinciden en el mismo golpe-.
        nombre: 'PÉGAME, PERRA: al pasar turno, el motor ejecuta el ataque forzado (y dispara YOLOLO)',
        flotantesIntencionados: [
            { de: '-1 VIDA ·', a: '-1 VIDA (Achmay) ·',
              motivo: 'el flotante automatico nombra ahora la carta origen cuando el cambio lo causa OTRA carta (Toto, 5-ago-2026): un "-N" suelto no decia de donde salia. No afecta al dano de combate (dealDamage no pasa fuente) ni al coste de tu propia Habilidad' },
        ],
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Achmay', furor: 2, vida: 8 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 20 }] },
        pasos: [
            { habilidad: 'Achmay' }, { confirmar: true }, { elegir: ['Mini-tigre'] },
            { finTurno: true },
        ],
        logsIntencionados: [
            { de: '¡Achmay insulta a Mini-tigre! ¡Deberá atacarle en su próximo turno!',
              a: '¡Achmay insulta a Mini-tigre [1] de J2 (Jugador 2)! ¡Deberá atacarle en su próximo turno!',
              motivo: 'ver escenario anterior' },
            { de: '¡YOLOLO! Mini-tigre se pincha con la barrera de Achmay.',
              a: '¡YOLOLO! Mini-tigre [1] de J2 (Jugador 2) se pincha con la barrera de Achmay.',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño)' },
        ],
        flotantesSoloVieja: [
            { linea: '-1 VIDA (Espinas)', motivo: 'ver primer escenario' },
        ],
    },
    {
        nombre: 'PÉGAME, PERRA rechazada: no hay enemigos en el campo',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Achmay', furor: 2 }] },
        p2: {},
        pasos: [ { habilidad: 'Achmay' } ],
    },
];

correrSuite('regresion47', escenarios);
