// tests/regresion58.js — Poder Legado migrada al DSL (31-jul-2026).
//
// Segunda de la tanda de "equipos con vida propia". Reutiliza la `cuentaAtras` estrenada con
// Súper Evolución (aquí de UN solo turno, no tres) y añade dos piezas:
//   · `mientrasEquipado: {fijar:{atk,def,hp}, ignorarTopes:true}` — stats BLOQUEADOS a un valor
//     en vez de sumados, con el `ignoreStatCaps` del motor para que ningún techo los baje
//     después. El texto dice "inamovible", y el delta de siempre (`{atk:N}`) no puede
//     expresarlo. Hermano del `superStats` de Súper Evolución: los dos son casos de "el bono no
//     es una suma fija".
//   · Trigger `EQUIPO_ANTES_DE_DEFENDER` -> onEquipBeforeDefend: interceptor que corre cuando
//     atacan a QUIEN LLEVA el equipo. Hermano de ANTES_DE_DEFENDER, pero declarado desde el
//     equipo en vez de desde la carta que defiende. La otra mitad del par
//     (EQUIPO_ANTES_DE_ATACAR) la estrena Milkor MGL.
//
// Al caducar no hace falta DESEQUIPAR: basta `VOLVER_A_MANO` con `reset`, porque resetCard llama
// a unequipAll y el equipo se va solo a la basura. Sin `reset` el Karlos volvería a la mano con
// los stats todavía bloqueados a 9 y el equipo encima -que es justo por lo que la vieja llamaba
// a resetCard a mano-.
//
// Como en Súper Evolución, se migra con AL_EQUIPAR (no AL_USAR_AYUDA) para conservar el flujo
// mano -> equipped, y el targeting pasa del modal genérico de la vieja a ELEGIR/pickBoardTargets,
// que es la norma del proyecto para elegir una carta que ya está en el campo.

'use strict';
const { correrSuite } = require('./harness');

const PODER_LEGADO = 'Poder Legado';

// Bug de motor real y preexistente corregido el 31-jul-2026 (betasteo de Poder Legado, Toto):
// el op EQUIPAR nunca llamaba a assignCopyId (el motor solo lo hacía en otros pipelines de
// jugar carta), así que ninguna Ayuda equipable vía AL_EQUIPAR distinguía copias en "Afectado
// por:" -copyId se quedaba en null para siempre-. Ver regresion6 para la nota completa; aquí
// solo se declara el efecto.
const COPY_ID_NACE = [
    { contiene: 'copyId', motivo: 'bug de motor preexistente: assignCopyId nunca se llamaba al jugar una Ayuda con onPlay propio; arreglado en el op EQUIPAR' },
    { contiene: 'cardCounts', motivo: 'consecuencia de lo mismo: el contador por el que assignCopyId reparte los números' },
];

// El requisito es EXACTAMENTE 1 de Vida, así que todos los escenarios parten de ahí.
const KARLOS_A_1 = { carta: 'Karlos', vida: 1 };

// Diferencias de MECANISMO (no de efecto), comunes a todos los escenarios que llegan a equipar.
// La más golosa es `cardRef`: la vieja guardaba una COPIA ENTERA de la carta equipo dentro del
// tempEffect —que viaja en exportGameState, o sea por la red en cada sincronización— solo para
// poder recuperarla luego. La nueva usa el `sourceInstanceId` que toda marca del DSL ya trae y
// la recupera con findCard (arreglado en la tanda anterior para que mire dentro de los equipos).
const MECANISMO_MARCA = [
    { contiene: 'tempEffects.0.isLegado', motivo: 'flag propio de la vieja para reconocer su marca; la nueva usa el mecanismo genérico de cuenta atrás' },
    { contiene: 'tempEffects.0.cardRef', motivo: 'la vieja embutía una copia completa de la carta en la marca (y por tanto en el estado que viaja por red); la nueva la recupera por sourceInstanceId' },
    { contiene: 'tempEffects.0.duration', motivo: 'campo de la cuenta atrás genérica, inexistente en la vieja' },
    { contiene: 'tempEffects.0.cuentaAtras', motivo: 'idem: el flag que enciende el mecanismo' },
    { contiene: 'tempEffects.0.cuentaTotal', motivo: 'idem: el total, para poder pintar el progreso' },
];

