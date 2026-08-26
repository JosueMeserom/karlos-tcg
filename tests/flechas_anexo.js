// tests/flechas_anexo.js — LAS FLECHAS DE ANEXO: cuándo se mueven y cuándo NO.
//
// POR QUÉ EXISTE (Toto, 26-ago-2026). Esta es la cuarta vuelta sobre el mismo sitio: las flechas
// no seguían a las cartas al deslizarse, luego seguían a TODO (un zoom al pasar el ratón, un
// tambaleo, una embestida) y bailaban sin motivo, y por el camino renacían enteras -con su
// dibujado- por un parpadeo del DOM. La capa cliente no la ve ninguna suite de regresión, así que
// mientras no hubiera algo que lo comprobara íbamos a volver.
//
// LA REGLA, que es la que pidió Toto: una flecha se mueve cuando su carta CAMBIA DE SITIO DE
// VERDAD -otra posición en el layout- y no cuando solo se deforma o cuando va y vuelve. Por eso
// las anclas se miden sobre el LAYOUT (inmune a cualquier transform) y, cuando esa posición
// cambia, la flecha VIAJA hasta la nueva con la misma curva y duración que usa la carta.
//
// Se prueba sobre el motor REAL (la clase Game de index.html) con un DOM de mentira: lo que se
// comprueba es geometría y ciclo de vida, no pintura.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
let comprobaciones = 0, fallos = 0;
function check(t, ok, extra) {
    comprobaciones++;
    if (ok) console.log('  OK    · ' + t);
    else { fallos++; console.log('  FALLO · ' + t + (extra ? '  [' + extra + ']' : '')); }
}

// ---------- DOM de mentira, lo justo para drawConnections ----------
function El(tag) {
    return {
        tag, attrs: {}, style: {}, children: [], dataset: {}, id: '', parentNode: null,
        _rect: { left: 0, top: 0, width: 100, height: 140, bottom: 140, right: 100 },
        offsetHeight: 140,
        classList: { add() {}, remove() {}, contains() { return false; } },
        setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); },
        getAttribute(k) { return this.attrs[k] !== undefined ? this.attrs[k] : null; },
        removeAttribute(k) { delete this.attrs[k]; },
        appendChild(x) { x.parentNode = this; this.children.push(x); return x; },
        remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(y => y !== this); this.parentNode = null; },
        getBoundingClientRect() { return this._rect; },
        getTotalLength() { return 250; },
        addEventListener() {}, removeEventListener() {}, insertBefore(x) { return x; },
        contains() { return false; }, closest() { return null; }, focus() {}, blur() {}, click() {},
        cloneNode() { return El(this.tag); },
        set innerHTML(v) {}, get innerHTML() { return ''; },
        _todos() { return this.children.reduce((acc, h) => acc.concat([h], h._todos()), []); },
        querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
        querySelectorAll(sel) {
            const m = sel.match(/^(\w+)?\[([\w-]+)(?:="([^"]*)")?\]$/);
            return this._todos().filter(n => {
                if (sel.startsWith('#')) return n.id === sel.slice(1);
                if (sel === 'defs') return n.tag === 'defs';
                if (m) {
                    const [, tag, attr, val] = m;
                    if (tag && n.tag !== tag) return false;
                    const v = n.getAttribute(attr);
                    return val === undefined ? v !== null : v === val;
                }
                return false;
            });
        },
    };
}

