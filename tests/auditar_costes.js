// tests/auditar_costes.js — Habilidades que COBRAN ANTES de que el jugador elija.
//
// LA NORMA (Toto, 7-ago-2026, y repetida a gritos el 20-ago-2026): el Furor y el anuncio de una
// Activa no se aplican hasta que algo deja de poder deshacerse. Mientras el jugador sigue
// eligiendo objetivos no ha cambiado nada en el tablero, así que debe poder cancelar y que NO
// ocurra absolutamente nada: ni Furor gastado, ni carta agotada, ni anuncio al rival.
//
// El motor ya lo hace solo. El compilador de ACTIVA (cartas.js) lo DEDUCE:
//
//     const _hayVentanaCancelable = !!_p0 && (_p0.op === 'ELEGIR' || _p0.op === 'BUSCAR')
//                                        && _p0.cancelable !== false;
//     const _diferir = activa.costeDiferido !== undefined ? !!activa.costeDiferido : _hayVentanaCancelable;
//
// O sea que una carta solo puede incumplir la norma de DOS formas, y las dos son explícitas:
//   · poniendo `cancelable: false` en esa primera elección, que apaga la deducción;
//   · poniendo `costeDiferido: false` a mano, que es el override directo.
//
// Y ahí está la trampa que motivó esta auditoría: `cancelable: false` NO parece un interruptor
// del cobro. Parece que habla de la elección. Se copia de una carta hermana sin pensar -es lo que
// pasó con Erazor Djinn, copiada de Raiju- y la Activa se pone a cobrar por adelantado sin que
// nada lo avise. Ninguna suite lo veía: el escenario del harness elige siempre, nunca cancela, y
// al final del camino el Furor acaba igual de gastado.
//
//   node tests/auditar_costes.js            # resumen
//   node tests/auditar_costes.js --detalle  # con el primer efecto de cada una
//
// DEVUELVE ERROR si aparece una carta que cobra por adelantado y no está declarada abajo con su
// motivo. Cobrar antes de tiempo no es una decisión de diseño que se tome sin querer.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const detalle = process.argv.includes('--detalle');

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

// La deducción se lee del FUENTE, no se copia aquí: si alguien cambia la heurística del
// compilador y no toca esto, la auditoría estaría midiendo una regla que ya no existe.
const SRC = fs.readFileSync(path.join(RAIZ, 'public/cartas.js'), 'utf8');
if (!/_hayVentanaCancelable\s*=\s*!!_p0 && \(_p0\.op === 'ELEGIR' \|\| _p0\.op === 'BUSCAR'\)\s*&& _p0\.cancelable !== false/.test(SRC)) {
    console.log('LA HEURÍSTICA DEL COMPILADOR HA CAMBIADO: revisar esta auditoría antes de fiarse.');
    process.exit(1);
}

// DECLARADAS: cartas que cobran por adelantado A SABIENDAS, con su motivo. Las cuatro que hay son
// anteriores a la norma y vienen de la base congelada, donde la Activa no se podía cancelar una
// vez confirmada; quitarles el flag les CAMBIA el comportamiento y hace divergir su suite
// viejo-vs-nuevo, así que es decisión de Toto y no un arreglo que se cuele en una tanda.
const DECLARADAS = {
    'Garret|ANDANADA METEÓRICA': 'heredado de la base congelada: la vieja no dejaba cancelar tras confirmar. Pendiente de decisión de Toto (20-ago-2026).',
    'Gólem de tierra|SEÍSMO': 'heredado de la base congelada: ídem. Pendiente de decisión de Toto (20-ago-2026).',
    'Frikazo|FIJACIÓN': 'heredado de la base congelada: ídem. Pendiente de decisión de Toto (20-ago-2026).',
    'Raiju|FOSFORESCENCIA': 'heredado de la base congelada: ídem. Es la carta de la que se copió Erazor Djinn y así se propagó el fallo. Pendiente de decisión de Toto (20-ago-2026).',
};

const malas = [], declaradas = [], bien = [];

for (const c of CARD_DB) {
    for (const a of (Array.isArray(c.abilities) ? c.abilities : [])) {
        if (a.trigger !== 'ACTIVA') continue;
        const coste = (a.coste && typeof a.coste.furor === 'number') ? a.coste.furor
                    : (typeof c.activeCost === 'number' ? c.activeCost : 0);
        if (!coste) continue;                       // sin coste no hay nada que cobrar antes
        const p0 = (a.efectos || [])[0];
        if (!p0) continue;
        const esEleccion = p0.op === 'ELEGIR' || p0.op === 'BUSCAR';
        if (!esEleccion) { bien.push({ carta: c.name, hab: a.nombre, por: `su primer efecto (${p0.op}) ya es irreversible: se cobra al instante, como debe` }); continue; }

        const clave = `${c.name}|${a.nombre}`;
        const porFlag = p0.cancelable === false;
        const porOverride = a.costeDiferido === false;
        if (!porFlag && !porOverride) { bien.push({ carta: c.name, hab: a.nombre, por: 'abre una elección cancelable: el cobro espera' }); continue; }

        const fila = { carta: c.name, hab: a.nombre, coste, p0: p0.op,
                       causa: porFlag ? '`cancelable: false` en su primera elección' : '`costeDiferido: false`',
                       motivo: DECLARADAS[clave] || null };
        (fila.motivo ? declaradas : malas).push(fila);
    }
}

console.log('AUDITORÍA DE COSTES COBRADOS ANTES DE TIEMPO\n');
console.log(`Revisadas ${CARD_DB.length} cartas. Solo entran las Activas CON coste en Furor.\n`);

console.log(`## Cumplen la norma (${bien.length})`);
console.log('   O esperan a la primera elección, o no tienen ventana que esperar.');
if (detalle) bien.forEach(f => console.log(`   · ${f.carta} [${f.hab}] — ${f.por}`));
else console.log('   (--detalle para verlas una a una)');

console.log(`\n## Cobran por adelantado A SABIENDAS (${declaradas.length})`);
console.log('   Declaradas aquí arriba con su motivo. No son un despiste, son una deuda conocida.');
declaradas.forEach(f => console.log(`   · ${f.carta} [${f.hab}], ${f.coste} de Furor — ${f.causa}`
    + (detalle ? `\n       ${f.motivo}` : '')));

if (!malas.length) {
    console.log('\n## SIN DECLARAR (0)');
    console.log('   Ninguna Habilidad cobra el Furor antes de que el jugador pueda arrepentirse.\n');
    console.log('TOTAL: 0 cartas cobran por adelantado sin declararlo');
} else {
    console.log(`\n## SIN DECLARAR (${malas.length}) — INCUMPLEN LA NORMA DEL COSTE`);
    console.log('   Cobran el Furor al confirmar la Habilidad, antes de elegir objetivo, y el');
    console.log('   jugador ya no puede arrepentirse gratis. Casi siempre es un `cancelable:');
    console.log('   false` copiado de otra carta sin querer: quitarlo suele ser todo el arreglo.');
    malas.forEach(f => console.log(`   · ${f.carta} [${f.hab}], ${f.coste} de Furor — ${f.causa}`));
    console.log(`\nTOTAL: ${malas.length} cartas cobran antes de tiempo`);
    process.exit(1);
}
