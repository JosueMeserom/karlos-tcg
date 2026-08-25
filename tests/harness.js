// tests/harness.js — Harness común de la batería de regresión viejo-vs-nuevo.
//
// Qué hace: carga public/cartas_antes_de_dsl.js (VIEJA) y public/cartas.js (NUEVA)
// en contextos vm aislados, junto con reglas.js y el motor real (la clase Game
// extraída del <script> inline de public/index.html). Ejecuta el mismo escenario
// contra ambas bases y compara: logs (logHistory), textos flotantes y estado
// final (exportGameState).
//
// Decisiones de diseño (razonadas, no cambiar a la ligera):
//  · El MOTOR es el mismo (el actual de index.html) para ambas bases: los hooks
//    de plantilla se consultan con typeof, así que la base vieja imperativa y la
//    nueva DSL conviven con él. Lo único que varía entre ejecuciones es cartas.js:
//    exactamente lo que queremos aislar.
//  · Se elimina la línea `window.game = new Game();` del motor extraído (con
//    aserción de que existe exactamente 1 vez). La instancia la crea el harness
//    con runInitialSetup anulado: el estado lo construye el escenario, no el
//    setup interactivo (mulligan/monedas), que consumiría PRNG y colgaría en UI.
//  · DOM falso SIN Proxy absorbe-todo: elementos con propiedades/métodos
//    explícitos. Si el motor usa algo que falta, el harness FALLA con un
//    TypeError que lo nombra y se añade aquí: mejor fallo ruidoso que absorción
//    silenciosa.
//  · Timers falsos: setTimeout se encola y `asentar()` los drena por tiempo
//    virtual. Así los banners de fase (timeout 1800 ms) y demás caducan al
//    instante y de forma determinista. requestAnimationFrame es no-op (mata los
//    bucles de animación). game.sleep() resuelve al instante.
//  · Math.random del contexto se sustituye por un LCG sembrado por escenario:
//    misma semilla en VIEJA y NUEVA ⇒ mismas tiradas.
//  · Interacciones de UI (modal de opciones, búsqueda visual, confirmación,
//    selección-en-tablero, cartel de turno, monedas) se interceptan a nivel de
//    INSTANCIA y se responden con pasos guionizados del escenario. El cartel de
//    turno se auto-cierra (equivale al clic). triggerCoinFlips se sustituye por
//    una cola guionizada (`monedas`), idéntica en ambas ejecuciones; los logs
//    de resultado los emiten los llamadores (checkAttackStatus, etc.), no el
//    modal, así que la comparación no pierde nada.
//  · Diferencias intencionadas de log (p. ej. paso a 3ª persona) se declaran en
//    el escenario con `logsIntencionados: [{de, a, motivo}]` y se aplican a la
//    salida VIEJA antes de comparar. Nunca se ignoran en silencio.
//  · Líneas de log/flotante que SOLO aparecen en la nueva (comportamiento nuevo
//    a propósito, p. ej. una pasiva que antes no se anunciaba) se declaran con
//    `logsSoloNueva`/`flotantesSoloNueva: [{linea, motivo}]` y se filtran de la
//    salida NUEVA antes de comparar (estricto: si la línea declarada no
//    aparece, falla). `logsSoloVieja` es la dirección contraria (log que la
//    nueva quitó a propósito).
//
// API para las suites:
//   const { correrSuite } = require('./harness');
//   correrSuite('regresion1', [escenario, ...]);
//
// Forma de un escenario: ver `construirEstado` y `ejecutarPaso` más abajo.

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const RUTAS = {
    reglas: path.join(RAIZ, 'public', 'reglas.js'),
    vieja: path.join(RAIZ, 'public', 'cartas_antes_de_dsl.js'),
    nueva: path.join(RAIZ, 'public', 'cartas.js'),
    index: path.join(RAIZ, 'public', 'index.html'),
};

// ---------------------------------------------------------------------------
// Extracción y precompilación de scripts (una vez por proceso)
// ---------------------------------------------------------------------------

function extraerMotor() {
    const html = fs.readFileSync(RUTAS.index, 'utf8');
    const abre = html.lastIndexOf('<script>');
    const cierra = html.indexOf('</script>', abre);
    if (abre === -1 || cierra === -1) {
        throw new Error('harness: no encuentro el <script> inline del motor en index.html');
    }
    let motor = html.slice(abre + '<script>'.length, cierra);

    const marca = 'window.game = new Game();';
    const trozos = motor.split(marca);
    if (trozos.length !== 2) {
        throw new Error(`harness: esperaba exactamente 1 "${marca}" en el motor y hay ${trozos.length - 1}. Revisar index.html.`);
    }
    motor = trozos.join('/* [harness] la instancia la crea el harness */');
    return motor;
}

let _scripts = null;
function scripts() {
    if (!_scripts) {
        _scripts = {
            reglas: new vm.Script(fs.readFileSync(RUTAS.reglas, 'utf8'), { filename: 'reglas.js' }),
            vieja: new vm.Script(fs.readFileSync(RUTAS.vieja, 'utf8'), { filename: 'cartas_antes_de_dsl.js' }),
            nueva: new vm.Script(fs.readFileSync(RUTAS.nueva, 'utf8'), { filename: 'cartas.js' }),
            motor: new vm.Script(extraerMotor(), { filename: 'motor_index_html.js' }),
        };
    }
    return _scripts;
}

// ---------------------------------------------------------------------------
// DOM falso
// ---------------------------------------------------------------------------

function crearElemento(tag = 'div') {
    const el = {
        tagName: String(tag).toUpperCase(),
        id: '',
        className: '',
        style: {},
        dataset: {},
        classList: {
            add() {}, remove() {}, toggle() {}, contains() { return false; },
        },
        children: [],
        childNodes: [],
        firstChild: null,
        parentNode: null,
        innerHTML: '',
        innerText: '',
        textContent: '',
        value: '',
        checked: false,
        disabled: false,
        paused: true,
        volume: 0,
        scrollTop: 0,
        scrollHeight: 0,
        offsetWidth: 0,
        offsetHeight: 0,
        options: [],
        selectedIndex: -1,
        onclick: null,
        add() {},
        appendChild(c) { return c; },
        removeChild(c) { return c; },
        remove() {},
        insertBefore(c) { return c; },
        prepend() {},
        append() {},
        querySelector() { return null; },
        querySelectorAll() { return []; },
        addEventListener() {},
        removeEventListener() {},
        getBoundingClientRect() { return { width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0, x: 0, y: 0 }; },
        getAttribute() { return null; },
        setAttribute() {},
        removeAttribute() {},
        closest() { return null; },
        contains() { return false; },
        focus() {}, blur() {}, click() {},
        play() { return Promise.resolve(); },
        pause() {},
        scrollIntoView() {},
        cloneNode() { return crearElemento(tag); },
    };
    return el;
}