// Al bloquear los stats a 9, la MEGADRENALINA de Karlos (que se enciende con Vida <= 3) se apaga.
// El texto del aviso de apagado difiere entre bases desde que Karlos se migró a PASIVA_CONTINUA
// (regresión 23): no tiene nada que ver con Poder Legado, pero aparece en estos escenarios.
const AVISO_MEGADRENALINA = {
    de: 'MEGADRENALINA (Karlos de J1 (Jugador 1)) desactivada.',
    a: 'Habilidad pasiva de Karlos de J1 (Jugador 1): MEGADRENALINA desactivada.',
    motivo: 'formato del aviso genérico de PASIVA_CONTINUA (Karlos, migrado en regresion23); ajeno a esta carta',
};

const escenarios = [
    {
        nombre: 'Poder Legado: se anexa a un Karlos con 1 de Vida y le bloquea los stats a 9',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [KARLOS_A_1], mano: [PODER_LEGADO] },
        p2: {},
        pasos: [ { jugar: PODER_LEGADO }, { elegir: ['Karlos'] } ],
        logsIntencionados: [
            { de: '¡Karlos despierta su verdadero poder!', a: '¡Karlos de J1 (Jugador 1) despierta su verdadero poder!',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas' },
        ],
        diferenciasEsperadas: [...MECANISMO_MARCA, ...COPY_ID_NACE],
    },
    {
        nombre: 'Poder Legado rechazado: el Karlos tiene más de 1 de Vida',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Karlos', vida: 3 }], mano: [PODER_LEGADO] },
        p2: {},
        pasos: [ { jugar: PODER_LEGADO } ],
    },
    {
        nombre: 'Poder Legado rechazado: no hay ningún Karlos en vanguardia',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Mini-tigre', vida: 1 }], mano: [PODER_LEGADO] },
        p2: {},
        pasos: [ { jugar: PODER_LEGADO } ],
    },
    {
        // El aura (EQUIPO_ANTES_DE_DEFENDER): quien ataque al portador pierde 1 de Furor. Se
        // monta jugando el equipo y pasando turno, que es como ocurre en una partida real.
        nombre: 'Poder Legado: quien ataca al portador pierde 1 de Furor por el aura',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [KARLOS_A_1], mano: [PODER_LEGADO] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', furor: 3, vida: 20 }] },
        pasos: [
            { jugar: PODER_LEGADO }, { elegir: ['Karlos'] },
            { finTurno: true },                                  // pasa el turno a p2
            { atacar: 'Mini-tigre', objetivo: 'Karlos' },
        ],
        logsIntencionados: [
            { de: '¡Karlos despierta su verdadero poder!', a: '¡Karlos de J1 (Jugador 1) despierta su verdadero poder!',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño)' },
            { de: 'drena la energía de Mini-tigre.', a: 'drena la energía de Mini-tigre [1] de J2 (Jugador 2).',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba attacker.name a secas' },
            AVISO_MEGADRENALINA,
        ],
        diferenciasEsperadas: [...MECANISMO_MARCA, ...COPY_ID_NACE],
    },
    {
        // El ciclo completo: al empezar el SIGUIENTE turno propio, el equipo consume al portador
        // y lo devuelve a la mano lavado (sin los stats bloqueados y sin el equipo encima).
        nombre: 'Poder Legado: al inicio del siguiente turno propio, el Karlos vuelve a la mano',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [KARLOS_A_1], mano: [PODER_LEGADO] },
        p2: {},
        pasos: [
            { jugar: PODER_LEGADO }, { elegir: ['Karlos'] },
            { finTurno: true }, { finTurno: true },   // vuelve a ser turno de p1: caduca
        ],
        logsIntencionados: [
            { de: '¡Karlos despierta su verdadero poder!', a: '¡Karlos de J1 (Jugador 1) despierta su verdadero poder!',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño)' },
            { de: 'ha consumido la energía de Karlos.', a: 'ha consumido la energía de Karlos de J1 (Jugador 1).',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas' },
            AVISO_MEGADRENALINA,
        ],
        // Antes de arreglar el `.filter()` síncrono de processStartPhaseEffects (index.html,
        // motor COMPARTIDO por ambas bases), esta línea sí habría divergido: la vieja habría
        // dejado la marca caducada pegada a la carta que vuelve a la mano -su hook async nunca
        // se esperaba, así que el `return false` real jamás se veía-. Con el motor arreglado,
        // el `return false` se respeta en LAS DOS bases y ambas limpian la marca por igual.
        diferenciasEsperadas: COPY_ID_NACE,
    },
];

correrSuite('regresion58', escenarios);
