// tests/auditar_presenta.js — cartas que podrían colocarse SIN presentarse.
//
// §14: nada visible hasta el punto de compromiso, y en ese punto ocurre todo junto. Para
// cumplirlo, el cliente no presenta la carta al clicarla si todavía se puede cancelar: deja la
// presentación ARMADA (`_presentacionArmada`) y la dispara `DSL._comprometer` en cuanto pasa algo
// irreversible. Quién la dispara depende de la cadena, y ahí está la trampa:
//
//   · Un efecto que no sea ELEGIR/BUSCAR la dispara (_runEffectList lo hace por cada uno).
//   · Un `esCoste` aparcado la dispara.
//   · Un BUSCAR en el MAZO la dispara al abrir el visor.
//   · Desde el 15-ago-2026, el final de una cadena ANTES_DE_JUGAR la dispara pase lo que pase.
//
// Pero una cadena que es ELEGIR **de principio a fin** no tiene ninguno de esos: el ELEGIR se
// salta _comprometer a propósito (mientras eliges aún puedes arrepentirte), y si la lista se
// acaba ahí no queda nadie que lo llame. Le pasaba a Publicidad mental y a Exhibicionismo, cuyo
// ELEGIR solo APUNTA a quién afectar -el efecto de verdad es un AURA continua, que no es un
// efecto de la lista-: se colocaban sin presentarse y Toto lo vio jugando.
//
// Esta auditoría enumera toda carta cuya presentación se ARMA y comprueba que algo la dispare.
//
// QUÉ NO PUEDE COMPROBAR: las cartas que arman por un hook IMPERATIVO (onValidateTarget /
// onBeforePlayAsync escritos a mano). Ahí el disparo vive en código, no en una lista de efectos,
// y decidirlo pide leerlo. Se listan aparte para que consten, no para que se ignoren.
//
//   node tests/auditar_presenta.js            # resumen
//   node tests/auditar_presenta.js --detalle  # con la cadena de cada una
//
// DEVUELVE ERROR si encuentra una cadena sin disparo: colocarse sin presentarse no es una
// decisión de diseño, es §14 incumplida.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const detalle = process.argv.includes('--detalle');

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

// LA COMPROBACIÓN DE FONDO, y la razón de que esta auditoría siga sirviendo después del arreglo:
// hay DOS listas de triggers que tienen que decir lo mismo y viven en ficheros distintos.
//   · index.html decide con cuáles ARMA la presentación (`_hayVentana`).
//   · cartas.js decide en cuáles la DISPARA al acabar la cadena (`await DSL._comprometer`).
// Si alguien añade un trigger a la primera y se olvida de la segunda, vuelve exactamente el bug
// de Publicidad mental. Así que las dos se leen del fuente y se comparan, en vez de copiarlas
// aquí a mano — una tercera copia sería una tercera cosa que desincronizar.
const SRC_CLIENTE = fs.readFileSync(path.join(RAIZ, 'public/index.html'), 'utf8');
const SRC_MOTOR = fs.readFileSync(path.join(RAIZ, 'public/cartas.js'), 'utf8');

const _hayVentana = /_ab\.find\(a =>([^)]*)\)/.exec(SRC_CLIENTE) || [];
const ARMAN = [...String(_hayVentana[1] || '').matchAll(/'([A-Z_]+)'/g)].map(m => m[1]);
if (!ARMAN.length) { console.log('NO ENCUENTRO la lista `_hayVentana` en index.html.'); process.exit(1); }