function crearDocumento() {
    const porId = new Map();
    return {
        getElementById(id) {
            if (!porId.has(id)) { const el = crearElemento(); el.id = id; porId.set(id, el); }
            return porId.get(id);
        },
        createElement(tag) { return crearElemento(tag); },
        // SVG (las flechas de Coste/Requisito de la presentación). Sin esto, cualquier carta con
        // coste marcado reventaba la presentación entera, y como la cola se traga los errores
        // (.catch), la carta ni siquiera llegaba a colocarse. Lo destapó Wolfgang (8-ago-2026).
        createElementNS(ns, tag) { return crearElemento(tag); },
        createTextNode(t) { return { textContent: t }; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        body: crearElemento('body'),
        documentElement: crearElemento('html'),
        addEventListener() {},
        removeEventListener() {},
        contains() { return false; },
    };
}

// ---------------------------------------------------------------------------
// Contexto de ejecución (uno POR ESCENARIO y por base: aislamiento total)
// ---------------------------------------------------------------------------

function crearContexto(cual /* 'vieja' | 'nueva' */) {
    const ctx = {
        cual,
        flotantes: [],
        alertas: [],
        pendientes: [],   // interacciones de UI abiertas esperando respuesta guionizada
        monedas: [],      // cola de resultados 'heads'/'tails'
        errores: [],      // rechazos de promesas de acciones lanzadas sin await
        timers: [],
        timerSeq: 0,
        horaVirtual: 0,
        semilla: 1,
    };

    const almacen = new Map([
        ['karlos_game_mode', 'local'],
        ['karlos_p1_name', 'Jugador 1'],
        ['karlos_p2_name', 'Jugador 2'],
    ]);

    const sandbox = {
        console: { log() {}, warn() {}, error() {}, info() {} },
        alert(msg) { ctx.alertas.push(String(msg)); },
        document: crearDocumento(),
        localStorage: {
            getItem(k) { return almacen.has(k) ? almacen.get(k) : null; },
            setItem(k, v) { almacen.set(k, String(v)); },
            removeItem(k) { almacen.delete(k); },
        },
        location: { href: '', reload() {} },
        navigator: {},
        setTimeout(fn, delay = 0, ...args) {
            const id = ++ctx.timerSeq;
            ctx.timers.push({ id, fn, args, cuando: ctx.horaVirtual + (Number(delay) || 0), seq: id });
            return id;
        },
        clearTimeout(id) { ctx.timers = ctx.timers.filter(t => t.id !== id); },
        setInterval() { return ++ctx.timerSeq; }, // nunca se ejecutan (solo los usa código online)
        clearInterval() {},
        requestAnimationFrame() { return 0; },
        cancelAnimationFrame() {},
        getComputedStyle() { return {}; },
        addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    };
    sandbox.window = sandbox;
    ctx.sandbox = sandbox;
    vm.createContext(sandbox);

    const s = scripts();
    s.reglas.runInContext(sandbox);
    s[cual].runInContext(sandbox);
    s.motor.runInContext(sandbox);

    // Math.random sembrado (el PRNG online del motor no aplica en modo local)
    sandbox.__rng = () => {
        ctx.semilla = (ctx.semilla * 1103515245 + 12345) % 2147483648;
        return ctx.semilla / 2147483648;
    };
    vm.runInContext('Math.random = () => __rng();', sandbox);

    // Captura de textos flotantes (declaración de función ⇒ propiedad del global)
    if (typeof sandbox.showFloatingText !== 'function') {
        throw new Error('harness: showFloatingText no es una función global tras cargar el motor');
    }
    sandbox.showFloatingText = (instanceId, texto, clase, offsetY) => {
        ctx.flotantes.push({ carta: instanceId, texto: String(texto), clase: clase || '' });
    };

    ctx.CARD_DB = vm.runInContext('CARD_DB', sandbox);
    return ctx;
}

function crearJuego(ctx) {
    // runInitialSetup anulado: el estado lo construye el harness.
    const inst = vm.runInContext(
        'new (class extends Game { async runInitialSetup() {} })()',
        ctx.sandbox
    );
    // El motor y las cartas referencian `game`/`window.game` como global.
    ctx.sandbox.game = inst;

    // --- Intercepciones a nivel de instancia (idénticas en VIEJA y NUEVA) ---
    inst.sleep = () => Promise.resolve();

    // render() es puramente visual (lee estado, escribe DOM, programa drawConnections
    // por timer). Anulado: evita depender de todo el árbol DOM del tablero.
    inst.render = () => {};

    inst.openChoiceModal = (titulo, opciones, chooserId) => {
        inst.currentChoices = opciones;
        ctx.pendientes.push({ tipo: 'opcion', titulo, etiquetas: opciones.map(o => o.label) });
    };

    inst.openVisualSearchModal = (titulo, cartas, exactCount = 0, autoSelectMax = false, chooserId = null) =>
        new Promise(resolve => {
            ctx.pendientes.push({ tipo: 'busqueda', titulo, cartas, exactCount, autoSelectMax, resolver: resolve });
        });

    // Visor de PILA completa (búsquedas con elección sobre el MAZO o los DESCARTES). Contrato:
    // resuelve UNA carta o null (cierre sin elegir / sin elegibles).
    // `zona` (7-ago-2026): el visor dejó de ser solo del mazo — buscar en descartes también lo
    // usa, así que `cartas` debe reflejar la pila REAL o el escenario mentiría sobre lo que el
    // jugador está viendo.
    inst.openDeckSearchViewer = (playerId, elegibles, titulo = null, aviso = null, maxCount = 1, zona = 'deck') =>
        new Promise(resolve => {
            ctx.pendientes.push({
                tipo: 'visorMazo', jugador: playerId, titulo, aviso, maxCount, zona,
                cartas: [...(zona === 'discard' ? inst.players[playerId].discard : inst.players[playerId].deck)],
                elegibles: elegibles || [], resolver: resolve,
            });
        });

    inst.openConfirmModal = (mensaje, aviso = null) => {
        ctx.pendientes.push({ tipo: 'confirmar', mensaje, aviso });
    };

    const origVCA = inst.validateAndConfirmAbility.bind(inst);
    inst.validateAndConfirmAbility = (carta, cb) => {
        origVCA(carta, cb);
        ctx.pendientes.push({ tipo: 'confirmar', mensaje: `¿Usar ${carta.name}?` });
    };

    const origPick = inst.pickBoardTargets.bind(inst);
    inst.pickBoardTargets = function (cartas, n, prompt, ...resto) {
        ctx.pendientes.push({ tipo: 'elegirTablero', n, prompt, pool: cartas });
        return origPick(cartas, n, prompt, ...resto);
    };

    const origSTO = inst.showTurnOverlay.bind(inst);
    inst.showTurnOverlay = () => {
        origSTO();
        // Auto-clic en el cartel de turno: en partida real lo pulsa el jugador.
        ctx.sandbox.setTimeout(() => { inst.dismissTurnOverlay(); }, 0);
    };

    inst.triggerCoinFlips = async (count = 1) => {
        const res = [];
        for (let i = 0; i < count; i++) {
            if (!ctx.monedas.length) {
                throw new Error(`[${ctx.cual}] triggerCoinFlips: se pidió una moneda y la cola guionizada está vacía (añadir a escenario.monedas)`);
            }
            res.push(ctx.monedas.shift());
        }
        return res;
    };

    return inst;
}

// ---------------------------------------------------------------------------
// Asentar: drenar microtareas + timers falsos hasta quiescencia
// ---------------------------------------------------------------------------

async function asentar(ctx) {
    let rondasEstables = 0;
    let iter = 0;
    while (rondasEstables < 3) {
        if (++iter > 500) {
            throw new Error(`[${ctx.cual}] asentar(): no se estabiliza tras 500 rondas (¿bucle de timers?)`);
        }
        const pendAntes = ctx.pendientes.length;
        for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r));
        const lote = ctx.timers.splice(0).sort((a, b) => a.cuando - b.cuando || a.seq - b.seq);
        for (const t of lote) {
            ctx.horaVirtual = Math.max(ctx.horaVirtual, t.cuando);
            t.fn(...t.args);
            for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r));
        }
        if (ctx.errores.length) throw ctx.errores[0];
        const estable = lote.length === 0 && ctx.timers.length === 0 && ctx.pendientes.length === pendAntes;
        rondasEstables = estable ? rondasEstables + 1 : 0;
    }
}

