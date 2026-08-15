// tests/auditar_fases.js — qué cartas alteran una FASE y cuáles lo dicen.
//
// El rectángulo de la columna derecha dice, además de la regla base de cada fase, qué efectos
// concretos la alteran ahora mismo. Eso NO se puede deducir del código: cada efecto de fase es un
// hook -una función-, y para saber qué hace habría que ejecutarlo, cosa que tiene efectos. Así
// que cada habilidad declara su propia línea en `resumenFase`, igual que declara su `text`.
//
// Y una declaración a mano es una declaración que se olvida. Esta auditoría enumera toda ability
// cuyo trigger cae en una fase y dice si la ha declarado, para que "falta anotar cartas" sea una
// lista que mengua y no una intuición. Mismo patrón que auditar_flechas / auditar_llegadas.
//
// Los seis triggers de fase, y en cuál caen (el mapa vive en index.html, FASE_DE):
//   · INICIO_TURNO, GLOBAL_INICIO_TURNO  -> EFECTOS INICIALES
//   · GLOBAL_MODIFICAR_FUROR             -> FUROR
//   · AL_CADUCAR                         -> EVENTO (solo el turno en que a ESE Evento se le acaba)
//   · FIN_TURNO                          -> EFECTOS FINALES
//   · PUEDE_ATACAR                       -> PRINCIPAL
// La fase de ROBO no tiene ninguno hoy: nada en el juego altera todavía el robo.
//
// Lo que NO entra, y es la decisión de diseño que hace útil al panel (Toto, 15-ago-2026):
// el panel dice lo que cambia las REGLAS de la fase, no lo que cambia los NÚMEROS de una carta.
// Por eso PASIVA_CONTINUA (16) y AURA (8) se quedan fuera aunque se apliquen cada turno: son
// modificadores de stats y ya tienen su sitio en los badges y en el «Afectado por» de cada carta.
// Repetirlos aquí sería justo la duplicación que este rectángulo existe para evitar.
//
//   node tests/auditar_fases.js            # resumen
//   node tests/auditar_fases.js --detalle  # con la línea declarada de cada una
//
// Informativo: NO devuelve código de error (anotar una carta es una decisión de redacción, no una
// regresión). Lo que sí falla es una declaración incoherente.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const detalle = process.argv.includes('--detalle');

// CARD_DB real, en un sandbox mínimo (mismo truco que el resto de auditorías).
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

const FASE_DE = {
    INICIO_TURNO: 'EFECTOS INICIALES', GLOBAL_INICIO_TURNO: 'EFECTOS INICIALES',
    GLOBAL_MODIFICAR_FUROR: 'FUROR', AL_CADUCAR: 'EVENTO',
    FIN_TURNO: 'EFECTOS FINALES', PUEDE_ATACAR: 'PRINCIPAL',
};

// NO PROCEDE: hooks de fase que de verdad no tienen nada que anunciar, con su porqué. Se apartan
// para que "por anotar" sea trabajo real y no ruido permanente. Dos motivos, y ninguno es pereza:
//   · Es LIMPIEZA: al expirar, el Evento solo deja de aplicar lo que aplicaba. La rúbrica (§11)
//     ya dice que un Evento no anuncia su propia destrucción, así que anunciarla aquí la
//     contradiría. El jugador ve desaparecer el efecto, que es el aviso.
//   · Es CONTABILIDAD interna: pone a cero un contador que el jugador no ve.
const NO_PROCEDE = {
    'De compras|AL_CADUCAR': 'limpieza: al expirar solo deja de revelar cartas, no hace nada nuevo',
    'Giro de guion|AL_CADUCAR': 'limpieza: su efecto ocurre al colocarla, no al expirar',
    'Apagón|AL_CADUCAR': 'limpieza: al expirar los ataques dejan de echar moneda, sin efecto propio',
    'Llamada del deber|AL_CADUCAR': 'limpieza: al expirar solo deja de ofrecer la búsqueda',
    'Publicidad mental|AL_CADUCAR': 'limpieza: al expirar se retira el -2 de Atq, sin efecto propio',
    'Exhibicionismo|AL_CADUCAR': 'limpieza: al expirar se retira el -2 de Def, sin efecto propio',
    'Esfuerzo dividido|AL_CADUCAR': null,   // sí tiene efecto propio: se declara
    'Matón|INICIO_TURNO': 'contabilidad interna: pone a 0 el contador de copias jugadas este turno, que el jugador no ve',
};

const filas = [];
for (const c of CARD_DB) {
    for (const ab of (Array.isArray(c.abilities) ? c.abilities : [])) {
        const fase = FASE_DE[ab.trigger];
        if (!fase) continue;
        const clave = `${c.name}|${ab.trigger}`;
        let incoherente = null;
        // `porHabilidad` es el " por HABILIDAD" de la gramática del detalle, y la rúbrica lo
        // reserva a Pasivas y Activas: en un Evento o una Ayuda se omite.
        if (ab.porHabilidad && c.type === 'Evento') {
            incoherente = 'declara porHabilidad siendo un Evento (la rúbrica lo reserva a Pasivas/Activas)';
        }
        if (ab.porHabilidad && !ab.resumenFase) {
            incoherente = 'declara porHabilidad pero no resumenFase: no se pinta nada';
        }
        filas.push({
            carta: c.name, trigger: ab.trigger, fase, clave,
            declarado: !!ab.resumenFase, resumen: ab.resumenFase || '',
            noProcede: NO_PROCEDE[clave] || null, incoherente,
        });
    }
}

const conResumen = filas.filter(f => f.declarado);
const noProcede = filas.filter(f => !f.declarado && f.noProcede);
const pendientes = filas.filter(f => !f.declarado && !f.noProcede);
const malas = filas.filter(f => f.incoherente);

console.log('AUDITORÍA DE RESÚMENES DE FASE\n');

const porFase = {};
conResumen.forEach(f => (porFase[f.fase] = porFase[f.fase] || []).push(f));
console.log(`## Declaradas (${conResumen.length})`);
console.log('   El rectángulo de la derecha las anuncia al entrar en su fase.');
for (const fase of Object.keys(FASE_DE).map(t => FASE_DE[t]).filter((v, i, a) => a.indexOf(v) === i)) {
    const l = porFase[fase] || [];
    if (!l.length) continue;
    console.log(`   ${fase} (${l.length}):`);
    l.forEach(f => console.log(`      · ${f.carta} [${f.trigger}]` + (detalle ? `\n          "${f.resumen}"` : '')));
}

console.log(`\n## No procede (${noProcede.length})`);
console.log('   Tienen hook de fase pero nada que anunciar, y por qué.');
noProcede.forEach(f => console.log(`   · ${f.carta} [${f.trigger}] — ${f.noProcede}`));

console.log(`\n## POR ANOTAR (${pendientes.length})`);
console.log('   Alteran una fase y no lo dicen: el panel se las calla. Escribirles su resumenFase.');
pendientes.forEach(f => console.log(`   · ${f.carta} [${f.trigger}] → ${f.fase}`));

if (malas.length) {
    console.log(`\n## INCOHERENTES (${malas.length}) — esto sí hay que arreglarlo`);
    malas.forEach(f => console.log(`   · ${f.carta} [${f.trigger}]: ${f.incoherente}`));
}

console.log(`\nTOTAL: ${filas.length} hooks de fase · ${conResumen.length} declarados`
    + ` · ${noProcede.length} no procede · ${pendientes.length} POR ANOTAR`);
if (malas.length) { console.log('\nHAY DECLARACIONES INCOHERENTES.'); process.exit(1); }
