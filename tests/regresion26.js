// tests/regresion26.js — Trigger de ANEXO (Kazuo/Gladiador), migración a DSL.
//
// Arquitectura nueva del intérprete en esta tanda (Toto, 27-jul-2026):
//   · Op `ANEXAR` -> crea el vínculo self<->objetivo (attachments/attachedTo), el
//     mismo campo genérico que ya dibuja la flecha morada y alimenta "Anexado
//     a:"/"Anexo:" en el detalle. Distinto de EQUIPAR (Ayuda anexándose a un aliado).
//   · Condición `anexoValido` en PASIVA_CONTINUA -> válido si el aliado anexado
//     sigue vivo, en mesa, y con el vínculo intacto; si se rompe, limpia
//     attachments sola (mismo criterio que el onUpdatePassive a mano que sustituye).
//   · `excluirSelf` en ELEGIR -> la propia carta ya está en el campo cuando el
//     ELEGIR corre en AL_JUGAR, así que hay que quitarla del pool de ALIADOS.
//
// Diferencias intencionadas:
//   · Elegir al aliado a anexar pasa del modal genérico (openVisualSearchModal,
//     violaba la norma de targeting en tablero) a selección en tablero (reborde
//     verde), norma del proyecto para elegir cartas YA EN EL CAMPO. De paso, la
//     elección se vuelve CANCELABLE en ambas cartas (nada irreversible se ha
//     comprometido aún al elegir) — en la vieja, Gladiador forzaba la elección
//     sin poder cancelar.
//   · Log de Kazuo: la vieja usaba maestro.name a secas; la nueva usa
//     DSL._nombre (formato "de JX (Nick)"), igual que el resto del log tras el
//     cambio de formato unificado de esta sesión.
//   · Gladiador YA NO es silencioso (a diferencia de Kazuo/Xidachane/Karolina):
//     el anuncio genérico de activación/desactivación de PASIVA_CONTINUA es
//     ahora quien avisa de la ROTURA del vínculo (antes, un log a mano
//     "La obsesión de Gladiador ha sido erradicada..."); se estandariza al
//     mismo formato ya aprobado por Toto para Karlos/Kyle. El aviso de
//     ANEXAR (quién es el aliado) se queda en su propio log narrativo,
//     separado del anuncio mecánico de stats.
//   · El +1 Vida Máx. de Gladiador (con el suelo de 1 al perderlo) lo cubre el
//     manejo genérico de "hp" del compilador de PASIVA_CONTINUA — el mismo
//     mecanismo por el que se diseñó (Fanático/Xidachane/Karolina).

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'Kazuo rechazado sin ningún aliado en el campo',
        p1: { mano: ['Kazuo'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { jugar: 'Kazuo' } ],
    },
    {
        nombre: 'Kazuo: elige maestro (masculino) entre dos aliados, +2 Atq mientras dure',
        p1: { vanguardia: ['Oso con armadura', 'Mini-tigre'], mano: ['Kazuo'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Kazuo' },
            { elegir: ['Oso con armadura'] },
        ],
        logsIntencionados: [
            { de: '¡Kazuo reconoce a Oso con armadura como su maestro y luchará por él!',
              a: '¡Kazuo reconoce a Oso con armadura [1] de J1 (Jugador 1) como su maestro y luchará por él!',
              motivo: 'la vieja usaba maestro.name a secas; la nueva rellena {maestro} con DSL._nombre (formato "de JX" tras el cambio de esta sesión)' },
        ],
    },
    {
        nombre: 'Kazuo: maestra de género femenino usa "maestra"/"ella"',
        p1: { vanguardia: ['Ayudante perturbada'], mano: ['Kazuo'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Kazuo' },
            { elegir: ['Ayudante perturbada'] },
        ],
        logsIntencionados: [
            { de: '¡Kazuo reconoce a Ayudante perturbada como su maestra y luchará por ella!',
              a: '¡Kazuo reconoce a Ayudante perturbada [1] de J1 (Jugador 1) como su maestra y luchará por ella!',
              motivo: 'idem anterior' },
        ],
    },
    {
        nombre: 'Kazuo: si el maestro muere, pierde el +2 Atq y se limpia el vínculo',
        p1: { vanguardia: ['Oso con armadura', { carta: 'Mini-tigre', vida: 1 }], mano: ['Kazuo'] },
        p2: { vanguardia: ['Robot de seguridad SP'] },
        pasos: [
            { jugar: 'Kazuo' },
            { elegir: ['Mini-tigre'] },
            { finTurno: true }, // p1 -> p2
            { atacar: 'Robot de seguridad SP', objetivo: 'Mini-tigre' }, // mata al maestro
        ],
        logsIntencionados: [
            { de: '¡Kazuo reconoce a Mini-tigre como su maestro y luchará por él!',
              a: '¡Kazuo reconoce a Mini-tigre [1] de J1 (Jugador 1) como su maestro y luchará por él!',
              motivo: 'idem: cambio de formato de nombre en el log' },
        ],
    },
    {
        nombre: 'Gladiador: anexa aliado, +1 Vida/Def/Atq mientras dure la unión',
        p1: { vanguardia: ['Mini-tigre'], mano: ['Gladiador'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Gladiador' },
            { elegir: ['Mini-tigre'] },
        ],
        logsIntencionados: [
            { de: '¡Gladiador se obsesiona y anexa a Mini-tigre!',
              a: '¡Gladiador se obsesiona y anexa a Mini-tigre [1] de J1 (Jugador 1)!',
              motivo: 'cambio de formato de nombre en el log' },
        ],
        logsSoloNueva: [
            { linea: 'OBSESIÓN DE VENGANZA tiene lugar',
              motivo: 'Gladiador ya NO es silencioso: el anuncio genérico de PASIVA_CONTINUA pasa a cubrir la activación del +1 Vida/Def/Atq, estandarización ya aprobada por Toto para Karlos/Kyle' },
        ],
        flotantesSoloVieja: [
            { linea: '+1 A TODO', motivo: 'la vieja anunciaba el bono combinado en un solo flotante al anexar; el genérico de PASIVA_CONTINUA (no silencioso) da uno por stat' },
        ],
        flotantesSoloNueva: [
            { linea: 'OBSESIÓN DE VENGANZA · ft-ability', motivo: 'flotante del nombre de la pasiva, parte del anuncio genérico' },
            { linea: '+1 VIDA MÁX. · ft-green', motivo: 'flotante por stat del anuncio genérico' },
            { linea: '+1 DEF · ft-green', motivo: 'idem' },
            { linea: '+1 ATQ · ft-green', motivo: 'idem' },
        ],
    },
    {
        nombre: 'Gladiador: sin aliados en el campo, se coloca sin anexar (sin modal)',
        p1: { mano: ['Gladiador'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { jugar: 'Gladiador' } ],
    },
    {
        nombre: 'Gladiador: el vínculo se rompe si el anexado muere, pierde el +1 a Vida/Def/Atq',
        p1: { vanguardia: [{ carta: 'Mini-tigre', vida: 1 }], mano: ['Gladiador'] },
        p2: { vanguardia: ['Robot de seguridad SP'] },
        pasos: [
            { jugar: 'Gladiador' },
            { elegir: ['Mini-tigre'] },
            { finTurno: true }, // p1 -> p2
            { atacar: 'Robot de seguridad SP', objetivo: 'Mini-tigre' }, // mata al anexado
        ],
        logsIntencionados: [
            { de: '¡Gladiador se obsesiona y anexa a Mini-tigre!',
              a: '¡Gladiador se obsesiona y anexa a Mini-tigre [1] de J1 (Jugador 1)!',
              motivo: 'cambio de formato de nombre en el log' },
        ],
        logsSoloNueva: [
            { linea: 'OBSESIÓN DE VENGANZA tiene lugar', motivo: 'idem escenario anterior: anuncio de activación' },
            { linea: 'OBSESIÓN DE VENGANZA (Gladiador de J1 (Jugador 1)) desactivada.',
              motivo: 'anuncio genérico de ROTURA del vínculo; antes era un log a mano ("La obsesión de Gladiador ha sido erradicada...") que se estandariza al mismo formato de Karlos/Kyle' },
        ],
        flotantesSoloVieja: [
            { linea: '+1 A TODO', motivo: 'idem escenario anterior' },
        ],
        flotantesSoloNueva: [
            { linea: 'OBSESIÓN DE VENGANZA · ft-ability', motivo: 'idem' },
            { linea: '+1 VIDA MÁX. · ft-green', motivo: 'idem' },
            { linea: '+1 DEF · ft-green', motivo: 'idem' },
            { linea: '+1 ATQ · ft-green', motivo: 'idem' },
        ],
        diferenciasEsperadas: [
            { contiene: 'estado.p1.vanguard.0.currentHp',
              motivo: 'BUG de la vieja documentado (no "corregido" a mano, es la propia migración quien lo arregla): la limpieza genérica del motor (checkDeath) vacía attachments de Gladiador EN CUANTO muere el anexado, antes de que su propio onUpdatePassive note la ruptura — así que la vieja nunca revierte el +1 Vida Máx. (Atq/Def sí, porque esos se resetean solos cada pasada, no dependen de detectar la ruptura). La nueva usa el manejo genérico de "hp" de PASIVA_CONTINUA, que no depende de esa carrera de tiempos: revierte correctamente a la base (5) en vez de quedarse en 6 para siempre.' },
            { contiene: 'estado.p1.vanguard.0.maxHp', motivo: 'mismo bug/corrección que currentHp' },
        ],
    },
];

correrSuite('regresion26', escenarios);