// ---------------------------------------------------------------------------
// Construcción del estado inicial
// ---------------------------------------------------------------------------

function resolverIdCarta(ctx, ref) {
    if (typeof ref === 'number') {
        if (!ctx.CARD_DB.some(t => t && t.id === ref)) throw new Error(`[${ctx.cual}] id de carta desconocido: ${ref}`);
        return ref;
    }
    const candidatas = ctx.CARD_DB.filter(t => t && t.name === ref);
    if (candidatas.length === 0) throw new Error(`[${ctx.cual}] carta no encontrada en CARD_DB: "${ref}"`);
    if (candidatas.length > 1) throw new Error(`[${ctx.cual}] nombre ambiguo en CARD_DB: "${ref}" (usar id numérico)`);
    return candidatas[0].id;
}

function crearCartaEn(ctx, inst, pid, spec, location) {
    const ref = (typeof spec === 'object') ? spec.carta : spec;
    const carta = inst.createCardInstance(resolverIdCarta(ctx, ref), pid);
    carta.location = location;
    if (typeof spec === 'object') {
        if (spec.furor !== undefined) carta.furor = spec.furor;
        if (spec.vida !== undefined) carta.currentHp = spec.vida;
        if (spec.atk !== undefined) carta.currentAtk = spec.atk;
        if (spec.def !== undefined) carta.currentDef = spec.def;
        if (spec.agotada !== undefined) carta.exhausted = spec.agotada;
        if (spec.duracion !== undefined) carta.duration = spec.duracion;
        if (spec.estado) carta.status = JSON.parse(JSON.stringify(spec.estado));
        // padre: enlaza este token/clon con otra carta por NOMBRE; construirEstado
        // resuelve el parentId tras colocarlo todo (el padre puede estar en cualquier zona).
        if (spec.padre) carta._padreRef = spec.padre;
        // campos arbitrarios (estado propio de la carta). CLONADO EN PROFUNDIDAD, igual que
        // `estado` justo arriba y por el mismo motivo (Toto, 5-ago-2026): `Object.assign` copia
        // la REFERENCIA, así que un valor-objeto (p. ej. `campos: {counters: {...}}`) quedaba
        // COMPARTIDO entre la pasada vieja y la nueva del mismo escenario -y también entre
        // escenarios, porque el literal vive en el fichero de la suite-. La vieja lo mutaba y la
        // nueva arrancaba con el valor ya tocado, así que la comparación mentía: parecía que la
        // nueva contaba de más cuando lo que pasaba es que empezaba más abajo. Lo destapó la
        // migración de Diego Antonio, la primera suite que mete contadores por `campos`.
        if (spec.campos) Object.assign(carta, JSON.parse(JSON.stringify(spec.campos)));
    }
    return carta;
}

function construirEstado(ctx, inst, esc) {
    inst.turn = esc.turno !== undefined ? esc.turno : 2; // turno 2 por defecto: sin restricciones de primer turno
    inst.activePlayerId = esc.turnoDe || 'p1';
    inst.startingPlayerId = esc.empieza || 'p1';
    inst.phase = 'PRINCIPAL';
    inst.inputState = 'IDLE';
    inst.placedUnitThisTurn = false;
    inst.directAttackUsedThisTurn = false;

    for (const pid of ['p1', 'p2']) {
        const cfg = esc[pid] || {};
        const p = inst.players[pid];
        p.hp = cfg.hp !== undefined ? cfg.hp : 6;
        (cfg.vanguardia || []).forEach(s => p.vanguard.push(crearCartaEn(ctx, inst, pid, s, 'vanguard')));
        (cfg.retaguardia || []).forEach(s => p.rearguard.push(crearCartaEn(ctx, inst, pid, s, 'rearguard')));
        (cfg.mano || []).forEach(s => p.hand.push(crearCartaEn(ctx, inst, pid, s, 'hand')));
        // mazo se declara DE ARRIBA A ABAJO; el motor roba con deck.pop() (el último es la cima)
        [...(cfg.mazo || [])].reverse().forEach(s => p.deck.push(crearCartaEn(ctx, inst, pid, s, 'deck')));
        (cfg.descartes || []).forEach(s => p.discard.push(crearCartaEn(ctx, inst, pid, s, 'discard')));
        (cfg.retribucion || []).forEach(s => p.retribution.push(crearCartaEn(ctx, inst, pid, s, 'retribution')));
        if (cfg.evento) p.activeEvent = crearCartaEn(ctx, inst, pid, cfg.evento, 'event');
    }

    // Resolución de `padre`: enlaza cada carta con _padreRef al parentId de la carta
    // homónima del MISMO jugador (busca en todas sus zonas: el padre puede estar en el
    // descarte, p. ej. para probar la muerte súbita del clon cuando el padre ya no está).
    for (const pid of ['p1', 'p2']) {
        const p = inst.players[pid];
        const todas = [...p.vanguard, ...p.rearguard, ...p.hand, ...p.deck, ...p.discard, ...(p.activeEvent ? [p.activeEvent] : [])];
        todas.forEach(c => {
            if (!c._padreRef) return;
            const padre = todas.find(x => x.name === c._padreRef && x.instanceId !== c.instanceId);
            if (!padre) throw new Error(`[${ctx.cual}] padre "${c._padreRef}" no encontrado para ${c.name}`);
            c.parentId = padre.instanceId;
            delete c._padreRef;
        });
    }

    inst.updatePassives();
    // La comparación empieza limpia: fuera el log del constructor y flotantes de updatePassives.
    inst.logHistory = [];
    ctx.flotantes.length = 0;
}

