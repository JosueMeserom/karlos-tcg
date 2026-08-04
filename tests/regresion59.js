// tests/regresion59.js — Milkor MGL migrada al DSL (31-jul-2026). CIERRA la tanda de "equipos
// con vida propia" (Súper Evolución -regresion57-, Poder Legado -regresion58- y esta).
//
// Era la que llevaba el trozo delicado, y por eso se dejó para el final: su interceptor DEVUELVE
// un valor al motor -{dmgMod, newDefender}, que performAttack suma y aplica- y, en la rama de
// cruz, hace elegir al RIVAL a mitad del ataque. Piezas nuevas:
//   · Trigger `EQUIPO_ANTES_DE_ATACAR` -> onEquipBeforeAttack: gemelo del
//     EQUIPO_ANTES_DE_DEFENDER de Poder Legado, pero para cuando ATACA quien lleva el equipo.
//     A diferencia del resto de triggers, el motor espera un valor de vuelta.
//   · Ops `DAÑO_ATAQUE` (modificador del DAÑO del golpe, no del Atq: el motor lo suma en
//     `dmg = atacante.Atq - defensor.Def + dmgModifier`) y `REDIRIGIR_ATAQUE` (cambia el
//     destinatario). Llenan un transitorio en `game` que el trigger devuelve, mismo criterio que
//     ESQUIVAR: es de UNA resolución y no viaja en el estado, así que no ensucia el arnés.
//   · `quien: "ATACANTE"` en los pools: dentro de este trigger la carta fuente es el EQUIPO, así
//     que "SELF" no sirve para apuntar a quien lo empuña.
//   · `{instancia}` en el id de MODIFICAR_CONTADORES/DESEQUIPAR, para que dos copias del arma
//     sobre el mismo portador no compartan la cuenta de disparos.
//
// La elección del rival NO necesitó nada nuevo: es un `ELEGIR` de ENEMIGOS con
// `elegidoPor:"RIVAL"`, que existe desde ACERTIJO, y por tanto va por reborde verde en el
// tablero del rival en vez del modal genérico que usaba la vieja — cumple de paso la norma de
// targeting en tablero, que esta carta incumplía por partida doble (también al equiparse).
//
// Bug de motor corregido de camino: performAttack recorría `attacker.equippedCards` con un
// for...of sobre el array VIVO, y esta arma puede desequiparse a sí misma dentro de ese mismo
// bucle al gastar su última carga. Se recorre una copia.
//
// OJO, hueco de la CARTA que la migración no arregla (mismo caso que MAESTRO DE ARMAS en
// Honsow): el texto dice "Aumenta su Atq en 4 durante el ataque (MÁXIMO 8)" y ese tope de 8 no
// lo aplicaba la imperativa ni se añade aquí — en una migración manda replicar 1:1.

'use strict';
const { correrSuite } = require('./harness');

const MILKOR = 'Milkor MGL';

// La vieja elegía portador y víctima con el modal genérico; la nueva usa ELEGIR ->
// pickBoardTargets. El paso {elegir} del harness es polimórfico y responde a los dos.
const COPY_ID_NACE = [
    { contiene: 'copyId', motivo: 'bug de motor preexistente: assignCopyId nunca se llamaba al jugar una Ayuda con onPlay propio; arreglado en el op EQUIPAR (ver regresion6)' },
    { contiene: 'cardCounts', motivo: 'consecuencia de lo mismo: el contador por el que assignCopyId reparte los números' },
];

// El contador 💥 espejado en la anfitriona NO existe en la base congelada: se añadió a la Milkor
// imperativa DESPUÉS de la foto (por eso allí no hay `counters` en el portador). No es una
// divergencia de esta migración, es una función posterior a la congelación.
const CONTADOR_ESPEJO = {
    contiene: 'vanguard.0.counters',
    motivo: 'el contador de disparos espejado en el portador se añadió a la carta después de congelar la base vieja',
};

const FLOTANTE_MILKOR = {
    linea: '¡MILKOR!',
    motivo: 'anuncio del arma al dispararse, como el resto de efectos migrados; la vieja solo lo decía en el log (se declara UNA vez aunque dispare varias: el filtro del arnés retira todas las coincidencias)',
};

