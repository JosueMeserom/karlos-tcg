// tests/auditar_etiquetas.js — que una etiqueta se escriba SIEMPRE igual, y que las que se
// consultan existan de verdad.
//
// EL FALLO QUE LA TRAJO (31-ago-2026): las etiquetas se comparan con `includes` sobre el array,
// o sea **exacto y sensible a mayúsculas**. Convivían siete escritas de dos formas ("diosa" y
// "Diosa", "científico" y "Científico"...) y eso no da ningún error: simplemente la carta que
// filtra no encuentra a la que debería. Dos consecuencias que llevaban meses en el juego:
//
//   · Alabanza y Rezo en grupo buscan 'Diosa' y **Edrielle llevaba 'diosa'**: no valía para
//     ninguna de las dos, siendo una de las cuatro Diosas del juego.
//   · Investigar y desarrollar da Furor a los 'Científico' y **Mill llevaba 'científico'**.
//
// Y se veía venir en el propio código: media docena de cartas ya consultaban LAS DOS grafías a
// mano (Feria del cómic, Deuda con la mafia) o usaban `includesCI` para esquivarlo. Eso es el
// síntoma, no el arreglo: cada carta nueva tenía que acordarse. Aquí se arregla el dato.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const FUENTE = fs.readFileSync(path.join(RAIZ, 'public/cartas.js'), 'utf8');

const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    document: { getElementById: () => ({ style: {}, classList: { add() {}, remove() {} } }),
        createElement: () => ({ style: {}, classList: { add() {} }, appendChild() {} }),
        querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem() {} },
    setTimeout() {}, clearTimeout() {}, alert() {},
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'public/reglas.js'), 'utf8'), sandbox);
vm.runInContext(FUENTE, sandbox);
const CARTAS = vm.runInContext('CARD_DB', sandbox).filter(Boolean);

// Etiquetas que alguna carta CONSULTA pero que todavía no lleva ninguna. Se declaran aquí con su
// motivo: una consulta a una etiqueta inexistente casi siempre es una errata, y las pocas que son
// legítimas apuntan a trabajo pendiente.
const SIN_CARTA_TODAVIA = {
    'Dios': "las dos cartas con etiqueta 'Dios' del Excel están sin implementar (Morfeo y Ornn); Alabanza y Rezo en grupo ya las esperan",
};

const problemas = [];

// ── 1. Ninguna etiqueta escrita de dos formas ────────────────────────────────
const porMinuscula = new Map();
for (const c of CARTAS) for (const t of (c.tags || [])) {
    const k = t.toLowerCase();
    if (!porMinuscula.has(k)) porMinuscula.set(k, new Map());
    const m = porMinuscula.get(k);
    m.set(t, (m.get(t) || []).concat([c.name]));
}
for (const [k, formas] of porMinuscula) {
    if (formas.size < 2) continue;
    const detalle = [...formas.entries()].map(([f, cartas]) => `"${f}" (${cartas.join(', ')})`).join('  vs  ');
    problemas.push(['DOS-GRAFIAS', `la etiqueta "${k}" se escribe de ${formas.size} formas: ${detalle}`]);
}

// ── 2. Toda etiqueta consultada existe tal cual ──────────────────────────────
const existentes = new Set();
CARTAS.forEach(c => (c.tags || []).forEach(t => existentes.add(t)));

const consultadas = new Map();   // valor -> [cómo se consulta]
const apunta = (val, como) => consultadas.set(val, (consultadas.get(val) || []).concat([como]));
for (const m of FUENTE.matchAll(/campo: "tags", op: "(includes|includesCI)", valor: "([^"]+)"/g)) apunta(m[2], m[1]);
for (const m of FUENTE.matchAll(/algunaEtiqueta: \[([^\]]+)\]/g))
    for (const v of m[1].matchAll(/"([^"]+)"/g)) apunta(v[1], 'algunaEtiqueta');
for (const m of FUENTE.matchAll(/tags(?:\s*\|\|\s*\[\])?\)?\.includes\(\s*['"]([^'"]+)['"]/g)) apunta(m[1], 'includes a mano');

for (const [val, comos] of consultadas) {
    // includesCI compara en minúsculas: le da igual la grafía, no se le exige nada.
    if (comos.every(c => c === 'includesCI')) continue;
    if (existentes.has(val)) continue;
    if (SIN_CARTA_TODAVIA[val]) continue;
    const casi = [...existentes].filter(e => e.toLowerCase() === val.toLowerCase());
    problemas.push(['NO-EXISTE', `se consulta la etiqueta "${val}" (${[...new Set(comos)].join(', ')}) y no la lleva ninguna carta` +
        (casi.length ? ` — pero sí existe "${casi.join('", "')}", así que es un problema de grafía` : '')]);
}

// ── 3. Las excepciones declaradas tienen que seguir haciendo falta ───────────
for (const [val, motivo] of Object.entries(SIN_CARTA_TODAVIA)) {
    if (existentes.has(val)) problemas.push(['SOBRA-EXCEPCION',
        `"${val}" ya la lleva alguna carta: quita su línea de SIN_CARTA_TODAVIA (${motivo})`]);
    else if (!consultadas.has(val)) problemas.push(['SOBRA-EXCEPCION',
        `"${val}" ya no la consulta ninguna carta: quita su línea de SIN_CARTA_TODAVIA`]);
}

console.log(`AUDITORÍA DE ETIQUETAS: ${CARTAS.length} cartas · ${existentes.size} etiquetas distintas · ${consultadas.size} consultadas`);
if (!problemas.length) {
    console.log('Ninguna etiqueta se escribe de dos formas y todas las consultadas existen.');
    if (Object.keys(SIN_CARTA_TODAVIA).length)
        console.log('Pendientes declaradas: ' + Object.entries(SIN_CARTA_TODAVIA).map(([k, v]) => `"${k}" (${v})`).join(' · '));
} else {
    const porCat = {};
    problemas.forEach(([c, d]) => (porCat[c] = porCat[c] || []).push(d));
    for (const [c, ds] of Object.entries(porCat)) {
        console.log(`\n## ${c} (${ds.length})`);
        ds.forEach(d => console.log('   · ' + d));
    }
    console.log(`\n${problemas.length} problema(s).`);
    process.exit(1);
}
