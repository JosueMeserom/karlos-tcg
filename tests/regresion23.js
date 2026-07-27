// tests/regresion23.js — Tanda PASIVA_CONTINUA: primeras cartas REALES que usan
// este trigger (antes solo lo ejercitaban las 2 cartas "de prueba" del propio
// intérprete). Migra pasivas de umbral propio (self hp/status/campo -> delta de
// Atq/Def), un archetipo distinto de AURA (que es un FOCO marcando a OTRAS
// cartas del tablero): Karlos, Karlos (KL), Zoe, Spencer.
//
// Piezas nuevas del intérprete en esta tanda:
//   · DSL._field gana el campo computado "dotActivo" (¿Daño por Tiempo activo?).
//   · DSL._value ahora pasa strings/booleanos literales tal cual (antes solo
//     números/COUNT/REF; cualquier otra cosa caía a 0) — lo necesita la rama
//     ATAQUE/DEFENSA/VIDA de Spencer, comparando campo:"pajaritaStance" contra
//     un valor de texto. Repasado: no había ningún uso previo de DSL._value con
//     un string, así que ampliar el fallback no cambia ninguna carta ya migrada
//     (confirmado con la pasada estricta completa).
//   · PASIVA_CONTINUA gana el flag `silencioso` (sin log ni floating; solo
//     aplica el delta) para las pasivas que en la vieja nunca se anunciaban
//     (Karlos (KL), Spencer) — a diferencia de Karlos/Zoe, que sí lo hacen.
//
// Diferencia de log intencionada y documentada: el anuncio de activación
// genérico de PASIVA_CONTINUA no incluye la cláusula de motivo que Karlos
// llevaba a mano ("por tener Vida <= 3"); el resto del mensaje (nombre de la
// pasiva, delta) es idéntico. La desactivación SÍ es idéntica palabra por
// palabra en ambas bases.
//
// BUG DE MOTOR encontrado en la Zoe VIEJA (no introducido por esta migración,
// preexistente): su onUpdatePassive solo sumaba el +2 Def en la transición
// inactivo->activo, guardado tras un flag; pero currentDef se resetea a la
// plantilla en CADA pasada de updatePassives, así que si esa función se llama
// más de una vez mientras el DoT sigue activo sin cambiar de estado, el +2 se
// pierde (el flag ya está a true, así que el guard bloquea reaplicarlo) aunque
// la carta siga "marcada" como activa. Karlos NO tiene este bug porque su
// código viejo reaplica el delta en CADA pasada, fuera del guard del anuncio
// (el guard solo decide si anunciar, no si aplicar). PASIVA_CONTINUA sigue el
// patrón de Karlos (reaplica siempre) para TODAS las cartas migradas, así que
// la nueva Zoe no reproduce el bug: es más correcta que la vieja. Por eso esta
// suite solo cubre el caso estático (activo/inactivo en el setup); la
// transición vía finTurno expondría esa divergencia real y no se prueba aquí.

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'Karlos: MEGADRENALINA se activa al bajar a Vida<=3 (ataque de Garret) y se desactiva al curarse',
        turnoDe: 'p2',
        p1: { vanguardia: ['Karlos'], mano: ['Manzanahoria'] },
        p2: { vanguardia: ['Garret'] },
        pasos: [
            { atacar: 'Garret', objetivo: 'Karlos' }, // dmg = 9-6 = 3 -> Vida 6->3: activa (+2 Atq)
            { finTurno: true },
            { jugar: 'Manzanahoria' },
            { seleccionar: 'Karlos' }, // cura 2 -> Vida 3->5: desactiva
        ],
        logsIntencionados: [
            { de: '¡Habilidad pasiva de Karlos de J1 (Jugador 1): MEGADRENALINA tiene lugar! (+2 de Atq por tener Vida <= 3)',
              a: '¡Habilidad pasiva de Karlos de J1 (Jugador 1): MEGADRENALINA tiene lugar! (+2 de Atq)',
              motivo: 'PASIVA_CONTINUA (motor) anuncia con un mensaje genérico (nombre + delta) que no incluye la cláusula de motivo que Karlos redactaba a mano ("por tener Vida <= 3"); la desactivación es idéntica en ambas.' },
        ],
    },
    {
        // Toto (23-jul-2026): la vieja Karlos (KL) nunca anunciaba su pasiva (asimetría sin
        // motivo respecto a Karlos, MISMA pasiva); a petición suya, la nueva SÍ la anuncia,
        // igual que Karlos. Cambio de comportamiento deliberado, no un artefacto de migración
        // -> logsSoloNueva (dos líneas nuevas: activación y desactivación).
        nombre: 'Karlos (KL): DAME TRABAJOS ahora SÍ se anuncia (igual que Karlos), a petición de Toto',
        turnoDe: 'p2',
        p1: { vanguardia: [{ carta: 'Karlos (KL)', vida: 5 }], mano: ['Manzanahoria'] },
        p2: { vanguardia: ['Garret'] },
        pasos: [
            { atacar: 'Garret', objetivo: 'Karlos (KL)' }, // dmg = 9-7 = 2 -> Vida 5->3: activa (+2 Atq), CON anuncio
            { finTurno: true },
            { jugar: 'Manzanahoria' },
            { seleccionar: 'Karlos (KL)' }, // cura 2 -> Vida 3->5: desactiva, CON anuncio
        ],
        logsIntencionados: [],
        logsSoloNueva: [
            { linea: 'Habilidad pasiva de Karlos (KL)', motivo: 'la vieja nunca anunciaba esta pasiva; a petición de Toto la nueva sí, igual que Karlos (base) con el mismo umbral' },
            { linea: 'DAME TRABAJOS', motivo: 'log de desactivación, nuevo a petición de Toto (mismo patrón que la desactivación de MEGADRENALINA en Karlos)' },
        ],
        flotantesSoloNueva: [
            { linea: '· DAME TRABAJOS · ft-ability', motivo: 'flotante del nombre de la pasiva al activarse, nuevo a petición de Toto' },
            { linea: '· +2 ATQ · ft-green', motivo: 'flotante del delta al activarse, nuevo a petición de Toto' },
        ],
    },
    {
        // Solo el caso ESTÁTICO (activación en el setup, sin pasos posteriores):
        // la vieja tiene un bug latente (no relacionado con esta migración, ver
        // cabecera del archivo) por el que el +2 Def desaparece si updatePassives
        // se llama más de una vez mientras el DoT sigue activo sin cambiar de
        // estado (el guard `!zoeDefBuffActive` bloquea reaplicar el delta tras el
        // reseteo de currentDef a base en cada pasada). PASIVA_CONTINUA reaplica
        // el delta en CADA pasada -mismo patrón que ya usaba Karlos-, así que no
        // reproduce ese bug. Probar aquí la transición vía finTurno expondría esa
        // divergencia real (no cosmética); se deja fuera adrede.
        nombre: 'Zoe: JUSTICIERA ARDIENTE (+2 Def) activa mientras tenga Daño por Tiempo',
        p1: { vanguardia: [{ carta: 'Zoe', estado: { dot: { duration: 1 } } }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [],
        logsIntencionados: [],
    },
    {
        nombre: 'Zoe: JUSTICIERA ARDIENTE inactiva sin Daño por Tiempo',
        p1: { vanguardia: ['Zoe'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [],
        logsIntencionados: [],
    },
    {
        nombre: 'Spencer: pajarita en DEFENSA (+3 Def/-1 Atq)',
        p1: { vanguardia: [{ carta: 'Spencer', campos: { pajaritaStance: 'DEFENSA' } }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [],
        logsIntencionados: [],
    },
    {
        nombre: 'Spencer: pajarita en ATAQUE (+3 Atq/-1 Def)',
        p1: { vanguardia: [{ carta: 'Spencer', campos: { pajaritaStance: 'ATAQUE' } }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [],
        logsIntencionados: [],
    },
    {
        nombre: 'Spencer: pajarita en VIDA (-1 Def/-1 Atq)',
        p1: { vanguardia: [{ carta: 'Spencer', campos: { pajaritaStance: 'VIDA' } }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [],
        logsIntencionados: [],
    },
];

correrSuite('regresion23', escenarios);
