// tests/regresion68.js — MULTIPLICACIÓN DE CUERPO: la CREACIÓN del clon.
//
// El clon en sí ya era declarativo desde julio (trigger ESPEJO, regresion21), pero esa suite lo
// coloca a mano con el ref `padre`: nadie comprobaba nunca el acto de crearlo, que era el único
// código imperativo que le quedaba a Unmei. Se escribe al migrarlo al op CREAR_CLON.
//
// El cuarto escenario es el que de verdad importa y el que casi se me pasa: **NoName replicando
// esta Habilidad**. La vieja elegía la ficha con un `card.name === "NoName" ? 901 : 900` metido
// dentro del onExecuteAbility de Unmei; el op la busca por NOMBRE ("Clon de " + quien la usa),
// así que el camino de RÉPLICA -que sigue siendo imperativo, y va a seguir siéndolo- tiene que
// seguir sacando su propio clon sin enterarse de nada.
'use strict';
const { correrSuite } = require('./harness');

// La base congelada escribía "Unmei" a secas; la norma del proyecto es nombrar cualquier carta
// del log con su dueño (getCardNameWithOwner), que en el DSL es el relleno {carta}. Mismo texto.
const NOMBRE = {
    logsIntencionados: [
        { de: '¡Unmei traza', a: '¡Unmei de J1 (Jugador 1) traza',
          motivo: 'norma del proyecto: una carta nombrada en el log lleva su dueño' },
        { de: '¡NoName traza', a: '¡NoName de J1 (Jugador 1) traza',
          motivo: 'idem, con NoName usando la Habilidad replicada' },
        // Esta no es de la migracion: es del propio RÉPLICA, que sigue siendo imperativo y ya
        // divergia de la base congelada por la misma norma.
        { de: 'CUERPO] de Unmei!', a: 'CUERPO] de Unmei de J2 (Jugador 2)!',
          motivo: 'idem, aplicado al escaneado por RÉPLICA' },
    ],
};

const escenarios = [
    {
        nombre: 'Unmei crea su clon en la vanguardia',
        p1: { vanguardia: [{ carta: 'Unmei', furor: 4 }] },
        p2: { vanguardia: ['Mini-tigre'] },
        ...NOMBRE,
        pasos: [
            { habilidad: 'Unmei' },
            { confirmar: true },
        ],
    },
    {
        // Vanguardia llena: el clon entra atrás. Lo decide el op, igual que lo decidía la vieja.
        nombre: 'Unmei con la vanguardia llena: el clon va a retaguardia',
        p1: { vanguardia: [{ carta: 'Unmei', furor: 4 }, 'Mini-tigre', 'Oso con armadura', 'Hechicero'] },
        p2: { vanguardia: ['Mini-tigre'] },
        ...NOMBRE,
        pasos: [
            { habilidad: 'Unmei' },
            { confirmar: true },
        ],
    },
    {
        // Sin un solo hueco en las dos filas: se rechaza ANTES de cobrar nada.
        nombre: 'Unmei sin sitio: la Habilidad se rechaza y no cuesta Furor',
        p1: {
            vanguardia: [{ carta: 'Unmei', furor: 4 }, 'Mini-tigre', 'Oso con armadura', 'Hechicero'],
            retaguardia: ['Mini-tigre', 'Oso con armadura', 'Hechicero', 'Robot de seguridad SP'],
        },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { habilidad: 'Unmei' },
        ],
    },
    {
        // RÉPLICA: NoName escanea a Unmei y usa SU Habilidad. Tiene que salir el "Clon de
        // NoName" (id 901), no el de Unmei, y pagarlo NoName de su propio Furor.
        nombre: 'NoName replica MULTIPLICACIÓN DE CUERPO y saca SU clon',
        p1: { vanguardia: [{ carta: 'NoName', furor: 4 }] },
        p2: { vanguardia: [{ carta: 'Unmei', furor: 4 }] },
        ...NOMBRE,
        pasos: [
            { habilidad: 'NoName' },
            { confirmar: true },
            { seleccionar: 'Unmei', jugador: 'p2' },
        ],
    },
];

correrSuite('regresion68', escenarios);
