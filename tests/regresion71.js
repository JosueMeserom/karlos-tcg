// tests/regresion71.js — Silhouette (REINA DEL COSPLAY + PONTE TRAJE), que no tenía suite.
//
// Se escribe al migrarla al DSL: era la carta con más hooks a mano del fichero (siete) y nadie
// comprobaba ninguno. Los caminos que tiene: la curación de cada turno, copiar los stats base de
// un enemigo, copiarlos de un aliado, que el traje SIGA puesto pasadas de pasivas después
// (lo que hacía su onUpdatePassive), cancelar sin pagar, y el requisito de colocación.
//
// LO QUE NO ENTRA AQUÍ, a propósito: que un Oculto ENEMIGO no se pueda copiar. La vieja lo
// rechazaba DESPUÉS de señalarlo (onValidateTarget, con aviso) y la nueva ni lo pinta elegible
// (`sinOcultosEnemigos`), así que el mismo paso no significa lo mismo en las dos bases y la
// comparación no diría nada. La regla sí se ve en el reborde verde del cliente.
'use strict';
const { correrSuite } = require('./harness');

// La base congelada nombra a la carta sin dueño en el log de la curación; la norma del proyecto
// es que todo log visible por ambos lleve el dueño, y es lo que rellena {objetivo} en el DSL.
const NOMBRE = {
    logsIntencionados: [
        { de: '¡REINA DEL COSPLAY! Silhouette se cura',
          a:  '¡REINA DEL COSPLAY! Silhouette de J1 (Jugador 1) se cura',
          motivo: 'norma del proyecto: una carta nombrada en el log lleva su dueño ({objetivo} en el DSL)' },
    ],
};

// PONTE TRAJE: mismo motivo en el log, y los flotantes cambian de forma a propósito.
// La vieja pintaba la DIFERENCIA ("+4 DEF", en verde de bono); la nueva pinta el resultado
// ("DEF = 5"), que es lo que de verdad hace la carta -tus stats base PASAN A SER esos, no te
// suben-. Es además el formato que ya usa Plan de equipo para lo mismo ("ATQ = {valor}").
const TRAJE = (modelo, conDueno, atq, def, deltaAtq, deltaDef) => ({
    logsIntencionados: [
        { de: '¡Silhouette copia los stats base de ' + modelo + '!',
          a:  '¡Silhouette de J1 (Jugador 1) copia los stats base de ' + conDueno + '!',
          motivo: 'norma del proyecto: una carta nombrada en el log lleva su dueño' },
    ],
    flotantesIntencionados: [
        { de: deltaAtq + ' ATQ · ft-green', a: 'ATQ = ' + atq + ' · ft-ability',
          motivo: 'se pinta el resultado, no la diferencia: PONTE TRAJE no suma, sustituye' },
        { de: deltaDef + ' DEF · ft-green', a: 'DEF = ' + def + ' · ft-ability', motivo: 'ídem' },
    ],
});

const escenarios = [
    {
        // La Pasiva: 2 de Vida al inicio de SU turno, y nunca por encima del máximo.
        nombre: 'REINA DEL COSPLAY cura 2 al inicio del turno propio',
        turno: 2, turnoDe: 'p2', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Silhouette', vida: 3 }] },
        p2: { vanguardia: ['Mini-tigre'] },
        ...NOMBRE,
        pasos: [ { finTurno: true } ],   // pasa a p1: su inicio de turno
    },
    {
        // Herida de 1: se cura solo esa 1, no las 2 enteras.
        nombre: 'REINA DEL COSPLAY no cura por encima del máximo',
        turno: 2, turnoDe: 'p2', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Silhouette', vida: 6 }] },
        p2: { vanguardia: ['Mini-tigre'] },
        ...NOMBRE,
        pasos: [ { finTurno: true } ],
    },
    {
        // El uso natural: copiarle los stats al enemigo más gordo del campo.
        nombre: 'PONTE TRAJE copia los stats base de un enemigo',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Silhouette', furor: 2 }] },
        p2: { vanguardia: ['Oso con armadura'] },
        ...TRAJE('Oso con armadura', 'Oso con armadura [1] de J2 (Jugador 2)', 2, 5, '+1', '+4'),
        pasos: [
            { habilidad: 'Silhouette' }, { confirmar: true },
            { elegir: ['Oso con armadura'] },
        ],
    },
    {
        // Y vale igual sobre los tuyos (de ahí el `de: "TODOS"`).
        nombre: 'PONTE TRAJE copia los stats base de un aliado',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Silhouette', furor: 2 }, 'Karlos'] },
        p2: { vanguardia: ['Mini-tigre'] },
        ...TRAJE('Karlos', 'Karlos de J1 (Jugador 1)', 5, 6, '+4', '+5'),
        pasos: [
            { habilidad: 'Silhouette' }, { confirmar: true },
            { elegir: ['Karlos'] },
        ],
    },
    {
        // EL TRAJE NO SE CAE: updatePassives resetea los stats a los de plantilla en cada pasada,
        // así que la copia tiene que reaplicarse sola. Pasar un turno entero fuerza unas cuantas.
        nombre: 'PONTE TRAJE aguanta puesto turnos después',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Silhouette', furor: 2 }] },
        p2: { vanguardia: ['Oso con armadura'] },
        ...TRAJE('Oso con armadura', 'Oso con armadura [1] de J2 (Jugador 2)', 2, 5, '+1', '+4'),
        pasos: [
            { habilidad: 'Silhouette' }, { confirmar: true },
            { elegir: ['Oso con armadura'] },
            { finTurno: true }, { finTurno: true },
        ],
    },
    {
        // Cancelar la elección no cuesta NADA: sin elegido no hay nada mutado todavía.
        nombre: 'PONTE TRAJE: cancelar no cuesta Furor ni la acción',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Silhouette', furor: 2 }] },
        p2: { vanguardia: ['Oso con armadura'] },
        // La vieja no abre una elección del DSL: se queda en su propia selección de objetivos,
        // así que el paso es solo para la nueva. Lo que importa es el estado final, y ahí las dos
        // coinciden: nadie ha pagado Furor ni ha gastado la acción.
        diferenciasEsperadas: [
            { contiene: 'pendingAbilityTarget', motivo: 'la vieja deja su selección de objetivos abierta; la nueva la ha cancelado' },
        ],
        pasos: [
            { habilidad: 'Silhouette' }, { confirmar: true },
            { soloEn: 'nueva', cancelar: true },
        ],
    },
    {
        // El requisito de colocación: sin 'Una buena razón' en NINGÚN campo, no se coloca.
        nombre: 'Silhouette no se coloca sin Una buena razón',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: ['Mini-tigre'], mano: ['Silhouette'] },
        p2: { vanguardia: ['Mini-tigre'] },
        logsSoloVieja: [
            { linea: 'No puedes colocar a Silhouette', motivo: 'el aviso pasa al canal privado (logError): es una instrucción para quien lo intenta, no algo que deba ver el rival — norma ya aplicada al resto de requisitos migrados' },
        ],
        pasos: [ { jugar: 'Silhouette' } ],
    },
];

correrSuite('regresion71', escenarios);
