// tests/auditar_flechas.js — qué cartas enseñan su coste al presentarse y cuáles no.
//
// Una carta se presenta CON lo que ha costado (§14.bis de la rúbrica): de cada carta que paga o
// que cumple el requisito sale una flecha hacia el escaparate. Hay tres:
//
//   · coste     (ámbar) - pierdes LA CARTA (se descarta para pagar).
//   · tributo   (rojo)  - pierdes FUROR; la carta se queda donde está.
//   · requisito (lima)  - no pierdes nada, solo se comprueba.
//
// Pero eso NO es automático: hay que marcarlo (`esCoste` / `esRequisito` en el DSL, o
// `DSL._marcarCoste` en una carta imperativa). Este fichero enumera quién lo tiene y quién no,
// para que "faltan cartas por marcar" deje de ser una intuición y sea una lista que mengua.
//
// Cómo detecta a un candidato, y por qué así:
//   · Un MODIFICAR_STAT de `furor` con delta NEGATIVO dentro de un JUGAR/AL_CONSUMIR/ANTES_DE_
//     JUGAR es un tributo. Da igual que el pagador salga de un ELEGIR o de un pool automático.
//   · El `text` de la carta empieza por "Coste:" o "Requisito:" (gramática fijada en la rúbrica),
//     que es la declaración de intenciones de la propia carta.
// Lo segundo es lo que hace la auditoría útil de verdad: pilla cartas cuyo coste se cobra con
// código a mano y que por tanto NUNCA saldrían buscando ops del DSL.
//
//   node tests/auditar_flechas.js            # resumen
//   node tests/auditar_flechas.js --detalle  # con el motivo carta por carta
//
// Informativo: NO devuelve código de error (marcar una carta es una decisión de diseño de Toto,
// no una regresión). Lo que sí falla es una carta MARCADA de forma incoherente.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const detalle = process.argv.includes('--detalle');

// --- CARD_DB real, en un sandbox mínimo (mismo truco que el resto de auditorías) ---
const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    document: {
        getElementById: () => ({ style: {}, classList: { add() {}, remove() {} } }),
        createElement: () => ({ style: {}, classList: { add() {} }, appendChild() {} }),
        createElementNS: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
        querySelector: () => null, querySelectorAll: () => [],
    },
    localStorage: { getItem: () => null, setItem() {} },
    setTimeout() {}, clearTimeout() {}, alert() {},
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'public/reglas.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'public/cartas.js'), 'utf8'), sandbox);
const CARD_DB = vm.runInContext('CARD_DB', sandbox);

// Cartas imperativas que marcan a mano: se leen del fuente, no de la estructura.
const SRC = fs.readFileSync(path.join(RAIZ, 'public/cartas.js'), 'utf8');
const LINEAS = SRC.split('\n');
const marcaAMano = new Set();
LINEAS.forEach((l, i) => {
    if (!/DSL\._marcarCoste\s*\(/.test(l) || /^\s*\/\//.test(l)) return;
    for (let j = i; j >= 0; j--) {
        const m = LINEAS[j].match(/^\s*(?:id:\s*\d+,\s*)?name:\s*"([^"]+)"/);
        if (m) { marcaAMano.add(m[1]); return; }
    }
});

// Triggers en los que un coste es "coste de jugar la carta" (los únicos que se presentan).
const TRIGGERS_DE_JUGADA = new Set(['JUGAR', 'AL_CONSUMIR', 'ANTES_DE_JUGAR', 'AL_JUGAR', 'AL_EQUIPAR', 'AL_USAR_AYUDA']);

// Recorre efectos anidados (ELEGIR lleva los suyos dentro).
function* efectosDe(lista) {
    for (const e of (lista || [])) {
        yield e;
        if (Array.isArray(e.efectos)) yield* efectosDe(e.efectos);
        for (const rama of ['siExito', 'siFallo', 'siMuere']) {
            if (e[rama] && Array.isArray(e[rama].efectos)) yield* efectosDe(e[rama].efectos);
        }
    }
}

const filas = [];
for (const c of CARD_DB) {
    const abilities = Array.isArray(c.abilities) ? c.abilities : [];
    let tributo = null, marcado = false, incoherente = null;

    for (const ab of abilities) {
        if (!TRIGGERS_DE_JUGADA.has(ab.trigger)) continue;
        for (const e of efectosDe(ab.efectos)) {
            if (e.esCoste || e.esRequisito || e.esTributo) marcado = true;
            const esFurorNegativo = e.op === 'MODIFICAR_STAT' && e.stat === 'furor'
                && (typeof e.delta === 'number' ? e.delta < 0 : (e.vaciar || e.deltaCondicional));
            if (esFurorNegativo) tributo = tributo || (typeof e.delta === 'number' ? Math.abs(e.delta) : '?');
            // Marcar un requisito sobre algo que se PIERDE, o un coste sobre algo que no cambia,
            // sería mentir en el color. Solo se comprueba lo comprobable en máquina.
            if (e.esRequisito && esFurorNegativo) incoherente = 'marcada como requisito pero gasta Furor (es un tributo)';
        }
    }
    if (marcaAMano.has(c.name)) marcado = true;

    const txt = String(c.text || '');
    const diceCoste = /^\s*Coste:/i.test(txt) || /\bCoste:/.test(txt);
    const diceReq = /^\s*Requisito:/i.test(txt) || /\bRequiere\b/.test(txt);
    if (!tributo && !diceCoste && !diceReq) continue;

    filas.push({
        nombre: c.name, marcado, incoherente,
        motivo: [tributo ? `tributa ${tributo} de Furor` : null,
                 diceCoste ? 'su texto declara "Coste:"' : null,
                 diceReq ? 'su texto declara Requisito' : null].filter(Boolean).join(' · '),
    });
}

const conFlecha = filas.filter(f => f.marcado);
const sinFlecha = filas.filter(f => !f.marcado);
const malas = filas.filter(f => f.incoherente);

console.log('AUDITORÍA DE FLECHAS DE COSTE / TRIBUTO / REQUISITO\n');
console.log(`## Con flecha (${conFlecha.length})`);
console.log('   Enseñan de dónde sale lo que pagan al presentarse.');
conFlecha.forEach(f => console.log(`   · ${f.nombre}${detalle ? '  — ' + f.motivo : ''}`));

console.log(`\n## SIN flecha (${sinFlecha.length})`);
console.log('   Pagan o exigen algo, pero al presentarse no lo enseñan. No es un bug: marcar una');
console.log('   carta es una decisión de diseño. Esta es la lista de las que quedan por decidir.');
sinFlecha.forEach(f => console.log(`   · ${f.nombre}${detalle ? '  — ' + f.motivo : ''}`));

if (malas.length) {
    console.log(`\n## INCOHERENTES (${malas.length}) — esto sí hay que arreglarlo`);
    malas.forEach(f => console.log(`   · ${f.nombre}: ${f.incoherente}`));
}

console.log(`\nTOTAL: ${filas.length} cartas con coste/tributo/requisito · ${conFlecha.length} con flecha · ${sinFlecha.length} sin ella`);
if (malas.length) { console.log('\nHAY MARCAJES INCOHERENTES.'); process.exit(1); }
