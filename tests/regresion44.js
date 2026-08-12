// tests/regresion44.js — Atomización migrada al DSL (31-jul-2026).
//
// Estaba clasificada como IRREDUCIBLE por sus dos inputState propios del motor
// (SELECT_ATOM_ALLY / SELECT_ATOM_ENEMY). Al leerla de cerca -a petición de Toto- resultó
// ser el patrón de Granada de maná (pagador + objetivo) más un "si lo mata": dos ELEGIR
// anidados sobre pickBoardTargets hacen exactamente lo mismo que los dos estados a medida,
// que además ya seleccionaban en tablero (no había violación de la norma de targeting).
//
// Piezas nuevas del intérprete, ambas reutilizables:
//   · `siMuere` en MODIFICAR_STAT — hermana del `siExito` de ATACAR. La condición se evalúa
//     ANTES de checkDeath, igual que la vieja (que miraba currentHp<=0 antes de llamarlo),
//     para que una carta capaz de burlar la muerte no borre a posteriori que el golpe FUE
//     letal.
//   · op `NO_CONSUMIR` — deja la Ayuda en la mano en vez de mandarla al descarte. El motor
//     ya soportaba el caso (el boilerplate de AL_CONSUMIR solo la saca de la mano si el
//     flujo dice que se gastó); esto solo lo hace declarable. El texto de la carta dice
//     "vuelve a la mano", pero mecánicamente NUNCA sale de ella.

'use strict';
const { correrSuite } = require('./harness');

// La vieja pedía confirmación ("¿Usar Atomización?") ANTES de elegir aliado, vía
// validateAndConfirmAbility. Ninguna otra Ayuda migrada la tiene (Granada de maná, Flash de
// maná, Cañón de positrones… van directas a la selección), y la primera elección -la del
// aliado- ya es cancelable, así que cumple la misma función. Se declara aquí en vez de
// silenciarla: es un cambio de UX real, no un detalle de formato.
const PASOS_VIEJA_CONFIRMA = [{ confirmar: true, soloEn: 'vieja' }];

// El flotante "DAÑO VERDADERO" es NUEVO: la vieja solo zarandeaba la carta (clase .shaking) y
// dejaba el "-2 VIDA" automático de modifyStat. Se añade porque el texto dice "ignora Def", o
// sea que es daño verdadero de pleno derecho, y así queda rotulado igual que las otras dos
// cartas de la familia (Granada de maná, TORMENTA PERFECTA). Va de la mano de la animación
// nueva de daño verdadero, que esta carta estrena para Ayudas.
const FLOTANTE_NUEVO = [
    { linea: 'DAÑO VERDADERO',
      motivo: 'rótulo nuevo, coherente con Granada de maná y TORMENTA PERFECTA: la vieja no lo ponía pese a ser el mismo tipo de daño (ignora Def)' },
];

// La vieja saca la carta de la mano por executeAyuda, que llama a assignCopyId ("el [n] nace al
// salir de la mano"); el boilerplate de AL_CONSUMIR del DSL no lo hace. Comprobado que NO es
// específico de esta carta: añadirlo al boilerplate hace divergir a 5 suites ya validadas
// (Poción revitalizante, Líquido mortal, Jarabe amargo, Domador, Overclock…), porque las bases
// VIEJAS de todos esos consumibles tampoco asignan copyId. O sea que la inconsistencia está en
// el motor viejo, entre sus dos caminos de "Ayuda usada", no en la migración. Se declara aquí y
// se deja sin unificar: cambiarlo es una decisión de Toto sobre TODOS los consumibles a la vez,
// no un efecto colateral de migrar Atomización.
const COPYID_CONSUMIBLE = [
    { contiene: 'estado.p1.discard.0.copyId',
      motivo: 'la vieja pasa por executeAyuda (que asigna copyId al salir de la mano); el boilerplate de AL_CONSUMIR no lo hace, igual que en el resto de consumibles ya migrados' },
    { contiene: 'estado.p1.cardCounts',
      motivo: 'consecuencia directa de lo anterior: el contador de copias solo avanza si se asigna copyId' },
];

