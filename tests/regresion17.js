// tests/regresion17.js — Dos peticiones de Toto sobre la tanda 1, después de
// betastear el resultado:
//
//   A) "Si la acción es reversible, se puede cancelar" — el criterio correcto
//      NO es "¿ha cambiado algo en la partida?" sino "¿ESTA habilidad ya pagó
//      SU coste o lanzó SU moneda antes de llegar a esta elección concreta?".
//      Auditados los 19 usos de ELEGIR en tablero: solo 3 estaban en zona
//      irreversible (ACERTIJO cara/cruz, tras pagar Furor y lanzar la moneda;
//      el 2º ELEGIR de PEM, tras pagar el Furor del 1º). pickBoardTargets gana
//      un flag `cancelable` (nuevo op-level `cancelable: false` en ELEGIR);
//      cancelAction() y el botón X lo respetan.
//
//   B) Auditoría de género: el motor ya tenía card.gender (M/F/N/N-A) pero solo
//      se consultaba con ternarios sueltos (p. ej. "ha sido destruido/a", ya
//      correcto). Nuevo: DSL._fill soporta {campo?masculino|femenino}; ELEGIR
//      con guardaEn también guarda {campo}G (código de género) automáticamente.
//      Corregidos: Deuda con la mafia (log + preview), Época de estudio y
//      Feria del cómic (preview), tempEffectText de PEM/Rebobinar/Canceladora,
//      y los logs de estado del motor (Confundido/Cegado/dormido/Silenciado)
//      que antes eran siempre masculinos. Los de "preview"/tempEffectText solo
//      alimentan el detalle (hover del cliente): no verificables por el
//      harness (render anulado); los de log SÍ lo son y se cubren aquí.

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'PEM: el 2º ELEGIR (objetivo) ya no es cancelable tras pagar el Furor del payer',
        p1: { vanguardia: [{ carta: 'Oso con armadura', furor: 1 }], mano: ['PEM'] },
        p2: { vanguardia: ['Robot de seguridad SP', 'Mini-tigre'] },
        pasos: [
            { jugar: 'PEM' },
            { elegir: ['Oso con armadura'] }, // payer: paga 1 Furor — commit irreversible
            { soloEn: 'nueva', cancelar: true }, // intento de cancelar: ignorado (la vieja SÍ podría, no se prueba)
            { elegir: ['Robot de seguridad SP'] }, // toca completar la elección igualmente
        ],
        logsIntencionados: [
            { de: '¡El PEM fríe los circuitos de Robot de seguridad SP! Se saltará', a: '¡El PEM fríe los circuitos de Robot de seguridad SP [1] de J2 (Jugador 2)! Se saltará',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba target.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
        logsSoloVieja: [
            { linea: 'Objetivos listos. ¡Ejecutando habilidad!',
              motivo: 'igual que en r7: el 2º objetivo de PEM en la vieja usa el flujo antiguo SELECT_ABILITY_TARGETS (mensaje genérico del motor viejo, no de esta carta)' },
        ],
        logsSoloNueva: [
            { linea: 'Ya te has comprometido: no puedes cancelar esta elección.',
              motivo: 'aviso del intento de cancelar bloqueado (solo se intenta en la nueva, vía {soloEn})' },
        ],
    },
    {
        nombre: 'ACERTIJO: el ELEGIR de cara ya no es cancelable tras pagar Furor y lanzar la moneda',
        monedas: ['cara'],
        p1: { vanguardia: [{ carta: 'Alumno con VP', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', furor: 2 }, 'Droide antidisturbios'] },
        pasos: [
            { habilidad: 'Alumno con VP' },
            { confirmar: true },
            { soloEn: 'nueva', cancelar: true }, // intento de cancelar tras la moneda: ignorado
            { elegir: ['Mini-tigre'] },
        ],
        logsIntencionados: [
            { de: '¡Mini-tigre no sabe la respuesta y pierde 2 de Furor!', a: '¡Mini-tigre [1] de J2 (Jugador 2) no sabe la respuesta y pierde 2 de Furor!',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba chosen.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
        logsSoloNueva: [
            { linea: 'Ya te has comprometido: no puedes cancelar esta elección.',
              motivo: 'aviso del intento de cancelar bloqueado (solo se intenta en la nueva, vía {soloEn})' },
        ],
    },
    {
        nombre: 'Deuda con la mafia: deudor de género femenino — el log dice "silenciada"',
        p1: { vanguardia: ['Ayudante perturbada'], mano: ['Deuda con la mafia'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Deuda con la mafia' },
            { elegir: ['Ayudante perturbada'] },
        ],
        logsIntencionados: [
            { de: '¡Ayudante perturbada se ha endeudado con la mafia! Queda silenciado y sin cobrar Furor.',
              a: '¡Ayudante perturbada [1] de J1 (Jugador 1) se ha endeudado con la mafia! Queda silenciada y sin cobrar Furor.',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño) + fix de género (Toto, 21-jul-2026): la vieja usaba target.name a secas y siempre en masculino; la nueva rellena {deudor} con DSL._nombre y {deudorG?...} con el género real de la carta elegida' },
        ],
    },
    {
        nombre: 'Confusión con género femenino: el log dice "está Confundida"',
        semilla: 21,
        // 2 monedas: 1) supera la Confusión (checkAttackStatus), 2) la propia
        // pasiva MANO PARÁSITA de Ayudante perturbada (onBeforeAttack) también
        // echa moneda — se me olvidó al elegir esta carta para el escenario.
        monedas: ['cara', 'cara'],
        p1: { vanguardia: [{ carta: 'Ayudante perturbada', estado: { confusion: { duration: 2 } } }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 3 }] },
        pasos: [
            { atacar: 'Ayudante perturbada', objetivo: 'Mini-tigre' },
        ],
        // Sin logsIntencionados: public/index.html es el motor COMPARTIDO (una
        // sola copia cargada por el harness para ambas bases), así que este fix
        // se comporta IDÉNTICO en vieja y nueva por construcción.
    },
    {
        nombre: 'Sueño con género femenino: el log dice "está dormida"',
        semilla: 23,
        // 2 monedas: 1) se despierta a tiempo (checkAttackStatus), 2) la propia
        // pasiva MANO PARÁSITA de Ayudante perturbada (onBeforeAttack).
        monedas: ['cara', 'cara'],
        p1: { vanguardia: [{ carta: 'Ayudante perturbada', estado: { sueno: { duration: 2 } } }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 3 }] },
        pasos: [
            { atacar: 'Ayudante perturbada', objetivo: 'Mini-tigre' },
        ],
    },
];

correrSuite('regresion17', escenarios);
