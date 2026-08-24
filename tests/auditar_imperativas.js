// tests/auditar_imperativas.js — las cartas que siguen en código a mano, y qué normas se saltan.
//
// Nace de un encargo de Toto (7-ago-2026): "tenemos que mirar TODAS las cartas imperativas
// aunque sean irreducibles, para adaptarlas a los modales, vocabulario y formas de actuar
// actuales y sin bugs mecánicos ni visuales". Lo destapó Necronomicón, que llevaba desde
// siempre eligiendo el pagador con una lista de botones de texto, buscando en los descartes con
// el modal genérico y -lo grave- CORROMPIENDO el estado al cancelar (`splice(-1,1)` sobre un
// resultado que creía carta suelta y era un array: resucitaba la última carta del descarte,
// saltándose los filtros).
//
// Este fichero NO arregla nada: enumera. La idea es que "revisar las imperativas" deje de ser
// una promesa y sea una lista que mengua, y que ninguna carta nueva se cuele en ella sin verse.
//
//   node tests/auditar_imperativas.js           # resumen por norma
//   node tests/auditar_imperativas.js --detalle # con el número de línea de cada infracción
//
// Informativo: NO devuelve código de error (aún hay deuda conocida y no puede tumbar la batería).

'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(RAIZ, 'public/cartas.js'), 'utf8');
const LINEAS = SRC.split('\n');
const detalle = process.argv.includes('--detalle');

// El intérprete DSL vive en el mismo fichero y usa estas mismas llamadas de forma legítima
// (es quien las centraliza). Todo lo que esté a partir de aquí NO es una carta.
const INICIO_DSL = LINEAS.findIndex(l => /^const DSL = \{|^\s*const DSL = \{/.test(l));
const finCartas = INICIO_DSL === -1 ? LINEAS.length : INICIO_DSL;

// A qué carta pertenece una línea: la última cabecera `name: "..."` por encima de ella.
function cartaDe(idx) {
    for (let i = idx; i >= 0; i--) {
        const m = LINEAS[i].match(/^\s*(?:id:\s*\d+,\s*)?name:\s*"([^"]+)"/);
        if (m) return m[1];
    }
    return '(?)';
}

// Dos usos del modal genérico que SÍ son correctos, y por qué. Se acotan lo justo para que no
// tapen infracciones de verdad (Toto, 7-ago-2026):
//
//  · SOLO LECTURA (`exactCount` 0): el modal no elige nada, enseña. Erasmo destapa LA CARTA
//    SUPERIOR del mazo rival; abrir ahí el visor de pila enseñaría el mazo ENTERO del rival,
//    que es justo lo contrario de lo que hace la carta.
//
// La excepción de "pool mixto campo + mano" (que tenía Meca EBA) YA NO EXISTE: desde que hay
// picker de mano, mezclar zonas en un mismo selector no es una limitación técnica sino un fallo
// -se pregunta por zona y cada una usa su picker-. Se retiró a propósito para que una carta
// futura que las mezcle vuelva a saltar aquí en vez de colarse por una excepción heredada.
const esSoloLectura = (linea) => /,\s*0\s*,\s*true\s*[,)]/.test(linea);

