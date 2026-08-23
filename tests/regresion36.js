// tests/regresion36.js — Guardia (FUEGO A DISCRECIÓN) migrada al DSL (30-jul-2026).
//
// MONEDA envolviendo un ELEGIR+ATACAR, mismo esqueleto que Investigador demente
// (regresion32): cara -> elige objetivo (excluyendo Ocultos) y ataca con +2 Atq;
// cruz -> falla sin pedir objetivo.
//
// Bug real corregido, no replicado: la vieja hacía "card.currentAtk += 2;
// performAttack(...); card.currentAtk -= 2;" — el mismo patrón ya documentado en
// Hiposaurio/Hawke (regresion28/29). performAttack llama a updatePassives()
// internamente, que resetea currentAtk a la base ANTES del "-= 2" a mano, así que
// el bono se restaba DOS VECES y Guardia se quedaba con Atq por debajo de su base
// hasta la siguiente pasada natural. El op ATACAR con bonoAtq usa
// game.updatePassives() (recompute completo), así que siempre acaba en la base
// correcta.
//
// Diferencias intencionadas: se cae el log "<Guardia> activa FUEGO A DISCRECIÓN."
// previo a la moneda — redundante con el floater del nombre de la Activa, mismo
// criterio ya aplicado a Aniceto/Investigador demente. Y, en la rama de éxito, los
// dos avisos de sistema del camino RAW de selección de objetivos de la vieja
// (mismo mecanismo documentado en regresion33 para Gólem de tierra) no tienen
// equivalente en el ELEGIR de la nueva.

'use strict';
const { correrSuite } = require('./harness');

const LOG_ACTIVA_VIEJA = { linea: 'activa FUEGO A DISCRECIÓN.',
    motivo: 'la vieja anunciaba la activación con un log propio antes de la moneda; la nueva se apoya solo en el floater del nombre de la Activa (mismo criterio que Aniceto/Investigador demente)' };
// El aviso genérico de "Objetivos listos" ya no entra en el historial compartido (23-ago-2026):
// es una instrucción para quien elige, así que va por el canal privado (logError) y no hay nada
// que declarar en ninguna de las dos bases.

const escenarios = [
    {
        nombre: 'FUEGO A DISCRECIÓN: cara — elige objetivo y ataca con +2 Atq',
        monedas: ['cara'],
        p1: { vanguardia: [{ carta: 'Guardia', furor: 1 }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { habilidad: 'Guardia' },
            { confirmar: true },
            { elegir: ['Mini-tigre'] },
        ],
        logsSoloVieja: [ LOG_ACTIVA_VIEJA ],
    },
    {
        nombre: 'FUEGO A DISCRECIÓN: cruz — falla sin pedir objetivo',
        monedas: ['cruz'],
        p1: { vanguardia: [{ carta: 'Guardia', furor: 1 }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { habilidad: 'Guardia' },
            { confirmar: true },
        ],
        logsSoloVieja: [ LOG_ACTIVA_VIEJA ],
    },
    {
        nombre: 'FUEGO A DISCRECIÓN rechazado: solo hay un enemigo Oculto en vanguardia',
        p1: { vanguardia: [{ carta: 'Guardia', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', campos: { stealth: true } }] },
        pasos: [ { habilidad: 'Guardia' } ],
    },
    {
        nombre: 'FUEGO A DISCRECIÓN: cara ignora al enemigo Oculto (no es seleccionable)',
        monedas: ['cara'],
        p1: { vanguardia: [{ carta: 'Guardia', furor: 1 }] },
        p2: { vanguardia: ['Mini-tigre', { carta: 'Robot de seguridad SP', campos: { stealth: true } }] },
        pasos: [
            { habilidad: 'Guardia' },
            { confirmar: true },
            { elegir: ['Mini-tigre'] },
        ],
        logsSoloVieja: [ LOG_ACTIVA_VIEJA ],
    },
];

correrSuite('regresion36', escenarios);
