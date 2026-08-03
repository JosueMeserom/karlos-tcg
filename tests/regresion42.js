// tests/regresion42.js — Limo crecido migrado al DSL (30-jul-2026): ABRAZO VISCOSO.
//
// Mismo esqueleto que Aniceto/Guardia: ATACAR normal (sin especial, ataqueNormal:true,
// performAttack) + APLICAR_ESTADO en siExito (el propio op ya garantiza éxito no letal:
// currentHp < startHp && currentHp > 0). A diferencia de Limo artificial (regresion32),
// aquí NO hay moneda intermedia: la Confusión se aplica directa si el golpe conecta.
// La vieja NO excluye Ocultos en su propio canActivateAbility (a diferencia de
// Agah/Garret/Megalimo, que sí lo hacen) — así que la migración tampoco lo hace en sus
// requisitos: fidelidad, no generalización del patrón. Comprobado además (motor,
// index.html ~5649/~8162): el CLIC de objetivo para cualquier Activa con
// isNormalAttack SIEMPRE bloquea a un Oculto, sea cual sea la carta — así que con un
// único enemigo Oculto en vanguardia, ambas bases dejan la Activa "activable pero
// imposible de completar" (bug compartido y preexistente, no introducido ni corregido
// por la migración).
//
// Se queda imperativo: canPlayCard/onBeforePlayAsync (modal de evolución desde Limo
// artificial, isEvolution).

'use strict';
const { correrSuite } = require('./harness');

// Águila (PSEUDO-PREVASIÓN) migrada al DSL el 31-jul-2026 (ver regresion53): su log de esquiva
// nombraba al ATACANTE a secas (`attacker.name`); ahora usa DSL._nombre, como manda la norma de
// logs en 3ª persona con dueño. Afecta a toda suite donde alguien ataca a Águila y falla.
const ESQUIVA_NOMBRE_ATACANTE = (plano, conDueno) => ({
    de: `ESQUIVÓ el ataque de ${plano}!`, a: `ESQUIVÓ el ataque de ${conDueno}!`,
    motivo: 'norma del proyecto (logs en 3ª persona con dueño): la Águila vieja usaba attacker.name a secas; la migrada rellena {objetivo} con DSL._nombre',
});

const escenarios = [
    {
        nombre: 'ABRAZO VISCOSO: golpe con éxito confunde al objetivo',
        p1: { vanguardia: [{ carta: 'Limo crecido', furor: 2 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 5 }] },
        pasos: [ { habilidad: 'Limo crecido' }, { confirmar: true }, { elegir: ['Mini-tigre'] } ],
        logsIntencionados: [
            { de: '¡El líquido envuelve a Mini-tigre!', a: '¡El líquido envuelve a Mini-tigre [1] de J2 (Jugador 2)!',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
        diferenciasEsperadas: [
            { contiene: 'status.confusion.sourceAbility', motivo: 'APLICAR_ESTADO deja la Habilidad; la vieja llamaba a applyStatus sin ese argumento' },
            { contiene: 'status.confusion.source', motivo: 'la vieja pasaba card.name (string) como fuente a applyStatus; APLICAR_ESTADO usa por defecto la carta completa, mismo criterio que Limo artificial/Investigador demente (regresion32)' },
        ],
    },
    {
        nombre: 'ABRAZO VISCOSO: golpe esquivado (Águila) — sin daño, sin Confusión',
        p1: { vanguardia: [{ carta: 'Limo crecido', furor: 2 }] },
        p2: { vanguardia: ['Águila'] },
        monedas: ['cara'], // única moneda del escenario: la esquiva de PSEUDO-PREVASIÓN
        logsIntencionados: [ ESQUIVA_NOMBRE_ATACANTE('Limo crecido', 'Limo crecido [1] de J1 (Jugador 1)') ],
        pasos: [ { habilidad: 'Limo crecido' }, { confirmar: true }, { elegir: ['Águila'] } ],
    },
    {
        nombre: 'ABRAZO VISCOSO: golpe letal no confunde (op ATACAR ya lo garantiza)',
        p1: { vanguardia: [{ carta: 'Limo crecido', furor: 2 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 1 }] },
        pasos: [ { habilidad: 'Limo crecido' }, { confirmar: true }, { elegir: ['Mini-tigre'] } ],
    },
    {
        // Old no filtra Ocultos en su canActivateAbility -> se activa igual, pero el
        // clic de objetivo lo bloquea el motor genéricamente (isNormalAttack): la
        // Activa se queda "activable pero sin objetivo completable" en AMBAS bases.
        // No es un fallo de la migración: es un bug compartido, preexistente, fiel.
        nombre: 'ABRAZO VISCOSO con único enemigo Oculto: se activa en ambas, pero el clic de objetivo lo bloquea el motor (bug compartido, fiel a la vieja)',
        p1: { vanguardia: [{ carta: 'Limo crecido', furor: 2 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 5, campos: { stealth: true } }] },
        pasos: [ { habilidad: 'Limo crecido' }, { confirmar: true }, { elegir: ['Mini-tigre'] } ],
    },
    {
        nombre: 'ABRAZO VISCOSO rechazado: sin enemigos en vanguardia',
        p1: { vanguardia: [{ carta: 'Limo crecido', furor: 2 }] },
        p2: { retaguardia: ['Mini-tigre'] },
        pasos: [ { habilidad: 'Limo crecido' } ],
    },
];

correrSuite('regresion42', escenarios);
