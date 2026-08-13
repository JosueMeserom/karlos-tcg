// tests/capas_cliente.js — capas elevadas del cliente (NO es una suite viejo-vs-nuevo).
//
// Cubre lo que la batería de regresión no puede ver: el harness anula render() y su DOM
// stub no tiene layout ni z-index, así que nada de esto es observable desde ahí. Aquí se
// monta un mini-DOM propio (el proyecto no trae jsdom y no se quiso añadir dependencia)
// con lo justo para ejercitar la construcción del árbol de capas y el rAF de seguimiento.
//
// Qué garantiza:
//   · _capaVisorLift: clones con z-index NEGATIVO
//     (sobre el velo, sin tapar las cartas del visor) y flechas con z-index POSITIVO
//     (sobre todo el contenido del visor, o las tapaban las propias cartas).
//   · _elevarAlVisor: el clon queda exactamente sobre el original, inerte y sin data-id;
//     y si es una carta conocida se REGENERA con createCardEl bajo _sinLiftBtn, para que el
//     botón de una carta agotada-pero-usable (Spencer) exista sin depender del holder externo
//     de #btn-lift-layer (que cloneNode no alcanza) — y acto seguido se EXTRAE del clon a la
//     capa de botones, porque la regla descendiente `.card.exhausted .action-btn-card` lo
//     pintaría gris con halo pulsante mientras siguiera dentro de la carta.
//   · _purgarVisor: cerrar un visor lo VACÍA. Si no, sus cartas siguen en el DOM con su
//     data-id y rect cero, y querySelector se engancha a ese fantasma: era la causa de que
//     la flecha naciera en la esquina (0,0) tras abrir y cerrar una pila de descartes.
//   · _reaccionLiftTick: el resalte sobrevive a un render() (que reconstruye la mano
//     entera) y se realinea; antes el bucle moría ahí y el resize descuadraba el clon.
//
// Lo puramente visual (que un z-index dé el efecto buscado) NO se puede afirmar desde
// aquí: eso se valida en el navegador. Esto solo fija el contrato estructural para que
// un refactor futuro no lo rompa en silencio.
// Se ejecuta aparte de la batería: `node tests/capas_cliente.js` (no lo recorre el bucle
// de regresion*.js, y no lo necesita: no toca cartas ni motor de juego).

const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');

