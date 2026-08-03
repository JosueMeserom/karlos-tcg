// tests/regresion57.js — Súper Evolución migrada al DSL (31-jul-2026).
//
// Primera de la tanda de "equipos con vida propia" (las otras dos, Poder Legado y Milkor MGL,
// comparten sus piezas). Tres nuevas, todas reutilizables:
//   · `mientrasEquipado: {superStats:true}` — el bono NO es un delta fijo sino la diferencia
//     entre los `superStats` de la plantilla DEL PORTADOR y su base, así que el `{atk:N,def:N}`
//     de siempre no podía expresarlo (cada portador evoluciona a los suyos). De paso fija maxHp
//     y cura, que es el "restaurando Vida" del texto, de forma idempotente.
//   · `cuentaAtras` en MARCAR_TEMPORAL — la marca baja 1 por cada turno propio del PORTADOR y,
//     al llegar a 0, dispara efectos. Hasta ahora `duracion` solo ETIQUETABA la marca y
//     decrementar era cosa del onStartTurnTempEffect imperativo de cada carta (Poción
//     revitalizante lo sigue haciendo así). El turno en que se coloca no cuenta.
//   · Op `DESEQUIPAR` (con `restaurarStats` y `limpiarEstados`) — el final de vida de un equipo:
//     lo suelta del portador, lo manda al descarte y devuelve la Vida máxima de plantilla.
//     Hacía falta un op porque `maxHp`, a diferencia de currentAtk/currentDef, NO se recalcula
//     en cada updatePassives: sin restaurarlo a mano se quedaría hinchado para siempre.
//
// Se migra con AL_EQUIPAR y NO con AL_USAR_AYUDA a propósito: ese otro pipeline (executeAyuda)
// manda la carta jugada a DESCARTES aunque quede anexada -la rareza del motor documentada en
// Espada V-, y aquí eso dejaría el equipo en la pila de descartes desde el minuto uno, con lo
// que el DESEQUIPAR final no tendría nada que soltar. AL_EQUIPAR conserva el flujo onPlay
// original (mano -> equipped) y el targeting en tablero lo pone ELEGIR, que ya usa
// pickBoardTargets: de paso cierra la infracción de la norma de targeting que tenía la vieja
// (elegía al portador con el modal genérico de búsqueda visual).
//
// Bug de motor corregido de camino, NO replicado: `findCard` no miraba dentro de `equippedCards`,
// así que buscar por instanceId una Ayuda equipada devolvía null. La vieja no lo notaba porque
// se guardaba la referencia a mano en el propio tempEffect (`cardRef`/`instanceId`); el hook
// genérico sí necesita recuperarla. Arreglado en findCard, que es de donde cuelga la clase
// entera de bugs, no en un rodeo local.

'use strict';
const { correrSuite } = require('./harness');

// Karlitos es el único "Usuario de Súper Evolución" del juego (superStats 4/7/7 sobre 3/2/3).
// `karlitosEntrenado` apaga su Pasiva PRÁCTICA CONSTANTE: a los 3 turnos propios abriría su
// propio modal de búsqueda de Súper Evolución, que no tiene nada que ver con lo que se prueba
// aquí y desincronizaría el guion (los dos flujos de búsqueda difieren entre bases).
const KARLITOS = 'Karlitos';
const KARLITOS_SIN_PASIVA = { carta: KARLITOS, campos: { karlitosEntrenado: true } };
const SUPER_EVO = 1049; // por id: en la base vieja se llama "Super Evolución", sin acento

// La vieja elegía al portador con el modal genérico de búsqueda visual (openVisualSearchModal);
// la nueva usa ELEGIR -> pickBoardTargets, que es la norma del proyecto para elegir una carta que
// YA ESTÁ EN EL CAMPO. El paso {elegir} del harness es polimórfico y responde a las dos.
const TRES_TURNOS_PROPIOS = [
    { finTurno: true }, { finTurno: true }, // 1er turno propio -> tick 1
    { finTurno: true }, { finTurno: true }, // 2º  -> tick 2
    { finTurno: true }, { finTurno: true }, // 3er -> tick 3: caduca
];

