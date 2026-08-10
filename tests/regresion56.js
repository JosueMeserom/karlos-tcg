// tests/regresion56.js — Honsow (GENERACIÓN DE ARMAMENTO MELÉ) migrada al DSL (31-jul-2026).
//
// Reutiliza la pieza grande de Karlitos (`BUSCAR` con varias zonas: aquí mano+mazo) y añade
// otras tres, todas pequeñas:
//   · `destino: "EQUIPADO"` en BUSCAR — lo encontrado se equipa a la carta fuente en vez de ir
//     a la mano.
//   · `barajarDespues.soloSiDelMazo` — el arma puede venir de la MANO, y entonces el mazo ni se
//     toca (la vieja lo distinguía con un flag `fromDeck`).
//   · `abortaSiVacio` en BUSCAR — hermano de `abortaSiCancelas`. Sin él, al no haber armas la
//     búsqueda devolvía 'skip' y la Habilidad SEGUÍA: habría atacado sin arma. La vieja hacía
//     cancelAction y se iba. Cubre el otro camino de "no pasó nada": no había NADA que elegir,
//     frente a había algo pero el jugador cerró el modal.
// `costeDiferido` (de Kami) reproduce que el Furor se cobre DESPUÉS de elegir el arma: si
// cancelas el modal, la vieja tampoco cobraba. El ataque encadenado no necesitó nada: un ELEGIR
// de ENEMIGOS + ATACAR, como Karlitos.
//
// OJO, HUECO DE DATOS DE CARTA (no de la migración): a día de hoy NINGÚN Arma no legendaria
// lleva la etiqueta 'melé' — Espada V no tiene etiquetas, y Canceladora y Milkor MGL son 'a
// distancia'; las únicas con 'melé' (Shichishito y Arthas) son legendarias, y el texto de Honsow
// las excluye. O sea que su Activa NO PUEDE encontrar nada en el juego real, ni antes ni ahora.
// Los escenarios de éxito de aquí abajo añaden la etiqueta a mano (`campos`) para poder probar
// el camino bueno; el escenario "sin armas válidas" es, hoy por hoy, el comportamiento real.
//
// MAESTRO DE ARMAS (la Pasiva) se queda fuera porque NO TIENE IMPLEMENTACIÓN en ninguna base:
// existe solo en el texto de la carta. No es algo que esta migración haya perdido.

'use strict';
const { correrSuite } = require('./harness');

const ESPADA_MELE = { carta: 'Espada V', campos: { tags: ['Equipable', 'melé'] } };

const AVISO_RAW_VIEJA = {
    linea: 'Objetivos listos. ¡Ejecutando habilidad!',
    motivo: 'aviso genérico de handleAbilityTargetSelection (camino RAW de abilityContext de la vieja); la nueva elige el enemigo con ELEGIR/pickBoardTargets, que no pasa por ahí',
};

// costeDiferido cobra el Furor al FINAL (para que cancelar el modal no cueste nada), así que el
// "-1 FUR" pasa del principio al final. Mismo texto en ambas bases: se retira como PAR.
// El "-1 FUR" vuelve a caer donde siempre: la norma del coste (7-ago-2026) cobra y anuncia
// JUNTOS en el instante irreversible -aquí, al elegir el arma-, no al terminar la Habilidad
// entera como hacía el `costeDiferido` de la primera versión. Lo único que queda distinto es
// el TEXTO del anuncio: la vieja pintaba a mano uno abreviado y la nueva usa el automático de
// la Activa, que lleva el activeName completo.
const FUR_AL_FINAL = {
    flotantesIntencionados: [
        { de: 'ARMAMENTO MELÉ', a: 'GENERACIÓN DE ARMAMENTO MELÉ',
          motivo: 'la vieja declaraba su propio flotante abreviado; la nueva usa el anuncio AUTOMÁTICO de la Activa (activeName completo), que es el que ahora tienen todas sin declararlo' },
    ],
};