const escenarios = [
    {
        nombre: 'Atomización: gasta la acción de un aliado y quita 2 de Vida (no mata) - se descarta',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { mano: ['Atomización'], vanguardia: [{ carta: 'Karlos', furor: 0 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 6 }] },
        pasos: [
            { jugar: 'Atomización' },
            ...PASOS_VIEJA_CONFIRMA,
            { elegir: ['Karlos'] },
            { elegir: ['Mini-tigre'] },
        ],
        logsSoloVieja: [
            { linea: 'Selecciona un aliado activo para gastar su acción.',
              motivo: 'prompt público de la vieja al entrar en su inputState a medida; el título del ELEGIR lo muestra pickBoardTargets por logError (privado, skipHistory), mismo criterio ya aplicado a Aniceto/Gólem de tierra/Raiju' },
            { linea: 'Aliado seleccionado. Elige enemigo objetivo.',
              motivo: 'segundo aviso de sistema del mismo mecanismo a medida (SELECT_ATOM_ALLY -> SELECT_ATOM_ENEMY); el ELEGIR anidado no pasa por ahí' },
        ],
        flotantesSoloNueva: FLOTANTE_NUEVO,
        diferenciasEsperadas: COPYID_CONSUMIBLE,
    },
    {
        nombre: 'Atomización: el golpe MATA - la carta se queda en la mano (NO_CONSUMIR)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { mano: ['Atomización'], vanguardia: [{ carta: 'Karlos', furor: 0 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 2 }] },
        pasos: [
            { jugar: 'Atomización' },
            ...PASOS_VIEJA_CONFIRMA,
            { elegir: ['Karlos'] },
            { elegir: ['Mini-tigre'] },
        ],
        logsSoloVieja: [
            { linea: 'Selecciona un aliado activo para gastar su acción.', motivo: 'ver escenario anterior' },
            { linea: 'Aliado seleccionado. Elige enemigo objetivo.', motivo: 'ver escenario anterior' },
            // Reordenamiento, no desaparición: la vieja anunciaba la vuelta a la mano ANTES de
            // checkDeath; en la nueva el aviso vive en siMuere, que corre DESPUÉS. La línea
            // existe en ambas, en distinta posición — se declara como par solo-vieja/solo-nueva
            // (misma técnica que el tributo de Garret en regresion38) para que el resto de la
            // comparación posicional cuadre.
            { linea: 'Enemigo destruido. Atomización vuelve a tu mano.',
              motivo: 'la vieja lo registra ANTES de checkDeath; ver logsSoloNueva para el mismo aviso en su nueva posición' },
        ],
        logsSoloNueva: [
            { linea: '¡Enemigo destruido! Atomización vuelve a la mano de J1 (Jugador 1).',
              motivo: 'la nueva lo registra DESPUÉS de checkDeath (el aviso vive en siMuere, que corre tras comprobar la muerte) Y con la redacción de la norma: 3ª persona con dueño, no "a tu mano" (§14, 8-ago-2026)' },
        ],
        flotantesSoloNueva: FLOTANTE_NUEVO,
    },
    {
        nombre: 'Atomización rechazada: no hay aliados activos (todos agotados)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { mano: ['Atomización'], vanguardia: [{ carta: 'Karlos', agotada: true }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { jugar: 'Atomización' } ],
    },
    {
        nombre: 'Atomización rechazada: el único enemigo es Eris (inmune a Ayudas enemigas)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { mano: ['Atomización'], vanguardia: [{ carta: 'Karlos', furor: 0 }] },
        p2: { vanguardia: ['Eris'] },
        pasos: [ { jugar: 'Atomización' } ],
    },
    {
        // Con Eris Y otro enemigo, la vieja SÍ dejaba clicar a Eris y respondía con el log de
        // su Pasiva; la nueva directamente no la ofrece en el pool. Aquí se elige al enemigo
        // válido, así que ambas coinciden — el escenario cubre que Eris no rompe la selección.
        nombre: 'Atomización con Eris en el campo: se atomiza al otro enemigo sin problema',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { mano: ['Atomización'], vanguardia: [{ carta: 'Karlos', furor: 0 }] },
        p2: { vanguardia: ['Eris', { carta: 'Mini-tigre', vida: 6 }] },
        pasos: [
            { jugar: 'Atomización' },
            ...PASOS_VIEJA_CONFIRMA,
            { elegir: ['Karlos'] },
            { elegir: ['Mini-tigre'] },
        ],
        logsSoloVieja: [
            { linea: 'Selecciona un aliado activo para gastar su acción.', motivo: 'ver primer escenario' },
            { linea: 'Aliado seleccionado. Elige enemigo objetivo.', motivo: 'ver primer escenario' },
        ],
        flotantesSoloNueva: FLOTANTE_NUEVO,
        diferenciasEsperadas: COPYID_CONSUMIBLE,
    },
    {
        // Betasteo de Toto (31-jul-2026): tras elegir pagador, la elección del enemigo debía
        // seguir siendo cancelable -nada irreversible ha pasado todavía, el aliado no se
        // agota hasta DESPUÉS-. Solo se prueba en 'nueva' (soloEn): la elección del enemigo
        // en la vieja es un clic crudo (SELECT_ATOM_ENEMY, sin pickBoardTargets), y el
        // harness no registra ninguna interacción pendiente para ese estado -no hay forma
        // guionizada de simular el clic en la [X] en ese punto concreto, mismo tipo de hueco
        // que otros estados de clic crudo del motor-. Se comprobó SOLO por lectura de código
        // (no por diff del harness) que el botón [X] de la vieja también estaría habilitado
        // ahí (isActionLocked se queda a false durante todo SELECT_ATOM_ALLY/ENEMY, y
        // cancelAction() no tiene ningún gate específico para ese inputState), así que el
        // comportamiento real coincidiría — pero eso no se puede verificar aquí.
        nombre: 'Atomización: cancelar la elección del enemigo devuelve todo intacto',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { mano: ['Atomización'], vanguardia: [{ carta: 'Karlos', furor: 0 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 6 }] },
        // La vieja se queda parada justo tras confirmar (SELECT_ATOM_ALLY, sin elegir aliado
        // todavía); la nueva sigue hasta elegir aliado y CANCELA ahí la elección del enemigo.
        // exportGameState() no incluye inputState/selectedCard, así que ambos paran en un
        // estado de juego observable IDÉNTICO (la Ayuda en mano, Karlos sin agotar, nada más
        // tocado) aunque el punto exacto del flujo donde cada una se detiene sea distinto.
        pasos: [
            { jugar: 'Atomización' },
            { confirmar: true, soloEn: 'vieja' },
            { soloEn: 'nueva', elegir: ['Karlos'] },
            { soloEn: 'nueva', cancelar: true },
        ],
        logsSoloVieja: [
            { linea: 'Selecciona un aliado activo para gastar su acción.', motivo: 'ver primer escenario' },
        ],
    },
];

correrSuite('regresion44', escenarios);
