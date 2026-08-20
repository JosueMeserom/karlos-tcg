// tests/regresion65.js — Kyle: REPARACIÓN MOLECULAR, migrada al DSL (20-ago-2026).
//
// Era de las últimas Activas imperativas de una sola pieza: canActivateAbility +
// onExecuteAbility + onValidateTarget + onTargetsReady, las cuatro escritas a mano para "elige un
// aliado y cúrale 2". El compilador de ACTIVA hace eso mismo, y de paso la carta se lleva lo que
// el DSL trae de serie: el cobro que espera a que elijas, la animación de aura de Habilidad y los
// logs con el formato de la rúbrica.
//
// Lo que se comprueba aquí es lo que NO se ve en una carta: que las tres validaciones sigan en
// pie. Son la razón de que la carta no sea trivial y lo primero que se pierde al migrar:
//   · un aliado a Vida llena NO es objetivo válido (o se gastaría el Furor y la acción en nada),
//   · un Zombificado rechaza la reparación,
//   · pero quien puede REBASAR su Vida máxima (onBeforeHealed, el Limo primario) SÍ vale aunque
//     esté al máximo — la excepción que hace que la primera regla no se pueda escribir a lo bruto.
'use strict';
const { correrSuite } = require('./harness');

// La vieja escribía su propio cartel sobre el aliado curado, nombraba a Kyle a pelo y logueaba su
// propio prompt de selección. Las tres cosas cambian A PROPÓSITO:
//   · el nombre, por la norma del proyecto (getCardNameWithOwner en todo log visible por los dos);
//   · el cartel sobre el objetivo, porque con la animación de aura sobra (Toto, 20-ago-2026) —
//     el nombre de la Activa SIGUE saliendo sobre Kyle, como "DERRENGAR" sale sobre Nethuns;
//   · el prompt, porque el título de la elección lo pinta el picker por la vía privada.
const PROMPT_VIEJO = { linea: 'Selecciona un aliado para Reparación Molecular.',
    motivo: 'la vieja logueaba su prompt con logMsg (entra en el historial); la nueva usa el título del target del ACTIVA, que el picker enseña por logError (privado)' };
const MOTIVO_NOMBRE = 'NORMA DEL PROYECTO: un log visible por los dos nombra la carta con getCardNameWithOwner, no con card.name pelado. De paso el log dice el antes y el después en vez de una cantidad fija, que es lo que de verdad ocurrió cuando la curación se capa';
const MOTIVO_CARTEL = 'Toto, 20-ago-2026: con la animación de aura -que sale de Kyle y cae sobre el aliado- el cartel sobre el OBJETIVO sobra, y el "+2 VIDA" automático ya dice lo que ha pasado';

