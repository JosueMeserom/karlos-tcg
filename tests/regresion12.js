// tests/regresion12.js — Las dos cartas que interceptan el flujo de ataque:
//   Apagón (1023, GLOBAL_ANTES_DE_ATAQUE con moneda) y
//   Sifón de maná (1088, GLOBAL_TRAS_ATAQUE con condiciones).
// Sus bloques funcionales son byte-idénticos entre bases (ya vivían en el
// intérprete temprano); la nueva solo añade PREVIEW_GLOBAL. La suite valida
// el intérprete compartido corriendo el flujo REAL de ataque del motor, y
// que añadir el preview no perturbó la compilación de los hooks globales.
//
// HALLAZGO DOCUMENTADO (bug del motor, compartido por ambas bases, verificado
// empíricamente con la pila de llamadas): checkAttackStatus invoca
// onGlobalBeforeAttack de los eventos activos en DOS bucles distintos (el de
// "Eventos activos" y otro duplicado tras las auras de vanguardia/retaguardia).
// Resultado: Apagón tira DOS monedas por ataque (con doble log visible)
// cuando el texto de la carta dice una; basta una cruz en cualquiera de las
// dos para bloquear. Ambas bases se comportan igual, así que la regresión
// pasa — pero es un argumento directo para el "punto único de intercepción
// en performAttack" de la tarea de interceptores (docs/DSL_cartas_diseno.md
// §10-11), que debería eliminar el bucle duplicado.

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'Apagón jugado desde la mano: doble cara y el ataque procede (doble moneda documentada)',
        monedas: ['cara', 'cara'],
        turnoDe: 'p1',
        p1: { vanguardia: [{ carta: 'Gallina del infinito', furor: 0 }], mano: ['Apagón'] },
        p2: { vanguardia: [{ carta: 'Oso con armadura', furor: 0 }] },
        pasos: [
            { jugar: 'Apagón' }, // AL_JUGAR: "¡Las luces se apagan...!"
            { atacar: 'Gallina del infinito', objetivo: 'Oso con armadura' },
        ],
    },
    {
        nombre: 'Apagón: cruz a la primera, el ataque falla y el atacante queda agotado sin hacer daño',
        monedas: ['cruz'],
        turnoDe: 'p1',
        p1: { vanguardia: [{ carta: 'Gallina del infinito', furor: 0 }], evento: { carta: 'Apagón', duracion: 2 } },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 3 }] },
        pasos: [
            { atacar: 'Gallina del infinito', objetivo: 'Mini-tigre' },
        ],
    },
    {
        nombre: 'Apagón: cara y luego cruz — la segunda invocación del bucle duplicado bloquea',
        monedas: ['cara', 'cruz'],
        turnoDe: 'p1',
        p1: { vanguardia: [{ carta: 'Gallina del infinito', furor: 0 }], evento: { carta: 'Apagón', duracion: 2 } },
        p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 3 }] },
        pasos: [
            { atacar: 'Gallina del infinito', objetivo: 'Mini-tigre' },
        ],
    },
    {
        nombre: 'Apagón afecta también al rival del dueño (p2 ataca bajo el Apagón de p1)',
        monedas: ['cara', 'cara'],
        turnoDe: 'p2',
        p1: { vanguardia: [{ carta: 'Oso con armadura', furor: 0 }], evento: { carta: 'Apagón', duracion: 3 } },
        p2: { vanguardia: [{ carta: 'Gallina del infinito', furor: 0 }] },
        pasos: [
            { atacar: 'Gallina del infinito', objetivo: 'Oso con armadura' },
        ],
    },
    {
        nombre: 'Simon (immuneToApagon) ataca sin tirar ninguna moneda',
        monedas: [], // estricto: si Apagón pidiera moneda, la cola vacía haría fallar el escenario
        turnoDe: 'p1',
        p1: { vanguardia: [{ carta: 'Simon', furor: 0 }], evento: { carta: 'Apagón', duracion: 2 } },
        p2: { vanguardia: [{ carta: 'Oso con armadura', vida: 3 }] },
        pasos: [
            { atacar: 'Simon', objetivo: 'Oso con armadura' },
        ],
    },
    {
        nombre: 'Apagón caduca: "Vuelve la luz." y el evento va al descarte',
        turnoDe: 'p2',
        p1: { vanguardia: ['Oso con armadura'], evento: { carta: 'Apagón', duracion: 1 }, mazo: ['Longaniza'] },
        p2: { vanguardia: ['Mini-tigre'], mazo: ['Longaniza'] },
        pasos: [
            { finTurno: true }, // p2→p1: duración 1→0, AL_CADUCAR
        ],
    },
    {
        nombre: 'Sifón de maná: ataque normal propio con daño roba 1 de Furor al defensor',
        turnoDe: 'p1',
        p1: { vanguardia: [{ carta: 'Gallina del infinito', furor: 0 }], evento: { carta: 'Sifón de maná', duracion: 2 } },
        p2: { vanguardia: [{ carta: 'Oso con armadura', furor: 2 }] }, // dmg 7-5=2, sobrevive con 1
        pasos: [
            { atacar: 'Gallina del infinito', objetivo: 'Oso con armadura' },
        ],
    },
    {
        nombre: 'Sifón de maná no roba si el daño no llega a 1 (Esbirro vs Personaje: 0.5)',
        turnoDe: 'p1',
        p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 0 }], evento: { carta: 'Sifón de maná', duracion: 2 } },
        p2: { vanguardia: [{ carta: 'Karlos', furor: 2 }] }, // atk 2 - def 6 → 0.5 de daño
        pasos: [
            { atacar: 'Mini-tigre', objetivo: 'Karlos' },
        ],
    },
    {
        nombre: 'Sifón de maná no roba si el defensor no tiene Furor',
        turnoDe: 'p1',
        p1: { vanguardia: [{ carta: 'Gallina del infinito', furor: 0 }], evento: { carta: 'Sifón de maná', duracion: 2 } },
        p2: { vanguardia: [{ carta: 'Oso con armadura', furor: 0 }] },
        pasos: [
            { atacar: 'Gallina del infinito', objetivo: 'Oso con armadura' },
        ],
    },
    {
        nombre: 'Sifón de maná no reacciona a los ataques del rival del dueño',
        turnoDe: 'p2',
        p1: { vanguardia: [{ carta: 'Oso con armadura', furor: 2 }], evento: { carta: 'Sifón de maná', duracion: 2 } },
        p2: { vanguardia: [{ carta: 'Gallina del infinito', furor: 0 }] },
        pasos: [
            { atacar: 'Gallina del infinito', objetivo: 'Oso con armadura' },
        ],
    },
    {
        nombre: 'Sifón de maná + PUÑALADA de Sra. Kumicho: la habilidad de ataque normal también roba',
        turnoDe: 'p1',
        p1: { vanguardia: [{ carta: 'Sra. Kumicho', furor: 1 }], evento: { carta: 'Sifón de maná', duracion: 2 } },
        p2: { vanguardia: [{ carta: 'Oso con armadura', furor: 2 }] }, // dmg 4-5→1 (mínimo), sobrevive; roba tras el golpe
        pasos: [
            { habilidad: 'Sra. Kumicho' },
            { confirmar: true },
            { elegir: ['Oso con armadura'] },
        ],
    },
];

correrSuite('regresion12', escenarios);