const svg = El('svg'); svg.id = 'connections-layer';
const board = El('div'); board.id = 'game-board';
const cartas = new Map();
const documento = {
    body: El('body'), createElement: El, createElementNS: (ns, t) => El(t),
    getElementById: (id) => id === 'connections-layer' ? svg : id === 'game-board' ? board : El('div'),
    querySelector(sel) { const m = sel.match(/^\.card\[data-id="([^"]+)"\]$/); return m ? (cartas.get(m[1]) || null) : null; },
    querySelectorAll() { return []; }, addEventListener() {},
};
const sandbox = {
    console: { log() {}, warn() {}, error() {} }, document: documento, setTimeout, clearTimeout,
    requestAnimationFrame: (f) => setTimeout(f, 16),
    Math, Date, Map, Set, Promise, JSON, Array, Object, String, Number, isNaN, parseInt, parseFloat,
    localStorage: { getItem: () => null, setItem() {} }, io: () => ({ on() {}, emit() {} }), alert() {},
    addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    inicializarReglas: () => {}, CARD_DB: [], getCardTemplate: () => ({}),
    KARLOS_RULES: { getFurorMax: () => 4 }, showFloatingText: () => {}, DSL: { compile() {} },
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
const html = fs.readFileSync(path.join(RAIZ, 'public/index.html'), 'utf8');
const a = html.lastIndexOf('<script>'), c = html.indexOf('</script>', a);
vm.runInContext(html.slice(a + 8, c).split('window.game = new Game();').join('this.__Game = Game;'), sandbox);

// ---------- la mesa: Sadame con un zombi anexado ----------
const g = Object.create(sandbox.__Game.prototype);
const sadame = { instanceId: 'S', owner: 'p1', name: 'Sadame' };
const zombi = { instanceId: 'Z', owner: 'p1', name: 'Zombi', attachedTo: 'S', reverseArrow: true };
g.players = { p1: { vanguard: [sadame, zombi], rearguard: [] }, p2: { vanguard: [], rearguard: [] } };
g.findCard = (id) => [sadame, zombi].find(x => x.instanceId === id) || null;
cartas.set('S', El('div'));
cartas.set('Z', El('div'));
cartas.get('S')._rect = { left: 0, top: 300, width: 100, height: 140, bottom: 440, right: 100 };
cartas.get('Z')._rect = { left: 200, top: 300, width: 100, height: 140, bottom: 440, right: 300 };

const flechas = () => svg.querySelectorAll('path[data-flecha]').length;
const laFlecha = () => svg.querySelector('path[data-flecha]');
const d = () => { const p = laFlecha(); return p && p.getAttribute('d'); };
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    console.log('--- Nacer, no duplicarse, despedirse ---');
    g.drawConnections();
    check('la flecha nace', flechas() === 1);
    check('...y arranca RECORTADA (se dibuja, no aparece)', laFlecha().getAttribute('data-t') === '0');
    g.drawConnections(); g.drawConnections();
    check('repintar no la duplica ni la relanza', flechas() === 1 && parseFloat(laFlecha().getAttribute('data-t')) >= 0);
    await esperar(500);
    check('al terminar de dibujarse suelta su marca de avance', laFlecha().getAttribute('data-t') === null);

    console.log('\n--- Un nodo que falta NO mata la flecha (el vínculo sigue vivo) ---');
    const _z = cartas.get('Z');
    cartas.delete('Z');
    g.drawConnections();
    check('sin su nodo, la flecha se queda como estaba', flechas() === 1 && !laFlecha().getAttribute('data-yendose'));
    cartas.set('Z', _z);

    console.log('\n--- LA REGLA: solo mueve la flecha un cambio REAL de posición ---');
    g.drawConnections();
    const base = d();
    // Deformarse: MISMO centro (250, 370), más grande. Es lo que hacen el zoom del ratón y
    // `.card.selected`; el layout no cambia, así que la flecha no debe enterarse.
    _z._rect = { left: 180, top: 280, width: 140, height: 180, bottom: 460, right: 320 };
    g.drawConnections();
    check('deformarse (mismo centro) NO la mueve', d() === base, d());
    // Ir y volver: dos repintados con la carta desplazada y devuelta a su sitio.
    _z._rect = { left: 200, top: 300, width: 100, height: 140, bottom: 440, right: 300 };
    g.drawConnections();
    check('...y volver a su sitio tampoco', d() === base, d());
    // Cambiar de sitio de verdad.
    _z._rect = { left: 600, top: 300, width: 100, height: 140, bottom: 440, right: 700 };
    g.drawConnections();
    // Arranca EN SU SITIO VIEJO: la flecha no salta, viaja. Por eso aquí `d` todavía es `base`.
    check('cambiar de sitio arranca un viaje (no un salto)', d() === base && g._flechasEnMovimiento() === true);
    await esperar(200);
    g.drawConnections();
    const _medio = d();
    check('...a media curva ya se ha movido, pero aún no ha llegado', _medio !== base);
    await esperar(600);
    g.drawConnections();
    check('...y al llegar se para', g._flechasEnMovimiento() === false && d() !== _medio);

    console.log('\n--- Deshacer el anexo ---');
    zombi.attachedTo = null;
    g.drawConnections();
    check('la flecha se despide', laFlecha() && laFlecha().getAttribute('data-yendose') === '1');
    await esperar(500);
    check('...y desaparece', flechas() === 0);

    console.log('');
    if (fallos) { console.log(`SUITE flechas_anexo: ${fallos} FALLOS de ${comprobaciones} comprobaciones`); process.exit(1); }
    console.log(`SUITE flechas_anexo: ${comprobaciones}/${comprobaciones} comprobaciones — FLECHAS CORRECTAS`);
})().catch(e => { console.error(e); process.exit(1); });
