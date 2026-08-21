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
        // REESCRITO (Toto, 21-ago-2026): CASTIGO pasa de "3 exactos" a "HASTA 3". Con el cupo fijo
        // la Habilidad quedaba muerta salvo con la vanguardia rival medio llena; así la carta es
        // más jugosa. Este escenario fijaba justo lo contrario -que con dos enemigos se
        // rechazara- y ahora fija que SÍ se puede, golpeando a los dos que hay.
        // La vieja no puede: su CASTIGO exige tres y ni arranca, así que la divergencia es total.
        nombre: 'CASTIGO con solo 2 enemigos: ya NO se rechaza, golpea a los dos (la vieja exigía 3)',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Serafín', furor: 4 }] },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 9 }, { carta: 'Robot de seguridad SP', vida: 9 }] },
        pasos: [
            { soloEn: 'nueva', habilidad: 'Serafín' },
            { soloEn: 'nueva', confirmar: true },
            // Al elegir al último enemigo que queda se alcanza el cupo y los ataques arrancan
            // solos, sin pulsar OK: mismo comportamiento que AL-FÉNIX.
            { soloEn: 'nueva', elegir: ['Mini-tigre', 'Robot de seguridad SP'] },
        ],
        // Todo lo que la nueva hace y la vieja ni empieza. Se declara entero, que es la forma de
        // dejar por escrito que la divergencia es la que se buscaba y no un descuido.
        logsSoloNueva: [
            { linea: 'Objetivo 1 fijado. Elige al siguiente objetivo.', motivo: 'la nueva entra en la selección de objetivos; la vieja rechaza la Habilidad antes' },
            { linea: 'Objetivos listos. ¡Ejecutando habilidad!', motivo: 'y la completa al elegir al segundo, porque ya no quedan más enemigos válidos (cierre automático de `hastaCantidad`)' },
            { linea: '¡Serafín imparte su CASTIGO divino!', motivo: 'ídem: la vieja no llega a lanzarla' },
            { linea: 'Mini-tigre [1] de J2 (Jugador 2) recibe 5 daño (9 Vida -> 4).', motivo: 'el ataque especial al primer enemigo' },
            { linea: 'Robot de seguridad SP [1] de J2 (Jugador 2) recibe 7 daño (9 Vida -> 2).', motivo: 'y al segundo' },
        ],
        flotantesSoloNueva: [
            { linea: '-4 FUR', motivo: 'la nueva paga el coste porque sí usa la Habilidad' },
            { linea: 'CASTIGO', motivo: 'y anuncia la Activa' },
            { linea: '-5 VIDA', motivo: 'el daño al primer enemigo' },
            { linea: '-7 VIDA', motivo: 'y al segundo' },
        ],
        diferenciasEsperadas: [
            { contiene: 'p1.vanguard.0.furor', motivo: 'la nueva SÍ usa la Habilidad y paga sus 4 de Furor; la vieja la rechaza por no haber 3 enemigos' },
            { contiene: 'p1.vanguard.0.exhausted', motivo: 'ídem: la nueva gasta la acción del turno' },
            { contiene: 'p2.vanguard.0.currentHp', motivo: 'el primer enemigo recibe el ataque especial, que en la vieja no llega a ocurrir' },
            { contiene: 'p2.vanguard.1.currentHp', motivo: 'y el segundo' },
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
