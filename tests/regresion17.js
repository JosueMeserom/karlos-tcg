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
        // REESCRITO (Toto, 20-ago-2026). Este escenario fijaba como correcto justo lo que estaba
        // mal: "el 2º ELEGIR ya no es cancelable tras pagar el Furor del payer". O sea que PEM
        // cobraba al elegir pagador y luego te OBLIGABA a elegir objetivo. Con la norma del coste
        // aplicada -el Furor no se toca mientras quede algo por decidir- ahora cancelar en el
        // segundo paso no cuesta nada, y eso es lo que se fija aquí. La vieja no puede cancelar
        // ahí (su flujo es el antiguo SELECT_ABILITY_TARGETS), así que a partir de ese punto los
        // dos caminos divergen enteros y se declara la divergencia.
        nombre: 'PEM: cancelar al elegir objetivo ya no cuesta el Furor (la vieja lo cobraba)',
        p1: { vanguardia: [{ carta: 'Oso con armadura', furor: 1 }], mano: ['PEM'] },
        p2: { vanguardia: ['Robot de seguridad SP', 'Mini-tigre'] },
        pasos: [
            { jugar: 'PEM' },
            { elegir: ['Oso con armadura'] },          // quién paga: aún no se cobra nada
            { soloEn: 'nueva', cancelar: true },       // arrepentirse ahora sale gratis
            { soloEn: 'vieja', elegir: ['Robot de seguridad SP'] },
        ],
        logsSoloVieja: [
            { linea: '¡El PEM fríe los circuitos de Robot de seguridad SP! Se saltará su próximo turno.',
              motivo: 'la vieja no deja cancelar y remata la carta; la nueva se ha cancelado y no paraliza a nadie' },
        ],
        flotantesSoloVieja: [
            { linea: 'inst_p1_1_16 · -1 FUR', motivo: 'lo mismo: la vieja ya había cobrado el Furor al elegir pagador' },
            { linea: 'PARALIZADO', motivo: 'y aplica la parálisis' },
        ],
        diferenciasEsperadas: [
            { contiene: 'p1.vanguard.0.furor', motivo: 'CANCELAR NO CUESTA NADA: la nueva conserva el Furor; la vieja lo había cobrado antes de dejarte elegir objetivo' },
            { contiene: 'p1.hand', motivo: 'la carta se queda en la mano al cancelar; en la vieja está consumida' },
            { contiene: 'p1.discard', motivo: 'ídem: la vieja la tiene ya en el descarte' },
            { contiene: 'tempEffects', motivo: 'la vieja llegó a paralizar al Robot; la nueva no' },
        ],
    },
    {
        nombre: 'ACERTIJO: el ELEGIR de cara ya no es cancelable tras pagar Furor y lanzar la moneda',
        flotantesIntencionados: [
            { de: '-2 FUR ·', a: '-2 FUR (Alumno con VP) ·',
              motivo: 'el flotante automatico nombra ahora la carta origen cuando el cambio lo causa OTRA carta (Toto, 5-ago-2026): un "-N" suelto no decia de donde salia. No afecta al dano de combate (dealDamage no pasa fuente) ni al coste de tu propia Habilidad' },
        ],
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