// Qué cadenas comprometen al final: el compilador de cada trigger que llama a _comprometer.
const COMPROMETEN = new Set();
for (const t of ARMAN) {
    // El bloque del compilador de ese trigger, hasta el siguiente `abs.find`.
    const i = SRC_MOTOR.indexOf(`a.trigger === '${t}'`);
    if (i === -1) continue;
    const j = SRC_MOTOR.indexOf('abs.find(', i + 10);
    if (/await DSL\._comprometer\(/.test(SRC_MOTOR.slice(i, j === -1 ? undefined : j))) COMPROMETEN.add(t);
}
const desincronizados = ARMAN.filter(t => !COMPROMETEN.has(t));

// Una cadena "dispara" si en algún punto alcanzable hay un efecto que no sea una elección: eso ya
// cambia algo, y _runEffectList llama a _comprometer por él. Se recorre en profundidad porque el
// ELEGIR corre sus `efectos` anidados, y esos sí disparan.
function dispara(efectos, nivel) {
    for (const e of (efectos || [])) {
        const esEleccion = e.op === 'ELEGIR' || e.op === 'BUSCAR';
        // Un BUSCAR en el MAZO compromete al ABRIR el visor: mirarlo ya sería leerlo gratis.
        if (e.op === 'BUSCAR' && /MAZO/.test(JSON.stringify(e.en || ''))) return 'BUSCAR en el mazo (compromete al abrir el visor)';
        if (!esEleccion) return `op ${e.op}`;
        if (e.esCoste) return `coste aparcado en ${e.op}`;
        for (const rama of ['efectos', 'siExito', 'siFallo', 'siMuere']) {
            const sub = Array.isArray(e[rama]) ? e[rama] : (e[rama] && e[rama].efectos);
            const r = dispara(sub, (nivel || 0) + 1);
            if (r) return `${r} (dentro de ${e.op}.${rama})`;
        }
    }
    return null;
}

const rotas = [], imperativas = [], ok = [];

for (const c of CARD_DB) {
    const abs = Array.isArray(c.abilities) ? c.abilities : [];
    const ab = abs.find(a => ARMAN.includes(a.trigger));
    const p0 = ab && ab.efectos && ab.efectos[0];
    const armaPorEleccion = !!(p0 && (p0.op === 'ELEGIR' || p0.op === 'BUSCAR') && p0.cancelable !== false);

    // Imperativa: el hook existe pero NO lo instaló el compilador desde una ability declarativa.
    const impBefore = typeof c.onBeforePlayAsync === 'function' && !abs.some(a => a.trigger === 'ANTES_DE_JUGAR');
    const impTarget = typeof c.onValidateTarget === 'function';
    if (impBefore || impTarget) {
        imperativas.push({ carta: c.name, por: [impTarget ? 'onValidateTarget' : null, impBefore ? 'onBeforePlayAsync' : null].filter(Boolean).join(' + ') });
        continue;
    }
    if (!armaPorEleccion) continue;

    // Desde el 15-ago-2026 las tres cadenas comprometen al terminar, así que una carta solo
    // puede quedarse sin presentar si su trigger NO está en COMPROMETEN — que es justo lo que
    // mide `desincronizados`. Se sigue diciendo quién la dispara ANTES del final, porque no es
    // lo mismo presentarse a mitad de la cadena que al acabarla, y saberlo ayuda a leer §14.
    const quien = dispara(ab.efectos) || (COMPROMETEN.has(ab.trigger) ? `el final de la cadena ${ab.trigger}` : null);
    (quien ? ok : rotas).push({ carta: c.name, trigger: ab.trigger, quien, primera: p0.op });
}

console.log('AUDITORÍA DE CARTAS QUE SE COLOCAN SIN PRESENTARSE\n');
console.log(`Triggers que ARMAN la presentación (leídos de index.html): ${ARMAN.join(', ')}`);
console.log(`Triggers que la DISPARAN al acabar (leídos de cartas.js): ${[...COMPROMETEN].join(', ') || '(ninguno)'}\n`);

console.log(`## Presentación armada y disparada (${ok.length})`);
console.log('   Se juegan con una ventana de cancelación, y algo dispara la presentación después.');
ok.forEach(f => console.log(`   · ${f.carta} [${f.trigger}]` + (detalle ? `\n       la dispara: ${f.quien}` : '')));

console.log(`\n## No comprobable (${imperativas.length})`);
console.log('   Arman por un hook imperativo: el disparo vive en código, no en una lista de');
console.log('   efectos. Constan aquí; comprobarlas pide leerlas.');
imperativas.forEach(f => console.log(`   · ${f.carta} — ${f.por}`));

if (desincronizados.length) {
    console.log(`\n## LISTAS DESINCRONIZADAS (${desincronizados.length}) — esto es lo grave`);
    console.log('   index.html ARMA la presentación con estos triggers, pero cartas.js no la');
    console.log('   dispara al acabar su cadena. Cualquier carta suya cuya cadena sea ELEGIR o');
    console.log('   BUSCAR de principio a fin se colocará sin presentarse.');
    desincronizados.forEach(t => console.log(`   · ${t}: falta un \`await DSL._comprometer(...)\` al final de su compilador`));
    console.log(`\nTOTAL: ${desincronizados.length} triggers arman sin disparar`);
    process.exit(1);
}

if (!rotas.length) {
    console.log(`\n## SIN DISPARO (0)`);
    console.log('   Ninguna cadena cancelable se queda sin presentar la carta.\n');
    console.log('TOTAL: 0 cartas se colocarían sin presentarse');
} else {
    console.log(`\n## SIN DISPARO (${rotas.length}) — incumplen §14`);
    console.log('   Su cadena es ELEGIR/BUSCAR de principio a fin, así que nadie llama a');
    console.log('   _comprometer: la carta se coloca sin pasar por el escaparate.');
    rotas.forEach(f => console.log(`   · ${f.carta} [${f.trigger}], empieza por ${f.primera}`));
    console.log(`\nTOTAL: ${rotas.length} cartas se colocan sin presentarse`);
    process.exit(1);
}