// ---------------------------------------------------------------------------
// Pasos del escenario
// ---------------------------------------------------------------------------

function buscarInstancia(ctx, inst, ref, zonas, jugador, indice) {
    const pids = jugador ? [jugador] : ['p1', 'p2'];
    const encontradas = [];
    for (const pid of pids) {
        const p = inst.players[pid];
        const listas = {
            mano: p.hand, vanguardia: p.vanguard, retaguardia: p.rearguard,
            mazo: p.deck, descartes: p.discard, retribucion: p.retribution,
        };
        // Se admite el ID NUMÉRICO además del nombre y del instanceId (igual que ya hacía el paso
        // {busqueda}): es la única forma de referirse a una carta que se llama distinto en cada
        // base, como Súper Evolución (id 1049), renombrada en la nueva y congelada en la vieja.
        for (const z of zonas) {
            for (const c of (listas[z] || [])) {
                if (c.instanceId === ref || c.name === ref || c.id === ref) encontradas.push(c);
            }
        }
        if (zonas.includes('evento') && p.activeEvent && (p.activeEvent.instanceId === ref || p.activeEvent.name === ref || p.activeEvent.id === ref)) {
            encontradas.push(p.activeEvent);
        }
    }
    if (encontradas.length === 0) throw new Error(`[${ctx.cual}] no encuentro "${ref}" en ${zonas.join('/')}${jugador ? ' de ' + jugador : ''}`);
    if (indice !== undefined) {
        if (!encontradas[indice]) throw new Error(`[${ctx.cual}] "${ref}": indice ${indice} fuera de rango (${encontradas.length} copias)`);
        return encontradas[indice];
    }
    if (encontradas.length > 1) throw new Error(`[${ctx.cual}] "${ref}" es ambigua (${encontradas.length} copias): usar instanceId, {jugador} o {indice}`);
    return encontradas[0];
}

const RESPUESTAS = new Set(['confirmar', 'cancelar', 'opcion', 'elegirTablero', 'busqueda']);

// 'elegir' es doblemente polimórfico: además de responder a un modal abierto
// (búsqueda visual / tablero DSL / opción), en algunos flujos NINGUNA base
// registra una interacción pendiente porque el propio selectCard() gestiona
// el estado (SELECT_ABILITY_TARGETS de la vieja, SELECT_DSL_TARGETS de la
// nueva vía _dslPickClick) — igual que un objetivo de ataque normal. Por eso
// decide su rama en ejecutarPaso, mirando si hay algo pendiente o no.
function esPasoRespuesta(paso) {
    if (Object.keys(paso).some(k => RESPUESTAS.has(k))) return true;
    return false;
}

function lanzar(ctx, promesa) {
    if (promesa && typeof promesa.catch === 'function') {
        promesa.catch(e => ctx.errores.push(e));
    }
}

async function aplicarRespuesta(ctx, inst, paso) {
    const pend = ctx.pendientes.shift();
    if (!pend) throw new Error(`[${ctx.cual}] paso de respuesta ${JSON.stringify(paso)} sin interacción pendiente`);

    // {elegir: [...]} es polimórfico: responde a lo que esté abierto. Necesario
    // porque la base vieja y la nueva pueden abrir modales distintos para la
    // misma elección (p. ej. Té helado: búsqueda visual vieja vs tablero nueva).
    if (paso.elegir !== undefined) {
        if (pend.tipo === 'elegirTablero') paso = { elegirTablero: paso.elegir };
        else if (pend.tipo === 'busqueda') paso = { busqueda: paso.elegir };
        else if (pend.tipo === 'opcion') paso = { opcion: paso.elegir[0] };
        else if (pend.tipo === 'visorMazo') {
            // Copia local para poder tomar instancias DISTINTAS cuando se repiten
            // nombres (p. ej. Inspiración: dos "Atomización"), como en 'busqueda'.
            const restantes = [...pend.elegibles];
            const seleccion = paso.elegir.map(ref => {
                const i = restantes.findIndex(c => c.instanceId === ref || c.name === ref);
                if (i === -1) throw new Error(`[${ctx.cual}] "${ref}" no está entre las elegibles del visor de mazo: ${pend.elegibles.map(c => c.name).join(', ') || '(ninguna)'}`);
                return restantes.splice(i, 1)[0];
            });
            // Contrato del visor: single (maxCount<=1) resuelve UNA carta; multi, el array.
            pend.resolver((pend.maxCount && pend.maxCount > 1) ? seleccion : seleccion[0]);
            await asentar(ctx);
            return;
        }
        else throw new Error(`[${ctx.cual}] {elegir} no sabe responder a "${pend.tipo}"`);
    }

    if (paso.confirmar !== undefined) {
        if (pend.tipo !== 'confirmar') throw new Error(`[${ctx.cual}] esperaba responder a "${pend.tipo}", el paso es {confirmar}`);
        lanzar(ctx, inst.confirmAction());
    } else if (paso.cancelar !== undefined) {
        // Sobre una búsqueda visual equivale al botón Cancelar del modal (resuelve
        // con lista vacía); sobre el visor de mazo, al clic en el fondo oscuro
        // (resuelve null); en el resto de estados, al clic de cancelación general.
        if (pend.tipo === 'busqueda') pend.resolver([]);
        else if (pend.tipo === 'visorMazo') pend.resolver(null);
        else if (pend.tipo === 'elegirTablero') {
            // cancelable:false (Toto, 21-jul-2026): cancelAction() puede negarse a
            // resolver el pick (coste/moneda ya comprometidos). Si sigue vivo tras
            // el intento, la interacción NO se dio por respondida: se repone en la
            // cola para que el escenario deba completar la elección de verdad.
            inst.cancelAction();
            if (inst.dslPick) { ctx.pendientes.unshift(pend); return; }
        }
        else inst.cancelAction();
    } else if (paso.opcion !== undefined) {
        if (pend.tipo !== 'opcion') throw new Error(`[${ctx.cual}] esperaba responder a "${pend.tipo}", el paso es {opcion}`);
        let idx;
        if (typeof paso.opcion === 'number') idx = paso.opcion;
        else {
            idx = pend.etiquetas.findIndex(e => e.includes(paso.opcion));
            if (idx === -1) throw new Error(`[${ctx.cual}] opción "${paso.opcion}" no está entre: ${pend.etiquetas.join(' | ')}`);
        }
        inst.executeChoice(idx);
    } else if (paso.elegirTablero !== undefined) {
        if (pend.tipo !== 'elegirTablero') throw new Error(`[${ctx.cual}] esperaba responder a "${pend.tipo}", el paso es {elegirTablero}`);
        for (const ref of paso.elegirTablero) {
            const carta = pend.pool.find(c => c.instanceId === ref || c.name === ref);
            if (!carta) throw new Error(`[${ctx.cual}] "${ref}" no está en el pool de selección: ${pend.pool.map(c => c.name).join(', ')}`);
            inst._dslPickClick(carta);
        }
    } else if (paso.busqueda !== undefined) {
        if (pend.tipo !== 'busqueda') throw new Error(`[${ctx.cual}] esperaba responder a "${pend.tipo}", el paso es {busqueda}`);
        const restantes = [...pend.cartas];
        const seleccion = paso.busqueda.map(ref => {
            const i = restantes.findIndex(c => c && (c.instanceId === ref || c.name === ref || c.id === ref));
            if (i === -1) throw new Error(`[${ctx.cual}] "${ref}" no está entre las cartas ofrecidas: ${restantes.map(c => c && c.name).join(', ')}`);
            return restantes.splice(i, 1)[0];
        });
        pend.resolver(seleccion);
    }
    await asentar(ctx);
}

