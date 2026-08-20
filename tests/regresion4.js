// tests/regresion4.js — Ayudas Mágicas con AL_USAR_AYUDA y coste de Furor:
//   Flash de maná (1031), Granada de maná (1032), Hexagrama (1033).
// Ejercitan: deltaCondicional (descuento Eris), APLICAR_ESTADO en área,
// ELEGIR sobre enemigos con hastaCantidad, BUSCAR en mazo con barajado
// (el barajado consume Math.random: la semilla compartida garantiza el
// mismo orden en ambas bases si consumen el mismo número de tiradas).

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'Flash de maná: paga 2 de Furor y ciega la vanguardia enemiga',
        flotantesSoloVieja: [ { linea: '-2 FUR', consecutivo: true, motivo: 'la vieja pintaba DOS veces el mismo flotante de Furor: el suyo escrito a mano MÁS el automático de modifyStat. La nueva ya no declara el suyo (Toto lo vio con Rezo en grupo, 8-ago-2026); el flotante que queda es el del motor, idéntico' } ],
        p1: { vanguardia: [{ carta: 'Oso con armadura', furor: 3 }], mano: ['Flash de maná'] },
        p2: { vanguardia: ['Mini-tigre', 'Droide antidisturbios'], retaguardia: ['Robot de seguridad SP'] },
        pasos: [
            { jugar: 'Flash de maná' },
            { seleccionar: 'Oso con armadura' },
        ],
        logsIntencionados: [
            { de: '¡Oso con armadura desata', a: '¡Oso con armadura [1] de J1 (Jugador 1) desata',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño/jugador): la vieja usaba nombres a secas o 2ª persona; la nueva usa DSL._nombre / {jugador}' },
        ],
    },
    {
        nombre: 'Flash de maná pagado por Eris: descuento a 1 de Furor (deltaCondicional)',
        flotantesSoloVieja: [ { linea: '-1 FUR', consecutivo: true, motivo: 'la vieja pintaba DOS veces el mismo flotante de Furor: el suyo escrito a mano MÁS el automático de modifyStat. La nueva ya no declara el suyo (Toto lo vio con Rezo en grupo, 8-ago-2026); el flotante que queda es el del motor, idéntico' } ],
        p1: { vanguardia: [{ carta: 'Eris', furor: 1 }], mano: ['Flash de maná'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Flash de maná' },
            { seleccionar: 'Eris' },
        ],
        logsIntencionados: [
            { de: '¡Eris desata', a: '¡Eris de J1 (Jugador 1) desata',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño/jugador): la vieja usaba nombres a secas o 2ª persona; la nueva usa DSL._nombre / {jugador}' },
        ],
    },
    {
        nombre: 'Flash de maná sin enemigos en vanguardia (logSiVacio)',
        flotantesSoloVieja: [ { linea: '-2 FUR', consecutivo: true, motivo: 'la vieja pintaba DOS veces el mismo flotante de Furor: el suyo escrito a mano MÁS el automático de modifyStat. La nueva ya no declara el suyo (Toto lo vio con Rezo en grupo, 8-ago-2026); el flotante que queda es el del motor, idéntico' } ],
        p1: { vanguardia: [{ carta: 'Oso con armadura', furor: 2 }], mano: ['Flash de maná'] },
        p2: { retaguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Flash de maná' },
            { seleccionar: 'Oso con armadura' },
        ],
        logsIntencionados: [
            { de: '¡Oso con armadura desata', a: '¡Oso con armadura [1] de J1 (Jugador 1) desata',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño/jugador): la vieja usaba nombres a secas o 2ª persona; la nueva usa DSL._nombre / {jugador}' },
        ],
    },
    {
        nombre: 'Granada de maná: elige 2 enemigos, daño verdadero y una muerte',
        diferenciasEsperadas: [
            { contiene: 'discard.0.granadaObjetivos', motivo: 'efecto lateral de mover el cobro DETRÁS de la elección (20-ago-2026): los elegidos se guardan en la carta para que el coste y el daño puedan apuntarles después, y ese campo viaja con ella al descarte. La vieja no lo necesitaba porque cobraba antes de elegir' },
        ],
        p1: { vanguardia: [{ carta: 'Oso con armadura', furor: 2 }], mano: ['Granada de maná'] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 1 }, 'Droide antidisturbios'] },
        pasos: [
            { jugar: 'Granada de maná' },
            { seleccionar: 'Oso con armadura' },
            { elegir: ['Mini-tigre', 'Droide antidisturbios'] }, // vieja: modal visual · nueva: tablero
        ],
        logsIntencionados: [
            { de: '¡Oso con armadura hace explotar', a: '¡Oso con armadura [1] de J1 (Jugador 1) hace explotar',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño/jugador): la vieja usaba nombres a secas o 2ª persona; la nueva usa DSL._nombre / {jugador}' },
        ],
        // Reordenamiento de flotantes (betasteo de Toto, 31-jul-2026): el flotante "razón"
        // (DAÑO VERDADERO) ahora sale ANTES del flotante del cambio de Vida en sí, no después
        // -mismo criterio aplicado a MALDITO (Muñeca del mal, regresion51)-. Mismo texto en
        // ambas bases para los 2 objetivos, solo cambia el orden: se retira como PAR completo.
        flotantesSoloVieja: [
            { linea: '-1 VIDA', motivo: 'orden vieja: -1 VIDA antes de DAÑO VERDADERO (2 objetivos)' },
            { linea: '-2 FUR', consecutivo: true, motivo: 'la vieja pintaba DOS veces el mismo flotante de Furor: el suyo escrito a mano MÁS el automático de modifyStat. La nueva ya no declara el suyo (Toto lo vio con Rezo en grupo, 8-ago-2026); el flotante que queda es el del motor, idéntico' },
        ],
        flotantesSoloNueva: [ { linea: '-1 VIDA', motivo: 'orden nueva: DAÑO VERDADERO antes de -1 VIDA (2 objetivos)' } ],
    },
    {
        nombre: 'Hexagrama: tributa 1 Furor, busca la Invocación y baraja',
        flotantesSoloVieja: [ { linea: '-1 FUR', consecutivo: true, motivo: 'la vieja pintaba DOS veces el mismo flotante de Furor: el suyo escrito a mano MÁS el automático de modifyStat. La nueva ya no declara el suyo (Toto lo vio con Rezo en grupo, 8-ago-2026); el flotante que queda es el del motor, idéntico' } ],
        semilla: 11,
        p1: {
            vanguardia: [{ carta: 'Mini-tigre', furor: 1 }],
            mano: ['Hexagrama'],
            mazo: ['Oso con armadura', 'Gólem multielemental', 'Longaniza', 'Robot de seguridad SP'],
        },
        p2: { vanguardia: ['Droide antidisturbios'] },
        pasos: [
            { jugar: 'Hexagrama' },
            { seleccionar: 'Mini-tigre' },
            { elegir: ['Gólem multielemental'] },
        ],
        logsIntencionados: [
            { de: 'Barajando el mazo...', a: 'Barajando el mazo de J1 (Jugador 1)...',
              motivo: 'atribución de jugador pedida por Toto (21-jul-2026): los logs de zonas ocultas dicen de quién son; la vieja decía "Barajando el mazo..." a secas' },
            { de: 'El Hexagrama brilla y te permite buscar en tu mazo...', a: 'El Hexagrama brilla y permite a J1 (Jugador 1) buscar en su mazo...',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño/jugador): la vieja usaba nombres a secas o 2ª persona; la nueva usa DSL._nombre / {jugador}' },
            { de: 'Añades Gólem multielemental a tu mano.', a: 'J1 (Jugador 1) añade Gólem multielemental de J1 (Jugador 1) a su mano.',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño/jugador): la vieja usaba nombres a secas o 2ª persona; la nueva usa DSL._nombre / {jugador}' },
        ],
    },
    {
        nombre: 'Hexagrama sin Invocaciones en el mazo: fracasa pero baraja igualmente',
        flotantesSoloVieja: [ { linea: '-1 FUR', consecutivo: true, motivo: 'la vieja pintaba DOS veces el mismo flotante de Furor: el suyo escrito a mano MÁS el automático de modifyStat. La nueva ya no declara el suyo (Toto lo vio con Rezo en grupo, 8-ago-2026); el flotante que queda es el del motor, idéntico' } ],
        semilla: 11,
        p1: {
            vanguardia: [{ carta: 'Mini-tigre', furor: 1 }],
            mano: ['Hexagrama'],
            mazo: ['Oso con armadura', 'Longaniza', 'Robot de seguridad SP'],
        },
        p2: { vanguardia: ['Droide antidisturbios'] },
        pasos: [
            { jugar: 'Hexagrama' },
            { seleccionar: 'Mini-tigre' },
            { soloEn: 'nueva', cancelar: true }, // cierra el visor de mazo vacío (solo la nueva lo abre)
        ],
        logsIntencionados: [
            { de: 'Barajando el mazo...', a: 'Barajando el mazo de J1 (Jugador 1)...',
              motivo: 'atribución de jugador pedida por Toto (21-jul-2026): los logs de zonas ocultas dicen de quién son; la vieja decía "Barajando el mazo..." a secas' },
            { de: "No quedan cartas de 'Invocación' en tu mazo.", a: "No quedan cartas de 'Invocación' en el mazo de J1 (Jugador 1).",
              motivo: 'norma del proyecto (logs en 3ª persona con dueño/jugador): la vieja usaba nombres a secas o 2ª persona; la nueva usa DSL._nombre / {jugador}' },
        ],
    },
];

correrSuite('regresion4', escenarios);
