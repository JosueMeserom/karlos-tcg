// tests/auditar_flechas.js — qué cartas enseñan su coste al presentarse y cuáles no.
//
// Una carta se presenta CON lo que ha costado (§14.bis de la rúbrica): de cada carta que paga o
// que cumple el requisito sale una flecha hacia el escaparate. Hay tres:
//
//   · coste     (ámbar) - pierdes LA CARTA (se descarta para pagar).
//   · tributo   (rojo)  - pierdes FUROR; la carta se queda donde está.
//   · requisito (lima)  - no pierdes nada, solo se comprueba.
//
// Pero eso NO es automático: hay que marcarlo (`esCoste` / `esRequisito` en el DSL, o
// `DSL._marcarCoste` en una carta imperativa). Este fichero enumera quién lo tiene y quién no,
// para que "faltan cartas por marcar" deje de ser una intuición y sea una lista que mengua.
//
// Cómo detecta a un candidato, y por qué así:
//   · Un MODIFICAR_STAT de `furor` con delta NEGATIVO dentro de un JUGAR/AL_CONSUMIR/ANTES_DE_
//     JUGAR es un tributo. Da igual que el pagador salga de un ELEGIR o de un pool automático.
//     PERO solo si se lo cobra a un ALIADO: quitarle Furor a un enemigo es lo que la carta HACE,
//     no lo que cuesta (Quema de maná; se coló en la primera pasada, 13-ago-2026).
//   · El `text` de la carta empieza por "Coste:" o "Requisito:" (gramática fijada en la rúbrica),
//     que es la declaración de intenciones de la propia carta.
// Lo segundo es lo que hace la auditoría útil de verdad: pilla cartas cuyo coste se cobra con
// código a mano y que por tanto NUNCA saldrían buscando ops del DSL.
//
//   node tests/auditar_flechas.js            # resumen
//   node tests/auditar_flechas.js --detalle  # con el motivo carta por carta
//
// Informativo: NO devuelve código de error (marcar una carta es una decisión de diseño de Toto,
// no una regresión). Lo que sí falla es una carta MARCADA de forma incoherente.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const detalle = process.argv.includes('--detalle');

// --- CARD_DB real, en un sandbox mínimo (mismo truco que el resto de auditorías) ---
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