const escenarios = [
    {
        nombre: 'Kyle: REPARACIÓN MOLECULAR cura 2 al aliado elegido',
        p1: { vanguardia: [{ carta: 'Kyle', furor: 1 }, { carta: 'Mini-tigre', vida: 1 }] },
        p2: { vanguardia: ['Aniceto'] },
        pasos: [ { habilidad: 'Kyle' }, { confirmar: true }, { elegir: ['Mini-tigre'] } ],
        logsSoloVieja: [PROMPT_VIEJO],
        logsIntencionados: [
            { de: 'Kyle repara 2 de Vida a Mini-tigre [1] de J1 (Jugador 1).',
              a: 'Kyle de J1 (Jugador 1) repara la Vida de Mini-tigre [1] de J1 (Jugador 1) (1 -> 3).',
              motivo: MOTIVO_NOMBRE },
        ],
        // Anclado al instanceId DEL OBJETIVO: sin eso se lleva por delante también el de Kyle,
        // que sí debe seguir saliendo, y el escenario pasaría por el motivo equivocado.
        flotantesSoloVieja: [ { linea: 'inst_p1_2_15 · REPARACIÓN MOLECULAR', motivo: MOTIVO_CARTEL } ],
    },
    {
        // Kyle puede curarse a SÍ MISMO: la vieja solo comprobaba que el objetivo fuera aliado, y
        // eso no cambia. Se fija aquí porque es justo lo que un `excludeSelf` de más se llevaría
        // por delante sin que nadie lo notara.
        nombre: 'Kyle puede repararse a sí mismo',
        p1: { vanguardia: [{ carta: 'Kyle', furor: 1, vida: 2 }] },
        p2: { vanguardia: ['Aniceto'] },
        pasos: [ { habilidad: 'Kyle' }, { confirmar: true }, { elegir: ['Kyle'] } ],
        logsSoloVieja: [PROMPT_VIEJO],
        logsIntencionados: [
            { de: 'Kyle repara 2 de Vida a Kyle de J1 (Jugador 1).',
              a: 'Kyle de J1 (Jugador 1) repara la Vida de Kyle de J1 (Jugador 1) (2 -> 4).',
              motivo: MOTIVO_NOMBRE },
            // Curarse hasta 4 le enciende su propia Pasiva, cuyo anuncio ya está migrado y
            // declarado en regresion24. Se repite aquí porque este escenario lo dispara.
            { de: '¡Habilidad pasiva de Kyle de J1 (Jugador 1): ENTEREZA DEL INGENUO activa! (+2 ATQ y +2 DEF)',
              a: '¡Habilidad pasiva de Kyle de J1 (Jugador 1): ENTEREZA DEL INGENUO tiene lugar! (+2 de Def, +2 de Atq)',
              motivo: 'anuncio genérico de PASIVA_CONTINUA, con los stats en orden Def -> Atq como en la cara de la carta (ya documentado en regresion24)' },
        ],
        flotantesSoloNueva: [
            { linea: '+2 DEF · ft-green', motivo: 'el anuncio genérico añade un flotante por stat cambiado; la vieja solo sacaba el del nombre (regresion24)' },
            { linea: '+2 ATQ · ft-green', motivo: 'ídem, flotante del Atq' },
        ],
        // Curándose a sí mismo, los DOS carteles caían sobre la misma carta y salían repetidos:
        // este es el caso exacto para el que existe `consecutivo`.
        flotantesSoloVieja: [ { linea: 'REPARACIÓN MOLECULAR', consecutivo: true, motivo: MOTIVO_CARTEL } ],
    },
    {
        // A Vida llena no se puede: si se pudiera, se gastaría el Furor y la acción en nada.
        // OJO A LA DIVERGENCIA, que es la razón de ser de este escenario: la base congelada es
        // del 20-jul y la validación se añadió el 27-jul, así que la VIEJA acepta al aliado lleno
        // y se come el Furor y la acción para no curar nada. Eso es justo lo que Toto mandó
        // arreglar entonces, y lo que la migración tenía que conservar.
        nombre: 'Kyle: un aliado a Vida llena no es objetivo válido',
        p1: { vanguardia: [{ carta: 'Kyle', furor: 1 }, { carta: 'Mini-tigre', vida: 1 }, 'Limo artificial'] },
        p2: { vanguardia: ['Aniceto'] },
        pasos: [
            { habilidad: 'Kyle' }, { confirmar: true },
            { elegir: ['Limo artificial'] },
        ],
        logsSoloVieja: [
            PROMPT_VIEJO,
            { linea: 'Objetivos listos. ¡Ejecutando habilidad!',
              motivo: 'la vieja acepta el objetivo inválido y llega a ejecutar; la nueva ni lo admite' },
            { linea: 'Limo artificial [1] de J1 (Jugador 1) ya tiene la Vida completa.',
              motivo: 'la vieja lo descubre DESPUÉS de haber gastado el Furor y la acción; la nueva no le deja elegirlo' },
        ],
        flotantesSoloVieja: [
            { linea: 'inst_p1_1_3 · -1 FUR', motivo: 'la vieja cobra el Furor por una curación que no ocurre' },
            { linea: 'inst_p1_1_3 · REPARACIÓN MOLECULAR', motivo: 'y anuncia la Activa igualmente' },
        ],
        diferenciasEsperadas: [
            { contiene: 'p1.vanguard.0.furor', motivo: 'la vieja paga por nada; la nueva no llega a pagar' },
            { contiene: 'p1.vanguard.0.exhausted', motivo: 'ídem con la acción del turno' },
            { contiene: 'pendingAbilityTarget', motivo: 'la vieja terminó; la nueva ha rechazado el objetivo y sigue pidiendo uno hasta que se cancela' },
        ],
    },
    {
        // La EXCEPCIÓN: el Limo primario puede rebasar su Vida máxima, así que sí vale aunque
        // esté al máximo. Es lo que obliga a que la regla de arriba sea "le falta Vida O puede
        // rebasarla" y no un simple "le falta Vida".
        nombre: 'Kyle: quien puede rebasar su Vida máxima sí vale aunque esté lleno',
        p1: { vanguardia: [{ carta: 'Kyle', furor: 1 }, 'Limo primario'] },
        p2: { vanguardia: ['Aniceto'] },
        pasos: [ { habilidad: 'Kyle' }, { confirmar: true }, { elegir: ['Limo primario'] } ],
        logsSoloVieja: [PROMPT_VIEJO],
        logsIntencionados: [
            { de: 'Kyle repara 2 de Vida a Limo primario [1] de J1 (Jugador 1).',
              a: 'Kyle de J1 (Jugador 1) repara la Vida de Limo primario [1] de J1 (Jugador 1) (4 -> 6).',
              motivo: MOTIVO_NOMBRE },
        ],
        flotantesSoloVieja: [ { linea: 'inst_p1_2_1004 · REPARACIÓN MOLECULAR', motivo: MOTIVO_CARTEL } ],
    },
    {
        // Sin NADIE a quien curar, la Activa no debe ni empezar. Esto la vieja no lo hacía: te
        // metía en la selección de objetivos para que descubrieras a mano que no valía ninguno.
        nombre: 'Kyle: sin ningún aliado curable, la Activa no arranca',
        p1: { vanguardia: [{ carta: 'Kyle', furor: 1 }, 'Limo artificial'] },
        p2: { vanguardia: ['Aniceto'] },
        pasos: [ { habilidad: 'Kyle' }, { soloEn: 'vieja', confirmar: true } ],
        logsSoloVieja: [PROMPT_VIEJO],
        // El aviso de la nueva ("No tienes ningún aliado al que reparar.") NO se puede declarar
        // como logsSoloNueva: los `requisitos` avisan por logError, que es privado y no entra en
        // el historial comparado. Lo observable es el estado.
        diferenciasEsperadas: [
            { contiene: 'pendingAbilityTarget', motivo: 'la vieja se mete en la selección de objetivos a esperar uno que no existe; la nueva ni entra, porque su requisito ve que no hay a quién curar' },
        ],
    },
];

correrSuite('regresion65', escenarios);
