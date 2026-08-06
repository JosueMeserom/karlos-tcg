// tests/auditar_textos.js — contrasta el TEXTO de cada carta contra lo que la carta HACE.
//
// No es una suite: no compara viejo-vs-nuevo ni afirma nada sobre el comportamiento. Carga
// cartas.js, extrae de cada carta sus disparadores/hooks/costes reales y comprueba invariantes
// contra lo que su `text` promete. **No arregla nada: señala.**
//
// Nació con la rúbrica de textos (docs/rubrica_textos_cartas.md, 5-ago-2026) y es su verificador:
// cada regla de aquí corresponde a una sección de allí. Conviene pasarlo al añadir cartas nuevas
// y al tocar textos.
//
//   node tests/auditar_textos.js            # solo lo que falla
//   node tests/auditar_textos.js --todo     # incluye las categorías informativas (longitud)
//
// Lo que este script NO puede ver: si la descripción de un efecto es correcta EN SU CONTENIDO
// (que "cura 2" cure 2 y no 3). Eso sigue siendo lectura humana; aquí se comprueba la
// ESTRUCTURA -nombres, costes, duraciones, momentos, banderas- que es donde estaban los fallos.

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');

// --- carga de cartas.js en un contexto mínimo ---
const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    document: {
        getElementById: () => ({ style: {}, classList: { add() {}, remove() {} } }),
        createElement: () => ({ style: {}, classList: { add() {} }, appendChild() {} }),
        querySelector: () => null, querySelectorAll: () => [],
    },
    localStorage: { getItem: () => null, setItem() {} },
    setTimeout() {}, clearTimeout() {}, alert() {},
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'public/reglas.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'public/cartas.js'), 'utf8'), sandbox);
const CARTAS = vm.runInContext('CARD_DB', sandbox).filter(Boolean);

const HOOKS = [
    'onPlay', 'onUpdatePassive', 'onExecuteAbility', 'canActivateAbility', 'onBeforePlayAsync',
    'onAfterPlayAsync', 'onDeath', 'onAllyDeath', 'onExpire', 'onDestroy', 'onBeforeDefend',
    'onAfterAttack', 'onStartTurn', 'onEndTurn', 'getCustomActions', 'onEquipUpdate',
    'onValidateTarget', 'onExecuteAyuda', 'onDoTTick', 'onGlobalStartTurn', 'onBeforeGainFuror',
    'onGlobalBeforeGainFuror', 'onUnequip', 'onDualLimitFallback', 'onBeforeHealed',
    'onHandReactionToAllyAttack', 'onHandReactionToAllyDamage', 'canPlayCard', 'canAttackNormally',
    'onBeforeAffectedByEnemyEffect', 'onTargetsReady', 'onEquipBeforeAttack', 'onGetPreviewEffects',
    'onGlobalGetPreviewEffects', 'onGlobalBeforeStatChange', 'onBeforeTakeDamage', 'onAfterDefend',
];

const hallazgos = [];
const add = (cat, c, detalle) => hallazgos.push({ cat, carta: c.name, tipo: c.type, detalle });

const T_COLOCAR = ['AL_JUGAR', 'ANTES_DE_JUGAR', 'AL_ENTRAR', 'onPlay', 'onAfterPlayAsync', 'onBeforePlayAsync'];
const T_CONTINUO = ['PASIVA_CONTINUA', 'AURA', 'PREVIEW_GLOBAL', 'GLOBAL_MODIFICAR_FUROR',
    'GLOBAL_ANTES_DE_CAMBIO_STAT', 'PUEDE_ATACAR', 'SOBRECURACION', 'FIN_TURNO', 'INICIO_TURNO',
    'GLOBAL_INICIO_TURNO', 'INTERCEPTOR_ATAQUE', 'onUpdatePassive', 'onEquipUpdate',
    'onGlobalGetPreviewEffects', 'onGetPreviewEffects', 'onGlobalBeforeStatChange',
    'onBeforeGainFuror', 'onGlobalBeforeGainFuror', 'canAttackNormally', 'onEndTurn', 'onStartTurn'];
const T_REACTIVO = ['REACCION', 'TRAS_ATACAR', 'TRAS_DEFENDER', 'ANTES_DE_ATACAR', 'ANTES_DE_DEFENDER',
    'INTERCEPTOR_ATAQUE', 'GLOBAL_TRAS_ATAQUE', 'GLOBAL_ANTES_DE_ATAQUE', 'EQUIPO_ANTES_DE_DEFENDER',
    'EQUIPO_ANTES_DE_ATACAR', 'ESPEJO', 'AL_MORIR', 'AL_MORIR_ALIADO'];

