// tests/coleccionables.js — qué cartas puede tener un jugador, y cuáles solo existen para el motor.
//
// LA REGLA (Toto, 31-ago-2026): las cartas "de prueba" y los clones NO existen para el jugador.
// Ni en el catálogo del constructor, ni en los mazos aleatorios, ni en el relleno, ni en los
// sobres del día de mañana. Solo se meten a mano por el panel de debug o por un código de
// escenario, que son justo las dos puertas que hay que dejar abiertas.
//
// Y el bug que destapó todo esto: `isToken` hacía DOS trabajos a la vez -"no da retribución al
// morir" y "no es una carta que se pueda tener"-, así que Lolita, que solo quería lo primero,
// se llevaba también lo segundo: era una carta completa, con rareza propia, que NADIE podía
// jugar. Ahora son dos flags distintos y esta suite vigila que sigan separados.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
let comprobaciones = 0, fallos = 0;
function check(t, ok, extra) {
    comprobaciones++;
    if (ok) console.log('  OK    · ' + t);
    else { fallos++; console.log('  FALLO · ' + t + (extra ? '  [' + extra + ']' : '')); }
}

// --- cartas.js en un contexto mínimo ---
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
const esColeccionable = vm.runInContext('esColeccionable', sandbox);

console.log('--- El censo: quién entra y quién no ---');
check('esColeccionable existe y es una función', typeof esColeccionable === 'function');

const FUERA = ['Clon de Unmei', 'Clon de NoName', 'Bersérker de prueba', 'Tótem de prueba',
    'Meteorito de prueba', 'Biblioteca de prueba', 'Maldición de prueba'];
for (const n of FUERA) {
    const c = CARTAS.find(x => x.name === n);
    check(`"${n}" NO es coleccionable`, !!c && !esColeccionable(c));
}
// Nadie más: si algún día se marca una carta de más, esto lo canta.
const noColec = CARTAS.filter(c => !esColeccionable(c)).map(c => c.name).sort();
check('y no hay ninguna otra fuera del pool', noColec.length === FUERA.length,
    'fuera: ' + noColec.join(', '));

console.log('\n--- Lolita: una carta de verdad, no un token ---');
const lolita = CARTAS.find(c => c.name === 'Lolita');
check('Lolita SÍ es coleccionable', !!lolita && esColeccionable(lolita));
check('...y ya no lleva isToken', !!lolita && !lolita.isToken);
check('...pero conserva el "no da retribución" en su propio flag',
    !!lolita && lolita.sinRetribucionAlMorir === true);
check('...y su texto lo sigue diciendo', !!lolita && /no te otorga retribución/i.test(lolita.text || ''));

console.log('\n--- El cliente pregunta por el sitio bueno ---');
// Lo que reparte cartas a un jugador NO puede volver a filtrar por isToken a mano: se le
// escaparían las de prueba, que es exactamente el fallo que había en los mazos aleatorios.
const REPARTEN = [
    ['public/deckbuilder.html', 'catálogo del constructor'],
    ['public/index.html', 'mazos de la partida'],
    ['public/lobby.html', 'mazo aleatorio del lobby'],
];
for (const [rel, quien] of REPARTEN) {
    const src = fs.readFileSync(path.join(RAIZ, rel), 'utf8');
    check(`${quien} usa esColeccionable`, src.includes('esColeccionable'));
}
// checkDeath es el único sitio donde isToken sigue teniendo sentido, y ahí tiene que mirar los dos.
const idx = fs.readFileSync(path.join(RAIZ, 'public/index.html'), 'utf8');
check('checkDeath mira isToken Y sinRetribucionAlMorir',
    /triggerRetribution && !card\.isToken && !card\.sinRetribucionAlMorir/.test(idx));
// El relleno de mazo cogía de CARD_DB entero: por ahí entraban tokens y cartas de prueba.
check('el relleno de mazo no coge de CARD_DB a pelo',
    !/CARD_DB\[Math\.floor\(Math\.random\(\) \* CARD_DB\.length\)\]/.test(idx));

console.log(`\nSUITE coleccionables: ${fallos ? fallos + ' FALLOS de ' : comprobaciones + '/'}${comprobaciones} comprobaciones` +
    (fallos ? '' : ' — EL POOL DE CARTAS CUMPLE'));
if (fallos) process.exit(1);
