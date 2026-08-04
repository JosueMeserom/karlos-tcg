// tests/regresion60.js — SABIDURÍA de Wolfgang: bug REAL de una carta viva, arreglado al
// migrar solo esa Pasiva (31-jul-2026, betasteo de Toto).
//
// EL BUG. La versión imperativa hacía `c.currentAtk += 1; c.currentDef += 1` directamente sobre
// los aliados de vanguardia. Eso NO sobrevive: `updatePassives` resetea currentAtk/currentDef a
// los valores de plantilla en CADA pasada, y esa función corre constantemente (cada ataque, cada
// carta jugada, cada cambio de turno). O sea que el "+1 Def y Atq a vanguardia aliada" que
// promete el texto duraba hasta el siguiente recálculo -segundos de partida- en vez de quedarse.
// Comprobado con probe antes de tocar nada: Mini-tigre 2/3 -> 3/4 al colocar a Wolfgang -> 2/3
// otra vez tras un único updatePassives.
//
// EL ARREGLO es el patrón de Domador: `MARCAR_TEMPORAL` con `stats` y SIN ninguna marca de
// caducidad. El compilador wire un onUpdateTempEffect genérico que reaplica el bono en cada
// pasada, que es la ÚNICA forma que tiene este motor de que un bono de Atq/Def persista: los
// dos únicos mecanismos que sobreviven al reseteo son este y el acumulador propio + Pasiva que
// lo lee (Karolina). Un `+=` suelto está condenado por construcción.
//
// Por eso esta suite compara con la base vieja SABIENDO que van a divergir: es justo la prueba
// de que el bono ahora se queda. Las diferencias declaradas son la esencia del arreglo, no ruido.
//
// El resto de Wolfgang (el requisito de Aniceto/Manzanahoria y TENTAR A LA SUERTE) sigue
// imperativo: aquí solo se ha tocado la Pasiva rota.

'use strict';
const { correrSuite } = require('./harness');

// Aniceto en campo cumple el requisito de colocación de Wolfgang sin gastar la Manzanahoria.
const CON_ANICETO = ['Aniceto'];

// La marca es nueva de la base migrada: la vieja no dejaba nada, solo tocaba los stats a pelo.
// Con DOS o más aliados en vanguardia, los flotantes salen en distinto ORDEN (mismo contenido):
// la vieja recorre aliado a aliado (SABIDURÍA, +1 ATQ, +1 DEF del primero; luego los del
// segundo), y la nueva resuelve efecto a efecto sobre TODO el grupo (todos los SABIDURÍA, luego
// todos los +1 ATQ...). Es la misma diferencia ya documentada en Cogorza (regresion54): se
// retira como PAR, declarando cada texto en los dos lados para que se cancelen.
const FLOTANTES_REORDENADOS = {
    flotantesSoloVieja: [
        { linea: 'SABIDURÍA', motivo: 'orden vieja: los tres flotantes de un aliado antes de pasar al siguiente' },
        { linea: '+1 ATQ', motivo: 'ídem' },
        { linea: '+1 DEF', motivo: 'ídem' },
    ],
    flotantesSoloNueva: [
        { linea: 'SABIDURÍA', motivo: 'orden nueva: el mismo efecto sobre todo el grupo antes de pasar al siguiente efecto' },
        { linea: '+1 ATQ', motivo: 'ídem' },
        { linea: '+1 DEF', motivo: 'ídem' },
    ],
};

const MARCA_NUEVA = [
    { contiene: 'tempEffects', motivo: 'la nueva deja una marca con `stats` (patrón de Domador), que es lo que hace que el bono sobreviva a updatePassives; la vieja no dejaba nada' },
];

const escenarios = [
    {
        // El escenario que demuestra el bug: tras colocar a Wolfgang, cualquier cosa que provoque
        // un recálculo (aquí, pasar turno) borraba el bono en la vieja. En la nueva se queda.
        nombre: 'SABIDURÍA: el +1/+1 a la vanguardia SOBREVIVE al recálculo (bug corregido)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [...CON_ANICETO, 'Mini-tigre'], mano: ['Wolfgang'] },
        p2: {},
        pasos: [
            { jugar: 'Wolfgang' },
            { finTurno: true }, { finTurno: true }, // fuerza recálculos: aquí moría el bono
        ],
        ...FLOTANTES_REORDENADOS,
        diferenciasEsperadas: [
            ...MARCA_NUEVA,
            { contiene: 'currentAtk', motivo: 'ESTE es el arreglo: en la vieja el +1 ATQ se evaporaba en el primer updatePassives; en la nueva se mantiene' },
            { contiene: 'currentDef', motivo: 'ídem con el +1 DEF' },
        ],
    },
    {
        // Sin pasar turno, la vieja también acaba perdiéndolo (updatePassives corre por su cuenta),
        // pero este escenario fija el momento JUSTO de la colocación: ahí las dos coinciden en
        // stats y solo difieren en el mecanismo (la marca).
        nombre: 'SABIDURÍA: al colocarse, ambas bases aplican el mismo +1/+1',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [...CON_ANICETO, 'Mini-tigre'], mano: ['Wolfgang'] },
        p2: {},
        pasos: [ { jugar: 'Wolfgang' } ],
        ...FLOTANTES_REORDENADOS,
        diferenciasEsperadas: MARCA_NUEVA,
    },
    {
        // Wolfgang NO se inspira a sí misma ("a vanguardia aliada", y la vieja excluía su propio
        // instanceId): con ella sola en vanguardia no debe pasar nada.
        nombre: 'SABIDURÍA no se aplica a la propia Wolfgang',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: CON_ANICETO, mano: ['Wolfgang'] },
        p2: {},
        pasos: [ { jugar: 'Wolfgang' } ],
        diferenciasEsperadas: MARCA_NUEVA, // Aniceto sí la recibe; Wolfgang no
    },
    {
        nombre: 'Wolfgang rechazada: ni Aniceto en el campo ni Manzanahoria en la mano',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: ['Mini-tigre'], mano: ['Wolfgang'] },
        p2: {},
        pasos: [ { jugar: 'Wolfgang' } ],
    },
];

correrSuite('regresion60', escenarios);
