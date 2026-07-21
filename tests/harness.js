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

    // Visor de mazo completo (búsquedas con elección sobre el MAZO). Contrato:
    // resuelve UNA carta o null (cierre sin elegir / sin elegibles).
    inst.openDeckSearchViewer = (playerId, elegibles, titulo = null, aviso = null) =>
        new Promise(resolve => {
            ctx.pendientes.push({
                tipo: 'visorMazo', jugador: playerId, titulo, aviso,
                cartas: [...inst.players[playerId].deck], elegibles: elegibles || [], resolver: resolve,
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
        for (const z of zonas) {
            for (const c of (listas[z] || [])) {
                if (c.instanceId === ref || c.name === ref) encontradas.push(c);
            }
        }
        if (zonas.includes('evento') && p.activeEvent && (p.activeEvent.instanceId === ref || p.activeEvent.name === ref)) {
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
            const ref = paso.elegir[0];
            const carta = pend.elegibles.find(c => c.instanceId === ref || c.name === ref);
            if (!carta) throw new Error(`[${ctx.cual}] "${ref}" no está entre las elegibles del visor de mazo: ${pend.elegibles.map(c => c.name).join(', ') || '(ninguna)'}`);
            pend.resolver(carta);
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
    if (a !== undefined) return false;
    if (ruta.endsWith('.counters') && b && typeof b === 'object' && Object.keys(b).length === 0) return true;
    if (ruta.endsWith('.hasAttackedThisTurn') && b === false) return true;
    if (ruta.includes('.tempEffects.') && ruta.endsWith('.sourceInstanceId') && typeof b === 'string') return true;
    // hastaFinDeTurnoPropio: la nueva declara explícitamente en la marca que se
    // limpia al terminar el turno del dueño; la vieja lograba lo mismo con un
    // onStartTurnTempEffect que devolvía false sin condiciones. Verificado
    // empíricamente (no solo leído) que ambos puntos de limpieza caen en el
    // mismo hueco del ciclo de turno: no hay divergencia observable de estado.
    if (ruta.endsWith('.hastaFinDeTurnoPropio') && b === true) return true;
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

    const maxF = Math.max(vieja.flotantes.length, nueva.flotantes.length);
    for (let i = 0; i < maxF; i++) {
        if (vieja.flotantes[i] !== nueva.flotantes[i]) {
            diffs.push(`flotante[${i}]:\n      vieja: ${vieja.flotantes[i]}\n      nueva: ${nueva.flotantes[i]}`);
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
