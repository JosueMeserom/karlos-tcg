// tests/auditar_efectos_mudos.js — declaraciones que el motor se traga en silencio.
//
// EL FALLO QUE LA TRAJO (31-ago-2026): tres cartas piden "+1 de VIDA" dentro de una
// PASIVA_CONTINUA y no pasa nada, porque `DSL._applyPassive` solo sabe aplicar ATQ y DEF. No hay
// error, no hay aviso: la mitad del texto de la carta simplemente no ocurre. Fanático lleva así
// desde que se escribió.
//
// El DSL valida la FORMA de una declaración (que el op exista, que no falten campos), pero no
// que el motor sepa hacerle caso EN ESE SITIO: el mismo `MODIFICAR_STAT` vale dentro de una
// Activa y es mudo dentro de una Pasiva. Esta auditoría cubre ese hueco.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    document: { getElementById: () => ({ style: {}, classList: { add() {}, remove() {} } }),
        createElement: () => ({ style: {}, classList: { add() {} }, appendChild() {} }),
        querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem() {} },
    setTimeout() {}, clearTimeout() {}, alert() {},
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'public/reglas.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'public/cartas.js'), 'utf8'), sandbox);
const CARTAS = vm.runInContext('CARD_DB', sandbox).filter(Boolean);

// Lo que DSL._applyPassive sabe aplicar dentro de una PASIVA_CONTINUA. Si esto crece, se quita
// de aquí (y de PENDIENTES lo que deje de estar roto).
const STATS_EN_PASIVA = ['atk', 'def'];

// Deuda conocida, con su motivo. Que esté declarada NO es que esté bien: es que se ha mirado y
// arreglarla es una decisión de diseño, no un arreglo mecánico. Una PASIVA_CONTINUA se recalcula
// entera en cada pasada, y la VIDA no se puede recalcular así porque lleva el daño acumulado
// dentro: habría que definirla como "sube el techo mientras se cumpla y lo baja cuando deje de
// cumplirse", que es otra cosa y toca el texto de las tres cartas.
const PENDIENTES = {
    'Fanático':  "+1 de VIDA por cada 'Monstruo' aliado: sin implementar, pendiente de decidir qué significa un bono continuo de VIDA",
    'Gladiador': '+1 de VIDA mientras la unión dure: mismo caso',
    'Grimm':     'los 2 de VIDA que debería perder para siempre si la ofrenda no llega a 4: mismo caso, y este va a su favor',
};

const problemas = [];
const vistos = new Set();

function recorrer(efectos, carta, trigger) {
    for (const e of (efectos || [])) {
        if (!e || typeof e !== 'object') continue;
        if (e.op === 'MODIFICAR_STAT' && e.stat && !STATS_EN_PASIVA.includes(e.stat)) {
            vistos.add(carta.name);
            if (!PENDIENTES[carta.name]) {
                problemas.push(['MUDO', `${carta.name}: declara "${e.stat}" en una ${trigger} y DSL._applyPassive solo aplica ${STATS_EN_PASIVA.join(' y ')}. No hace nada.`]);
            }
        }
        for (const k of ['then', 'else', 'efectos']) if (Array.isArray(e[k])) recorrer(e[k], carta, trigger);
    }
}

for (const c of CARTAS) {
    for (const ab of (c.abilities || [])) {
        if (ab.trigger !== 'PASIVA_CONTINUA') continue;
        // Una PASIVA_CONTINUA cuelga sus efectos de `efectos` o, si es condicional, directamente
        // de `then`/`else` en la propia habilidad (Fanático, Karlos, Kyle...).
        for (const k of ['efectos', 'then', 'else']) if (Array.isArray(ab[k])) recorrer(ab[k], c, ab.trigger);
    }
}

// Una deuda declarada que ya no existe también es un problema: significa que se arregló y nadie
// borró la línea, y a la siguiente ya nadie se fía de la lista.
for (const [nombre, motivo] of Object.entries(PENDIENTES)) {
    if (!vistos.has(nombre)) problemas.push(['SOBRA-PENDIENTE',
        `"${nombre}" ya no declara ningún efecto mudo: quita su línea de PENDIENTES (${motivo})`]);
}

console.log(`AUDITORÍA DE EFECTOS MUDOS: ${CARTAS.length} cartas`);
if (!problemas.length) {
    console.log('Ninguna carta declara un efecto que el motor se trague en silencio.');
    if (Object.keys(PENDIENTES).length) {
        console.log(`\nDeuda declarada (${Object.keys(PENDIENTES).length}), pendiente de decisión de diseño:`);
        for (const [n, m] of Object.entries(PENDIENTES)) console.log(`   · ${n}: ${m}`);
    }
} else {
    for (const [c, d] of problemas) console.log(`   [${c}] ${d}`);
    console.log(`\n${problemas.length} problema(s).`);
    process.exit(1);
}