const escenarios = [
    {
        nombre: 'Milkor MGL: se equipa a un aliado que no sea Animal salvaje',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: ['Karlos'], mano: [MILKOR] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { jugar: MILKOR }, { elegir: ['Karlos'] } ],
        logsIntencionados: [
            { de: 'Karlos carga el Milkor MGL.', a: 'Karlos de J1 (Jugador 1) carga el Milkor MGL.',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas' },
        ],
        diferenciasEsperadas: COPY_ID_NACE,
    },
    {
        // El texto excluye a los Animal salvaje: sin más aliados, la carta se rechaza.
        nombre: 'Milkor MGL rechazado: el único aliado es un Animal salvaje',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: ['Mini-tigre'], mano: [MILKOR] }, // Mini-tigre lleva 'Animal salvaje'
        p2: { vanguardia: ['Oso con armadura'] },
        pasos: [ { jugar: MILKOR } ],
    },
    {
        // CARA: +4 al daño del golpe. Karlos (Atq 5) contra Oso con armadura (Def 3) haría 2;
        // con el Milkor, 6.
        nombre: 'Milkor MGL: al atacar, CARA suma 4 al daño y gasta un disparo',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: ['Karlos'], mano: [MILKOR] },
        p2: { vanguardia: [{ carta: 'Oso con armadura', vida: 20 }] },
        monedas: ['cara'],
        pasos: [
            { jugar: MILKOR }, { elegir: ['Karlos'] },
            { atacar: 'Karlos', objetivo: 'Oso con armadura' },
        ],
        logsIntencionados: [
            { de: 'Karlos carga el Milkor MGL.', a: 'Karlos de J1 (Jugador 1) carga el Milkor MGL.',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño)' },
            { de: '¡Karlos dispara el Milkor MGL! (Disparo 1/2)', a: '¡Karlos de J1 (Jugador 1) dispara el Milkor MGL!',
              motivo: 'nombre con dueño (norma del proyecto) y sin el recuento "(N/2)": el contador 💥 de la anfitriona ya lo dice, y repetirlo en el log era ruido' },
        ],
        flotantesSoloNueva: [ FLOTANTE_MILKOR ],
        diferenciasEsperadas: [...COPY_ID_NACE, CONTADOR_ESPEJO],
    },
    {
        // CRUZ: -3 al daño y el RIVAL elige quién recibe el roce.
        nombre: 'Milkor MGL: CRUZ resta 3 al daño y el rival redirige el golpe',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: ['Karlos'], mano: [MILKOR] },
        p2: { vanguardia: [{ carta: 'Oso con armadura', vida: 20 }, { carta: 'Mini-tigre', vida: 20 }] },
        monedas: ['cruz'],
        pasos: [
            { jugar: MILKOR }, { elegir: ['Karlos'] },
            { atacar: 'Karlos', objetivo: 'Oso con armadura' },
            { elegir: ['Mini-tigre'] }, // lo elige el RIVAL (elegidoPor: "RIVAL")
        ],
        logsIntencionados: [
            { de: 'Karlos carga el Milkor MGL.', a: 'Karlos de J1 (Jugador 1) carga el Milkor MGL.',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño)' },
            { de: '¡Karlos dispara el Milkor MGL! (Disparo 1/2)', a: '¡Karlos de J1 (Jugador 1) dispara el Milkor MGL!',
              motivo: 'ver escenario anterior' },
        ],
        flotantesSoloNueva: [ FLOTANTE_MILKOR ],
        diferenciasEsperadas: [...COPY_ID_NACE, CONTADOR_ESPEJO],
    },
    {
        // Dos disparos y el arma se queda sin munición: se suelta y va al descarte.
        nombre: 'Milkor MGL: al segundo disparo se queda sin munición y se descarta',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: ['Karlos'], mano: [MILKOR] },
        p2: { vanguardia: [{ carta: 'Oso con armadura', vida: 30 }] },
        monedas: ['cara', 'cara'],
        pasos: [
            { jugar: MILKOR }, { elegir: ['Karlos'] },
            { atacar: 'Karlos', objetivo: 'Oso con armadura' },
            { finTurno: true }, { finTurno: true },   // vuelve a ser turno de p1
            { atacar: 'Karlos', objetivo: 'Oso con armadura' },
        ],
        logsIntencionados: [
            { de: 'Karlos carga el Milkor MGL.', a: 'Karlos de J1 (Jugador 1) carga el Milkor MGL.',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño)' },
            { de: '¡Karlos dispara el Milkor MGL! (Disparo 1/2)', a: '¡Karlos de J1 (Jugador 1) dispara el Milkor MGL!',
              motivo: 'ver escenario anterior' },
            { de: '¡Karlos dispara el Milkor MGL! (Disparo 2/2)', a: '¡Karlos de J1 (Jugador 1) dispara el Milkor MGL!',
              motivo: 'ver escenario anterior' },
        ],
        flotantesSoloNueva: [ FLOTANTE_MILKOR ],
        // El arma se rompe en MOMENTOS distintos: la vieja lo hacía con un setTimeout(1000) desde
        // onEquipUpdate, o sea DESPUÉS de resolverse el golpe; la nueva lo resuelve en el propio
        // interceptor, justo tras gastar la última carga. El efecto es idéntico (el +4 ya viajaba
        // en el valor devuelto al motor); lo único que cambia es el ORDEN de esas dos líneas de
        // log, de ahí que se declaren las dos posiciones que se intercambian.
        // Sin CONTADOR_ESPEJO: aquí el arma acaba rota y DESEQUIPAR se lleva el contador por
        // delante, así que las dos bases terminan sin contadores en el portador.
        diferenciasEsperadas: [
            ...COPY_ID_NACE,
            { contiene: 'log[8]', motivo: 'la rotura del arma se anuncia antes del daño (la vieja la retrasaba 1 s con un setTimeout)' },
            { contiene: 'log[9]', motivo: 'la otra mitad del mismo intercambio de orden' },
            { contiene: 'discard.0.equippedTo', motivo: 'la vieja dejaba el vínculo colgando tras descartar el arma; DESEQUIPAR lo suelta (mismo caso que Súper Evolución)' },
            { contiene: 'discard.0.pendingDestroy', motivo: 'bandera de bookkeeping de la vieja para no relanzar su setTimeout; la nueva no la necesita' },
        ],
    },
];

correrSuite('regresion59', escenarios);
