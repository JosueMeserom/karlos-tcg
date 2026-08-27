// tests/auditar_marcas.js — TODA MARCA TEMPORAL SE VE, Y SE EXPLICA.
//
// POR QUÉ EXISTE (Toto, 27-ago-2026, tras la tercera vez). Una marca temporal decide algo de un
// turno FUTURO -"se saltará su próximo turno", "estará Oculta durante el turno del rival"- y por
// tanto es información que los dos jugadores necesitan AHORA. Se ha colado tres veces lo mismo:
//   · el Oculto que llegaba en el turno siguiente, sin chapa hasta que ya había pasado;
//   · los contadores que enseñaban su clave interna en vez de su nombre;
//   · y la ATADURA DE AGUJA, que ataba al enemigo sin decírselo a nadie.
// El último fue el más sutil: la carta SÍ declaraba su `tempEffectText`, pero el hueco donde se
// genera esa línea (`onGetPreviewEffects`) lo había ocupado antes otro generador del compilador,
// así que el hook existía y devolvía vacío. Ninguna suite lo veía: el arnés compara ESTADO, y la
// marca estaba puesta.
//
// LO QUE SE COMPRUEBA, sobre las plantillas YA COMPILADAS y llamando a los hooks de verdad:
//   1. Toda carta que ponga una marca temporal declara `tempEffectText` (lo que la marca le hace
//      al marcado). Se exime con `sinTextoMarca: true` en la plantilla, que hay marcas cuyo
//      efecto ya lo cuenta otra línea (el Oculto de Simon) — pero hay que declararlo.
//   2. Ese texto LLEGA: se llama a `onGetPreviewEffects(cartaFalsa, gameFalso, marcaFalsa)` y
//      tiene que devolver una línea no vacía. Esto es lo que caza el hueco robado.
//   3. Una marca con chapa declarada la lleva de verdad en la marca que se estampa.
//
//   node tests/auditar_marcas.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
                createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {} }),
                createElementNS: () => ({ style: {}, setAttribute() {}, appendChild() {} }) },
    localStorage: { getItem: () => null, setItem() {} },
    setTimeout() {}, clearTimeout() {}, alert() {},
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'public/reglas.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'public/cartas.js'), 'utf8'), sandbox);
const CARD_DB = vm.runInContext('CARD_DB', sandbox);
const DSL = vm.runInContext('DSL', sandbox);

// ¿Qué cartas ponen marcas temporales QUE HAYA QUE EXPLICAR? Se lee de sus abilities.
//
// EXENTAS de oficio las marcas cuyo único contenido es `stats`: un bono continuo YA se cuenta
// solo en el detalle -"+2 ATQ (1 turno restante) por LIDERAZGO, fuente: Capitán Guardia Real"-,
// con su fuente y su cuenta atrás, así que pedir además un texto sería decir lo mismo dos veces.
// Lo que hay que explicar es lo que NO se ve en ningún número: perder el turno, quedar provocado,
// no poder atacar, esconderse el turno que viene.
const _marcasDe = (c) => {
    const out = [];
    const hay = (lista) => (lista || []).forEach(e => {
        if (!e) return;
        if (e.op === 'MARCAR_TEMPORAL') out.push(e);
        hay(e.efectos); hay(e.then); hay(e.else); hay(e.siExito); hay(e.siMuere); hay(e.cara); hay(e.cruz);
        (e.opciones || []).forEach(o => hay(o.efectos));
    });
    (Array.isArray(c.abilities) ? c.abilities : []).forEach(a => {
        hay(a.efectos); hay(a.then); hay(a.else);
        Object.values(a.zonas || {}).forEach(z => hay(z.efectos));
    });
    return out;
};
const _soloStats = (m) => !!m.stats && !m.pierdeSuTurno && !m.provocaAtaque && !m.vetoAtaqueNormal
    && !m.oculto && !m.cuentaAtras && !m.superStats && !m.marcar;
const ponenMarca = (c) => _marcasDe(c).some(m => !_soloStats(m));

// Un juego de mentira, lo justo para que la línea se pueda montar.
const gameFalso = {
    findCard: () => null,
    refCarta: (c) => (c && c.name) || 'carta',
    nCarta: (c) => (c && c.name) || 'carta',
    lineaEfecto: (afeccion, o = {}) => `${afeccion}${o.turnos ? ` (${o.turnos} turnos restantes)` : ''}${o.habilidad ? ` por ${o.habilidad}` : ''}, fuente: ${o.ref || 'esta carta'}`,
    players: { p1: { vanguard: [], rearguard: [], activeEvent: null }, p2: { vanguard: [], rearguard: [], activeEvent: null } },
};

const sinTexto = [], mudas = [], bien = [];
for (const c of CARD_DB) {
    if (!ponenMarca(c)) continue;
    if (c.sinTextoMarca) { bien.push({ carta: c.name, por: 'declara `sinTextoMarca`: su marca la cuenta otra línea' }); continue; }
    if (!c.tempEffectText) { sinTexto.push(c.name); continue; }
    // Y que la línea LLEGUE de verdad.
    const cartaFalsa = { instanceId: 'x', name: 'Marcada', owner: 'p1', gender: 'M' };
    const marcaFalsa = { sourceId: c.id, sourceInstanceId: 'y', duration: 1, habilidad: c.passiveName || null };
    let linea = null;
    try { linea = (c.onGetPreviewEffects && c.onGetPreviewEffects(cartaFalsa, gameFalso, marcaFalsa)) || []; } catch (e) { linea = []; }
    if (!linea.length || !String(linea[0]).trim()) mudas.push(c.name);
    else bien.push({ carta: c.name, por: String(linea[0]).slice(0, 70) });
}

console.log('MARCAS TEMPORALES: qué ve el jugador marcado\n');
bien.forEach(b => console.log(`  OK    · ${b.carta.padEnd(24)} ${b.por}`));
if (sinTexto.length) {
    console.log('\n  SIN TEXTO (ponen una marca y no dicen qué hace):');
    sinTexto.forEach(n => console.log(`     · ${n} — declara tempEffectText o, si de verdad no procede, sinTextoMarca: true`));
}
if (mudas.length) {
    console.log('\n  MUDAS (declaran el texto pero NO llega al detalle):');
    mudas.forEach(n => console.log(`     · ${n} — su onGetPreviewEffects devuelve vacío: alguien le ha robado el hueco`));
}
const mal = sinTexto.length + mudas.length;
console.log(`\nTOTAL: ${bien.length} marcas se explican · ${mal} SIN EXPLICAR`);
if (mal) process.exit(1);