// Banderas de plantilla que conceden una REGLA real: si la carta la tiene, el texto debe decirlo.
const BANDERAS = {
    immuneToEnemyEvents: ['evento'], immuneToEnemyAids: ['ayuda'],
    isTaunt: ['provoc', 'dirigid', 'deben ir'], uncounterable: ['imparable', 'no se puede', 'contrarrest'],
    canAttackStealth: ['oculto', 'oculta'], treatAttacksAsSpecial: ['especial'],
    ignoreStatCaps: ['límite', 'limite', 'rebasa', 'super'], isAvatar: ['avatar', 'inmune'],
    canGainFurorFromRearguard: ['retaguardia'], cannotRetreat: ['retirar'],
    isEvolution: ['evolucion', 'evolución', 'sustituy', 'sustituir', 'requisito'],
};

const CHARS_LINEA = 37;   // 260px de panel menos paddings, a 12px de fuente
const MAX_LINEAS = 5;     // más de 5 líneas seguidas ya se leen como un muro
const TOPE_CAJA = CHARS_LINEA * MAX_LINEAS;

// Trocea un texto en las CAJAS que el detalle pintará por separado.
function cajasDe(c) {
    let t = c.text || '';
    const out = [];
    const corta = (re, etq) => { const m = t.match(re); if (m) { out.push([etq, m[0].trim().length]); t = t.slice(m[0].length); } };
    corta(/^Requisito:\s*[^.]+\.\s*/i, 'Requisito');
    corta(/^Coste:\s*[^.]+\.\s*/i, 'Coste');
    corta(/^\d+\s*turnos?\.\s*/i, 'Duración');
    if (c.type === 'Evento') {
        return out.concat(t.split(/(?=Antes de colocarla, |Al colocarla, |Mientras esté en juego, |Al expirar, )/)
            .filter(p => p.trim())
            .map(p => [(p.match(/^(Antes de colocarla|Al colocarla|Mientras esté en juego|Al expirar)/) || [, 'cuerpo'])[1], p.trim().length]));
    }
    const trozos = t.split(/\s*(?<![\p{L}\p{N}])(P:|A:)(?=\s)\s*/u).filter(x => x && x.trim());
    for (let i = 0; i < trozos.length; i++) {
        if (trozos[i] === 'P:' || trozos[i] === 'A:') { out.push([trozos[i] === 'P:' ? 'Pasiva' : 'Activa', (trozos[i + 1] || '').trim().length]); i++; }
        else out.push(['cuerpo', trozos[i].trim().length]);
    }
    return out;
}

function opsDe(nodo, acc = new Set()) {
    if (!nodo || typeof nodo !== 'object') return acc;
    if (Array.isArray(nodo)) { nodo.forEach(n => opsDe(n, acc)); return acc; }
    if (nodo.op) acc.add(nodo.op);
    for (const k of Object.keys(nodo)) if (k !== 'op') opsDe(nodo[k], acc);
    return acc;
}