// ---------- mini-DOM ----------
let _seq = 0;
function Nodo(tag, ns) {
    const n = {
        __id: ++_seq, tagName: String(tag).toUpperCase(), __ns: ns || null,
        id: '', className: '', children: [], parentNode: null, __html: '',
        __attrs: {}, dataset: {}, __rect: { left: 0, top: 0, width: 0, height: 0 },
        style: { cssText: '' },
        classList: {
            add(...c) { c.forEach(x => { if (!n.className.split(' ').includes(x)) n.className = (n.className + ' ' + x).trim(); }); },
            remove(...c) { n.className = n.className.split(' ').filter(x => !c.includes(x)).join(' '); },
            contains(c) { return n.className.split(' ').includes(c); },
        },
        appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = n; n.children.push(c); return c; },
        insertBefore(c, ref) {
            if (c.parentNode) c.parentNode.removeChild(c);
            c.parentNode = n;
            const i = ref ? n.children.indexOf(ref) : -1;
            if (i === -1) n.children.push(c); else n.children.splice(i, 0, c);
            return c;
        },
        removeChild(c) { const i = n.children.indexOf(c); if (i !== -1) { n.children.splice(i, 1); c.parentNode = null; } return c; },
        remove() { if (n.parentNode) n.parentNode.removeChild(n); },
        contains(o) { if (o === n) return true; return n.children.some(c => c.contains(o)); },
        getAttribute(k) { return k === 'data-id' ? (n.dataset.id === undefined ? null : n.dataset.id) : (n.__attrs[k] === undefined ? null : n.__attrs[k]); },
        setAttribute(k, v) {
            n.__attrs[k] = String(v);
            if (k === 'data-id') n.dataset.id = String(v);
            if (k === 'id') n.id = String(v);
            if (k === 'style') n.style.cssText = String(v);
            if (k === 'class') n.className = String(v);
        },
        removeAttribute(k) { delete n.__attrs[k]; if (k === 'data-id') delete n.dataset.id; },
        getBoundingClientRect() { return Object.assign({}, n.__rect, { right: n.__rect.left + n.__rect.width, bottom: n.__rect.top + n.__rect.height }); },
        matches() { return false; },
        // closest acotado a lo que el cliente usa de verdad: `[id$="-sufijo"]`. Sube por
        // parentNode, como el de verdad. Lo necesita _salirDeLaMano para encontrar la mano.
        closest(sel) {
            const m = /^\[id\$="([^"]+)"\]$/.exec(sel || '');
            if (!m) return null;
            let cur = n;
            while (cur) { if (cur.id && cur.id.endsWith(m[1])) return cur; cur = cur.parentNode; }
            return null;
        },
        get firstChild() { return n.children[0] || null; },
        cloneNode(deep) {
            const c = Nodo(n.tagName, n.__ns);
            c.id = n.id; c.className = n.className;
            c.__attrs = Object.assign({}, n.__attrs);
            c.dataset = Object.assign({}, n.dataset);
            c.__rect = Object.assign({}, n.__rect);
            c.style = Object.assign({}, n.style); // el DOM real clona el atributo style entero
            if (deep) n.children.forEach(h => c.appendChild(h.cloneNode(true)));
            return c;
        },
        querySelectorAll(sel) {
            const out = [];
            const rec = (x) => { x.children.forEach(h => { if (coincide(h, sel)) out.push(h); rec(h); }); };
            rec(n); return out;
        },
        querySelector(sel) { return n.querySelectorAll(sel)[0] || null; },
    };
    Object.defineProperty(n, 'innerHTML', {
        get() { return n.__html; },
        set(v) { n.__html = String(v); n.children.forEach(c => c.parentNode = null); n.children.length = 0; },
    });
    return n;
}
function coincide(nodo, sel) {
    const m = sel.match(/^\.card\[data-id="([^"]+)"\]$/);
    if (m) return nodo.classList.contains('card') && nodo.dataset.id === m[1];
    if (sel === '[data-id]') return nodo.dataset.id !== undefined;
    // `.card[data-id]` sin valor: lo usa _cartasDeFila para recoger la fila entera.
    if (sel === '.card[data-id]') return nodo.classList.contains('card') && nodo.dataset.id !== undefined;
    // `#id`: _cartasDeFila localiza primero el contenedor de la fila con querySelector.
    const _id = sel.match(/^#([A-Za-z0-9_-]+)$/);
    if (_id) return nodo.id === _id[1];
    // `[data-id="X"]` sin exigir .card: lo usa _manoLiftRefrescar, que sube cartas de mano
    // (cara O dorso: un dorso NO lleva la clase .card sola) y la carta fuente del tablero.
    const di = sel.match(/^\[data-id="([^"]+)"\]$/);
    if (di) return nodo.dataset.id === di[1];
    const h = sel.match(/^\[data-badge="([^"]+)"\]$/);
    if (h) return nodo.dataset.badge === h[1];
    const cl = sel.match(/^\.([A-Za-z0-9_-]+)$/); // selector de clase simple
    if (cl) return nodo.classList.contains(cl[1]);
    return false;
}
const raiz = Nodo('body');
const porId = new Map();
const documento = {
    getElementById_probe(id) { return documento.getElementById(id); },
    body: raiz, documentElement: Nodo('html'),
    createElement(t) { return Nodo(t); },
    createElementNS(ns, t) { return Nodo(t, ns); },
    createTextNode(t) { return Nodo('#text'); },
    getElementById(id) {
        const rec = (x) => { for (const h of x.children) { if (h.id === id) return h; const r = rec(h); if (r) return r; } return null; };
        return rec(raiz) || porId.get(id) || null;
    },
    querySelector(sel) { return raiz.querySelector(sel); },
    querySelectorAll(sel) { return raiz.querySelectorAll(sel); },
    contains(o) { return raiz.contains(o); },
    addEventListener() {}, removeEventListener() {}, styleSheets: [],
};

// ---------- carga del motor ----------
const html = fs.readFileSync(path.join(RAIZ, 'public/index.html'), 'utf8');
const a = html.lastIndexOf('<script>'), c = html.indexOf('</script>', a);
const motor = html.slice(a + 8, c).split('window.game = new Game();').join('/*probe*/');

function stubSimple() {
    const el = () => ({ style: {}, dataset: {}, options: [], selectedIndex: -1, classList: { add(){}, remove(){}, toggle(){}, contains(){return false;} },
        children: [], innerHTML: '', innerText: '', value: '', appendChild(x){return x;}, removeChild(x){return x;}, remove(){}, insertBefore(x){return x;},
        querySelector(){return null;}, querySelectorAll(){return [];}, addEventListener(){}, removeEventListener(){},
        getBoundingClientRect(){return {width:0,height:0,left:0,top:0};}, getAttribute(){return null;}, setAttribute(){}, removeAttribute(){},
        closest(){return null;}, contains(){return false;}, focus(){}, blur(){}, click(){}, cloneNode(){return el();} });
    const m = new Map();
    return { getElementById(id){ if(!m.has(id)) m.set(id, el()); return m.get(id); }, createElement:el, createElementNS:el,
        createTextNode:()=>({}), querySelector:()=>null, querySelectorAll:()=>[], body:el(), documentElement:el(),
        addEventListener(){}, removeEventListener(){}, contains(){return false;} };
}

let rafCola = [];
const sandbox = {
    console: { log(){}, warn(){}, error(){}, info(){} },
    document: stubSimple(),
    localStorage: { getItem: () => null, setItem(){}, removeItem(){} },
    window: {}, setTimeout: () => 0, clearTimeout(){},
    requestAnimationFrame: (fn) => { rafCola.push(fn); return rafCola.length; },
    navigator: {}, location: { href: '' },
    getComputedStyle: () => ({ borderLeftWidth: '2px', borderTopWidth: '2px', borderRightWidth: '2px', borderBottomWidth: '2px', backgroundColor: 'rgb(0,0,0)' }),
    addEventListener(){}, removeEventListener(){}, dispatchEvent(){}, alert(){},
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'public/reglas.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'public/cartas.js'), 'utf8'), sandbox);
vm.runInContext(motor, sandbox);
const game = vm.runInContext('new (class extends Game { async runInitialSetup() {} })()', sandbox);
sandbox.document = documento; // a partir de aquí, el DOM rico

// ---------- montaje del escenario ----------
const visor = Nodo('div'); visor.setAttribute('id', 'discard-viewer'); visor.style.display = 'flex';
const titulo = Nodo('div'); titulo.setAttribute('id', 'discard-title');
const contenido = Nodo('div'); contenido.setAttribute('id', 'discard-content');
visor.appendChild(titulo); visor.appendChild(contenido);
raiz.appendChild(visor);

// carta EN EL VISOR (la que se inspecciona: un Domador ya descartado)
const cartaVisor = Nodo('div'); cartaVisor.classList.add('card'); cartaVisor.setAttribute('data-id', 'DOM1');
cartaVisor.__rect = { left: 400, top: 300, width: 90, height: 120 };
contenido.appendChild(cartaVisor);

// carta EN EL TABLERO afectada por ella (agotada, con botón elevado aparte)
const board = Nodo('div'); board.setAttribute('id', 'game-board'); raiz.appendChild(board);
const cartaCampo = Nodo('div'); cartaCampo.classList.add('card'); cartaCampo.classList.add('exhausted');
cartaCampo.setAttribute('data-id', 'TIG1');
cartaCampo.__rect = { left: 120, top: 500, width: 90, height: 120 };
const badge = Nodo('div'); badge.dataset.badge = 'atk'; badge.__rect = { left: 130, top: 505, width: 20, height: 20 };
cartaCampo.appendChild(badge);
board.appendChild(cartaCampo);

// el botón "aún usable" de la carta agotada, ya sacado a btn-lift-layer
const btnLayer = Nodo('div'); btnLayer.setAttribute('id', 'btn-lift-layer'); raiz.appendChild(btnLayer);
const hold = Nodo('div'); hold.dataset.inst = 'TIG1'; hold.style.transform = 'scale(0.8)';
const btn = Nodo('div'); btn.classList.add('action-btn-card'); btn.innerText = 'CAMBIO DE PAJARITA';
hold.appendChild(btn); btnLayer.appendChild(hold);

// ---------- pruebas ----------
let fallos = 0, comprobaciones = 0;
const check = (nombre, cond, extra) => { comprobaciones++; console.log((cond ? '  OK   ' : '  FALLO') + ' · ' + nombre + (cond ? '' : '  -> ' + extra)); if (!cond) fallos++; };

const { capa, svg, btns } = game._capaVisorLift();
check('la capa se crea DENTRO del visor', visor.contains(capa), 'no está dentro');
check('la capa es el PRIMER hijo del visor (sobre el velo, bajo las cartas)', visor.children[0] === capa, 'índice ' + visor.children.indexOf(capa));
check('la capa lleva z-index negativo', /z-index:\s*-1/.test(capa.style.cssText), capa.style.cssText);
check('el svg de flechas NO cuelga de la capa de clones', !capa.contains(svg), 'sigue dentro');
check('el svg de flechas cuelga del VISOR', visor.contains(svg), 'no cuelga del visor');
check('el svg gana a .card:hover (100), .selected (50) y .interactive (2000)', (parseInt((svg.style.cssText.match(/z-index:\s*(\d+)/)||[])[1],10)||0) > 2000, svg.style.cssText);
check('la capa de clones sigue con z-index negativo (no tapa el visor)', /z-index:\s*-1/.test(capa.style.cssText), capa.style.cssText);
check('hay una 3a capa para los botones, hija del visor', !!btns && visor.contains(btns), 'no existe');
const _zb = parseInt((btns && btns.style.cssText.match(/z-index:\s*(\d+)/)||[])[1],10)||0;
const _zs = parseInt((svg.style.cssText.match(/z-index:\s*(\d+)/)||[])[1],10)||0;
check('los botones van en positivo (se ven) y por debajo de las flechas', _zb > 2000 && _zb < _zs, 'btns=' + _zb + ' svg=' + _zs);

game._elevarAlVisor(cartaCampo);
const clones = capa.children.slice();
check('la carta del tablero se clona a la capa', clones.length >= 1, 'clones: ' + clones.length);
const clonCarta = clones.find(x => x.classList.contains('card'));
check('el clon conserva las clases (glows/estados)', !!clonCarta && clonCarta.classList.contains('exhausted'), 'clases: ' + (clonCarta && clonCarta.className));
check('el clon conserva los badges internos', !!clonCarta && clonCarta.children.length === 1, 'hijos: ' + (clonCarta && clonCarta.children.length));
check('el clon queda EXACTAMENTE sobre la original', !!clonCarta && clonCarta.style.left === '120px' && clonCarta.style.top === '500px', clonCarta && (clonCarta.style.left + ',' + clonCarta.style.top));
check('el clon es inerte (sin data-id, sin puntero)', !!clonCarta && clonCarta.getAttribute('data-id') === null && clonCarta.style.pointerEvents === 'none', 'data-id=' + (clonCarta && clonCarta.getAttribute('data-id')));
check('los badges del clon tambien pierden data-id', !!clonCarta && clonCarta.children.every(h => h.getAttribute('data-id') === null), 'quedó alguno');
check('_sinLiftBtn queda desactivado tras elevar (no contamina renders futuros)', !game._sinLiftBtn, 'sigue activo: el tablero perderia sus botones elevados');
check('el svg va DESPUES del contenido del visor en el DOM', visor.children.indexOf(svg) > visor.children.indexOf(contenido), 'idx svg ' + visor.children.indexOf(svg));

game._elevarAlVisor(cartaCampo);
check('no duplica si se eleva dos veces', capa.children.filter(x => x.classList.contains('card')).length === 1, 'duplicado');
game._elevarAlVisor(cartaVisor);
check('lo que YA esta en el visor no se eleva', capa.children.filter(x => x.classList.contains('card')).length === 1, 'elevó la del visor');

game._limpiarVisorLift();
check('al limpiar, la capa desaparece por completo', document_no(visor), 'sigue ahí');
check('al limpiar, tambien desaparecen las capas de flechas y botones',
      !visor.children.some(x => x.id === 'viewer-lift-arrows' || x.id === 'viewer-lift-btns'), 'quedó alguna');
function document_no(v) { return !v.children.some(x => x.id === 'viewer-lift'); }
check('limpiar NO toca el contenido del visor', visor.children.length === 2 && visor.contains(cartaVisor), 'hijos: ' + visor.children.length);
check('limpiar NO toca la carta del tablero ni su boton', board.contains(cartaCampo) && btnLayer.contains(hold), 'se perdió algo del tablero');

// ---------- fix del resalte de reacción ante repintados ----------
console.log('\n--- _reaccionLiftTick: sobrevivir a render() (bug del resize) ---');
const mano = Nodo('div'); mano.setAttribute('id', 'p1-hand'); raiz.appendChild(mano);
let cartaMano = Nodo('div'); cartaMano.classList.add('card'); cartaMano.setAttribute('data-id', 'ESC1');
cartaMano.__rect = { left: 500, top: 900, width: 90, height: 120 };
mano.appendChild(cartaMano);
const liftLayer = Nodo('div'); liftLayer.setAttribute('id', 'reaccion-lift'); raiz.appendChild(liftLayer);
const clon = Nodo('div'); clon.classList.add('card'); liftLayer.appendChild(clon);

cartaMano.style.visibility = 'hidden';
game._reaccionManoOrig = cartaMano;
game._reaccionManoId = 'ESC1';
game._reaccionLiftClon = clon;
rafCola = [];
game._reaccionLiftTick();
const tick = () => { const cola = rafCola; rafCola = []; cola.forEach(f => f()); };
tick();
check('el clon se coloca sobre la carta de la mano', clon.style.left === '500px', clon.style.left);

// render(): la mano se vacía y se reconstruye -> la referencia vieja muere y la nueva nace visible
mano.removeChild(cartaMano);
cartaMano = Nodo('div'); cartaMano.classList.add('card'); cartaMano.setAttribute('data-id', 'ESC1');
cartaMano.__rect = { left: 260, top: 900, width: 90, height: 120 }; // la ventana se estrechó: otra X
mano.appendChild(cartaMano);
tick();
check('el bucle SIGUE vivo tras el repintado', rafCola.length > 0, 'el bucle murió (bug original)');
check('el clon se re-alinea con la carta nueva', clon.style.left === '260px', 'quedó en ' + clon.style.left + ' (bug original: 500px)');
check('la carta original se vuelve a ocultar', cartaMano.style.visibility === 'hidden', 'visible: se verían las dos (bug original)');

game._limpiarResalteReaccion();
check('al limpiar, la original recupera su visibilidad', cartaMano.style.visibility === '', 'quedó ' + cartaMano.style.visibility);
rafCola = []; tick();
check('al limpiar, el bucle se detiene', rafCola.length === 0, 'sigue corriendo');


// ---------- boton de carta agotada-pero-usable dentro del clon (Spencer) ----------
console.log('\n--- clon de carta REAL: el boton nace dentro (Spencer, agotado y con Furor) ---');
const spId = vm.runInContext('CARD_DB.find(c => c.name === "Spencer").id', sandbox);
const spencer = game.createCardInstance(spId, 'p1');
spencer.location = 'vanguard'; spencer.exhausted = true; spencer.furor = 3;
game.players.p1.vanguard.push(spencer);
game.activePlayerId = 'p1'; game.phase = 'PRINCIPAL'; game.inputState = 'IDLE'; game.gameMode = 'local';
check('Spencer puede usar su Activa estando agotado (abilityWhileExhausted)',
      vm.runInContext(`!!getCardTemplate(${spId}).abilityWhileExhausted`, sandbox), 'no lo tiene');

const elSpencer = Nodo('div'); elSpencer.classList.add('card'); elSpencer.classList.add('exhausted');
elSpencer.setAttribute('data-id', spencer.instanceId);
elSpencer.__rect = { left: 700, top: 480, width: 90, height: 120 };
board.appendChild(elSpencer);

rafCola = [];
game._elevarAlVisor(elSpencer);
const capa2 = documento.getElementById("viewer-lift");
const clonSp = capa2 && capa2.children.find(x => x.classList.contains('card'));
check('el clon de Spencer se genera', !!clonSp, 'no se generó');
check('el boton NO queda dentro del clon (.card.exhausted .action-btn-card lo pinta gris)',
      !clonSp.children.some(x => x.className.includes('action-btn-container')), 'sigue dentro del clon');
const capaBtns = documento.getElementById('viewer-lift-btns');
const holdVl = capaBtns && capaBtns.children.find(x => x.className.includes('vl-btn-hold'));
check('el boton se eleva a la capa de botones (no a la de clones, donde no se veia)', !!holdVl, 'no hay holder en viewer-lift-btns');
check('el holder NO esta en la capa de clones', !capa2.children.some(x => x.className.includes('vl-btn-hold')), 'sigue en la capa z-index:-1');
const btnCont = holdVl && holdVl.children.find(x => x.className.includes('action-btn-container'));
check('el holder lleva el contenedor de botones', !!btnCont, 'holder vacio');
check('el boton dice el nombre de la Activa', !!btnCont && btnCont.children.some(b => (b.innerText || '').includes('PAJARITA')), 'texto: ' + (btnCont && btnCont.children.map(b=>b.innerText).join('|')));
check('el holder se alinea con la caja interior de la carta (descontando bordes)',
      !!holdVl && holdVl.style.cssText.includes('left:702px') && holdVl.style.cssText.includes('top:482px'), holdVl && holdVl.style.cssText);
rafCola.forEach(f => { try { f(); } catch(e){} });
check('el clon NO manda su boton a btn-lift-layer', !btnLayer.children.some(h => h.dataset.inst === spencer.instanceId), 'lo sacó fuera: se pisaria con la carta real');
check('_sinLiftBtn vuelve a false', !game._sinLiftBtn, 'quedó activo');

// ---------- carta fantasma del visor cerrado ----------
console.log('\n--- purga del visor al cerrarlo (flecha desde la esquina 0,0) ---');
check('antes de purgar, la carta del visor esta en el DOM con su data-id',
      !!raiz.querySelector('.card[data-id="DOM1"]'), 'no está');
game._purgarVisor();
check('tras purgar, NO queda ninguna carta fantasma con ese data-id',
      !raiz.querySelector('.card[data-id="DOM1"]'), 'sigue en el DOM: cualquier querySelector la cogeria con rect 0');
check('tras purgar, el contenido del visor queda vacio', contenido.children.length === 0, 'hijos: ' + contenido.children.length);
check('purgar NO toca las cartas del tablero', board.contains(cartaCampo) && board.contains(elSpencer), 'se perdió algo del tablero');

// ---------- capa elevada de la eleccion DE MANO ----------
// Migrada al estilo overlay el 7-ago-2026: mlVelo + clones, en vez del apagado por opacidad.
// El riesgo real de esta capa no es que se vea bonita (eso se valida en el navegador) sino el
// CONTRATO estructural: que la original quede oculta (conservando el hueco), que el clon salga
// de cloneNode -y por tanto un dorso siga siendo un dorso, que es lo que permite elegir a ciegas
// de la mano rival sin revelarla-, que la carta que ACTUA tambien suba, y que limpiar lo deje
// todo como estaba. Si un refactor rompe algo de eso, salta aqui.
console.log('\n--- capa elevada de la eleccion DE MANO ---');
const mlHandEl = Nodo('div'); mlHandEl.setAttribute('id', 'p1-hand'); raiz.appendChild(mlHandEl);
const mlCara = Nodo('div'); mlCara.classList.add('card'); mlCara.setAttribute('data-id', 'MANO1');
mlCara.__rect = { left: 300, top: 600, width: 90, height: 130 }; mlHandEl.appendChild(mlCara);
const mlDorso = Nodo('div'); mlDorso.classList.add('card'); mlDorso.classList.add('card-back');
mlDorso.setAttribute('data-id', 'MANO2');
mlDorso.__rect = { left: 400, top: 600, width: 90, height: 130 }; mlHandEl.appendChild(mlDorso);

const _cMano = { instanceId: 'MANO1', owner: 'p1', name: 'CartaMano' };
const _cDorso = { instanceId: 'MANO2', owner: 'p1', name: 'CartaDorso' };
game.players.p1.hand = [_cMano, _cDorso];
game.inputState = 'SELECT_DSL_TARGETS';
game.gameMode = 'local';
game.selectedCard = spencer;                       // la carta que ACTUA (esta en el tablero)
game.dslPick = { pool: new Set(['MANO1']), n: 1, targets: [], byId: {}, chooserId: 'p1',
                 cancelable: true, mano: true, manoDe: 'p1',
                 prompt: 'Puedes elegir ahora un Necronomicón de tu mano' };
game._manoLiftRefrescar();

const mlVelo = documento.getElementById('mano-overlay');
const mlCapa = documento.getElementById('mano-lift');
check('se monta el VELO (mismo lenguaje que el resto de overlays)', !!mlVelo, 'no hay #mano-overlay');
check('...por debajo de los clones', !!mlVelo && mlVelo.style.cssText.includes('z-index:4000')
      && !!mlCapa && mlCapa.style.cssText.includes('z-index:4100'),
      (mlVelo && mlVelo.style.cssText) + ' / ' + (mlCapa && mlCapa.style.cssText));
// El cartel: sin él, oscurecer la mano no dice QUE se esta eligiendo ni que se puede salir.
const mlCab = mlVelo.children[0];
check('el velo lleva cartel explicativo', !!mlCab && mlCab.children.length >= 1, 'velo sin cabecera');
check('...con el texto del prompt', !!mlCab && (mlCab.children[0].innerText || '').includes('Necronomicón'),
      'texto: ' + (mlCab && mlCab.children[0] && mlCab.children[0].innerText));
check('...y la pista de cancelar (la eleccion es cancelable)',
      !!mlCab && mlCab.children.length === 2 && (mlCab.children[1].innerText || '').includes('cancelar'),
      'hijos: ' + (mlCab && mlCab.children.length));
check('sube la mano ENTERA, no solo lo elegible', mlCapa.children.length === 3,
      'clones: ' + mlCapa.children.length + ' (esperados 3: fuente + 2 de mano)');
check('...incluida la carta que ACTUA, marcada SIN reescalarla', mlCapa.children.some(x => x.classList.contains('mano-lift-fuente')),
      'ninguna lleva .mano-lift-fuente');
check('...y NO con .selected, que lleva scale(1.2) y la escalaria dos veces',
      !mlCapa.children.some(x => x.classList.contains('selected')), 'alguna lleva .selected');
check('el DORSO sigue siendo dorso al clonarse (elegir a ciegas no revela nada)',
      mlCapa.children.some(x => x.classList.contains('card-back')), 'se perdio la clase card-back');
check('los clones NO llevan data-id (no envenenan querySelector)',
      !mlCapa.children.some(x => x.dataset && x.dataset.id), 'algun clon conserva data-id');
check('la original se OCULTA conservando su hueco', mlCara.style.visibility === 'hidden',
      'visibility=' + mlCara.style.visibility);
const mlClonEleg = mlCapa.children.find(x => x.classList.contains('valid-target'));
check('solo la elegible lleva reborde verde (la mano no es entera elegible)', !!mlClonEleg, 'ninguna con valid-target');

// Mano ENTERA elegible -> el reborde no discrimina, asi que no se pinta.
game.dslPick.pool = new Set(['MANO1', 'MANO2']);
game._manoLiftRefrescar();
const mlCapa2 = documento.getElementById('mano-lift');
check('con la mano entera elegible NO se pinta reborde en ninguna',
      !mlCapa2.children.some(x => x.classList.contains('valid-target')), 'alguna lleva valid-target');

// Limpieza: fuera mlVelo, fuera clones, y las originales vuelven a verse.
game.dslPick = null;
game.inputState = 'IDLE';
game._manoLiftRefrescar();
check('al terminar se retira el mlVelo', !documento.getElementById('mano-overlay'), 'sigue el mlVelo puesto');
check('...y la capa de clones', !documento.getElementById('mano-lift'), 'sigue la capa');
check('...y las originales vuelven a ser visibles', mlCara.style.visibility === ''
      && mlDorso.style.visibility === '', 'quedaron ocultas: la mano se veria vacia');

// ---------- deslizamiento de fila (FLIP) ----------
// Cuando entra una carta nueva, las que ya estaban se APARTAN en vez de saltar. Se hace con
// FLIP: foto de posiciones ANTES, render, y a cada carta se le aplica la transformacion que la
// devuelve opticamente a su sitio viejo para luego quitarla con transicion. Lo que se comprueba
// aqui es el CONTRATO: que la carta entrante se excluya (viaja por su cuenta), que a las demas
// se les ponga un translate distinto de cero, y que las que no se han movido no se toquen.
// Que el movimiento SE VEA bien es cosa del navegador; esto solo fija que no se descuadre.
console.log('\n--- deslizamiento de fila (FLIP) ---');
const filaEl = Nodo('div'); filaEl.setAttribute('id', 'p1-vanguard'); raiz.appendChild(filaEl);
const _mk = (id, left) => { const c = Nodo('div'); c.classList.add('card'); c.setAttribute('data-id', id);
    c.__rect = { left: left, top: 400, width: 90, height: 126 }; filaEl.appendChild(c); return c; };
const fA = _mk('FA', 100), fB = _mk('FB', 200), fNueva = _mk('FN', 300);

const fotoFila = vm.runInContext('_fotoFila', sandbox)('#p1-vanguard');
check('la foto recoge las 3 cartas de la fila', fotoFila.size === 3, 'tam: ' + fotoFila.size);

// Se simula el repintado: todas se corren 50px porque ha entrado una nueva.
fA.__rect = { left: 50, top: 400, width: 90, height: 126 };
fB.__rect = { left: 150, top: 400, width: 90, height: 126 };
vm.runInContext('_deslizarFila', sandbox)('#p1-vanguard', fotoFila, 'FN');

// OJO: FLIP pone el translate y lo QUITA en el mismo tick (es lo que dispara la transicion),
// asi que `transform` ya no es observable al volver. Lo que queda -y es el contrato real- es
// que a las cartas que se movieron se les haya armado una transicion de transform.
check('a la carta que se movio se le arma la transicion', /transform \d+ms/.test(fA.style.transition || ''),
      'transition: ' + fA.style.transition);
check('...y a la otra tambien', /transform \d+ms/.test(fB.style.transition || ''),
      'transition: ' + fB.style.transition);
check('la carta ENTRANTE se excluye (viaja por su cuenta)', !fNueva.style.transition,
      'transition: ' + fNueva.style.transition);

// Una carta que NO se ha movido no debe recibir transformacion ninguna.
const foto2 = vm.runInContext('_fotoFila', sandbox)('#p1-vanguard');
fA.style.transition = '';
vm.runInContext('_deslizarFila', sandbox)('#p1-vanguard', foto2, 'FN');
check('si no se ha movido, no se le toca', !fA.style.transition, 'transition: ' + fA.style.transition);

// Una carta con su PROPIA animación en marcha (transform inline puesto: embestida, muerte,
// aterrizaje) no se toca: el FLIP genérico del repintado se la pisaría. Toto, 13-ago-2026, al
// hacer que TODO repintado deslice en vez de saltar.
const foto3 = vm.runInContext('_fotoFila', sandbox)('#p1-vanguard');
fA.__rect = { left: 999, top: 400, width: 90, height: 126 };   // se ha movido mucho
fA.style.transition = '';
fA.style.transform = 'translate(5px, 5px) scale(1.2)';         // ...pero está animándose
vm.runInContext('_deslizarFila', sandbox)('#p1-vanguard', foto3, null);
check('una carta con su animación en marcha no se desliza', !fA.style.transition,
      'transition: ' + fA.style.transition);
fA.style.transform = '';

// ---------- salir de la mano (la carta se va, el resto se acomoda) ----------
// Cuando una carta viaja al escaparate deja de estar en la mano: si nadie la quita del DOM se
// ve DUPLICADA -en la mano y en el escaparate a la vez- porque el estado ya la sacó pero no se
// ha repintado (Toto lo vio con Wolfgang, 13-ago-2026). Se comprueba el contrato: la carta sale
// del DOM y a las que quedan se les arma el deslizamiento.
console.log('\n--- salir de la mano ---');
const manoEl = Nodo('div'); manoEl.setAttribute('id', 'p1-hand'); raiz.appendChild(manoEl);
const _mkMano = (id, left) => { const c = Nodo('div'); c.classList.add('card'); c.setAttribute('data-id', id);
    c.__rect = { left: left, top: 700, width: 90, height: 126 }; manoEl.appendChild(c); return c; };
const mA = _mkMano('MA', 100), mB = _mkMano('MB', 200), mSale = _mkMano('MS', 300);

// El repintado que provocaría quitar la del medio: las que quedan se recolocan.
mSale.__salir = () => { mA.__rect = { left: 150, top: 700, width: 90, height: 126 }; };
const _origAppend = mA.__rect;
vm.runInContext('_salirDeLaMano', sandbox)(mSale);
check('la carta que se va sale del DOM de la mano', !manoEl.children.includes(mSale),
      'quedan: ' + manoEl.children.length);
check('las que quedan siguen en la mano', manoEl.children.includes(mA) && manoEl.children.includes(mB));
// Sin movimiento no hay transición (mismo contrato que _deslizarFila): se fuerza uno.
mA.style.transition = ''; mB.style.transition = '';
const manoEl2 = Nodo('div'); manoEl2.setAttribute('id', 'p2-hand'); raiz.appendChild(manoEl2);
const nA = Nodo('div'); nA.classList.add('card'); nA.setAttribute('data-id', 'NA');
nA.__rect = { left: 100, top: 700, width: 90, height: 126 }; manoEl2.appendChild(nA);
const nS = Nodo('div'); nS.classList.add('card'); nS.setAttribute('data-id', 'NS');
nS.__rect = { left: 200, top: 700, width: 90, height: 126 }; manoEl2.appendChild(nS);
const _rectAntes = nA.__rect;
nA.__rectTrasSalida = { left: 150, top: 700, width: 90, height: 126 };
// _salirDeLaMano fotografía, quita y desliza; se simula el recolocado cambiando el rect justo
// antes de que mida (aquí basta con dejarlo puesto: la foto ya se tomó con el valor viejo).
const _fotoAntes = vm.runInContext('_fotoFila', sandbox)('#p2-hand');
nA.__rect = nA.__rectTrasSalida;
manoEl2.removeChild(nS);
vm.runInContext('_deslizarFila', sandbox)('#p2-hand', _fotoAntes, null);
check('a la carta que se recoloca se le arma el deslizamiento', /transform \d+ms/.test(nA.style.transition || ''),
      'transition: ' + nA.style.transition);

console.log(fallos === 0 ? '\nSUITE capas_cliente: ' + comprobaciones + '/' + comprobaciones + ' comprobaciones — CAPAS CORRECTAS' : '\nSUITE capas_cliente: ' + fallos + ' FALLOS de ' + comprobaciones + ' comprobaciones');
process.exit(fallos ? 1 : 0);
