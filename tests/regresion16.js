// tests/regresion16.js — Primera tanda de "sencillas" tras la fase interceptores:
//   Elemental sanador (RECIEDAD, ACTIVA sinObjetivo + LIMPIAR_ESTADOS),
//   Alumno con VP (ACERTIJO, MONEDA con ELEGIR + elegidoPor: RIVAL),
//   Muro parlante (PUEDE_ATACAR, nueva consulta de veto de ataque),
//   Limo primario (SOBRECURACION, extiende el onBeforeHealed ya soportado por CURAR).
//
// Extensiones nuevas del intérprete usadas aquí (documentadas en cartas.js):
//   - ACTIVA gana un cierre genérico (exhausted/candado/render/forceSync) que
//     antes solo aportaba ATACAR vía performAttack: bug latente nunca disparado
//     porque las dos únicas Activas DSL previas (BOMBAZO, PUÑALADA) atacan.
//   - ACTIVA.sinObjetivo: salta la fase de clic-en-objetivo (autobuffs, fichas,
//     monedas con elección interna).
//   - ELEGIR.elegidoPor: "RIVAL" — el pool sigue siendo relativo al DUEÑO de la
//     carta, pero decide/clica el rival (fuerza modal: el tablero no soporta
//     "espera a que decida el otro jugador").
//   - Triggers PUEDE_ATACAR (-> canAttackNormally) y SOBRECURACION (->
//     onBeforeHealed) para consultas de una sola carta.
//
// Cambio de comportamiento deliberado en Alumno con VP: la comprobación de
// "hay enemigos" pasa a requisitos (como Contendiente/Sra. Kumicho) y se
// evalúa ANTES de pagar el coste y lanzar la moneda; la imperativa gastaba
// ambos igualmente cuando no había objetivos válidos.
//
// Limo primario: el tope de Math.min(9, ...) es defensivo y NO es alcanzable
// con los Ingeribles actuales desde la Vida base (4) — cualquier heal que
// deje la carta con currentHp == maxHp la invalida como objetivo antes del
// siguiente heal (regla general de las Ayudas de curar). Verificado leyendo
// el código; no se fuerza un escenario artificial para cubrirlo.

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'Elemental sanador: RECIEDAD limpia todos los estados alterados de los aliados',
        p1: {
            vanguardia: [
                { carta: 'Elemental sanador', furor: 1 },
                { carta: 'Oso con armadura', estado: { dot: { duration: 2 }, confusion: { duration: 1 } } },
            ],
            retaguardia: [{ carta: 'Mini-tigre', estado: { sueno: { duration: 3 } } }],
        },
        p2: { vanguardia: ['Droide antidisturbios'] },
        pasos: [
            { habilidad: 'Elemental sanador' },
            { confirmar: true },
        ],
    },
    {
        nombre: 'Elemental sanador rechazado sin Furor',
        p1: { vanguardia: [{ carta: 'Elemental sanador', furor: 0 }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { habilidad: 'Elemental sanador' },
        ],
    },
    {
        nombre: 'Alumno con VP: ACERTIJO con cara — tú eliges al enemigo que pierde 2 Furor',
        monedas: ['cara'],
        p1: { vanguardia: [{ carta: 'Alumno con VP', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', furor: 2 }, 'Droide antidisturbios'] },
        pasos: [
            { habilidad: 'Alumno con VP' },
            { confirmar: true },
            { elegir: ['Mini-tigre'] },
        ],
        logsIntencionados: [
            { de: '¡Mini-tigre no sabe la respuesta y pierde 2 de Furor!', a: '¡Mini-tigre [1] (J2 (Jugador 2)) no sabe la respuesta y pierde 2 de Furor!',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba chosen.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
    },
    {
        nombre: 'Alumno con VP: ACERTIJO con cruz — el rival elige a su propio aliado, pierde 1 Furor',
        monedas: ['cruz'],
        p1: { vanguardia: [{ carta: 'Alumno con VP', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', furor: 2 }, 'Droide antidisturbios'] },
        pasos: [
            { habilidad: 'Alumno con VP' },
            { confirmar: true },
            { elegir: ['Droide antidisturbios'] }, // lo clica el rival (elegidoPor: RIVAL)
        ],
        logsIntencionados: [
            { de: 'El rival decide sacrificar 1 Furor de Droide antidisturbios.', a: 'El rival decide sacrificar 1 Furor de Droide antidisturbios [1] (J2 (Jugador 2)).',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba chosen.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
    },
    {
        // Cambio deliberado (ver cabecera): la vieja SÍ abría el modal de confirmar
        // (su canActivateAbility solo miraba el Furor) y gastaba Furor + moneda
        // igualmente al no haber objetivos; la nueva bloquea en canActivateAbility
        // (requisito de enemigos) ANTES de abrir el modal, así que ese paso no
        // aplica en su lado — de ahí el {soloEn: 'vieja'}.
        nombre: 'Alumno con VP rechazado sin enemigos en el campo',
        monedas: { vieja: ['cara'] }, // la vieja tira moneda ANTES de descubrir que no hay objetivos; la nueva no llega a la moneda
        p1: { vanguardia: [{ carta: 'Alumno con VP', furor: 1 }] },
        p2: {},
        pasos: [
            { habilidad: 'Alumno con VP' },
            { soloEn: 'vieja', confirmar: true },
        ],
        diferenciasEsperadas: [
            { contiene: 'estado.p1.vanguard.0.furor', motivo: 'la vieja gastaba 1 Furor igualmente al no haber objetivos; la nueva no llega a pagar el coste (requisito previo)' },
            { contiene: 'flotante[', motivo: 'la vieja llega a mostrar los flotantes de coste/activación (-1 FUR, ACERTIJO) antes de descubrir que no hay objetivos; la nueva no llega a ejecutar nada' },
            { contiene: 'estado.p1.vanguard.0.exhausted', motivo: 'la vieja agota la carta tras el intento fallido (dentro de onExecuteAbility); la nueva ni siquiera la activa' },
        ],
    },
    {
        nombre: 'Muro parlante: INAMOVIBLE veta el ataque normal mientras su Atq sea 0',
        p1: { vanguardia: ['Muro parlante'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { atacar: 'Muro parlante', objetivo: 'Mini-tigre' },
        ],
    },
    {
        nombre: 'Muro parlante puede atacar normalmente si su Atq sube de 0',
        p1: { vanguardia: [{ carta: 'Muro parlante', atk: 3 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 3 }] },
        pasos: [
            { atacar: 'Muro parlante', objetivo: 'Mini-tigre' },
        ],
    },
    {
        nombre: 'Limo primario: CRECIMIENTO IMPARABLE expande la Vida máxima al rebasarla al curar',
        p1: { vanguardia: [{ carta: 'Limo primario', vida: 3 }], mano: ['Manzanahoria'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Manzanahoria' },
            { seleccionar: 'Limo primario' },
        ],
    },
    {
        nombre: 'Limo primario: curar sin rebasar la Vida máxima no expande nada',
        p1: { vanguardia: [{ carta: 'Limo primario', vida: 1 }], mano: ['Manzanahoria'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Manzanahoria' },
            { seleccionar: 'Limo primario' },
        ],
    },
];

correrSuite('regresion16', escenarios);