const escenarios = [
    {
        nombre: 'Súper Evolución: equipa a Karlitos, sube sus stats a los de superStats y le cura',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: KARLITOS, vida: 1 }], mano: [SUPER_EVO] },
        p2: {},
        pasos: [ { jugar: SUPER_EVO }, { elegir: [KARLITOS] } ],
        logsIntencionados: [
            { de: '¡Karlitos alcanza su Súper Evolución!', a: '¡Karlitos de J1 (Jugador 1) alcanza su Súper Evolución!',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas' },
        ],
        // La marca temporal cambia de MECANISMO, no de efecto: la vieja llevaba un contador
        // propio (`count`, que subía hasta 3) y se guardaba a mano el instanceId del equipo; la
        // nueva usa la cuenta atrás genérica (`duration` bajando desde `cuentaTotal`, con
        // `turnApplied` para no gastar tick el turno en que se coloca) y recupera el equipo por
        // el `sourceInstanceId` que toda marca del DSL ya lleva.
        diferenciasEsperadas: [
            { contiene: 'tempEffects.0.count', motivo: 'la vieja contaba hacia arriba con un campo propio; la nueva cuenta hacia abajo con el mecanismo genérico' },
            { contiene: 'tempEffects.0.instanceId', motivo: 'la vieja guardaba a mano el instanceId del equipo; la nueva usa sourceInstanceId, que toda marca del DSL ya trae' },
            { contiene: 'tempEffects.0.duration', motivo: 'campo de la cuenta atrás genérica, inexistente en la vieja' },
            { contiene: 'tempEffects.0.turnApplied', motivo: 'idem: marca el turno de colocación para no gastar un tick el mismo turno' },
            { contiene: 'tempEffects.0.cuentaAtras', motivo: 'idem: el flag que enciende el mecanismo' },
            { contiene: 'tempEffects.0.cuentaTotal', motivo: 'idem: el total, para poder pintar "n/total" en el aviso de progreso' },
        ],
    },
    {
        nombre: 'Súper Evolución: limpia los estados alterados del portador al equiparse',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: KARLITOS, estado: { confusion: { duration: 3, source: 'X' } } }], mano: [SUPER_EVO] },
        p2: {},
        pasos: [ { jugar: SUPER_EVO }, { elegir: [KARLITOS] } ],
        logsIntencionados: [
            { de: '¡Karlitos alcanza su Súper Evolución!', a: '¡Karlitos de J1 (Jugador 1) alcanza su Súper Evolución!',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño)' },
        ],
        // La marca temporal cambia de MECANISMO, no de efecto: la vieja llevaba un contador
        // propio (`count`, que subía hasta 3) y se guardaba a mano el instanceId del equipo; la
        // nueva usa la cuenta atrás genérica (`duration` bajando desde `cuentaTotal`, con
        // `turnApplied` para no gastar tick el turno en que se coloca) y recupera el equipo por
        // el `sourceInstanceId` que toda marca del DSL ya lleva.
        diferenciasEsperadas: [
            { contiene: 'tempEffects.0.count', motivo: 'la vieja contaba hacia arriba con un campo propio; la nueva cuenta hacia abajo con el mecanismo genérico' },
            { contiene: 'tempEffects.0.instanceId', motivo: 'la vieja guardaba a mano el instanceId del equipo; la nueva usa sourceInstanceId, que toda marca del DSL ya trae' },
            { contiene: 'tempEffects.0.duration', motivo: 'campo de la cuenta atrás genérica, inexistente en la vieja' },
            { contiene: 'tempEffects.0.turnApplied', motivo: 'idem: marca el turno de colocación para no gastar un tick el mismo turno' },
            { contiene: 'tempEffects.0.cuentaAtras', motivo: 'idem: el flag que enciende el mecanismo' },
            { contiene: 'tempEffects.0.cuentaTotal', motivo: 'idem: el total, para poder pintar "n/total" en el aviso de progreso' },
        ],
    },
    {
        // El ciclo completo: 3 turnos propios y el equipo se destruye devolviendo los stats base.
        nombre: 'Súper Evolución: tras 3 turnos propios caduca, restaura stats y va al descarte',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [KARLITOS_SIN_PASIVA], mano: [SUPER_EVO] },
        p2: {},
        pasos: [ { jugar: SUPER_EVO }, { elegir: [KARLITOS] }, ...TRES_TURNOS_PROPIOS ],
        logsIntencionados: [
            { de: '¡Karlitos alcanza su Súper Evolución!', a: '¡Karlitos de J1 (Jugador 1) alcanza su Súper Evolución!',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño)' },
            { de: '¡La Súper Evolución de Karlitos se ha agotado!', a: '¡La Súper Evolución de Karlitos de J1 (Jugador 1) se ha agotado!',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño)' },
        ],
        // El aviso de progreso del ÚLTIMO tick: la vieja pintaba "SÚPER EVO: 3/3" ADEMÁS de
        // "AGOTADO"; la nueva, al caducar, pinta solo el final. El estado resultante es el mismo.
        flotantesSoloVieja: [
            { linea: 'SÚPER EVO: 3/3', motivo: 'la vieja pintaba el progreso también en el tick que caduca, junto al "AGOTADO"; la nueva solo pinta el final' },
        ],
        // MEJORA, no replicada a propósito: la vieja mandaba el equipo al descarte SIN soltar su
        // `equippedTo`, que se quedaba apuntando al portador para siempre — estado zombi que
        // dice "esta carta está equipada a X" de una carta que ya está en la pila de descartes.
        // El op DESEQUIPAR lo limpia. Replicar la basura habría costado lo mismo y dejaría una
        // trampa para cualquier cosa que en el futuro mire ese campo (p. ej. al rejugar la carta).
        diferenciasEsperadas: [
            { contiene: 'discard.0.equippedTo', motivo: 'la vieja dejaba el vínculo colgando tras descartar el equipo; DESEQUIPAR lo suelta' },
        ],
    },
    {
        nombre: 'Súper Evolución rechazada: no hay ningún Usuario de Súper Evolución en vanguardia',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: ['Mini-tigre'], mano: [SUPER_EVO] },
        p2: {},
        pasos: [ { jugar: SUPER_EVO } ],
    },
    {
        // Un Usuario en RETAGUARDIA no vale: el texto dice "en vanguardia".
        nombre: 'Súper Evolución rechazada: el Usuario está en retaguardia, no en vanguardia',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { retaguardia: [KARLITOS], mano: [SUPER_EVO] },
        p2: {},
        pasos: [ { jugar: SUPER_EVO } ],
    },
];

correrSuite('regresion57', escenarios);