async function ejecutarPaso(ctx, inst, paso) {
    // soloEn: paso que solo aplica a una base, para divergencias de FLUJO
    // intencionadas (p. ej. la nueva pregunta donde la vieja callaba). Úsese
    // siempre junto a diferenciasEsperadas que documenten la divergencia.
    if (paso.soloEn && paso.soloEn !== ctx.cual) return;

    if (esPasoRespuesta(paso)) return aplicarRespuesta(ctx, inst, paso);

    if (paso.elegir !== undefined && ctx.pendientes.length) return aplicarRespuesta(ctx, inst, paso);

    if (ctx.pendientes.length) {
        throw new Error(`[${ctx.cual}] hay una interacción pendiente (${ctx.pendientes[0].tipo}) sin responder antes del paso ${JSON.stringify(paso)}`);
    }

    if (paso.elegir !== undefined) {
        // Sin interacción registrada: el propio selectCard() gestiona el
        // estado (clic directo en el tablero, una carta por paso).
        for (const ref of paso.elegir) {
            const c = buscarInstancia(ctx, inst, ref, ['vanguardia', 'retaguardia'], undefined);
            lanzar(ctx, inst.selectCard(c.instanceId));
            await asentar(ctx);
        }
        return;
    }

    if (paso.jugar !== undefined) {
        const c = buscarInstancia(ctx, inst, paso.jugar, ['mano'], paso.jugador || inst.activePlayerId, paso.indice);
        lanzar(ctx, inst.playCard(c.instanceId));
    } else if (paso.seleccionar !== undefined) {
        const c = buscarInstancia(ctx, inst, paso.seleccionar, ['vanguardia', 'retaguardia', 'mano'], paso.jugador);
        lanzar(ctx, inst.selectCard(c.instanceId));
    } else if (paso.atacar !== undefined) {
        const atacante = buscarInstancia(ctx, inst, paso.atacar, ['vanguardia'], inst.activePlayerId);
        lanzar(ctx, inst.selectCard(atacante.instanceId));
        await asentar(ctx);
        const objetivo = buscarInstancia(ctx, inst, paso.objetivo, ['vanguardia'], inst.activePlayerId === 'p1' ? 'p2' : 'p1');
        lanzar(ctx, inst.selectCard(objetivo.instanceId));
    } else if (paso.ataqueDirecto !== undefined) {
        const atacante = buscarInstancia(ctx, inst, paso.ataqueDirecto, ['vanguardia'], inst.activePlayerId);
        lanzar(ctx, inst.selectCard(atacante.instanceId));
        await asentar(ctx);
        lanzar(ctx, inst.performDirectAttack());
    } else if (paso.habilidad !== undefined) {
        const c = buscarInstancia(ctx, inst, paso.habilidad, ['vanguardia', 'retaguardia'], paso.jugador || inst.activePlayerId);
        inst.activateAbility(c.instanceId);
    } else if (paso.descarteRival !== undefined) {
        const rival = inst.activePlayerId === 'p1' ? 'p2' : 'p1';
        const c = buscarInstancia(ctx, inst, paso.descarteRival, ['mano'], rival);
        inst.handleOpponentDiscard(c);
    } else if (paso.robar !== undefined) {
        lanzar(ctx, inst.drawCard(paso.robar === true ? inst.activePlayerId : paso.robar, true));
    } else if (paso.pararEleccion !== undefined) {
        // Parada anticipada ("ya he elegido bastantes"). Es POLIMÓRFICO como {elegir}: el camino
        // crudo de la vieja (SELECT_ABILITY_TARGETS + canStopEarly) y el ELEGIR del DSL tienen
        // cada uno su propio botón OK, así que el paso responde al que esté abierto y el mismo
        // escenario vale para las dos bases.
        if (inst.inputState === 'SELECT_DSL_TARGETS' && inst.dslPick) lanzar(ctx, inst.pararEleccionDsl());
        else lanzar(ctx, inst.finishEarlyTargetSelection());
    } else if (paso.finTurno !== undefined) {
        lanzar(ctx, inst.confirmEndTurn());
    } else {
        throw new Error(`[${ctx.cual}] paso desconocido: ${JSON.stringify(paso)}`);
    }
    await asentar(ctx);
}

// ---------------------------------------------------------------------------
// Ejecución completa de un escenario contra una base
// ---------------------------------------------------------------------------

async function ejecutarEscenario(cual, esc) {
    const ctx = crearContexto(cual);
    ctx.semilla = esc.semilla !== undefined ? esc.semilla : 1;
    // esc.monedas admite array (simétrico, de siempre) u objeto {vieja:[...], nueva:[...]}
    // para flujos que divergen en CUÁNTAS monedas se piden (p. ej. un requisito
    // nuevo que corta el camino antes de llegar a la moneda en una sola base).
    const _monedasCrudas = Array.isArray(esc.monedas) ? esc.monedas : (esc.monedas ? esc.monedas[cual] || [] : []);
    ctx.monedas = _monedasCrudas.map(m => m === 'cara' ? 'heads' : m === 'cruz' ? 'tails' : m);

    const inst = crearJuego(ctx);
    await asentar(ctx); // timers del constructor (chat de fin de partida, etc.)
    construirEstado(ctx, inst, esc);

    for (const paso of (esc.pasos || [])) {
        await ejecutarPaso(ctx, inst, paso);
    }
    await asentar(ctx);

    if (ctx.pendientes.length) {
        throw new Error(`[${cual}] fin de escenario con ${ctx.pendientes.length} interacción(es) sin responder (primera: ${ctx.pendientes[0].tipo})`);
    }
    if (ctx.monedas.length) {
        throw new Error(`[${cual}] fin de escenario con ${ctx.monedas.length} moneda(s) guionizada(s) sin usar: guion desincronizado`);
    }

    const estado = JSON.parse(JSON.stringify(inst.exportGameState()));
    delete estado.logHistory; // los logs se comparan aparte, con las diferencias intencionadas
    return {
        logs: inst.logHistory.map(e => `[${e.type}] ${e.msg}`),
        flotantes: ctx.flotantes.map(f => `${f.carta} · ${f.texto} · ${f.clase}`),
        estado,
    };
}