for (const c of CARTAS) {
    const t = c.text || '';
    const tl = t.toLowerCase();
    const triggers = (c.abilities || []).map(a => a.trigger);
    const hooks = HOOKS.filter(h => typeof c[h] === 'function');
    const ops = [...opsDe(c.abilities || [])];
    const tiene = (lista) => lista.some(x => triggers.includes(x) || hooks.includes(x));

    if (!t) { if (hooks.length || triggers.length) add('SIN-TEXTO', c, 'tiene comportamiento pero no declara text'); continue; }

    // --- §1 Toda Habilidad se nombra ---
    const mP = t.match(/(?:^|\s)P:\s*([^:.]+?)\s*:/);
    const mA = t.match(/(?:^|\s)A:\s*([^:(]+?)\s*(?:\(|:)/);
    const nomP = mP ? mP[1].trim() : null;
    const nomA = mA ? mA[1].trim() : null;
    if (c.passiveName && !/(?:^|\s)P:/.test(t)) add('NOMBRE-PASIVA', c, `passiveName="${c.passiveName}" pero el texto no tiene sección "P:"`);
    else if (c.passiveName && !nomP) add('NOMBRE-PASIVA', c, `passiveName="${c.passiveName}" pero el texto no lo nombra tras "P:"`);
    else if (nomP && c.passiveName && nomP !== c.passiveName) add('NOMBRE-PASIVA', c, `texto dice "${nomP}" · passiveName="${c.passiveName}"`);
    if (nomP && !c.passiveName) add('NOMBRE-PASIVA', c, `el texto nombra "${nomP}" pero la carta no declara passiveName`);
    if (c.activeName && !/(?:^|\s)A:/.test(t)) add('NOMBRE-ACTIVA', c, `activeName="${c.activeName}" pero el texto no tiene sección "A:"`);
    else if (nomA && c.activeName && nomA !== c.activeName) add('NOMBRE-ACTIVA', c, `texto dice "${nomA}" · activeName="${c.activeName}"`);
    if (/(?:^|\s)A:/.test(t) && !c.activeName) add('NOMBRE-ACTIVA', c, 'el texto tiene "A:" pero no declara activeName');

    // --- §3 Coste en Furor ---
    const mCost = t.match(/\((\d+)\s*F\)/i);
    if (c.activeCost > 0 && !mCost) add('COSTE-ACTIVA', c, `activeCost=${c.activeCost} pero el texto no lo dice con "(${c.activeCost}F)"`);
    if (mCost && c.activeCost !== undefined && Number(mCost[1]) !== c.activeCost) add('COSTE-ACTIVA', c, `texto dice (${mCost[1]}F) · activeCost=${c.activeCost}`);
    if (mCost && c.activeCost === undefined) add('COSTE-ACTIVA', c, `el texto dice (${mCost[1]}F) pero no declara activeCost`);
    // "N Furor" a secas está prohibido (§3): o "(NF)" en cabecera, o "N de Furor" en prosa.
    const mSuelto = t.match(/\d+\s+Furor\b(?!\s*\))/);
    if (mSuelto) add('VOCABULARIO', c, `"${mSuelto[0]}" — §3 pide "N de Furor" en prosa`);

    // --- Duración de Evento ---
    if (c.type === 'Evento') {
        const mDur = t.match(/(\d+)\s*turnos?\./i);
        if (c.duration !== undefined && !mDur) add('DURACION', c, `duration=${c.duration} pero el texto no abre con "N turnos."`);
        if (mDur && c.duration !== undefined && Number(mDur[1]) !== c.duration) add('DURACION', c, `texto dice ${mDur[1]} turnos · duration=${c.duration}`);
    }

    // --- §2 Momentos ---
    const diceColocar = /\bal colocar/i.test(tl);
    const diceMientras = /mientras est|mientras siga|mientras haya|mientras teng/i.test(tl);
    if (diceColocar && !tiene(T_COLOCAR)) add('MOMENTO', c, 'dice "Al colocar" pero no hay AL_JUGAR/onPlay/onAfterPlayAsync');
    if (diceMientras && !tiene(T_CONTINUO)) add('MOMENTO', c, 'dice "Mientras…" (continuo) pero no hay disparador continuo');
    // Concordancia de género en "Al colocar" — §2 lo quiere NEUTRO siempre. Excepción: los
    // Eventos usan "Al colocarla, " como MARCADOR DE SECCIÓN, que el parser busca literalmente.
    const mConcordado = t.match(/\bal colocarl[oa]\b/i);
    if (mConcordado && c.type !== 'Evento') add('VOCABULARIO', c, `"${mConcordado[0]}" — §2 pide "Al colocar:" neutro`);

    // --- §2 Efectos reactivos que el texto no anuncia ---
    // El vocabulario canónico de la rúbrica, más las formas equivalentes que ya se usaban.
    const diceReactivo = new RegExp([
        'al (recibir|atacar|morir|sufrir|ser atacad|realizar un ataque|hacer un ataque|intentar un ataque)',
        'cuando (muere|muera|sea|le|lo|la|reciba|ataqu|defien|pierda|su vida)',
        'cada vez que', 'si (recibe|es atacad|le atac|muere|unmei|el|su|uno de)',
        'tras (atacar|combatir|defender)', 'antes de recibir', 'quien le ataque',
        'reacción', 'reaccion', 'en su lugar', 'en todo momento', 'echan una moneda al',
        'solo puedes atacar', 'sus ataques', 'deben ir dirigidos', 'declare un ataque',
    ].join('|'), 'i');
    if (tiene(T_REACTIVO) && !diceReactivo.test(tl)) {
        add('REACTIVO-MUDO', c, `tiene ${triggers.filter(x => T_REACTIVO.includes(x)).join('/') || hooks.join('/')} pero el texto no dice cuándo se dispara`);
    }

    // --- Banderas de plantilla que el texto calla ---
    for (const [bandera, palabras] of Object.entries(BANDERAS)) {
        if (c[bandera] !== true) continue;
        if (!palabras.some(p => tl.includes(p))) add('REGLA-OCULTA', c, `tiene la bandera ${bandera} pero el texto no la menciona`);
    }

    // --- §6 Tipografía ---
    if (/[—–]/.test(t)) add('TIPOGRAFIA', c, 'usa guion largo (—/–); la norma es guion corto');

    // --- §4 Abreviaturas ---
    const abrev = [[/\b\d+T\b/, '"NT" -> "N turnos"'], [/\bVan\./, '"Van." -> "vanguardia"'],
        [/\bRet\./, '"Ret." -> "retaguardia"'], [/\bDoT\b/, '"DoT" -> "Daño por tiempo"'],
        [/\bHP\b/, '"HP" -> "Vida"']];
    for (const [re, msg] of abrev) if (re.test(t)) add('VOCABULARIO', c, `§4: ${msg}`);

    // --- §5 Características y zonas ---
    // Se excluye lo que caiga DENTRO de un nombre de Habilidad (va en mayúsculas por diseño).
    const sinNombres = t.replace(/(?:^|\s)[PA]:\s*[^:(]+/g, ' ');
    const caps = [[/\bATQ\b/, 'ATQ -> Atq'], [/\bDEF\b/, 'DEF -> Def'], [/\bVIDA\b/, 'VIDA -> Vida'],
        [/\bVanguardia\b/, 'Vanguardia -> vanguardia'], [/\bRetaguardia\b/, 'Retaguardia -> retaguardia']];
    for (const [re, msg] of caps) if (re.test(sinNombres)) add('VOCABULARIO', c, `§5: ${msg}`);

    // --- §7 Longitud, medida POR CAJA del detalle, no por carta ---
    // El panel son 260px a 12px de fuente: ~37 caracteres por línea. Lo que satura la vista es
    // una caja de habilidad larga, no el total: una carta con Requisito + Coste + Pasiva +
    // Activa necesita legítimamente más total que una vainilla, y medir el total castigaba a
    // las bien escritas y dejaba pasar cartas con UNA caja enorme (Toto, 5-ago-2026).
    for (const [etq, largo] of cajasDe(c)) {
        if (largo > TOPE_CAJA) add('LONGITUD', c, `caja "${etq}": ${largo} caracteres (tope ${TOPE_CAJA} = ${MAX_LINEAS} líneas)`);
    }
}

// ---------- salida ----------
const INFORMATIVAS = ['LONGITUD'];
const orden = ['NOMBRE-PASIVA', 'NOMBRE-ACTIVA', 'COSTE-ACTIVA', 'DURACION', 'MOMENTO',
    'REGLA-OCULTA', 'REACTIVO-MUDO', 'VOCABULARIO', 'TIPOGRAFIA', 'SIN-TEXTO', 'LONGITUD'];
const todo = process.argv.includes('--todo');
const porCat = {};
for (const h of hallazgos) (porCat[h.cat] = porCat[h.cat] || []).push(h);

let problemas = 0;
for (const cat of orden) {
    const list = porCat[cat] || [];
    if (!list.length) continue;
    const informativa = INFORMATIVAS.includes(cat);
    if (informativa && !todo) continue;
    if (!informativa) problemas += list.length;
    console.log(`\n## ${cat} (${list.length})${informativa ? '  [informativa]' : ''}`);
    for (const h of list) console.log(`   · ${h.carta} [${h.tipo}]: ${h.detalle}`);
}

const nInfo = INFORMATIVAS.reduce((s, c) => s + (porCat[c] || []).length, 0);
console.log(`\nAUDITORÍA DE TEXTOS: ${CARTAS.length} cartas · ${problemas} ${problemas === 1 ? 'problema' : 'problemas'}`
    + (nInfo && !todo ? ` (+${nInfo} informativas, ver --todo)` : ''));
if (problemas === 0) console.log('Todos los textos cumplen la rúbrica (docs/rubrica_textos_cartas.md).');
process.exit(problemas ? 1 : 0);
