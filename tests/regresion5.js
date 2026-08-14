// tests/regresion5.js — Eventos con ciclo de vida (jugar → disparos → caducar):
//   De compras (1014, FIN_TURNO), Caza del tesoro (1027, AL_JUGAR/AL_CADUCAR),
//   Infundir desesperación (30, bloqueo de Furor + AL_CADUCAR).
// Ejercitan el ciclo completo de turnos del harness: decremento de duración en
// la fase de inicio del dueño, disparos de FIN_TURNO y expiración con modales.
//
// De compras: la nueva restaura el log decorativo de expiración ("Termina el
// día De compras de {jugador}.") vía un trigger AL_CADUCAR sin efectos, a
// petición de Toto, con la sintaxis/estilo 3ª-persona del resto del proyecto.

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'De compras: compra un Ingerible, luego no encuentra nada, y caduca',
        semilla: 3,
        turnoDe: 'p1',
        p1: {
            vanguardia: ['Oso con armadura'],
            evento: { carta: 'De compras', duracion: 2 },
            // De abajo a arriba del array interno; la búsqueda escanea en orden
            mazo: ['Mini-tigre', 'Longaniza', 'Robot de seguridad SP', 'Droide antidisturbios', 'Gallina del infinito'],
        },
        p2: { vanguardia: ['Mini-tigre'], mazo: ['Oso con armadura', 'Longaniza', 'Robot de seguridad SP'] },
        pasos: [
            { finTurno: true }, // FIN_TURNO p1: compra la Longaniza y baraja → turno p2
            { finTurno: true }, // p2 pasa → inicio p1: roba, duración 2→1
            { finTurno: true }, // FIN_TURNO p1: ya no hay Ingeribles → "no quedaba nada" → turno p2
            { finTurno: true }, // p2 pasa → inicio p1: duración 1→0 → caduca
        ],
        logsIntencionados: [
            { de: 'activo: De compras', a: 'activo: De compras de J1 (Jugador 1)', motivo: 'NORMA DEL PROYECTO aplicada al {carta} del DSL (14-ago-2026): un log que nombra una carta dice de quien es, con el formato de siempre. La vieja usaba el nombre pelado. Mismo mensaje, nombre completo' },
            { de: 'Barajando el mazo...', a: 'Barajando el mazo de J1 (Jugador 1)...',
              motivo: 'atribución de jugador pedida por Toto (21-jul-2026): los logs de zonas ocultas dicen de quién son; la vieja decía "Barajando el mazo..." a secas' },
            { de: 'Has comprado: Longaniza.', a: 'J1 (Jugador 1) ha comprado: Longaniza de J1 (Jugador 1).',
              motivo: 'norma del proyecto (3ª persona con {jugador}): la vieja hablaba en 2ª persona' },
            { de: 'Has mirado toda la tienda y no quedaba nada de eso.', a: 'J1 (Jugador 1) ha mirado toda la tienda y no quedaba nada de eso.',
              motivo: 'norma del proyecto (3ª persona con {jugador}): la vieja hablaba en 2ª persona' },
            { de: 'Termina tu día De compras.', a: 'Termina el día De compras de J1 (Jugador 1).',
              motivo: 'norma del proyecto (3ª persona con {jugador}): a petición de Toto, restaurado como AL_CADUCAR en la nueva' },
        ],
    },
    {
        nombre: 'Caza del tesoro caduca: p1 busca su recompensa, p2 declina',
        semilla: 5,
        turnoDe: 'p2',
        p1: {
            vanguardia: ['Oso con armadura'],
            evento: { carta: 'Caza del tesoro', duracion: 1 },
            mazo: ['Mini-tigre', 'Espada V', 'Canceladora', 'Robot de seguridad SP'],
        },
        p2: {
            vanguardia: ['Droide antidisturbios'],
            mazo: ['Chaqueta metálica defensiva de la muerte', 'Mini-tigre', 'Longaniza'],
        },
        pasos: [
            { finTurno: true },                    // p2 pasa → inicio p1: duración 1→0 → caduca
            { opcion: 'SÍ, BUSCAR EN EL MAZO' },   // p1 acepta
            { elegir: ['Espada V'] },              // p1 elige entre Espada V y Canceladora
            { opcion: 'NO BUSCAR' },               // p2 declina
        ],
        logsIntencionados: [
            { de: 'Barajando el mazo...', a: 'Barajando el mazo de J1 (Jugador 1)...',
              motivo: 'atribución de jugador pedida por Toto (21-jul-2026): los logs de zonas ocultas dicen de quién son; la vieja decía "Barajando el mazo..." a secas' },
        ],
    },
    {
        nombre: 'Infundir desesperación bloquea el Furor del rival en su fase',
        turnoDe: 'p1',
        p1: {
            vanguardia: [{ carta: 'Oso con armadura', furor: 1 }],
            evento: { carta: 'Infundir desesperación', duracion: 3 },
            mazo: ['Mini-tigre'],
        },
        p2: {
            vanguardia: [{ carta: 'Mini-tigre', furor: 0 }, { carta: 'Droide antidisturbios', furor: 2 }],
            mazo: ['Longaniza'],
        },
        pasos: [
            { finTurno: true }, // turno de p2: su fase de Furor queda bloqueada por el evento de p1
        ],
    },
    {
        nombre: 'Infundir desesperación caduca: +3 de Furor a los enemigos de vanguardia',
        // Aquí el flotante retirado no era un duplicado: era MENTIRA. El propio Infundir
        // desesperación sigue en juego en el instante en que caduca, así que bloquea el Furor
        // que él mismo regala y el cambio real es 0 -las dos bases acaban con el MISMO Furor,
        // el estado coincide-. La vieja pintaba "+3 FUROR" igualmente porque lo tenía escrito a
        // mano; el automático de modifyStat no sale (aborta con amount 0), que es lo honesto.
        // OJO: eso deja al descubierto un fallo REAL de la carta, no de la migración.
        flotantesSoloVieja: [ { linea: '+3 FUROR', motivo: 'la vieja anunciaba un +3 que nunca ocurría (el propio evento lo bloquea al caducar); el motor no pinta nada porque el cambio real es 0' } ],
        turnoDe: 'p2',
        p1: {
            vanguardia: ['Oso con armadura'],
            evento: { carta: 'Infundir desesperación', duracion: 1 },
            mazo: ['Mini-tigre'],
        },
        p2: {
            vanguardia: [{ carta: 'Mini-tigre', furor: 1 }],
            retaguardia: ['Droide antidisturbios'], // en retaguardia: no debe recibir Furor
            mazo: ['Longaniza'],
        },
        pasos: [
            { finTurno: true }, // p2 pasa → inicio p1: duración 1→0 → caduca → +3 Furor a la vanguardia de p2
        ],
    },
];

correrSuite('regresion5', escenarios);