// ---------------------------------------------------------------------------
// Comparación
// ---------------------------------------------------------------------------

// El boilerplate AL_CONSUMIR de la nueva "lava" la Ayuda con game.resetCard()
// antes de descartarla; la vieja la descartaba tal cual. resetCard CREA dos
// campos que antes no existían y que son inertes para el juego (el motor solo
// los consulta por truthiness): counters={} y hasAttackedThisTurn=false.
// Solo se ignora la dirección undefined→valor-inerte; cualquier otro cambio
// en esos campos sigue siendo un fallo.
// Además, MARCAR_TEMPORAL (nueva) guarda en la marca el sourceInstanceId de la
// carta que la creó (lo necesita p. ej. sinMarcaTemporalPropia); las marcas
// viejas solo llevaban {sourceId, ownerId}. Campo nuevo intencionado e inerte
// para el comportamiento comparado.
function esDiffInerte(ruta, a, b) {
    // zoeDefBuffActive: bandera de bookkeeping de la Zoe VIEJA (imperativa), sustituida
    // por el _dslPasN genérico (ver más abajo) en la nueva (PASIVA_CONTINUA). Única
    // excepción en la dirección CONTRARIA a las demás (vieja=true -> nueva=ausente: la
    // nueva ni siquiera declara el campo), así que va ANTES del guard `a !== undefined`
    // de abajo (que solo cubre la dirección undefined -> valor-inerte).
    if (ruta.endsWith('.zoeDefBuffActive') && a === true && b === undefined) return true;
    // passiveActive: idéntico caso al de arriba pero para Karlos/Kyle (bandera del anuncio
    // manual de su pasiva vieja, sustituida por el _dslPasN genérico). Aquí la nueva SÍ
    // declara el campo —createCardInstance lo inicializa a false— así que el diff es
    // true -> false. Nada del motor ni de ninguna carta lo lee: es solo bookkeeping.
    if (ruta.endsWith('.passiveActive') && a === true && b === false) return true;
    // xidachaneBoosts/karolinaDefBoosts/fanaticoBoost (Toto, 27-jul-2026): la vieja los
    // inicializaba a 0 (o al valor real) dentro de su propio onUpdatePassive imperativo; la
    // pasiva DSL solo los LEE (vía REF/COUNT), nunca los escribe -así que se activan/leen a
    // través de la Activa imperativa que sigue intacta, pero nunca quedan "a 0 por defecto".
    // Ambos lados los tratan como 0 si faltan (ver `|| 0` en _passiveDeltas/_ref), así que la
    // diferencia es inerte. Dirección vieja=número -> nueva=ausente.
    if (/\.(xidachaneBoosts|karolinaDefBoosts|fanaticoBoost)$/.test(ruta) && typeof a === 'number' && b === undefined) return true;
    // reverseArrow: la vieja de Gladiador lo dejaba en `false` explícito al anexar (mismo
    // valor falsy que por defecto, sin efecto real en la flecha); la nueva simplemente no
    // lo toca. gladiadorBuffActive: bookkeeping interno que sustituye el propio array
    // `attachments`/anexoValido en la nueva (Toto, 27-jul-2026, trigger de anexo).
    if (ruta.endsWith('.reverseArrow') && a === false && b === undefined) return true;
    if (ruta.endsWith('.gladiadorBuffActive') && typeof a === 'boolean' && b === undefined) return true;
    // ayudanteBuff (Ayudante perturbada, 31-jul-2026): bookkeeping propio de la vieja para
    // saber si debía restar el +2 Atq al final del ataque; la nueva usa BONO_ATAQUE, que
    // deshace el bono vía updatePassives (recompute) y no necesita recordar nada.
    if (ruta.endsWith('.ayudanteBuff') && typeof a === 'boolean' && b === undefined) return true;
    // _haAtacado / _haRecibidoDano / _haUsadoActiva (31-jul-2026): bookkeeping del MOTOR, no de
    // las cartas — sirve para que una carta pueda saber si una unidad "sigue intacta" (la primera
    // que lo necesita es Neo). Vive en index.html, así que lo comparten LAS DOS bases: cuando
    // difiere NO es que una lo ponga y la otra no, sino que el CAMINO hasta él es distinto, y esa
    // diferencia ya está cubierta por el resto de aserciones del escenario:
    //   · vieja=true, nueva=undefined -> la nueva bloquea ANTES (veto temprano §11b, requisitos
    //     del DSL) donde la vieja se comprometía y abortaba después. Mismo desenlace.
    //   · vieja=undefined, nueva=true -> la nueva destruye pasando por modifyStat (que es donde
    //     se pone la marca) mientras la vieja asignaba currentHp = 0 a pelo. Mismo desenlace.
    // Si alguna vez una de estas marcas difiere por un motivo REAL, se notará en los stats, los
    // logs o la zona de la carta, que sí se comparan.
    if (/\._ha(Atacado|RecibidoDano|UsadoActiva)$/.test(ruta)) return true;
    // FIRMA DE UN CONTADOR (22-ago-2026). Un contador se firma hoy con la CARTA que lo puso
    // ({source: nombre, sourceInstanceId, sourceAbility}); las cartas más viejas pasaban una
    // cadena ya compuesta ("esta carta (POCA PACIENCIA)"). Es metadato PURO -el único que lo
    // lee es el panel de detalle, para escribir la línea de "Afectado por:"- y nadie decide
    // nada con él. Mismo criterio que las marcas temporales de justo abajo. El COUNT, que sí
    // es juego, se sigue comparando entero.
    if (/\.counters\.[^.]+\.(source|sourceInstanceId|sourceAbility)$/.test(ruta)) return true;
    if (a !== undefined) return false;
    if (ruta.endsWith('.counters') && b && typeof b === 'object' && Object.keys(b).length === 0) return true;
    if (ruta.endsWith('.hasAttackedThisTurn') && b === false) return true;
    if (ruta.includes('.tempEffects.') && ruta.endsWith('.sourceInstanceId') && typeof b === 'string') return true;
    // habilidad (Toto, 5-ago-2026): la marca del DSL firma QUÉ Pasiva/Activa la dejó, para que
    // el detalle pueda decir "+1 DEF y +1 ATQ por SABIDURÍA" -la vieja nunca lo guardaba, así
    // que la línea salía sin firmar-. Es metadato PURO: nadie en el motor ni en ninguna carta
    // lee este campo para decidir nada, solo lo pinta el panel de detalle. Va aquí y no como
    // diferencia declarada suite a suite porque aparece en TODA marca dejada por una unidad;
    // declararlo escenario por escenario sería ruido en cada suite presente y futura.
    if (ruta.includes('.tempEffects.') && ruta.endsWith('.habilidad') && typeof b === 'string') return true;
    // hastaFinDeTurnoPropio: la nueva declara explícitamente en la marca que se
    // limpia al terminar el turno del dueño; la vieja lograba lo mismo con un
    // onStartTurnTempEffect que devolvía false sin condiciones. Verificado
    // empíricamente (no solo leído) que ambos puntos de limpieza caen en el
    // mismo hueco del ciclo de turno: no hay divergencia observable de estado.
    if (ruta.endsWith('.hastaFinDeTurnoPropio') && b === true) return true;
    // _dslPasN / _dslPasHpN: bookkeeping interno del trigger PASIVA_CONTINUA (23 y
    // 27-jul-2026) para saber cuándo anunciar activación/desactivación de la pasiva
    // (compara magnitud/valor actual vs anterior; _dslPasHpN es la variante para el stat
    // "hp", que necesita guardar el TOTAL aportado, no una magnitud). Puramente interno,
    // nunca leído por el motor ni por ninguna otra carta.
    if (/\._dslPas(Hp)?\d+$/.test(ruta) && typeof b === 'number') return true;
    // _sueloAvisado: bookkeeping del aviso de SUELO_STAT/TECHO_STAT (27-jul-2026) — evita
    // repetir el log/flotante en cada pasada mientras el límite siga corrigiendo algo.
    if (ruta.endsWith('._sueloAvisado') && typeof b === 'boolean') return true;
    // _pasivaHabilidadReal: bookkeeping interno (27-jul-2026) que deja la PASIVA_CONTINUA
    // compilada para que el _anota genérico de updatePassives (index.html) atribuya el
    // Atq/Def reaplicado a la Habilidad real (Activa) en vez de siempre a template.passiveName.
    // No existe en la vieja; nunca se lee fuera de ese _anota.
    if (ruta.endsWith('._pasivaHabilidadReal') && a === undefined) return true;
    return false;
}

