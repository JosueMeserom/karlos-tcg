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

// ── ETIQUETAS: se nombran diciendo que lo son ────────────────────────────────
// Las comillas simples se usan para DOS cosas -nombres de carta y etiquetas- y hay 52 etiquetas
// distintas, así que 'Mercenario' o 'Estudioso' se leían como si fueran cartas. La gramática es
// "con etiqueta 'X'" (Toto, 13-ago-2026).
//
// La comprobación NO lee la prosa: contrasta cada texto entrecomillado contra la lista REAL de
// etiquetas y la de nombres de carta, sacadas de CARD_DB. Si coincide con una etiqueta y no con
// un nombre, exige "etiqueta" delante. Es la lección de haber buscado "Energía Adán" como nombre
// de carta -no existe- cuando era una etiqueta de Igniz y Yuriy.
const ETIQUETAS = new Set();
CARTAS.forEach(c => (c.tags || []).forEach(g => ETIQUETAS.add(g)));
const NOMBRES = new Set(CARTAS.map(c => c.name));
const _escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const c of CARTAS) {
    const txt = String(c.text || '');
    for (const g of ETIQUETAS) {
        if (NOMBRES.has(g)) continue;   // ambiguo de verdad: es etiqueta Y nombre de carta
        const re = new RegExp("(.{0,14})'" + _escRe(g) + "'", 'g');
        let m;
        while ((m = re.exec(txt))) {
            if (/etiquetas?\s*$/i.test(m[1])) continue;
            // Encadenado: "sin etiqueta 'A' ni 'B'". El nexo basta, pero SOLO si la frase ya
            // dijo "etiqueta" antes; si no, cualquier texto colaría poniéndole un "o" delante.
            // La frase incluye m[1] (Toto, 20-ago-2026). `m.index` es donde empieza el trozo
            // capturado, no la comilla, así que cortando ahí se perdían hasta 14 caracteres — los
            // justos para partir la palabra "etiqueta" por la mitad y no reconocerla. Alabanza
            // ("con la etiqueta 'Dios/a' o 'Genio'") salía marcada estando bien escrita, y solo
            // se vio cuando 'Genio' existió como etiqueta de verdad.
            const frase = (txt.slice(0, m.index) + m[1]).split(/[.;]/).pop();
            if (/\b(ni|o|y)\s*$/i.test(m[1]) && /etiquetas?\b/i.test(frase)) continue;
            add('ETIQUETA-SIN-DECIRLO', c, `'${g}' es una ETIQUETA y se nombra como si fuera una carta: "...${m[1].trim()} '${g}'". Debe decir "con etiqueta '${g}'"`);
        }
    }
}

// GRAMÁTICA DEL REQUISITO SEGÚN EL TIPO (Toto, 21-ago-2026, con captura). Un Evento escribe
// "Requiere X." y una carta normal "Requisito: X." — y no son intercambiables: el detalle solo
// reconoce cada forma en su sitio, así que la equivocada se queda como PROSA SUELTA, sin caja.
// Pasó en Serafín y en Alabanza, las dos escritas del tirón copiando el patrón de un Evento.
// Solo mira el ARRANQUE del texto: un "Requiere" dentro de la descripción de una Activa ("A:
// SACRIFICIO EQUIVALENTE (1F): Requiere otro aliado…") es prosa correcta y no se toca.
for (const c of CARTAS) {
    const txt = String(c.text || '').trim();
    if (c.type === 'Evento') {
        if (/^\s*(?:\d+\s+turnos?\.\s*)?Requisito:/i.test(txt)) {
            add('REQUISITO-MAL-ESCRITO', c, 'es un Evento y usa "Requisito:": su caja solo reconoce "Requiere X."');
        }
    } else if (/^Requiere\b/i.test(txt)) {
        add('REQUISITO-MAL-ESCRITO', c, 'no es un Evento y usa "Requiere": su caja solo reconoce "Requisito: X." (si no, sale como prosa suelta)');
    }
}

