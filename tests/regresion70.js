// tests/regresion70.js — DOMINIO (Erasmo): el control mental, que no tenía suite.
//
// Se escribe al migrarla al DSL (op ORDENAR_ATAQUE): la Activa era imperativa entera y nadie
// comprobaba ni que el ataque forzado ocurriera ni a quién se le puede ordenar. Los caminos:
// ordenar a un enemigo que ataque a un aliado tuyo, ordenarle que ataque a OTRO enemigo (que es
// lo jugoso de la carta), y el rechazo cuando no hay marioneta posible.
//
// UNA REGLA CAMBIA A PROPÓSITO (Toto, 23-ago-2026): la vieja dejaba ordenar un ataque contra un
// aliado PROPIO que estuviera Oculto -solo bloqueaba a los Ocultos enemigos-. Un Oculto es un
// Oculto: ahora no se puede señalar a ninguno. Era un descuido de la vieja, no una regla.
//
// SEGUIMIENTO no entra aquí: sigue siendo imperativo (expone la mano rival en cada pasada de
// pasivas y saca un botón para mirar el mazo), y esta suite cubre lo migrado.
'use strict';
const { correrSuite } = require('./harness');

// La base congelada nombra las cartas a secas en este log; la norma es nombrarlas con su dueño,
// que es lo que rellenan {carta}/{atacante}/{objetivo} en el DSL. Mismo texto palabra por palabra.
const NOMBRE = (marioneta, victima) => ({
    logsIntencionados: [
        { de: '¡Erasmo toma el control de ' + marioneta + ' y le obliga a atacar a ' + victima + '!',
          a: '¡Erasmo de J1 (Jugador 1) toma el control de ' + marioneta + ' [1] de J2 (Jugador 2) y le obliga a atacar a ' + victima + ' [1] de J1 (Jugador 1)!',
          motivo: 'norma del proyecto: una carta nombrada en el log lleva su dueño' },
    ],
});