const NORMAS = [
    { id: 'PILA-CON-MODAL-GENERICO',
      // Solo cuenta si el pool que se le pasa sale de una PILA (deck/discard). Con la mano es legítimo.
      re: /openVisualSearchModal\s*\(/,
      filtro: (linea, idx) => {
          const ventana = LINEAS.slice(Math.max(0, idx - 14), idx + 2).join('\n');
          // OJO: aquí NO vale la exención de "solo lectura" (Toto, 23-ago-2026). Mirar una pila
          // es mirar una pila, se coja carta o no: el visor sabe enseñarla con lo que no toca
          // ver de dorso (`soloVisibles`) y con quién mira distinto de su dueño (`mirador`).
          // Por esa exención se coló durante meses el "MIRAR MAZO RIVAL" de Erasmo.
          return /\.(deck|discard)\b/.test(ventana);
      },
      msg: 'busca en mazo/descartes con el modal genérico; debe usar el visor de pila' },
    { id: 'CAMPO-CON-MODAL-GENERICO',
      re: /openVisualSearchModal\s*\(/,
      filtro: (linea, idx) => {
          const ventana = LINEAS.slice(Math.max(0, idx - 14), idx + 2).join('\n');
          if (esSoloLectura(linea)) return false;
          return /\.(vanguard|rearguard)\b/.test(ventana) && !/\.(deck|discard)\b/.test(ventana);
      },
      msg: 'elige una carta YA EN EL CAMPO con modal; debe ser reborde verde en el tablero' },
    { id: 'CAMPO-CON-LISTA-DE-BOTONES',
      re: /openChoiceModal\s*\(/,
      filtro: (linea, idx) => {
          const ventana = LINEAS.slice(Math.max(0, idx - 18), idx + 12).join('\n');
          // Una lista de botones construida MAPEANDO cartas del campo es un selector disfrazado;
          // un sí/no o un menú de modos es legítimo.
          return /\.(vanguard|rearguard)[^\n]*\.map\s*\(|validPayers|validAllies|validTributes/.test(ventana);
      },
      msg: 'elige una carta del campo con lista de botones; debe ser reborde verde en el tablero' },
];

const hallazgos = [];
for (let i = 0; i < finCartas; i++) {
    const l = LINEAS[i];
    if (/^\s*\/\//.test(l)) continue;              // comentarios no cuentan
    for (const n of NORMAS) {
        if (!n.re.test(l)) continue;
        if (n.filtro && !n.filtro(l, i)) continue;
        hallazgos.push({ norma: n.id, msg: n.msg, carta: cartaDe(i), linea: i + 1 });
    }
}

// Censo de cartas que siguen SIN declarar `abilities` pero tienen comportamiento propio.
const HOOKS = /^\s*(onPlay|onUpdatePassive|onExecuteAbility|canPlayCard|onBeforePlayAsync|onAfterPlayAsync|onDeath|onAllyDeath|onExpire|onEndTurn|onStartTurn|getCustomActions|onExecuteAyuda|onBeforeTakeDamage|onAfterAttack|onAfterDefend|onBeforeDefend|canAttackNormally|onInterceptAttack)\s*:\s*(async\s+)?function/;
const porCarta = new Map();
for (let i = 0; i < finCartas; i++) {
    if (!HOOKS.test(LINEAS[i])) continue;
    const c = cartaDe(i);
    porCarta.set(c, (porCarta.get(c) || 0) + 1);
}

const porNorma = {};
for (const h of hallazgos) (porNorma[h.norma] = porNorma[h.norma] || []).push(h);

console.log('AUDITORÍA DE CARTAS IMPERATIVAS\n');
for (const n of NORMAS) {
    const list = porNorma[n.id] || [];
    console.log(`## ${n.id} (${list.length})`);
    if (!list.length) { console.log('   — ninguna, norma cumplida\n'); continue; }
    console.log(`   ${n.msg}`);
    const cartas = [...new Set(list.map(h => h.carta))];
    for (const c of cartas) {
        const suyas = list.filter(h => h.carta === c);
        console.log(`   · ${c}${detalle ? '  (líneas ' + suyas.map(h => h.linea).join(', ') + ')' : ''}`);
    }
    console.log();
}

const total = [...porCarta.entries()].sort((a, b) => b[1] - a[1]);
console.log(`## Cartas con hooks escritos a mano (${total.length})`);
console.log('   El recuento de hooks NO mide complejidad (el compilador DSL cuelga los suyos);');
console.log('   esta lista es solo el censo de lo que queda por revisar.');
console.log('   ' + total.map(([c, n]) => `${c} (${n})`).join(' · '));
console.log(`\nTOTAL de infracciones de norma: ${hallazgos.length} en ${new Set(hallazgos.map(h => h.carta)).size} cartas`);
