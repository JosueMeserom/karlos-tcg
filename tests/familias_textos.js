// tests/familias_textos.js — agrupa las cartas por LO QUE HACEN para comparar CÓMO lo dicen.
//
// El problema que resuelve (Toto, 5-ago-2026): "Águila y Xanadu tienen pasivas ligeramente
// similares, pero lo que tienen en común no está redactado igual, sino completamente diferente".
// Eso no lo caza una auditoría mecánica de vocabulario: las dos frases pueden ser impecables por
// separado y aun así no parecerse en nada.
//
// La intuición era que hacía falta leer las 148 cartas y compararlas entre sí — 10.878 parejas,
// carísimo. **No hace falta: el DSL ya es el índice semántico.** Dos cartas que hacen lo mismo
// tienen la misma firma de disparadores y ops. Así que se agrupa por firma (mecánico y gratis) y
// solo se leen los textos DENTRO de cada grupo, que es donde la comparación tiene sentido. De
// 10.878 parejas se baja a unas pocas decenas, y encima ya vienen clasificadas por tema.
//
// Para las que siguen siendo imperativas se usa su firma de hooks, que sirve igual de bien.
//
//   node tests/familias_textos.js          # familias con 2+ cartas
//   node tests/familias_textos.js --todas  # también las de una sola carta
//
// No comprueba nada ni falla nunca: es una herramienta de lectura para decidir redacciones.

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    document: { getElementById: () => ({ style: {}, classList: { add() {}, remove() {} } }), createElement: () => ({ style: {}, classList: { add() {} }, appendChild() {} }), querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem() {} }, setTimeout() {}, clearTimeout() {}, alert() {},
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'public/reglas.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'public/cartas.js'), 'utf8'), sandbox);
const CARTAS = vm.runInContext('CARD_DB', sandbox).filter(c => c && c.text);

// Hooks que describen QUÉ HACE una carta imperativa (los que el compilador cuelga solo no valen,
// pero para las cartas SIN `abilities` no hay compilador de por medio, así que son los suyos).
const HOOKS_SEMANTICOS = [
    'onBeforeDefend', 'onBeforeTakeDamage', 'onAfterAttack', 'onAfterDefend', 'onInterceptAttack',
    'onDeath', 'onAllyDeath', 'onStartTurn', 'onEndTurn', 'onUpdatePassive', 'onExpire',
    'onBeforeGainFuror', 'onGlobalBeforeGainFuror', 'onDoTTick', 'onBeforeHealed',
    'canAttackNormally', 'getCustomActions', 'onEquipUpdate', 'onUnequip',
    'onHandReactionToAllyAttack', 'onHandReactionToAllyDamage', 'onGlobalStartTurn',
];

// Qué OPS usa un árbol de efectos (sin repetir).
function opsDe(nodo, acc = new Set()) {
    if (!nodo || typeof nodo !== 'object') return acc;
    if (Array.isArray(nodo)) { nodo.forEach(n => opsDe(n, acc)); return acc; }
    if (nodo.op) acc.add(nodo.op);
    for (const k of Object.keys(nodo)) if (k !== 'op') opsDe(nodo[k], acc);
    return acc;
}

// La firma de una carta es el conjunto de "cosas que hace", una por disparador (con sus ops
// principales) o por hook. Se ordena para que dos cartas iguales den la misma cadena.
function firmasDe(c) {
    const out = [];
    for (const a of (c.abilities || [])) {
        const ops = [...opsDe(a)].sort().join('+');
        out.push(ops ? `${a.trigger}[${ops}]` : a.trigger);
    }
    for (const h of HOOKS_SEMANTICOS) if (typeof c[h] === 'function') out.push(`hook:${h}`);
    return out;
}

// Cada carta entra en TANTAS familias como cosas hace: una carta con Pasiva y Activa aparece en
// la familia de cada una. Es lo que interesa — lo que se compara es la frase, no la carta entera.
const familias = new Map();
for (const c of CARTAS) {
    for (const f of firmasDe(c)) {
        if (!familias.has(f)) familias.set(f, []);
        familias.get(f).push(c);
    }
}

// Trocea el texto en sus cajas, para poder enseñar solo la parte relevante.
function cajas(c) {
    const t = c.text || '';
    const out = {};
    const mR = t.match(/Requisito:\s*([^.]+\.)/i); if (mR) out.Requisito = mR[1];
    const mC = t.match(/Coste:\s*([^.]+\.)/i); if (mC) out.Coste = mC[1];
    const mP = t.match(/(?:^|\s)P:\s*(.*?)(?=\s+A:|$)/s); if (mP) out.Pasiva = mP[1].trim();
    const mA = t.match(/(?:^|\s)A:\s*(.*)$/s); if (mA) out.Activa = mA[1].trim();
    if (!out.Pasiva && !out.Activa) out.cuerpo = t;
    return out;
}

const todas = process.argv.includes('--todas');
const lista = [...familias.entries()]
    .filter(([, cs]) => todas || cs.length >= 2)
    .sort((a, b) => b[1].length - a[1].length);

console.log(`${CARTAS.length} cartas · ${familias.size} familias de comportamiento`
    + ` · ${lista.length} con ${todas ? 'al menos 1' : '2 o más'} carta(s)\n`);
console.log('Dentro de cada familia, las cartas HACEN lo mismo: sus textos deberían PARECERSE.\n');

for (const [firma, cs] of lista) {
    console.log(`\n══ ${firma}   (${cs.length})`);
    for (const c of cs) {
        const cj = cajas(c);
        // Se enseña la caja que más probablemente corresponde a esta familia.
        const clave = /ACTIVA/.test(firma) ? 'Activa'
            : /PASIVA|AURA|ANTES_DE|TRAS_|hook:/.test(firma) ? 'Pasiva'
            : Object.keys(cj)[0];
        const txt = cj[clave] || cj.Pasiva || cj.cuerpo || c.text;
        console.log(`   · ${c.name}: ${txt}`);
    }
}
