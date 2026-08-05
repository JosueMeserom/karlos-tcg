// tests/regresion16.js — Primera tanda de "sencillas" tras la fase interceptores:
//   Elemental sanador (RECIEDAD, ACTIVA sinObjetivo + LIMPIAR_ESTADOS),
//   Alumno con VP (ACERTIJO, MONEDA con ELEGIR + elegidoPor: RIVAL),
//   Muro parlante (PUEDE_ATACAR, nueva consulta de veto de ataque),
//   Limo primario (SOBRECURACION, extiende el onBeforeHealed ya soportado por CURAR).
//
// Extensiones nuevas del intérprete usadas aquí (documentadas en cartas.js):
//   - ACTIVA gana un cierre genérico (exhausted/candado/render/forceSync) que
//     antes solo aportaba ATACAR vía performAttack: bug latente nunca disparado
//     porque las dos únicas Activas DSL previas (BOMBAZO, PUÑALADA) atacan.
//   - ACTIVA.sinObjetivo: salta la fase de clic-en-objetivo (autobuffs, fichas,
//     monedas con elección interna).
//   - ELEGIR.elegidoPor: "RIVAL" — el pool sigue siendo relativo al DUEÑO de la
//     carta, pero decide/clica el rival: pickBoardTargets gana un "chooser"
//     explícito (norma de targeting en tablero — nunca modal para elegir del
//     campo, ver CLAUDE.md), con render/clic gateados por chooser y no por
//     activePlayerId.
//   - Triggers PUEDE_ATACAR (-> canAttackNormally) y SOBRECURACION (->
//     onBeforeHealed) para consultas de una sola carta.
//
// BUGS DE MOTOR descubiertos y corregidos al preparar esta tanda (betasteo de
// Toto sobre la propia tanda):
//   1. cancelAction() nunca resolvía un dslPick activo (ni pasaba por el
//      candado de isActionLocked ni limpiaba this.dslPick): con el modal, la
//      vieja tenía su propio botón "Cancelar" independiente del candado; con
//      el tablero generalizado, cualquier ELEGIR opcional a mitad de una
//      acción bloqueada (Plan de equipo, disparado dentro de performAttack)
//      se habría quedado sin forma de declinar. Corregido: SELECT_DSL_TARGETS
//      resuelve el pick con null ANTES de mirar isActionLocked.
//   2. La heurística de "objetivo ya lleno" de AL_USAR_AYUDA (onValidateTarget)
//      no contaba con onBeforeHealed/SOBRECURACION: Limo primario a Vida
//      máxima quedaba inelegible para curar aunque pudiera rebasarla. Ahora se
//      omite esa heurística cuando la plantilla tiene onBeforeHealed.
//   3. RECIEDAD no comprobaba que hubiera algún estado alterado que limpiar
//      (requisito nuevo con el filtro algunEstado, ya existente para JUGAR
//      pero ausente del _pool genérico que usan los requisitos de ACTIVA).
//
// Cambio de comportamiento deliberado en Alumno con VP: la comprobación de
// "hay enemigos" pasa a requisitos (como Contendiente/Sra. Kumicho) y se
// evalúa ANTES de pagar el coste y lanzar la moneda; la imperativa gastaba
// ambos igualmente cuando no había objetivos válidos.
//
// Limo primario: el tope de Math.min(9, ...) es defensivo y NO es alcanzable
// con los Ingeribles actuales desde la Vida base (4) — cualquier heal que
// deje la carta con currentHp == maxHp la invalida como objetivo antes del
// siguiente heal (regla general de las Ayudas de curar). Verificado leyendo
// el código; no se fuerza un escenario artificial para cubrirlo.

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'Elemental sanador: RECIEDAD limpia todos los estados alterados de los aliados',
        p1: {
            vanguardia: [
                { carta: 'Elemental sanador', furor: 1 },
                { carta: 'Oso con armadura', estado: { dot: { duration: 2 }, confusion: { duration: 1 } } },
            ],
            retaguardia: [{ carta: 'Mini-tigre', estado: { sueno: { duration: 3 } } }],
        },
        p2: { vanguardia: ['Droide antidisturbios'] },
        pasos: [
            { habilidad: 'Elemental sanador' },
            { confirmar: true },
        ],
    },
    {
        nombre: 'Elemental sanador rechazado sin Furor',
        p1: { vanguardia: [{ carta: 'Elemental sanador', furor: 0 }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { habilidad: 'Elemental sanador' },
        ],
    },
    {
        // Cubre el bug #3 de la cabecera: antes se podía activar RECIEDAD sin
        // ningún estado que limpiar (gastando Furor para nada). La vieja no tenía
        // este requisito (solo miraba el Furor), así que SÍ abre el modal de
        // confirmar; la nueva bloquea antes en canActivateAbility.
        nombre: 'Elemental sanador rechazado sin ningún estado alterado que limpiar',
        p1: { vanguardia: [{ carta: 'Elemental sanador', furor: 1 }, 'Oso con armadura'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { habilidad: 'Elemental sanador' },
            { soloEn: 'vieja', confirmar: true },
        ],
        diferenciasEsperadas: [
            { contiene: 'estado.p1.vanguard.0.furor', motivo: 'la vieja gastaba 1 Furor igualmente sin nada que limpiar; la nueva bloquea antes de pagar el coste (requisito nuevo)' },
            { contiene: 'flotante[', motivo: 'la vieja llega a mostrar los flotantes de activación (RECIEDAD) y el log de intro antes de no encontrar nada que limpiar; la nueva no llega a ejecutar nada' },
            { contiene: 'log[', motivo: 'idem: la vieja loguea el intento (intro + "nada que limpiar" implícito, sin log explícito de fracaso); la nueva no genera ningún log' },
            { contiene: 'estado.p1.vanguard.0.exhausted', motivo: 'la vieja agota la carta tras el intento; la nueva ni siquiera la activa' },
        ],
    },
    {
        nombre: 'Alumno con VP: ACERTIJO con cara — tú eliges al enemigo que pierde 2 Furor',
        monedas: ['cara'],
        p1: { vanguardia: [{ carta: 'Alumno con VP', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', furor: 2 }, 'Droide antidisturbios'] },
        pasos: [
            { habilidad: 'Alumno con VP' },
            { confirmar: true },
            { elegir: ['Mini-tigre'] },
        ],
        logsIntencionados: [
            { de: '¡Mini-tigre no sabe la respuesta y pierde 2 de Furor!', a: '¡Mini-tigre [1] de J2 (Jugador 2) no sabe la respuesta y pierde 2 de Furor!',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba chosen.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
    },
    {
        nombre: 'Alumno con VP: ACERTIJO con cruz — el rival elige a su propio aliado, pierde 1 Furor',
        monedas: ['cruz'],
        p1: { vanguardia: [{ carta: 'Alumno con VP', furor: 1 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', furor: 2 }, 'Droide antidisturbios'] },
        pasos: [
            { habilidad: 'Alumno con VP' },
            { confirmar: true },
            { elegir: ['Droide antidisturbios'] }, // lo clica el rival (elegidoPor: RIVAL)
        ],
        logsIntencionados: [
            { de: 'El rival decide sacrificar 1 Furor de Droide antidisturbios.', a: 'El rival decide sacrificar 1 Furor de Droide antidisturbios [1] de J2 (Jugador 2).',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba chosen.name a secas; la nueva rellena {objetivo} con DSL._nombre' },
        ],
    },
    {
        // Cambio deliberado (ver cabecera): la vieja SÍ abría el modal de confirmar
        // (su canActivateAbility solo miraba el Furor) y gastaba Furor + moneda
        // igualmente al no haber objetivos; la nueva bloquea en canActivateAbility
        // (requisito de enemigos) ANTES de abrir el modal, así que ese paso no
        // aplica en su lado — de ahí el {soloEn: 'vieja'}.
        nombre: 'Alumno con VP rechazado sin enemigos en el campo',
        monedas: { vieja: ['cara'] }, // la vieja tira moneda ANTES de descubrir que no hay objetivos; la nueva no llega a la moneda
        p1: { vanguardia: [{ carta: 'Alumno con VP', furor: 1 }] },
        p2: {},
        pasos: [
            { habilidad: 'Alumno con VP' },
            { soloEn: 'vieja', confirmar: true },
        ],
        diferenciasEsperadas: [
            { contiene: 'estado.p1.vanguard.0.furor', motivo: 'la vieja gastaba 1 Furor igualmente al no haber objetivos; la nueva no llega a pagar el coste (requisito previo)' },
            { contiene: 'flotante[', motivo: 'la vieja llega a mostrar los flotantes de coste/activación (-1 FUR, ACERTIJO) antes de descubrir que no hay objetivos; la nueva no llega a ejecutar nada' },
            { contiene: 'estado.p1.vanguard.0.exhausted', motivo: 'la vieja agota la carta tras el intento fallido (dentro de onExecuteAbility); la nueva ni siquiera la activa' },
        ],
    },
    {
        nombre: 'Muro parlante: INAMOVIBLE veta el ataque normal mientras su Atq sea 0',
        p1: { vanguardia: ['Muro parlante'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { atacar: 'Muro parlante', objetivo: 'Mini-tigre' },
        ],
    },
    {
        nombre: 'Muro parlante puede atacar normalmente si su Atq sube de 0',
        p1: { vanguardia: [{ carta: 'Muro parlante', atk: 3 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 3 }] },
        pasos: [
            { atacar: 'Muro parlante', objetivo: 'Mini-tigre' },
        ],
    },
    {
        nombre: 'Limo primario: CRECIMIENTO IMPARABLE expande la Vida máxima al rebasarla al curar',
        p1: { vanguardia: [{ carta: 'Limo primario', vida: 3 }], mano: ['Manzanahoria'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Manzanahoria' },
            { seleccionar: 'Limo primario' },
        ],
    },
    {
        nombre: 'Limo primario: curar sin rebasar la Vida máxima no expande nada',
        p1: { vanguardia: [{ carta: 'Limo primario', vida: 1 }], mano: ['Manzanahoria'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Manzanahoria' },
            { seleccionar: 'Limo primario' },
        ],
    },
    {
        // Cubre el bug #2 de la cabecera: Limo primario EXACTAMENTE a su Vida
        // máxima (4/4, sin rebasar todavía) debe seguir siendo objetivo válido
        // para curar, porque puede expandir su propio máximo al hacerlo. Antes
        // del fix, onValidateTarget lo rechazaba como "ya tiene la Vida completa".
        nombre: 'Limo primario a Vida máxima sigue siendo objetivo válido (puede rebasarla)',
        p1: { vanguardia: [{ carta: 'Limo primario', vida: 4 }], mano: ['Manzanahoria'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Manzanahoria' },
            { seleccionar: 'Limo primario' },
        ],
        // El fix del bug #2 vive en public/cartas.js (onValidateTarget del compile
        // AL_USAR_AYUDA); cartas_antes_de_dsl.js NUNCA se edita, así que la vieja
        // sigue rechazando a Limo primario como objetivo ("ya tiene la Vida
        // completa") y Manzanahoria se queda sin usar en su mano. La nueva sí lo
        // acepta y expande su máximo a 6. Divergencia real y deliberada.
        diferenciasEsperadas: [
            { contiene: 'log[', motivo: 'la vieja rechaza el objetivo en silencio (logError privado) y no llega a ejecutar nada; la nueva cura y expande' },
            { contiene: 'flotante[', motivo: 'ídem: la vieja no genera ningún flotante' },
            { contiene: 'estado.p1.hand.0', motivo: 'la vieja no consume Manzanahoria (objetivo rechazado); la nueva sí' },
            { contiene: 'estado.p1.vanguard.0.currentHp', motivo: 'la vieja deja a Limo primario en 4; la nueva lo cura a 6' },
            { contiene: 'estado.p1.vanguard.0.maxHp', motivo: 'la vieja no expande el máximo (rechazó el objetivo); la nueva lo expande a 6' },
            { contiene: 'estado.p1.discard', motivo: 'la vieja no descarta Manzanahoria (no llegó a usarse); la nueva sí' },
            { contiene: 'estado.p1.cardCounts', motivo: 'consecuencia del mismo desajuste: la nueva asigna copyId al descartar, la vieja no llega a esa rama' },
            // Aflora al añadir `pendingAttackTarget` al estado exportado (reanudar-perfecto del
            // targeting de ataque, 5-ago-2026): no es un cambio de comportamiento, es la MISMA
            // divergencia de arriba hecha visible. Al rechazar el objetivo de la Ayuda, la vieja
            // deja el clic sobre Limo primario cayendo en la rama de "seleccionar carta para
            // atacar" y se queda en SELECT_TARGET; la nueva consume la Ayuda y no llega ahí.
            { contiene: 'estado.pendingAttackTarget', motivo: 'la vieja acaba en SELECT_TARGET (el clic rechazado por la Ayuda cae en la rama de ataque); la nueva usa la Manzanahoria y termina en IDLE' },
        ],
    },
];

correrSuite('regresion16', escenarios);
