// tests/regresion18.js — Tanda 2 de la migración al DSL: las 5 cartas de
// REACCIÓN desde la mano, ahora declarativas con el trigger REACCION nuevo.
//
//   · Cortarrollos, Inspiración, Pequeña traición, Jugada arriesgada
//     (sobre: 'ATAQUE' -> onHandReactionToAttack)
//   · Escudo mágico (sobre: 'DAÑO' -> onHandReactionToDamage)
//
// El motor de combate (index.html, compartido por ambas bases) ya recorría la
// mano del defensor llamando a esos dos hooks; la migración solo cambia QUIÉN
// los produce (el compilador del DSL en vez de código a mano en cada carta). El
// contrato de retorno es idéntico ({used, newDefender?, drainFurorAfter?,
// cancelAttack?} y {used, newDmg}), así que no se tocó ningún call-site.
//
// Diferencias intencionadas (documentadas): los logs de estas cartas pasan a
// 3ª persona con el nombre completo del jugador/carta (norma del proyecto) y,
// en Jugada arriesgada, el aviso de CRUZ pasa de logError privado (fuera del
// historial) a log de combate compartido, coherente con el de CARA.

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'Cortarrollos: reacciona SÍ y vacía todo el Furor del atacante; el ataque procede igual',
        p1: { vanguardia: [{ carta: 'Robot de seguridad SP', furor: 3 }] },
        p2: { vanguardia: ['Mini-tigre'], mano: ['Cortarrollos'] },
        pasos: [
            { atacar: 'Robot de seguridad SP', objetivo: 'Mini-tigre' },
            { opcion: 0 }, // SÍ, reaccionar
        ],
        logsIntencionados: [
            { de: 'anula la inercia de Robot de seguridad SP! Pierde',
              a: 'anula la inercia de Robot de seguridad SP [1] de J1 (Jugador 1)! Pierde',
              motivo: 'norma del proyecto (3ª persona con dueño): la vieja usaba attacker.name a secas; la nueva rellena {atacante} con DSL._nombre (nombre + copyId + dueño)' },
        ],
    },
    {
        nombre: 'Cortarrollos: reacciona NO; el ataque procede y la carta se queda en la mano',
        p1: { vanguardia: [{ carta: 'Robot de seguridad SP', furor: 3 }] },
        p2: { vanguardia: ['Mini-tigre'], mano: ['Cortarrollos'] },
        pasos: [
            { atacar: 'Robot de seguridad SP', objetivo: 'Mini-tigre' },
            { opcion: 1 }, // NO REACCIONAR
        ],
        logsIntencionados: [],
    },
    {
        nombre: 'Pequeña traición: reacciona SÍ y redirige el ataque a otro aliado',
        p1: { vanguardia: [{ carta: 'Robot de seguridad SP', furor: 1 }] },
        p2: { vanguardia: ['Mini-tigre', 'Droide antidisturbios'], mano: ['Pequeña traición'] },
        pasos: [
            { atacar: 'Robot de seguridad SP', objetivo: 'Mini-tigre' },
            { opcion: 0 },
            { elegir: ['Droide antidisturbios'] }, // vieja: modal visual; nueva: reborde verde en tablero
        ],
        logsIntencionados: [
            { de: 'redirigido vilmente hacia Droide antidisturbios.',
              a: 'redirigido vilmente hacia Droide antidisturbios [1] de J2 (Jugador 2).',
              motivo: 'norma del proyecto (3ª persona con dueño): la vieja usaba chosen.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
    },
    {
        nombre: 'Pequeña traición: cancela la elección de víctima; la carta NO se consume y el ataque va al original',
        p1: { vanguardia: [{ carta: 'Robot de seguridad SP', furor: 1 }] },
        p2: { vanguardia: ['Mini-tigre', 'Droide antidisturbios'], mano: ['Pequeña traición'] },
        pasos: [
            { atacar: 'Robot de seguridad SP', objetivo: 'Mini-tigre' },
            { opcion: 0 },
            { cancelar: true }, // se echa atrás en la elección de nueva víctima
        ],
        logsIntencionados: [],
    },
    {
        nombre: 'Jugada arriesgada: CARA — el atacante se ataca a sí mismo y el ataque se cancela',
        monedas: ['cara'],
        p1: { vanguardia: [{ carta: 'Robot de seguridad SP', furor: 0 }] },
        p2: { vanguardia: ['Mini-tigre'], mano: ['Jugada arriesgada'] },
        pasos: [
            { atacar: 'Robot de seguridad SP', objetivo: 'Mini-tigre' },
            { opcion: 0 },
        ],
        logsIntencionados: [
            { de: '¡JUGADOR 2 opta por una Jugada arriesgada!', a: '¡J2 (Jugador 2) opta por una Jugada arriesgada!',
              motivo: 'norma del proyecto (3ª persona): la vieja hardcodeaba "JUGADOR 2"; la nueva rellena {reactor} con getDisplayName' },
            { de: 'ataque de Robot de seguridad SP rebota', a: 'ataque de Robot de seguridad SP [1] de J1 (Jugador 1) rebota',
              motivo: 'norma del proyecto (3ª persona con dueño): la vieja usaba attacker.name a secas; la nueva rellena {atacante} con DSL._nombre' },
        ],
    },
    {
        nombre: 'Jugada arriesgada: CRUZ — el ataque procede y el atacante pierde 1 Furor después',
        monedas: ['cruz'],
        p1: { vanguardia: [{ carta: 'Robot de seguridad SP', furor: 2 }] },
        p2: { vanguardia: ['Mini-tigre'], mano: ['Jugada arriesgada'] },
        pasos: [
            { atacar: 'Robot de seguridad SP', objetivo: 'Mini-tigre' },
            { opcion: 0 },
        ],
        logsIntencionados: [
            { de: '¡JUGADOR 2 opta por una Jugada arriesgada!', a: '¡J2 (Jugador 2) opta por una Jugada arriesgada!',
              motivo: 'norma del proyecto (3ª persona): la vieja hardcodeaba "JUGADOR 2"; la nueva rellena {reactor} con getDisplayName' },
        ],
        logsSoloNueva: [
            { linea: 'Moneda: CRUZ - El ataque procede, pero le costará energía.',
              motivo: 'la vieja lo emitía por game.logError (privado, fuera del historial compartido); la nueva lo pasa a log de combate visible por ambos, coherente con el mensaje de CARA (que la vieja ya emitía por logMsg)' },
        ],
    },
    {
        nombre: 'Inspiración: reacciona a un ataque normal y busca 2 Técnicas del mazo',
        p1: { vanguardia: [{ carta: 'Robot de seguridad SP', furor: 0 }] },
        p2: { vanguardia: ['Mini-tigre'], mano: ['Inspiración'], mazo: ['Atomización', 'Atomización'] },
        pasos: [
            { atacar: 'Robot de seguridad SP', objetivo: 'Mini-tigre' },
            { opcion: 0 },
            { elegir: ['Atomización', 'Atomización'] },
        ],
        logsIntencionados: [
            { de: '¡La adrenalina del combate te da Inspiración!', a: '¡La adrenalina del combate le da Inspiración a J2 (Jugador 2)!',
              motivo: 'norma del proyecto (3ª persona): la vieja decía "te da" (2ª persona); la nueva lo pasa a 3ª persona con {reactor}' },
        ],
        logsSoloNueva: [
            { linea: 'añade Atomización de J2 (Jugador 2) a su mano.',
              motivo: 'pedido por Toto: al coger cartas del mazo debe informarse siempre a ambos jugadores (sintaxis estándar "{jugador} añade {objetivo} a su mano."); la vieja las movía en silencio. Filtra las 2 líneas (una por Técnica cogida)' },
        ],
    },
    {
        nombre: 'Escudo mágico: reacciona al daño, gasta 1 Furor del defensor y anula el golpe',
        p1: { vanguardia: [{ carta: 'Robot de seguridad SP', furor: 0 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', furor: 2 }], mano: ['Escudo mágico'] },
        pasos: [
            { atacar: 'Robot de seguridad SP', objetivo: 'Mini-tigre' },
            { opcion: 0 },
        ],
        logsIntencionados: [
            { de: '¡JUGADOR 2 usa Escudo mágico', a: '¡J2 (Jugador 2) usa Escudo mágico',
              motivo: 'norma del proyecto (3ª persona): la vieja hardcodeaba "JUGADOR 2"; la nueva rellena {reactor} con getDisplayName' },
        ],
    },
    {
        nombre: 'Frasco maldito: reacciona al daño normal, baja 2 el ATQ del atacante y el golpe',
        diferenciasEsperadas: [
            { contiene: 'tempEffects.0.stats', motivo: 'la marca ahora LLEVA ESCRITO lo que antes hacía un hook a mano de la carta (20-ago-2026): el motor ya tenía handlers genéricos para `stats`, así que la carta solo tiene que declararlo. Mismo comportamiento; lo que cambia es dónde está dicho' },
            { contiene: 'tempEffects.0.hastaInicioTurnoLanzador', motivo: 'la marca ahora LLEVA ESCRITO lo que antes hacía un hook a mano de la carta (20-ago-2026): el motor ya tenía handlers genéricos para `hastaInicioTurnoLanzador`, así que la carta solo tiene que declararlo. Mismo comportamiento; lo que cambia es dónde está dicho' },
        ],
        p1: { vanguardia: ['Droide antidisturbios'] }, // atk 5
        p2: { vanguardia: ['Robot de seguridad SP'], mano: ['Frasco maldito'] }, // def 1, hp 4
        pasos: [
            { atacar: 'Droide antidisturbios', objetivo: 'Robot de seguridad SP' },
            { opcion: 0 },
        ],
        logsIntencionados: [
            { de: '¡JUGADOR 2 lanza un Frasco maldito a Droide antidisturbios!',
              a: '¡J2 (Jugador 2) lanza un Frasco maldito a Droide antidisturbios [1] de J1 (Jugador 1)!',
              motivo: 'norma del proyecto (3ª persona con dueño): la vieja hardcodeaba "JUGADOR 2" y attacker.name a secas; la nueva rellena {reactor}/{atacante} con getDisplayName/DSL._nombre' },
        ],
    },
];

correrSuite('regresion18', escenarios);
