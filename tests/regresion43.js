// tests/regresion43.js — Megalimo migrado al DSL (30-jul-2026): ABRAZO PERTURBADOR.
//
// Mismo esqueleto que Limo crecido/ABRAZO VISCOSO (regresion42), con bonoAtq:4 y el
// filtro anti-sigilo que esta carta SÍ llevaba en su propio canActivateAbility (a
// diferencia de Limo crecido, que no lo llevaba).
//
// Bug real corregido, no replicado: la vieja hacía "card.currentAtk += 4;
// performAttack(...); card.currentAtk -= 4;" — mismo patrón ya documentado en
// Hiposaurio/Hawke/Guardia (regresion28/29/36). performAttack llama a
// updatePassives() por dentro, que resetea currentAtk a la base ANTES del "-= 4" a
// mano, así que el bono se restaba DOS VECES y Megalimo se quedaba con Atq por
// debajo de su base hasta la siguiente pasada natural. El op ATACAR con bonoAtq usa
// game.updatePassives() (recompute completo), así que siempre acaba en la base
// correcta.
//
// Se queda imperativo: onBeforePlayAsync (evolución desde Limo crecido, hereda
// stats) y getCustomActions (botón de consumir Furor para curar).

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'ABRAZO PERTURBADOR: golpe con +4 Atq, confunde y Atq vuelve a su base (bug de doble resta corregido)',
        p1: { vanguardia: [{ carta: 'Megalimo', furor: 3 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 10 }] },
        pasos: [ { habilidad: 'Megalimo' }, { confirmar: true }, { elegir: ['Mini-tigre'] } ],
        logsIntencionados: [
            { de: '¡La inmensa viscosidad satura los sentidos de Mini-tigre!', a: '¡La inmensa viscosidad satura los sentidos de Mini-tigre [1] de J2 (Jugador 2)!',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
        diferenciasEsperadas: [
            { contiene: 'estado.p1.vanguard.0.currentAtk',
              motivo: 'bug de la vieja (resta el bono dos veces tras el ataque, ver comentario arriba); la nueva devuelve correctamente el Atq a su base (2) en vez de dejarlo en -2' },
            { contiene: 'status.confusion.sourceAbility', motivo: 'APLICAR_ESTADO deja la Habilidad; la vieja llamaba a applyStatus sin ese argumento' },
            { contiene: 'status.confusion.source', motivo: 'la vieja pasaba card.name (string) como fuente a applyStatus; APLICAR_ESTADO usa por defecto la carta completa, mismo criterio que Limo artificial/Investigador demente (regresion32)' },
        ],
    },
    {
        nombre: 'ABRAZO PERTURBADOR: golpe letal no confunde (op ATACAR ya lo garantiza)',
        p1: { vanguardia: [{ carta: 'Megalimo', furor: 3 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 1 }] },
        pasos: [ { habilidad: 'Megalimo' }, { confirmar: true }, { elegir: ['Mini-tigre'] } ],
        diferenciasEsperadas: [
            { contiene: 'estado.p1.vanguard.0.currentAtk',
              motivo: 'mismo bug de doble resta que el escenario anterior; se manifiesta también cuando el objetivo muere' },
        ],
    },
    {
        nombre: 'ABRAZO PERTURBADOR rechazado: solo hay un enemigo Oculto en vanguardia',
        p1: { vanguardia: [{ carta: 'Megalimo', furor: 3 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', campos: { stealth: true } }] },
        pasos: [ { habilidad: 'Megalimo' } ],
    },
    {
        nombre: 'ABRAZO PERTURBADOR rechazado: sin enemigos en vanguardia',
        p1: { vanguardia: [{ carta: 'Megalimo', furor: 3 }] },
        p2: { retaguardia: ['Mini-tigre'] },
        pasos: [ { habilidad: 'Megalimo' } ],
    },
];

correrSuite('regresion43', escenarios);