const escenarios = [
    {
        nombre: 'ARMAMENTO MELÉ: coge el arma de la MANO, se equipa y ataca (sin barajar)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Honsow', furor: 1 }], mano: [ESPADA_MELE] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 20 }] },
        pasos: [
            { habilidad: 'Honsow' }, { confirmar: true },
            // La NUEVA pregunta primero en qué zona buscar (confirmarPorZona, 7-ago-2026): antes
            // mezclaba mano y mazo en un modal, spoileando el mazo y forzando el barajado.
            { opcion: 'COGER DE LA MANO', soloEn: 'nueva' },
            { busqueda: ['Espada V'], soloEn: 'vieja' },   // la nueva coge la única arma sin modal
            { elegir: ['Mini-tigre'] },
        ],
        logsSoloVieja: [ AVISO_RAW_VIEJA ],
        logsIntencionados: [
            { de: 'se equipa con Espada V ignorando', a: 'se equipa con Espada V de J1 (Jugador 1) ignorando',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba weapon.name a secas' },
        ],
        ...FUR_AL_FINAL,
    },
    {
        nombre: 'ARMAMENTO MELÉ: coge el arma del MAZO, se equipa, baraja y ataca',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Honsow', furor: 1 }], mazo: [ESPADA_MELE, 'Longaniza'] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 20 }] },
        pasos: [
            { habilidad: 'Honsow' }, { confirmar: true },
            // La NUEVA pregunta primero en qué zona buscar (confirmarPorZona, 7-ago-2026): antes
            // mezclaba mano y mazo en un modal, spoileando el mazo y forzando el barajado.
            { opcion: 'BUSCAR EN EL MAZO', soloEn: 'nueva' },
            { elegir: ['Espada V'] },   // vieja: modal de búsqueda · nueva: visor del mazo
            { elegir: ['Mini-tigre'] },
        ],
        logsSoloVieja: [ AVISO_RAW_VIEJA ],
        logsIntencionados: [
            { de: 'se equipa con Espada V ignorando', a: 'se equipa con Espada V de J1 (Jugador 1) ignorando',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño)' },
        ],
        logsSoloNueva: [
            { linea: 'Barajando el mazo...',
              motivo: 'la vieja lo anunciaba con logError (privado, skipHistory: no entra en el historial que compara el arnés); la nueva usa el canal público de barajarDespues, como el resto de búsquedas ya migradas' },
        ],
        ...FUR_AL_FINAL,
    },
    {
        // El caso REAL a día de hoy: ningún Arma no legendaria lleva 'melé' (ver cabecera).
        // Ambas bases coinciden en lo que importa: no cobra Furor, no agota y no ataca.
        nombre: 'ARMAMENTO MELÉ sin armas válidas: no cobra, no agota y no ataca',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Honsow', furor: 1 }], mano: ['Longaniza'] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 20 }] },
        // Sin armas en ninguna zona la nueva OFRECE el mazo igual (ocultarlo delataría que no
        // queda ninguna); se declina para que el flujo vuelva a converger con la vieja.
        pasos: [ { habilidad: 'Honsow' }, { confirmar: true }, { opcion: 'NO BUSCAR', soloEn: 'nueva' } ],
        logsSoloVieja: [
            { linea: '¡No puedes cancelar esta acción!',
              motivo: 'la vieja llamaba a cancelAction() con el candado puesto, así que el motor respondía con este aviso en vez de abortar limpiamente; la nueva aborta la lista de efectos con abortaSiVacio y no necesita cancelar nada' },
        ],
        logsSoloNueva: [
            // Ya NO aparece (Toto, 7-ago-2026): `logNoValidas` solo salta cuando no queda NINGUNA
            // zona que ofrecer, y el MAZO se ofrece siempre. Anunciar "no hay armas en tu mano ni
            // en tu mazo" sería, además, contarle exactamente lo que la norma dice que no puede
            // saber. Ahora se le ofrece mirar y decide él.
        ],
    },
    {
        nombre: 'ARMAMENTO MELÉ rechazada: no hay enemigos a los que atacar',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Honsow', furor: 1 }], mano: [ESPADA_MELE] },
        p2: {},
        pasos: [ { habilidad: 'Honsow' } ],
    },
];

correrSuite('regresion56', escenarios);
