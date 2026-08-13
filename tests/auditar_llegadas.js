// tests/auditar_llegadas.js — toda carta que llega a una MANO, y si cumple las dos reglas.
//
// Nace de un fallo repetido (Toto, 13-ago-2026): cada animación que llevaba una carta a la mano
// tenía su propia copia del viaje, y cada copia se saltaba una regla distinta. La retribución no
// volteaba NUNCA -ni siquiera para su dueño, que sí la ve- y `animateStackToHand` enseñaba la
// cara A TODO EL MUNDO, viera o no esa mano. Se arreglaban de una en una según Toto las iba
// encontrando en el navegador, que es exactamente lo que esta auditoría existe para evitar.
//
// LAS DOS REGLAS (§14.quater de la rúbrica):
//   1. ATERRIZA — la carta entra en la mano a MITAD del vuelo, así que el clon va a su hueco
//      REAL y las que ya estaban se apartan deslizándose. Nunca "aparece" al final de la cadena.
//   2. VOLTEA SEGÚN QUIÉN MIRA — sale de dorso y se gira a la cara solo si la mano de destino es
//      visible para ese cliente (la tuya siempre; la del rival solo con SEGUIMIENTO).
//
// Hoy hay DOS caminos legítimos, y los dos las cumplen por construcción:
//   · `volarALaMano`  — el helper único de index.html (retribución, animateStackToHand).
//   · el `aMano` del op BUSCAR en cartas.js — pasa por la presentación, con zonaSel y
//     `ocultarAlLlegar`.
// Cualquier `hand.push` fuera de esos dos sale aquí para mirarlo.
//
//   node tests/auditar_llegadas.js            # resumen
//   node tests/auditar_llegadas.js --detalle  # con el contexto de cada sitio
//
// Informativo: NO devuelve código de error. Hay llegadas que legítimamente no animan (el reparto
// inicial, un robo normal, un descarte forzado del rival), y distinguirlas pide criterio humano.
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const detalle = process.argv.includes('--detalle');

// Marcas de que ese `hand.push` va por un camino que cumple las reglas.
const BUENAS = [/volarALaMano/, /animateStackToHand/, /animateRetributionToHand/,
                /animarPresentacionCarta/, /animateSpinToHand/, /_volverAMano/, /_deslizarFila/,
                // El `colocar` de una presentación: la marca que lo identifica es `zonaSel` /
                // `ocultarAlLlegar`, porque la llamada a animarPresentacionCarta queda lejos.
                /ocultarAlLlegar/, /zonaSel:/];

// Sitios que NO deben animar, con su porqué. Se listan aparte para que la lista de "sin revisar"
// mengüe de verdad en vez de quedarse con ruido permanente.
const EXENTAS = [
    { re: /drawMulliganHandsLocal|runInitialSetup|doLocalSetup|doOnlineSetup/, motivo: 'reparto inicial: anima por su cuenta (animarRobo)' },
    { re: /async drawCard/, motivo: 'robo normal: anima por su cuenta (animarRobo)' },
    { re: /importGameState|exportGameState|loadBoardScenario/, motivo: 'reconstrucción de estado, no es una llegada' },
    { re: /applyForcedHands|debugAddCard|debugTakeRetribution/, motivo: 'utilidad de debug: monta la mano, no la anima' },
    { re: /mulliganResolve|elegirMulligan|rehacerMano/, motivo: 'mulligan: la mano se rehace entera' },
    { re: /doFastSetup|inicioRapido/, motivo: 'inicio rápido: reparte la mano de golpe, sin animar' },
];

// Sitios que ya cumplen pero cuya marca queda fuera de la ventana (el respaldo que corre solo si
// la animación NO llegó a colocar la carta: el `if (!_yaColocada)` de `aMano` y el `_aLaMano()`
// de la retribución). Se declaran para que no ensucien la lista de pendientes.
const RESPALDOS = [/_yaColocada/, /_yaEnMano/];

const hallazgos = [];
for (const rel of ['public/cartas.js', 'public/index.html']) {
    const lineas = fs.readFileSync(path.join(RAIZ, rel), 'utf8').split('\n');
    // A qué carta / función pertenece una línea.
    const dueno = (i) => {
        for (let j = i; j >= 0; j--) {
            const m = lineas[j].match(/^\s*(?:id:\s*\d+,\s*)?name:\s*"([^"]+)"/)
                   || lineas[j].match(/^\s*(?:async\s+)?(?:function\s+)?([A-Za-z_][\w]*)\s*\([^)]*\)\s*\{\s*$/);
            // `if (…) {` y compañía también encajan en el patrón de función: se descartan, o el
            // dueño que sale es siempre "if" y la lista no dice nada.
            if (m && !['if', 'for', 'while', 'switch', 'catch', 'else'].includes(m[1])) return m[1];
        }
        return '(?)';
    };
    lineas.forEach((l, i) => {
        if (!/\.hand\.push\(/.test(l) || /^\s*\/\//.test(l)) return;
        const ventana = lineas.slice(Math.max(0, i - 14), i + 4).join('\n');
        const ancho = lineas.slice(Math.max(0, i - 60), i + 4).join('\n');
        const exenta = EXENTAS.find(e => e.re.test(ancho));
        const buena = BUENAS.some(re => re.test(ventana)) || RESPALDOS.some(re => re.test(ventana));
        hallazgos.push({
            fichero: rel.split('/').pop(), linea: i + 1, dueno: dueno(i),
            estado: exenta ? 'exenta' : buena ? 'ok' : 'revisar',
            motivo: exenta ? exenta.motivo : null,
            contexto: l.trim(),
        });
    });
}

const pinta = (titulo, lista, extra) => {
    console.log(`## ${titulo} (${lista.length})`);
    if (extra) console.log('   ' + extra);
    lista.forEach(h => console.log(`   · ${h.fichero}:${h.linea}  ${h.dueno}${h.motivo ? '  — ' + h.motivo : ''}`
        + (detalle ? '\n       ' + h.contexto : '')));
    console.log();
};

console.log('AUDITORÍA DE LLEGADAS A LA MANO\n');
pinta('Cumplen las dos reglas', hallazgos.filter(h => h.estado === 'ok'),
    'aterrizan deslizando y voltean según quién mire.');
pinta('Exentas', hallazgos.filter(h => h.estado === 'exenta'),
    'no son "una carta que llega": reparto, robo o reconstrucción de estado.');
pinta('POR REVISAR', hallazgos.filter(h => h.estado === 'revisar'),
    'meten una carta en la mano sin pasar por ningún camino conocido. Mirar una a una.');

const n = (e) => hallazgos.filter(h => h.estado === e).length;
console.log(`TOTAL: ${hallazgos.length} llegadas · ${n('ok')} correctas · ${n('exenta')} exentas · ${n('revisar')} por revisar`);