// Cartas imperativas que marcan a mano: se leen del fuente, no de la estructura.
const SRC = fs.readFileSync(path.join(RAIZ, 'public/cartas.js'), 'utf8');
const LINEAS = SRC.split('\n');
const marcaAMano = new Set();
LINEAS.forEach((l, i) => {
    // `DSL.tributoFuror` marca por dentro: las nueve cartas que lo usan tienen su flecha aunque
    // en su propio bloque no aparezca ningún _marcarCoste. Sin esto salían como pendientes -un
    // falso negativo que hacía que la lista de "por decidir" mintiera (Toto, 14-ago-2026).
    if (!/DSL\._marcarCoste\s*\(|DSL\.tributoFuror\s*\(/.test(l) || /^\s*\/\//.test(l)) return;
    for (let j = i; j >= 0; j--) {
        const m = LINEAS[j].match(/^\s*(?:id:\s*\d+,\s*)?name:\s*"([^"]+)"/);
        if (m) { marcaAMano.add(m[1]); return; }
    }
});

// Triggers en los que un coste es "coste de jugar la carta" (los únicos que se presentan).
const TRIGGERS_DE_JUGADA = new Set(['JUGAR', 'AL_CONSUMIR', 'ANTES_DE_JUGAR', 'AL_JUGAR', 'AL_EQUIPAR', 'AL_USAR_AYUDA']);

// Recorre efectos anidados (ELEGIR lleva los suyos dentro).
// `de`/`quien` heredados del ELEGIR que envuelve al efecto: un MODIFICAR_STAT anidado no dice a
// quién apunta, lo dice su ELEGIR.
function* efectosDe(lista, bando) {
    for (const e of (lista || [])) {
        yield Object.assign({ __bando: bando }, e);
        const _b = e.de || (e.target && e.target.quien) || e.quien || bando;
        if (Array.isArray(e.efectos)) yield* efectosDe(e.efectos, _b);
        for (const rama of ['siExito', 'siFallo', 'siMuere']) {
            if (e[rama] && Array.isArray(e[rama].efectos)) yield* efectosDe(e[rama].efectos, _b);
        }
    }
}

const filas = [];
for (const c of CARD_DB) {
    const abilities = Array.isArray(c.abilities) ? c.abilities : [];
    let tributo = null, marcado = false, incoherente = null;

    for (const ab of abilities) {
        if (!TRIGGERS_DE_JUGADA.has(ab.trigger)) continue;
        for (const e of efectosDe(ab.efectos, null)) {
            if (e.esCoste || e.esRequisito || e.esTributo) marcado = true;
            const _contraEnemigo = /ENEMIG/i.test(String(e.__bando || '')) || /ENEMIG/i.test(String((e.target && e.target.quien) || ''));
            const esFurorNegativo = e.op === 'MODIFICAR_STAT' && e.stat === 'furor' && !_contraEnemigo
                && (typeof e.delta === 'number' ? e.delta < 0 : (e.vaciar || e.deltaCondicional));
            if (esFurorNegativo) tributo = tributo || (typeof e.delta === 'number' ? Math.abs(e.delta) : '?');
            // Marcar un requisito sobre algo que se PIERDE, o un coste sobre algo que no cambia,
            // sería mentir en el color. Solo se comprueba lo comprobable en máquina.
            if (e.esRequisito && esFurorNegativo) incoherente = 'marcada como requisito pero gasta Furor (es un tributo)';
        }
    }
    // `requisitoVisible` y `costeVisible` viven en la plantilla, no en un efecto: dicen a qué
    // cartas del campo apuntan la flecha lima (lo que hace legal la jugada) y la ámbar (lo que
    // se pierde al hacerla).
    if (c.requisitoVisible || c.costeVisible || c.requisitoZona) marcado = true;
    // Neo marca su cebo cuando SE REVELA, no al jugarse: su gracia es pillar desprevenido, y
    // señalarlo antes lo delataría. La marca vive en NEO.revelar, no en la plantilla.
    if (c.name === 'Neo') marcado = true;
    if (marcaAMano.has(c.name)) marcado = true;

    const txt = String(c.text || '');
    const diceCoste = /^\s*Coste:/i.test(txt) || /\bCoste:/.test(txt);
    const diceReq = /^\s*Requisito:/i.test(txt) || /\bRequiere\b/.test(txt);
    if (!tributo && !diceCoste && !diceReq) continue;

    filas.push({
        nombre: c.name, marcado, incoherente,
        motivo: [tributo ? `tributa ${tributo} de Furor` : null,
                 diceCoste ? 'su texto declara "Coste:"' : null,
                 diceReq ? 'su texto declara Requisito' : null].filter(Boolean).join(' · '),
    });
}

// NO PROCEDE: cartas cuyo coste o requisito no puede tener flecha, con el porqué. Se apartan de
// "por decidir" para que esa lista sea trabajo REAL y no ruido permanente (Toto, 14-ago-2026).
// Tres motivos, y ninguno es pereza:
//   · La condición gobierna una ACTIVA, no la colocación. Una Activa no se presenta, así que no
//     hay escaparate donde dibujar nada.
//   · (RETIRADO 14-ago-2026) Los requisitos de RECUENTO sí tienen a quién apuntar: las cartas
//     concretas que lo cumplen, y son TODAS. Lo dijo Toto y tenía razón - "vanguardia llena" lo
//     cumplen cuatro cartas, no ninguna. Berry, Cápsula, Esfuerzo dividido y Plan de equipo
//     pasaron a llevar flecha.
//   · Es NEGATIVO ("Karolina no está", "tu rival no tiene Evento"): lo que lo cumple es una
//     ausencia, y a una ausencia no se le puede apuntar.
const NO_PROCEDE = {
    // NO son costes ni requisitos de COLOCACIÓN: son condiciones de una Habilidad, como que
    // BI-CHOQUE de Karlos pida 2 enemigos. Que sus textos usen la palabra "Requiere" no las
    // convierte en lo mismo, y yo las metí aquí por leer el vocabulario en vez de la mecánica
    // (Toto, 14-ago-2026). No es que "no puedan" tener flecha: es que no pintan nada en esta
    // lista. El día que las Activas se presenten, se revisan como lo que son.
    'Kami': 'condición de una HABILIDAD (SACRIFICIO EQUIVALENTE), no un requisito de colocación',
    'Meca EBA': 'condición de una HABILIDAD (EMPLAZAR PILOTO), no un requisito de colocación',
    'Arthas': 'requisito NEGATIVO: lo cumple la AUSENCIA de Karolina, y a una ausencia no se apunta',
    'Chaqueta metálica defensiva de la muerte': 'el aliado que cumple el requisito es el MISMO al que se anexa: la flecha sería redundante con el propio equipo',
    // Zoe SÍ se presenta al evolucionar (§14.quater) — eso se hizo el 13-ago. Lo que no tiene es
    // a QUIÉN apuntar: su requisito es haber completado Entrenamiento arduo, y ese Evento acaba
    // de expirar e irse al descarte, que es justo lo que dispara la evolución. Son dos cosas
    // distintas y las mezclé al justificarlo.
    'Zoe (calcinante)': 'se presenta, pero su requisito es un Evento que YA expiró al dispararla: no queda carta en el campo que señalar',
};

const conFlecha = filas.filter(f => f.marcado);
const noProcede = filas.filter(f => !f.marcado && NO_PROCEDE[f.nombre]);
const sinFlecha = filas.filter(f => !f.marcado && !NO_PROCEDE[f.nombre]);
const malas = filas.filter(f => f.incoherente);

console.log('AUDITORÍA DE FLECHAS DE COSTE / TRIBUTO / REQUISITO\n');
console.log(`## Con flecha (${conFlecha.length})`);
console.log('   Enseñan de dónde sale lo que pagan al presentarse.');
conFlecha.forEach(f => console.log(`   · ${f.nombre}${detalle ? '  — ' + f.motivo : ''}`));

console.log(`\n## No procede (${noProcede.length})`);
console.log('   No pueden tenerla, y por qué. Apartadas para que "por decidir" sea trabajo real.');
noProcede.forEach(f => console.log(`   · ${f.nombre} — ${NO_PROCEDE[f.nombre]}`));

console.log(`\n## SIN flecha (${sinFlecha.length})`);
console.log('   Pagan o exigen algo, pero al presentarse no lo enseñan. No es un bug: marcar una');
console.log('   carta es una decisión de diseño. Esta es la lista de las que quedan por decidir.');
sinFlecha.forEach(f => console.log(`   · ${f.nombre}${detalle ? '  — ' + f.motivo : ''}`));

if (malas.length) {
    console.log(`\n## INCOHERENTES (${malas.length}) — esto sí hay que arreglarlo`);
    malas.forEach(f => console.log(`   · ${f.nombre}: ${f.incoherente}`));
}

console.log(`\nTOTAL: ${filas.length} cartas · ${conFlecha.length} con flecha · ${noProcede.length} no procede · ${sinFlecha.length} POR DECIDIR`);
if (malas.length) { console.log('\nHAY MARCAJES INCOHERENTES.'); process.exit(1); }
// DEJA DE SER INFORMATIVA (Toto, 27-ago-2026): "eso es muy importante que lo haga cada carta con
// Requisito o Coste, a menos que decidamos en algún caso concreto que no". O sea: la flecha es la
// NORMA y la excepción hay que declararla arriba, en NO_PROCEDE, con su motivo. Una carta nueva
// que se olvide de marcar su coste pone la pasada en rojo, que es justo lo que no pasaba antes.
if (sinFlecha.length) {
    console.log('\nHAY COSTES/REQUISITOS SIN FLECHA. Marca la carta (esCoste / esRequisito /');
    console.log('requisitoVisible) o, si de verdad no procede, añádela a NO_PROCEDE con su motivo.');
    process.exit(1);
}
