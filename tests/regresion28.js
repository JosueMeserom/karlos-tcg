// tests/regresion28.js — Tanda de volumen (27-jul-2026, Sonnet): Hiposaurio, Gul guerrero,
// Hechicero y Ángel migrados a DSL sobre patrones ya existentes del compilador.
//
// Piezas nuevas del intérprete en esta tanda:
//   · `especial: true` en el op ATACAR: fórmula de ataque especial (Atq-Def, suelo 0.5/1
//     para Esbirro-vs-Personaje) reutilizable — antes duplicada a mano en >12 sitios.
//     Comprueba `onBeforeDefend` (esquiva), a diferencia del código a mano de Hechicero
//     (ver bug corregido más abajo).
//   · `logSiAplicado` en AL_JUGAR (ya existía solo en AL_CADUCAR): anuncia un log SOLO si
//     algún efecto de verdad hizo algo (p. ej. un CURAR en grupo con soloSiHerido).
//
// Diferencias intencionadas:
//   · Gul guerrero (SANGRE MALDITA): el log de "la sangre maldita infecta a X" pasa de
//     target.name a secas al {objetivo} con DSL._nombre (formato "de JX (Nick)"), y
//     APLICAR_ESTADO atribuye la fuente a la carta completa (antes solo pasaba card.name
//     como string a applyStatus, así que "Afectado por:" mostraba la fuente sin dueño).
//   · Hechicero (CHIRIBITA): CORRECCIÓN de un bug real de la vieja, no una migración 1:1.
//     La vieja no comprobaba onBeforeDefend antes de golpear (a diferencia de Karolina o
//     Raiju, que sí lo hacen en su propio ataque especial) — un objetivo con esquiva
//     (p. ej. Águila) no podía usarla contra CHIRIBITA. El op genérico SÍ la comprueba.

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        // BUG de la vieja encontrado y corregido (no replicado): performAttack ya llama a
        // updatePassives() internamente (varias veces, durante la resolución del combate), que
        // resetea currentAtk a la base de plantilla ANTES de que el código a mano llegue a su
        // propio "card.currentAtk -= 2" tras el ataque — así que ese -2 se resta DOS VECES (una
        // por el reseteo interno, otra a mano) y Hiposaurio se queda con 0 de Atq hasta la
        // siguiente pasada natural. La nueva usa game.updatePassives() (recompute completo) en
        // vez de restar a ciegas, así que siempre acaba en la base correcta.
        nombre: 'Hiposaurio: CABREO (ataque normal + 2 Atq)',
        p1: { vanguardia: [{ carta: 'Hiposaurio', furor: 3 }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { habilidad: 'Hiposaurio' }, { confirmar: true }, { elegir: ['Mini-tigre'] } ],
        diferenciasEsperadas: [
            { contiene: 'estado.p1.vanguard.0.currentAtk',
              motivo: 'bug de la vieja (resta el bono dos veces tras el ataque, ver comentario arriba); la nueva devuelve correctamente el Atq a su base (2) en vez de dejarlo en 0' },
        ],
    },
    {
        nombre: 'Hiposaurio: CABREO rechazada sin Furor suficiente',
        p1: { vanguardia: [{ carta: 'Hiposaurio', furor: 2 }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { habilidad: 'Hiposaurio' } ],
    },
    {
        nombre: 'Gul guerrero: SANGRE MALDITA con éxito aplica Daño por tiempo',
        p1: { vanguardia: [{ carta: 'Gul guerrero', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 3 }] },
        pasos: [ { habilidad: 'Gul guerrero' }, { confirmar: true }, { elegir: ['Mini-tigre'] } ],
        logsIntencionados: [
            { de: 'La sangre maldita infecta a Mini-tigre.',
              a: 'La sangre maldita infecta a Mini-tigre [1] de J2 (Jugador 2).',
              motivo: 'la vieja usaba target.name a secas; la nueva rellena {objetivo} con DSL._nombre (formato "de JX")' },
        ],
        diferenciasEsperadas: [
            { contiene: 'estado.p2.vanguard.0.status.dot.source',
              motivo: 'la vieja pasaba card.name (string, sin dueño) como fuente a applyStatus; APLICAR_ESTADO usa por defecto la carta completa, así que la fuente queda con el formato estándar "de JX (Nick)"' },
        ],
    },
    {
        nombre: 'Gul guerrero: SANGRE MALDITA letal no aplica Daño por tiempo (el objetivo muere)',
        p1: { vanguardia: [{ carta: 'Gul guerrero', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 1 }] },
        pasos: [ { habilidad: 'Gul guerrero' }, { confirmar: true }, { elegir: ['Mini-tigre'] } ],
    },
    {
        nombre: 'Hechicero: CHIRIBITA (ataque especial + 1 Atq)',
        p1: { vanguardia: [{ carta: 'Hechicero', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Robot de seguridad SP', vida: 4 }] },
        pasos: [ { habilidad: 'Hechicero' }, { confirmar: true }, { elegir: ['Robot de seguridad SP'] } ],
    },
    {
        nombre: 'Hechicero: CHIRIBITA rechazada sin enemigos en vanguardia',
        p1: { vanguardia: [{ carta: 'Hechicero', furor: 1 }] },
        p2: { retaguardia: ['Mini-tigre'] },
        pasos: [ { habilidad: 'Hechicero' } ],
    },
    {
        // Betasteo de Toto (28-jul-2026): Águila solo esquiva "ante ataques normales" (así lo
        // dice su propio texto) — un ataque especial nunca debió poder ser esquivado.
        // onBeforeDefend ahora recibe un 5º parámetro `isSpecial`; Águila lo comprueba y
        // declina la esquiva EN SILENCIO (sin log, sin flotante, sin moneda) cuando es true.
        // La vieja (base congelada) nunca llegó a llamar a onBeforeDefend en su ataque especial
        // (el primer bug, ya documentado en el escenario "CHIRIBITA (ataque especial + 1 Atq)"
        // de esta misma suite) — así que el resultado NETO es idéntico en ambas bases: Águila
        // siempre recibe el golpe, sin ningún log de su Pasiva de por medio.
        nombre: 'Hechicero: CHIRIBITA contra Águila — nunca esquiva un ataque especial',
        p1: { vanguardia: [{ carta: 'Hechicero', furor: 1 }] },
        p2: { vanguardia: ['Águila'] },
        pasos: [ { habilidad: 'Hechicero' }, { confirmar: true }, { elegir: ['Águila'] } ],
    },
    {
        nombre: 'Ángel: PRODIGIO cura 1 a la vanguardia dañada al colocarse',
        p1: { vanguardia: [{ carta: 'Mini-tigre', vida: 1 }, 'Oso con armadura'], mano: ['Ángel'] },
        pasos: [ { jugar: 'Ángel' }, { elegir: ['Mini-tigre'] } ], // tributoFuror: paga con Mini-tigre
        logsIntencionados: [
            { de: '¡La luz del Ángel sana a la vanguardia!', a: '¡La luz del Ángel sana a la vanguardia!', motivo: 'sin cambios (control de que el log sigue disparándose)' },
        ],
    },
    {
        nombre: 'Ángel: PRODIGIO no anuncia nada si la vanguardia ya está a tope',
        p1: { vanguardia: ['Oso con armadura', { carta: 'Mini-tigre', furor: 2 }], mano: ['Ángel'] },
        pasos: [ { jugar: 'Ángel' }, { elegir: ['Mini-tigre'] } ],
    },
];

correrSuite('regresion28', escenarios);