const T_COLOCAR = ['AL_JUGAR', 'ANTES_DE_JUGAR', 'AL_ENTRAR', 'onPlay', 'onAfterPlayAsync', 'onBeforePlayAsync'];
// PERIODICO cuenta como continuo: es lo que absorbió a INICIO_TURNO y FIN_TURNO (21-ago-2026),
// que ya estaban aquí. Sin esto, las cartas que se compilan a él perdían su disparador continuo a
// ojos de la auditoría y salían como si su "Mientras…" no lo hiciera nadie.
const T_CONTINUO = ['PASIVA_CONTINUA', 'AURA', 'PREVIEW_GLOBAL', 'GLOBAL_MODIFICAR_FUROR', 'GLOBAL_TRIBUTO', 'PERIODICO',
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
    // "ocupa/ocupar su lugar" es la forma canónica de la familia evolución desde la §9.bis
    // (7-ago-2026): sustituye a las tres redacciones sueltas que había ("sustituye a X", "las
    // bonificaciones se transfieren", "hereda stats"), así que cuenta como mención de la bandera.
    isEvolution: ['evolucion', 'evolución', 'sustituy', 'sustituir', 'requisito', 'ocupa su lugar', 'ocupar su lugar'],
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

// Todos los ops BUSCAR de un árbol de habilidades.
function buscaresDe(nodo, acc = []) {
    if (!nodo || typeof nodo !== 'object') return acc;
    if (Array.isArray(nodo)) { nodo.forEach(n => buscaresDe(n, acc)); return acc; }
    if (nodo.op === 'BUSCAR') acc.push(nodo);
    for (const k of Object.keys(nodo)) if (k !== 'op') buscaresDe(nodo[k], acc);
    return acc;
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

    // Cartas A MEDIAS (Toto, 7-ago-2026): entran al juego porque algo las necesita (p. ej. Yuriy
    // aporta la etiqueta 'Energía Adán' que Meca EBA busca), pero su diseño está incompleto en el
    // Excel. Se listan como INFORMATIVA para que la deuda esté a la vista y no se olvide, no
    // como problema: no están mal escritas, están sin terminar.
    if (c.enConstruccion) { add('EN-CONSTRUCCION', c, 'declarada `enConstruccion`: falta diseño por parte de Toto'); continue; }

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

    // --- §14 GRAMÁTICA DEL EVENTO (Toto, 7-ago-2026) ---
    // Las tres reglas de aquí abajo YA se cumplían en los 30 Eventos antiguos: se rompieron al
    // añadir cartas nuevas copiando el texto del Excel en vez de aplicar la rúbrica. Se
    // comprueban en máquina precisamente por eso — una norma que solo vive en un documento se
    // vuelve a saltar la próxima vez.
    if (c.type === 'Evento') {
        // (a) Un Evento NO anuncia su propia destrucción al expirar: es lo primero que pasa
        //     SIEMPRE, así que decirlo gasta caja y no informa de nada.
        const mAuto = t.match(/Al expirar,[^.]*\b(se destruye|se descarta|destruye esta carta|descarta esta carta)/i);
        if (mAuto) add('EVENTO-AUTODESTRUCCION', c, `"${mAuto[1]}" — al expirar el Evento se va solo; no se escribe`);
        // (b) El requisito de un Evento se escribe "Requiere X.", no "Requisito: X." — la caja
        //     REQUISITO del detalle solo reconoce la primera forma (las Ayudas usan la segunda).
        if (/Requisito:/.test(t)) add('EVENTO-REQUISITO', c, 'usa "Requisito:" (forma de Ayuda); un Evento pide "Requiere X."');
        // (c) Todo lo que un Evento hace va bajo un MARCADOR de sección; sin él el parser lo pinta
        //     como párrafo plano, sin caja ni color.
        const MARCAS = /^(Antes de colocarla, |Al colocarla, |Mientras esté en juego, |Al expirar, )/;
        // Se descuentan las partes que el detalle saca A SU PROPIA CAJA antes de partir por
        // marcadores: el coste de colocación (que va SIEMPRE el primero, como en cualquier otra
        // carta), la duración y el requisito. Lo que quede es el cuerpo, y ESO sí tiene que
        // colgar de un marcador (26-ago-2026: el Mapa de Cornifer estrena Evento CON coste).
        const _cuerpo = t.replace(/^\s*Coste:\s*[^.]+\.\s*/i, '')
                         .replace(/^\s*\d+\s*turnos?\.\s*/, '')
                         .replace(/^Requiere\s+[^.]+\.\s*/, '');
        _cuerpo.split(/(?=Antes de colocarla, |Al colocarla, |Mientras esté en juego, |Al expirar, )/)
            .map(x => x.trim()).filter(Boolean)
            .forEach(seg => { if (!MARCAS.test(seg)) add('EVENTO-SIN-MARCADOR', c, `"${seg.slice(0, 45)}…" no cuelga de ningún marcador (queda como párrafo plano)`); });
    }

    // --- §15 DESCARTAR vs DESTRUIR (Toto, 7-ago-2026) ---
    // "Descartar" es SOLO ir de la MANO a los descartes. Desde cualquier otro sitio (campo,
    // Evento en juego, equipo anexado) la palabra es "destruir", aunque acabe en la misma pila.
    const mDesc = t.match(/\b(se descarta|descarta esta carta)\b/i);
    if (mDesc && c.type !== 'Ayuda') add('DESCARTAR-VS-DESTRUIR', c, `"${mDesc[1]}" — solo se "descarta" lo que está en la MANO; en el campo es "destruir"`);

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
    // EXENTO: un trigger reactivo cuyo único efecto es RETIRAR SU PROPIO AVISO (Mill, que se
    // quita la marca de "voy a camuflarme" al atacar). No añade una regla que el texto tenga que
    // contar -es el reverso de lo que el texto ya dice ("si no ataca")- y lo que el jugador ve es
    // la chapa desapareciendo, que se explica sola. Se acota a eso: solo QUITAR_MARCA, y sobre sí
    // mismo; cualquier otro efecto en un trigger reactivo sigue teniendo que anunciarse.
    const _soloSeDesmarca = (c.abilities || [])
        .filter(a => T_REACTIVO.includes(a.trigger))
        .every(a => (a.efectos || []).length > 0 && (a.efectos || []).every(e =>
            e.op === 'QUITAR_MARCA' && (!e.target || e.target.quien === 'SELF')));
    if (tiene(T_REACTIVO) && !_soloSeDesmarca && !diceReactivo.test(tl)) {
        add('REACTIVO-MUDO', c, `tiene ${triggers.filter(x => T_REACTIVO.includes(x)).join('/') || hooks.join('/')} pero el texto no dice cuándo se dispara`);
    }

    // --- §21: "a N" es N exactos; "a hasta N" se adapta ---
    // La forma de escribirlo ES la regla, así que el texto y la declaración tienen que decir lo
    // mismo. Es un desajuste que nadie ve leyendo -las dos frases suenan bien- y que cambia por
    // completo cuándo se puede usar la Habilidad.
    for (const ab of (c.abilities || [])) {
        const _t = ab.target || {};
        const _elegir = (ab.efectos || []).find(e => e.op === 'ELEGIR') || {};
        const n = _t.cantidad || _elegir.cantidad;
        if (!n || n < 2) continue;
        const flexible = !!(_t.hastaCantidad || _t.permitirParar || _elegir.hastaCantidad || _elegir.permitirParar);
        // "hasta 3" o "hasta tres": las dos valen, que los textos del juego mezclan cifra y
        // palabra según lo que se lea mejor en la caja.
        const diceHasta = /hasta\s+(\d+|dos|tres|cuatro|cinco)\b/i.test(tl);
        const diceMaximo = /(un\s+m[áa]ximo\s+de|o\s+menos)/i.test(tl);
        if (flexible && !diceHasta) {
            add('CUPO-MUDO', c, `elige HASTA ${n} objetivos pero el texto no dice "hasta ${n}" (§21)`);
        }
        if (!flexible && (diceHasta || diceMaximo)) {
            add('CUPO-MUDO', c, `pide ${n} objetivos EXACTOS pero el texto dice "hasta"/"máximo" (§21)`);
        }
    }

    // --- Banderas de plantilla que el texto calla ---
    for (const [bandera, palabras] of Object.entries(BANDERAS)) {
        if (c[bandera] !== true) continue;
        if (!palabras.some(p => tl.includes(p))) add('REGLA-OCULTA', c, `tiene la bandera ${bandera} pero el texto no la menciona`);
    }

    // --- Invariante que sostiene una afirmación de la rúbrica (§7) ---
    // §7 permite omitir "y baraja el mazo" de los textos porque barajar tras buscar en el MAZO
    // pasa SIEMPRE. Pero el motor no lo garantiza: `barajarDespues` es opt-in por carta, así que
    // hoy es cierto por convención (12 de 12) y mañana podría dejar de serlo en silencio -y
    // entonces el texto callaría algo que sí importa-. Se comprueba aquí para que no pase.
    for (const b of buscaresDe(c.abilities)) {
        const zonas = Array.isArray(b.en) ? b.en : [b.en || 'DESCARTES'];
        if (zonas.includes('MAZO') && !b.barajarDespues) {
            add('REGLA-OCULTA', c, 'busca en el MAZO sin declarar `barajarDespues`: o baraja (y se omite del texto, §7) o el texto tiene que avisar de que NO baraja');
        }
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
    // MAYÚSCULAS desde el 23-ago-2026 (Toto): las tres características se escriben como en la
    // CARA DE LA CARTA -VIDA · DEF · ATQ- y como ya las escribe el motor en el detalle y en los
    // flotantes ("+2 ATQ", "VIDA MÁX."). Antes la norma era justo la contraria y el texto de la
    // carta hablaba un idioma distinto del de su propio detalle. `Furor` NO entra: no está en la
    // cara de la carta. Y los LOGS tampoco: ahí son prosa ("cura 2 de Vida a X") y las mayúsculas
    // gritarían a mitad de frase.
    const caps = [[/\bAtq\b/, 'Atq -> ATQ'], [/\bDef\b/, 'Def -> DEF'], [/\bVida\b/, 'Vida -> VIDA'],
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
const INFORMATIVAS = ['LONGITUD', 'EN-CONSTRUCCION'];
// `orden` solo fija la PRELACIÓN de salida, no qué se informa: cualquier categoría que no esté
// aquí se imprime igual, detrás. Antes el bucle iteraba únicamente sobre esta lista, así que una
// regla nueva se recogía en `hallazgos` y NUNCA se imprimía ni contaba — el auditor daba "0
// problemas" con violaciones delante (encontrado el 7-ago-2026 al añadir las reglas de §14/§15,
// probando a reintroducir a propósito los fallos que acababa de corregir). Un verificador que
// puede callarse en silencio es peor que no tenerlo: parece que cubre lo que ya no cubre.
const orden = ['NOMBRE-PASIVA', 'NOMBRE-ACTIVA', 'COSTE-ACTIVA', 'DURACION', 'MOMENTO',
    'EVENTO-AUTODESTRUCCION', 'EVENTO-REQUISITO', 'EVENTO-SIN-MARCADOR', 'DESCARTAR-VS-DESTRUIR',
    'REGLA-OCULTA', 'REACTIVO-MUDO', 'VOCABULARIO', 'TIPOGRAFIA', 'SIN-TEXTO', 'LONGITUD'];
const todo = process.argv.includes('--todo');
const porCat = {};
for (const h of hallazgos) (porCat[h.cat] = porCat[h.cat] || []).push(h);
const categorias = [...orden, ...Object.keys(porCat).filter(c => !orden.includes(c))];

let problemas = 0;
for (const cat of categorias) {
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