function diffProfundo(a, b, ruta, salida) {
    if (salida.length >= 25) return; // suficiente para diagnosticar
    if (a === b) return;
    const ta = typeof a, tb = typeof b;
    if (ta !== 'object' || tb !== 'object' || a === null || b === null) {
        if (esDiffInerte(ruta, a, b)) return;
        salida.push(`${ruta}: vieja=${JSON.stringify(a)} · nueva=${JSON.stringify(b)}`);
        return;
    }
    const claves = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of claves) diffProfundo(a[k], b[k], `${ruta}.${k}`, salida);
}

function compararCapturas(esc, vieja, nueva) {
    const diffs = [];

    // Diferencias intencionadas: se aplican sobre la salida VIEJA (de → a)
    let logsViejos = vieja.logs;
    for (const regla of (esc.logsIntencionados || [])) {
        if (!regla.motivo) throw new Error(`escenario "${esc.nombre}": logsIntencionados sin "motivo" documentado`);
        logsViejos = logsViejos.map(l => l.split(regla.de).join(regla.a));
    }
    // Líneas que la vieja emitía y la nueva eliminó a propósito (p. ej. el
    // onExpire decorativo de De compras). Estricto: si la línea declarada no
    // aparece en la vieja, el escenario falla (guion desincronizado).
    for (const regla of (esc.logsSoloVieja || [])) {
        if (!regla.motivo) throw new Error(`escenario "${esc.nombre}": logsSoloVieja sin "motivo" documentado`);
        const antes = logsViejos.length;
        logsViejos = logsViejos.filter(l => !l.includes(regla.linea));
        if (logsViejos.length === antes) {
            diffs.push(`logsSoloVieja: la línea declarada "${regla.linea}" no aparece en la salida vieja`);
        }
    }

    // Líneas que SOLO la nueva emite: casos donde la vieja tenía el mismo
    // aviso pero en logError (privado, fuera del historial) y la nueva lo
    // pasó a logMsg público. Estricto en el mismo sentido que logsSoloVieja.
    let logsNuevos = nueva.logs;
    for (const regla of (esc.logsSoloNueva || [])) {
        if (!regla.motivo) throw new Error(`escenario "${esc.nombre}": logsSoloNueva sin "motivo" documentado`);
        const antes = logsNuevos.length;
        logsNuevos = logsNuevos.filter(l => !l.includes(regla.linea));
        if (logsNuevos.length === antes) {
            diffs.push(`logsSoloNueva: la línea declarada "${regla.linea}" no aparece en la salida nueva`);
        }
    }

    const maxL = Math.max(logsViejos.length, logsNuevos.length);
    for (let i = 0; i < maxL; i++) {
        if (logsViejos[i] !== logsNuevos[i]) {
            diffs.push(`log[${i}]:\n      vieja: ${logsViejos[i]}\n      nueva: ${logsNuevos[i]}`);
        }
    }

    // Flotantes que SOLO la VIEJA emitía (simétrico de logsSoloVieja): p. ej. un anuncio
    // de pasiva escrito a mano que la migración sustituye por el genérico del trigger.
    let flotantesViejos = vieja.flotantes;
    // Reescrituras intencionadas del TEXTO de un flotante (gemelo de logsIntencionados, que
    // existía solo para los logs; 5-ago-2026). Se aplican sobre la salida VIEJA (de → a), o sea
    // que el escenario declara "la vieja decía X y la nueva dice Y, y es a propósito".
    for (const regla of (esc.flotantesIntencionados || [])) {
        if (!regla.motivo) throw new Error(`escenario "${esc.nombre}": flotantesIntencionados sin "motivo" documentado`);
        // `ocurrencia: N` reescribe SOLO el N-ésimo flotante que case (1 = el primero), en vez de
        // todos (22-ago-2026). Hace falta cuando el mismo texto sale dos veces y solo una cambia:
        // NoName pinta "RÉPLICA" al escanear -eso sigue igual- y luego el nombre de la Habilidad
        // que ha copiado, que antes también decía "RÉPLICA". Sin esto había que elegir entre
        // tapar el legítimo o no declarar el arreglo.
        if (typeof regla.ocurrencia === 'number') {
            let visto = 0, hecho = false;
            flotantesViejos = flotantesViejos.map(l => {
                if (!l.includes(regla.de)) return l;
                visto++;
                if (visto !== regla.ocurrencia) return l;
                hecho = true;
                return l.split(regla.de).join(regla.a);
            });
            if (!hecho) diffs.push(`flotantesIntencionados: no hay un flotante nº ${regla.ocurrencia} que contenga "${regla.de}" en la salida vieja`);
            continue;
        }
        flotantesViejos = flotantesViejos.map(l => l.split(regla.de).join(regla.a));
    }
    for (const regla of (esc.flotantesSoloVieja || [])) {
        if (!regla.motivo) throw new Error(`escenario "${esc.nombre}": flotantesSoloVieja sin "motivo" documentado`);
        const antes = flotantesViejos.length;
        // `consecutivo`: la vieja pintaba el MISMO flotante dos veces seguidas y la nueva lo
        // pinta una. Colapsa repeticiones inmediatas idénticas en vez de borrar por texto: sin
        // esto, declarar "-2 FUR" se llevaba por delante también el legítimo, y un fallo de
        // recuento -el bug clásico de esta batería- pasaba desapercibido. No depende de
        // instanceId ni de contar a mano, así que no se pudre al retocar un escenario.
        // Si no hay ninguna repetición consecutiva, falla (8-ago-2026).
        if (regla.consecutivo) {
            const out = [];
            let quitados = 0;
            for (const l of flotantesViejos) {
                if (out.length && out[out.length - 1] === l && l.includes(regla.linea)) { quitados++; continue; }
                out.push(l);
            }
            flotantesViejos = out;
            if (!quitados) diffs.push(`flotantesSoloVieja(consecutivo): "${regla.linea}" no sale repetido en la vieja`);
            continue;
        }
        flotantesViejos = flotantesViejos.filter(l => !l.includes(regla.linea));
        if (flotantesViejos.length === antes) {
            diffs.push(`flotantesSoloVieja: la línea declarada "${regla.linea}" no aparece en la salida vieja`);
        }
    }

    // Flotantes que SOLO la nueva emite (mismo patrón que logsSoloNueva): p. ej.
    // una pasiva que antes nunca se anunciaba y ahora sí, a petición de Toto.
    // Estricto en el mismo sentido: si la línea declarada no aparece, falla.
    let flotantesNuevos = nueva.flotantes;
    for (const regla of (esc.flotantesSoloNueva || [])) {
        if (!regla.motivo) throw new Error(`escenario "${esc.nombre}": flotantesSoloNueva sin "motivo" documentado`);
        const antes = flotantesNuevos.length;
        // `ocurrencia: N` quita SOLO el N-ésimo que case, no todos (hermano del que ya tenía
        // flotantesIntencionados). Hace falta cuando la nueva pinta el MISMO cartel más veces
        // que la vieja -Sadame anuncia ZOMBIFICAR también al deshacer los anexos- y borrarlos
        // todos se llevaría por delante el legítimo, escondiendo un fallo de recuento.
        if (typeof regla.ocurrencia === 'number') {
            let visto = 0;
            flotantesNuevos = flotantesNuevos.filter(l => {
                if (!l.includes(regla.linea)) return true;
                return ++visto !== regla.ocurrencia;
            });
            if (visto < regla.ocurrencia) {
                diffs.push(`flotantesSoloNueva: no hay un flotante nº ${regla.ocurrencia} que contenga "${regla.linea}" en la salida nueva`);
            }
            continue;
        }
        flotantesNuevos = flotantesNuevos.filter(l => !l.includes(regla.linea));
        if (flotantesNuevos.length === antes) {
            diffs.push(`flotantesSoloNueva: la línea declarada "${regla.linea}" no aparece en la salida nueva`);
        }
    }

    // `flotantesReordenados`: los MISMOS flotantes, en distinto orden, a propósito. Nace de que
    // el Evento pasara a resolver su fin de turno ANTES que las cartas (21-ago-2026), que es el
    // orden de las reglas -Evento, vanguardia, retaguardia, Daños por tiempo-; la vieja lo hacía
    // al revés. No es un cambio de CONTENIDO, así que declararlo pieza a pieza con
    // flotantesSoloVieja/SoloNueva sería mentir: no falta ni sobra ninguno.
    // Estricto igual que el resto: exige que el CONJUNTO sea idéntico. Si de verdad aparece o
    // desaparece un flotante, esto NO lo tapa.
    if (esc.flotantesReordenados) {
        if (!esc.flotantesReordenados.motivo) throw new Error(`escenario "${esc.nombre}": flotantesReordenados sin "motivo" documentado`);
        const _orden = (xs) => [...xs].sort();
        if (JSON.stringify(_orden(flotantesViejos)) !== JSON.stringify(_orden(flotantesNuevos))) {
            diffs.push(`flotantesReordenados: no son los mismos flotantes, solo cambiados de orden.\n      vieja: ${flotantesViejos.join(' | ')}\n      nueva: ${flotantesNuevos.join(' | ')}`);
        }
    } else {
        const maxF = Math.max(flotantesViejos.length, flotantesNuevos.length);
        for (let i = 0; i < maxF; i++) {
            if (flotantesViejos[i] !== flotantesNuevos[i]) {
                diffs.push(`flotante[${i}]:\n      vieja: ${flotantesViejos[i]}\n      nueva: ${flotantesNuevos[i]}`);
            }
        }
    }

    diffProfundo(vieja.estado, nueva.estado, 'estado', diffs);

    // Diferencias de COMPORTAMIENTO esperadas (p. ej. bug latente de la base
    // vieja corregido en la migración). Estricto en ambos sentidos: falla si
    // aparece un diff no declarado Y si un diff declarado deja de aparecer.
    const esperadas = esc.diferenciasEsperadas || [];
    if (esperadas.length) {
        for (const e of esperadas) {
            if (!e.motivo) throw new Error(`escenario "${esc.nombre}": diferenciasEsperadas sin "motivo" documentado`);
        }
        const sinDeclarar = diffs.filter(d => !esperadas.some(e => d.includes(e.contiene)));
        const sinAparecer = esperadas.filter(e => !diffs.some(d => d.includes(e.contiene)));
        const fallos = [...sinDeclarar];
        sinAparecer.forEach(e => fallos.push(`diferencia esperada que ya NO aparece (¿cambió el comportamiento?): "${e.contiene}"`));
        return { fallos, nota: fallos.length ? null : `${esperadas.length} diferencia(s) de comportamiento esperadas y documentadas` };
    }
    return { fallos: diffs, nota: null };
}