const escenarios = [
    {
        // El uso natural: le quitas el turno a un enemigo haciéndole pegar a quien tú quieras.
        nombre: 'DOMINIO: el enemigo controlado ataca a un aliado tuyo',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Erasmo', furor: 2 }, { carta: 'Mini-tigre', vida: 9 }] },
        p2: { vanguardia: [{ carta: 'Oso con armadura' }] },
        ...NOMBRE('Oso con armadura', 'Mini-tigre'),
        pasos: [
            { habilidad: 'Erasmo' }, { confirmar: true },
            { elegir: ['Oso con armadura'] },   // la marioneta
            { elegir: ['Mini-tigre'] },         // la víctima
        ],
    },
    {
        // Y lo que de verdad la hace temible: enemigo contra enemigo.
        nombre: 'DOMINIO: enemigo contra enemigo',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Erasmo', furor: 2 }] },
        p2: { vanguardia: [{ carta: 'Oso con armadura' }, { carta: 'Mini-tigre', vida: 9 }] },
        logsIntencionados: [
            { de: '¡Erasmo toma el control de Oso con armadura y le obliga a atacar a Mini-tigre!',
              a: '¡Erasmo de J1 (Jugador 1) toma el control de Oso con armadura [1] de J2 (Jugador 2) y le obliga a atacar a Mini-tigre [1] de J2 (Jugador 2)!',
              motivo: 'norma del proyecto: una carta nombrada en el log lleva su dueño' },
        ],
        pasos: [
            { habilidad: 'Erasmo' }, { confirmar: true },
            { elegir: ['Oso con armadura'] },
            { elegir: ['Mini-tigre'] },
        ],
    },
    {
        // La marioneta hereda LO SUYO: con Infusión de maná sus ataques normales cuentan como
        // especiales, así que sí puede señalar a una Oculta. Los objetivos se piden al mismo
        // sitio que decide eso en un ataque normal, no a una copia de sus reglas.
        // La VIEJA también lo permitía, pero por el motivo equivocado: no miraba el Oculto de
        // los ALIADOS del que ordena, y Edrielle aquí es enemiga suya... así que la vieja la
        // bloqueaba. Divergencia declarada abajo.
        nombre: 'DOMINIO: la marioneta con ataques especiales sí puede pegar a una Oculta',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Erasmo', furor: 2 }] },
        p2: { vanguardia: [
            { carta: 'Mini-tigre', campos: { treatAttacksAsSpecial: true } },
            { carta: 'Edrielle', vida: 9 },
        ] },
        pasos: [
            { soloEn: 'nueva', habilidad: 'Erasmo' },
            { soloEn: 'nueva', confirmar: true },
            { soloEn: 'nueva', elegir: ['Mini-tigre'] },
            { soloEn: 'nueva', elegir: ['Edrielle'] },
        ],
        logsSoloNueva: [
            { linea: 'toma el control de Mini-tigre', motivo: 'la vieja no deja señalar a una Oculta ni aunque el atacante convierta sus ataques en especiales: solo miraba la bandera canAttackStealth de la plantilla' },
            { linea: 'recibe 0.5 daño', motivo: 'y por tanto tampoco llega el golpe (0.5: Esbirro contra Personaje, mínimo del motor)' },
        ],
        flotantesSoloNueva: [
            { linea: '-2 FUR', motivo: 'la nueva sí usa la Habilidad y paga su coste' },
            { linea: 'DOMINIO', motivo: 'y la anuncia' },
            { linea: '-0.5 VIDA', motivo: 'el golpe que la vieja no llega a dar' },
        ],
        diferenciasEsperadas: [
            { contiene: 'p1.vanguard.0.furor', motivo: 'la vieja se queda a medias: deja elegir marioneta pero no víctima, así que nunca se compromete' },
            { contiene: 'p1.vanguard.0.exhausted', motivo: 'ídem: no gasta la acción' },
            { contiene: 'p2.vanguard.1.currentHp', motivo: 'Edrielle recibe el ataque especial que la vieja no permite ordenar' },
            { contiene: 'p2.vanguard.0.hasAttackedThisTurn', motivo: 'la marioneta ataca de verdad' },
            { contiene: 'p2.vanguard.0.exhausted', motivo: 'ídem: la marioneta gasta su acción al atacar' },
            { contiene: 'edrielleExposed', motivo: 'campo de la Edrielle VIEJA: su moneda de "estás sola" ya no es suya, es el escondite frágil universal (23-ago-2026)' },
        ],
    },
    {
        // CANCELAR a mitad no cuesta NADA: elegir marioneta todavía no ha cambiado el tablero.
        // (La vieja tampoco cobraba aquí, así que las dos bases coinciden.)
        nombre: 'DOMINIO: cancelar tras elegir marioneta no cuesta Furor ni la acción',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Erasmo', furor: 2 }] },
        p2: { vanguardia: [{ carta: 'Oso con armadura' }] },
        pasos: [
            { habilidad: 'Erasmo' }, { confirmar: true },
            { elegir: ['Oso con armadura'] },
            // La vieja no tiene aquí una elección "cancelable" del DSL: se queda en su propia
            // selección de objetivos, así que el paso es solo para la nueva. Lo que importa es
            // el estado final, y ahí las dos coinciden: nadie ha pagado nada.
            { soloEn: 'nueva', cancelar: true },
        ],
        diferenciasEsperadas: [
            { contiene: 'pendingAbilityTarget', motivo: 'la vieja se queda con su selección de objetivos abierta; la nueva la ha cancelado' },
        ],
    },
    {
        // Sin enemigos en el campo no hay a quién controlar: se rechaza al pulsar.
        nombre: 'DOMINIO rechazado: no hay enemigos controlables',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Erasmo', furor: 2 }] },
        p2: {},
        pasos: [ { habilidad: 'Erasmo' } ],
    },
];

correrSuite('regresion70', escenarios);
