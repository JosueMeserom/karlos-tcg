// tests/regresion38.js — Garret migrado al DSL (30-jul-2026): tributo (ANTES_DE_JUGAR)
// + ANDANADA METEÓRICA.
//
// El tributo NO usa DSL.tributoFuror (ese helper elige entre CUALQUIER aliado con
// Furor suficiente): el pagador debe ser Sadame, Aniceto o Hawke por NOMBRE, así
// que va por ANTES_DE_JUGAR + ELEGIR con un filtro `o` de 3 nombres, mismo
// mecanismo que el deudor de Deuda con la mafia. La vieja delegaba el descuento de
// Furor y su log a un mecanismo genérico del motor (card.tributeSourceId, con -4
// hardcodeado); aquí un MODIFICAR_STAT anidado hace lo mismo explícitamente.
//
// ANDANADA METEÓRICA es un calco de Raiju/Gólem de tierra: ELEGIR de cantidad
// EXACTA 2 + ATACAR especial:true. SIN filtro de Oculto desde el 25-ago-2026: es un
// ataque ESPECIAL y el Oculto solo tapa de los normales (Toto). La vieja sí filtraba
// -y la migración lo replicó tal cual-, así que el último escenario compara justo eso.
//
// Se quedan imperativos: la búsqueda de Escudo mágico (mazo O descartes, BUSCAR no
// soporta elegir zona) y los dos ganchos globales (+1 Furor extra en fase de
// Furor, inmune a daño especial).

'use strict';
const { correrSuite } = require('./harness');

const LOGS_SISTEMA_VIEJA = [
];

const escenarios = [
    {
        nombre: 'Garret: coloca pagando el tributo con Aniceto (-4 Furor)',
        flotantesIntencionados: [
            { de: '-4 FUR ·', a: '-4 FUR (Garret) ·',
              motivo: 'el flotante automatico nombra ahora la carta origen cuando el cambio lo causa OTRA carta (Toto, 5-ago-2026): un "-N" suelto no decia de donde salia. No afecta al dano de combate (dealDamage no pasa fuente) ni al coste de tu propia Habilidad' },
        ],
        p1: { mano: ['Garret'], vanguardia: [ { carta: 'Aniceto', furor: 4 } ] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Garret' },
            { elegir: ['Aniceto'] },
            { opcion: 'NO BUSCAR NADA' }, // DESBORDE DE MANÁ: búsqueda de Escudo mágico, sin tocar (imperativa en ambas bases)
        ],
        // Reordenamiento, no solo cambio de texto: ANTES_DE_JUGAR corre el tributo
        // ANTES de la colocación (para poder abortarla si se cancela la elección);
        // la vieja delegaba el descuento a un mecanismo genérico del motor que
        // corre DESPUÉS de colocar la carta. El log existe en ambas, en distinta
        // posición — se declara como "solo vieja" / "solo nueva" (con su propio
        // texto exacto) para que ambas comparaciones posicionales queden en el
        // único log que sí coincide en índice ("juega Garret...").
        logsSoloVieja: [
            { linea: 'entrega su Furor como tributo para Garret.',
              motivo: 'la vieja registra el tributo DESPUÉS de colocar la carta (mecanismo genérico del motor, nombre a secas); ver logsSoloNueva para el equivalente' },
        ],
        logsSoloNueva: [
            { linea: 'Aniceto de J1 (Jugador 1) entrega su Furor como tributo para Garret.',
              motivo: 'la nueva registra el tributo ANTES de colocar la carta (ANTES_DE_JUGAR, para poder abortar la colocación si se cancela la elección) y con DSL._nombre en vez del nombre a secas' },
        ],
    },
    {
        nombre: 'Garret rechazado: ningún pagador válido (Furor insuficiente)',
        p1: { mano: ['Garret'], vanguardia: [ { carta: 'Aniceto', furor: 3 } ] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { jugar: 'Garret' } ],
    },
    {
        nombre: 'ANDANADA METEÓRICA: ataque especial a 2 enemigos distintos',
        p1: { vanguardia: [ { carta: 'Garret', furor: 3 } ] },
        p2: { vanguardia: ['Mini-tigre', 'Robot de seguridad SP'] },
        pasos: [
            { habilidad: 'Garret' },
            { confirmar: true },
            { elegir: ['Mini-tigre', 'Robot de seguridad SP'] },
        ],
        logsSoloVieja: LOGS_SISTEMA_VIEJA,
    },
    {
        // EL OCULTO NO TAPA DE UN ESPECIAL (Toto, 25-ago-2026). La vieja rechazaba la Habilidad
        // entera por no tener "2 enemigos válidos"; la nueva los ve a los dos y les pega.
        nombre: 'ANDANADA METEÓRICA sí alcanza a un enemigo Oculto (es especial)',
        p1: { vanguardia: [ { carta: 'Garret', furor: 3 } ] },
        // Con Vida de sobra los dos: lo que se compara es a quién ALCANZA la Habilidad, y dos
        // muertes llenarían el diff de mudanzas al descarte sin aportar nada.
        p2: { vanguardia: [ { carta: 'Mini-tigre', vida: 9, campos: { maxHp: 9 } },
                            { carta: 'Robot de seguridad SP', vida: 9, campos: { maxHp: 9, stealth: true } } ] },
        pasos: [
            { soloEn: 'nueva', habilidad: 'Garret' },
            { soloEn: 'nueva', confirmar: true },
            { soloEn: 'nueva', elegir: ['Mini-tigre', 'Robot de seguridad SP'] },
        ],
        logsSoloNueva: [
            { linea: 'Robot de seguridad SP', motivo: 'el Oculto recibe el ataque especial que la vieja no dejaba ni señalar' },
            { linea: 'Mini-tigre', motivo: 'y el otro enemigo también: la vieja rechazaba la Habilidad entera' },
        ],
        flotantesSoloNueva: [
            { linea: '-3 FUR', motivo: 'la nueva sí usa la Habilidad y paga su coste' },
            { linea: 'ANDANADA METEÓRICA', motivo: 'y la anuncia' },
            { linea: '-6 VIDA', motivo: 'el golpe al Mini-tigre' },
            { linea: '-8 VIDA', motivo: 'y el golpe al Oculto' },
        ],
        diferenciasEsperadas: [
            { contiene: 'p1.vanguard.0.furor', motivo: 'la vieja no llega a cobrar nada' },
            { contiene: 'p1.vanguard.0.exhausted', motivo: 'ídem: no gasta la acción' },
            { contiene: 'p2.vanguard.0.currentHp', motivo: 'los dos enemigos reciben su ataque especial' },
            { contiene: 'p2.vanguard.1.currentHp', motivo: 'ídem, incluido el Oculto' },
        ],
    },
];

correrSuite('regresion38', escenarios);
