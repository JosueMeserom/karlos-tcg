// tests/regresion49.js — COMA (Valafar), SANCIÓN (Ángel) y CASTIGO (Serafín) migradas al DSL
// (31-jul-2026), las tres con el MISMO bug de diseño corregido de la misma forma.
//
// Corrección de diseño, no migración "fiel" (betasteo de Toto): el código imperativo
// original de las tres exigía solo 1 enemigo en vanguardia para ACTIVARSE (`vanguard.length
// === 0` bloquea, nada más) y luego dejaba `canStopEarly` resolver con 1..N objetivos según
// lo clicado. Toto confirmó que eso es un bug del código original, no un requisito real de
// la carta — el texto de las tres dice literalmente "a 2/dos/3 enemigos", exactamente como
// Bi-choque, que SÍ exige (bien) >=N objetivos válidos ANTES de dejar activar la Habilidad.
// Corregido en la migración: `requisitos` con `count:{quien:"ENEMIGO",zona:"vanguardia"},
// op:">=", valor:N` gatea `canActivateAbility` (igual que Bi-choque), y con esa garantía la
// selección de objetivos pasa a ser "exactamente N, sin parada anticipada" — el camino RAW
// de `target:{quien,cantidad:N}`, YA soportado sin cambios por el compilador de ACTIVA (el
// mismo mecanismo que ya usa DEVASTACIÓN AGAH con 2 ATACAR seguidos). No hace falta ninguna
// arquitectura de canStopEarly: la supuesta necesidad de esa pieza (documentada en sesiones
// anteriores junto a COMA/SANCIÓN, y repetida sin volver a comprobarlo para CASTIGO) partía
// de la misma premisa equivocada las tres veces.
//
// Consecuencia: NO se prueba en este arnés el caso "N-1 enemigos presentes" contra ambas
// bases a la vez (la vieja seguiría adelante con menos objetivos -el bug que se corrige-, la
// nueva lo rechaza sin más). Reproducir fielmente ese camino de la vieja solo para descartarlo
// no compensa; en su lugar, cada escenario "rechazada: faltan enemigos" usa `soloEn:'nueva'`
// sobre el propio paso `{habilidad}` — si `canActivateAbility` no rechazara correctamente, el
// motor dejaría abierta una interacción `confirmar` sin responder y el arnés fallaría solo
// por eso (fin de escenario con interacción pendiente), sin necesitar ninguna aserción más.
//
// Diferencias intencionadas (mismo canal shared que Gólem de tierra, regresion33): los avisos
// de sistema "Objetivo N fijado..."/"Objetivos listos..." los emite handleAbilityTargetSelection
// (index.html), código COMPARTIDO por ambas bases -ni COMA ni SANCIÓN usan ELEGIR/pickBoardTargets,
// a diferencia de SEÍSMO-, así que salen IDÉNTICOS en las dos y no se declaran.
//
// APLICAR_ESTADO (Sueño) reordena `checkDeath` respecto al log/floater de Sueño frente a la
// vieja (dealDamage -> checkDeath -> Sueño en la nueva; dealDamage -> Sueño -> checkDeath en
// la vieja) porque así es como ya funciona el op ATACAR/siExito genérico (Puñalada, Gólem de
// tierra...). Sin efecto observable: checkDeath no hace nada si la carta sigue viva.
//
// La procedencia guardada en card.status.sueno también mejora (no solo el log): la vieja
// pasaba `card.name` (string suelto: source="Valafar", sourceAbility null, sourceInstanceId
// null); APLICAR_ESTADO, sin `fuente` explícita, pasa la CARTA (sourceCard) — source pasa a
// "Valafar de J1 (Jugador 1)" (formato completo, §13 del doc de diseño) y sourceAbility a
// "COMA" (SÍ la causa una Activa, así que "por HABILIDAD" corresponde en el detalle). Mismo
// criterio que cualquier otro APLICAR_ESTADO ya migrado; declarado como diferenciasEsperadas.

'use strict';
const { correrSuite } = require('./harness');