// ---------------------------------------------------------------------------
// Runner de suites
// ---------------------------------------------------------------------------

async function correrSuite(nombreSuite, escenarios) {
    let fallos = 0;
    const alRechazar = (e) => { throw e; };
    process.on('unhandledRejection', alRechazar);

    for (const esc of escenarios) {
        try {
            const vieja = await ejecutarEscenario('vieja', esc);
            const nueva = await ejecutarEscenario('nueva', esc);
            const { fallos: diffs, nota } = compararCapturas(esc, vieja, nueva);
            if (diffs.length === 0) {
                console.log(`  ✔ ${esc.nombre}${nota ? ` (${nota})` : ''}`);
            } else {
                fallos++;
                console.log(`  ✘ ${esc.nombre}`);
                diffs.forEach(d => console.log(`    · ${d}`));
            }
        } catch (e) {
            fallos++;
            console.log(`  ✘ ${esc.nombre} — ERROR: ${e.message}`);
            if (process.env.HARNESS_DEBUG) console.log(e.stack);
        }
    }

    process.removeListener('unhandledRejection', alRechazar);
    if (fallos === 0) {
        console.log(`SUITE ${nombreSuite}: ${escenarios.length}/${escenarios.length} escenarios — salidas IDÉNTICAS`);
    } else {
        console.log(`SUITE ${nombreSuite}: ${fallos} FALLOS de ${escenarios.length} escenarios`);
        process.exitCode = 1;
    }
}

module.exports = { correrSuite, ejecutarEscenario, compararCapturas };