// Sueño: la vieja usa enemy.name a secas; la nueva rellena {objetivo} con DSL._nombre
// (norma del proyecto, logs en 3ª persona con dueño).
const suenoVieja = (nombrePlano) => ({ linea: `${nombrePlano} cae en un profundo Sueño.`, motivo: 'la vieja usa enemy.name a secas' });
const suenoNueva = (nombreConDueno) => ({ linea: `${nombreConDueno} cae en un profundo Sueño.`, motivo: 'norma del proyecto (logs en 3ª persona con dueño)' });

const escenarios = [
    // ---------------- COMA (Valafar) ----------------
    {
        nombre: 'COMA: ataque especial a 2 enemigos de vanguardia, ambos sobreviven y caen Dormidos',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Valafar', furor: 4 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 20 }, { carta: 'Robot de seguridad SP', vida: 20 }] },
        pasos: [
            { habilidad: 'Valafar' }, { confirmar: true },
            { elegir: ['Mini-tigre', 'Robot de seguridad SP'] },
        ],
        logsSoloVieja: [
            suenoVieja('Mini-tigre'),
            suenoVieja('Robot de seguridad SP'),
        ],
        logsSoloNueva: [
            suenoNueva('Mini-tigre [1] de J2 (Jugador 2)'),
            suenoNueva('Robot de seguridad SP [1] de J2 (Jugador 2)'),
        ],
        diferenciasEsperadas: [
            { contiene: 'status.sueno.source', motivo: 'ver nota de procedencia del Sueño arriba' },
            { contiene: 'status.sueno.sourceAbility', motivo: 'ver nota de procedencia del Sueño arriba' },
            { contiene: 'status.sueno.sourceInstanceId', motivo: 'ver nota de procedencia del Sueño arriba' },
        ],
    },
    {
        nombre: 'COMA: un objetivo muere por el golpe y NO cae Dormido (siExito exige seguir con vida)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Valafar', furor: 4 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 3 }, { carta: 'Robot de seguridad SP', vida: 20 }] },
        pasos: [
            { habilidad: 'Valafar' }, { confirmar: true },
            { elegir: ['Mini-tigre', 'Robot de seguridad SP'] },
        ],
        logsSoloVieja: [ suenoVieja('Robot de seguridad SP') ],
        logsSoloNueva: [ suenoNueva('Robot de seguridad SP [1] de J2 (Jugador 2)') ],
        diferenciasEsperadas: [
            { contiene: 'status.sueno.source', motivo: 'ver nota de procedencia del Sueño arriba' },
            { contiene: 'status.sueno.sourceAbility', motivo: 'ver nota de procedencia del Sueño arriba' },
            { contiene: 'status.sueno.sourceInstanceId', motivo: 'ver nota de procedencia del Sueño arriba' },
        ],
    },
    {
        nombre: 'COMA rechazada: no hay enemigos en vanguardia',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Valafar', furor: 4 }] },
        p2: {},
        pasos: [ { habilidad: 'Valafar' } ],
    },
    {
        nombre: 'COMA rechazada: solo hay 1 enemigo válido en vanguardia (corrección del bug original, exige >=2)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Valafar', furor: 4 }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { soloEn: 'nueva', habilidad: 'Valafar' } ],
    },
    {
        nombre: 'COMA: con 3 enemigos válidos en vanguardia, se activa igual y se eligen exactamente 2',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Valafar', furor: 4 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 20 }, { carta: 'Robot de seguridad SP', vida: 20 }, { carta: 'Oso con armadura', vida: 20 }] },
        pasos: [
            { habilidad: 'Valafar' }, { confirmar: true },
            { elegir: ['Mini-tigre', 'Robot de seguridad SP'] },
        ],
        logsSoloVieja: [
            suenoVieja('Mini-tigre'),
            suenoVieja('Robot de seguridad SP'),
        ],
        logsSoloNueva: [
            suenoNueva('Mini-tigre [1] de J2 (Jugador 2)'),
            suenoNueva('Robot de seguridad SP [1] de J2 (Jugador 2)'),
        ],
        diferenciasEsperadas: [
            { contiene: 'status.sueno.source', motivo: 'ver nota de procedencia del Sueño arriba' },
            { contiene: 'status.sueno.sourceAbility', motivo: 'ver nota de procedencia del Sueño arriba' },
            { contiene: 'status.sueno.sourceInstanceId', motivo: 'ver nota de procedencia del Sueño arriba' },
        ],
    },

    // ---------------- SANCIÓN (Ángel) ----------------
    {
        nombre: 'SANCIÓN: ataque especial a 2 enemigos de vanguardia (sin efecto adicional, solo daño)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Ángel', furor: 2 }] },
        p2: { vanguardia: ['Mini-tigre', 'Robot de seguridad SP'] },
        pasos: [
            { habilidad: 'Ángel' }, { confirmar: true },
            { elegir: ['Mini-tigre', 'Robot de seguridad SP'] },
        ],
    },
    {
        nombre: 'SANCIÓN rechazada: no hay enemigos en vanguardia',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Ángel', furor: 2 }] },
        p2: {},
        pasos: [ { habilidad: 'Ángel' } ],
    },
    {
        nombre: 'SANCIÓN rechazada: solo hay 1 enemigo válido en vanguardia (corrección del bug original, exige >=2)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Ángel', furor: 2 }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { soloEn: 'nueva', habilidad: 'Ángel' } ],
    },

    // ---------------- CASTIGO (Serafín) ----------------
    {
        nombre: 'CASTIGO: ataque especial a 3 enemigos de vanguardia (sin efecto adicional, solo daño)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Serafín', furor: 4 }] },
        p2: { vanguardia: ['Mini-tigre', 'Robot de seguridad SP', 'Oso con armadura'] },
        pasos: [
            { habilidad: 'Serafín' }, { confirmar: true },
            { elegir: ['Mini-tigre', 'Robot de seguridad SP', 'Oso con armadura'] },
        ],
    },
    {
        nombre: 'CASTIGO rechazado: no hay enemigos en vanguardia',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Serafín', furor: 4 }] },
        p2: {},
        pasos: [ { habilidad: 'Serafín' } ],
    },
    {
        // REVERTIDO (Toto, 23-ago-2026): CASTIGO vuelve a exigir TRES exactos. El "hasta 3" del
        // 21-ago se probó y hacía la carta demasiado fuerte -es un Arcángel, y la familia ya
        // gana sola-, así que el cupo fijo vuelve a ser lo que la frena. Zoe (calcinante) se
        // queda con su "hasta": ahí el tope es el reparto entre filas, no la potencia.
        // Con dos enemigos, la Habilidad no arranca: las dos bases coinciden otra vez.
        // La NUEVA lo rechaza al pulsar la Habilidad (requisito de 3 enemigos); la VIEJA llega a
        // abrir el modal de confirmación y se planta después, así que ese paso va `soloEn: vieja`.
        nombre: 'CASTIGO con solo 2 enemigos: se rechaza (hacen falta 3)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Serafín', furor: 4 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 9 }, { carta: 'Robot de seguridad SP', vida: 9 }] },
        pasos: [ { habilidad: 'Serafín' }, { soloEn: 'vieja', confirmar: true } ],
        diferenciasEsperadas: [
            { contiene: 'pendingAbilityTarget',
              motivo: 'la vieja te deja empezar a elegir objetivos y se queda esperando unos que no existen; la nueva lo rechaza al pulsar la Habilidad, que es la norma: no se arranca lo que no puede terminar' },
        ],
    },
    {
        nombre: 'CASTIGO: con 4 enemigos válidos en vanguardia, se activa igual y se eligen exactamente 3',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Serafín', furor: 4 }] },
        p2: { vanguardia: ['Mini-tigre', 'Robot de seguridad SP', 'Oso con armadura', { carta: 'Achmay', vida: 20 }] },
        pasos: [
            { habilidad: 'Serafín' }, { confirmar: true },
            { elegir: ['Mini-tigre', 'Robot de seguridad SP', 'Oso con armadura'] },
        ],
    },
];

correrSuite('regresion49', escenarios);
