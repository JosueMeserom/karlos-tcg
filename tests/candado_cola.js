// tests/candado_cola.js — EL CANDADO DE LA COLA: nada se aplica sobre un tablero que aún no es
// el bueno.
//
// EL AGUJERO QUE CIERRA (idea de Toto, pendiente desde el hito de reconexión). Cuando un cliente
// reconecta -o detecta un hueco en el orden- pide un volcado autoritativo del estado. Entre que
// lo pide y le llega hay una ventana; hasta hoy, cualquier acción ordenada que cayera dentro se
// aplicaba igual, encima de un tablero viejo. Y luego pasaba una de dos: o el volcado la pisaba
// (se pierde) o se contaba dos veces. La ventana bajó de 1500 ms a ~60 en su día, pero seguía
// siendo una ventana. Esto la convierte en un candado.
//
// LA REGLA: mientras `awaitingHardSync`, las acciones ORDENADAS (las que llevan `_seq`) se
// RETIENEN aparte -no se tiran-. Al importar el volcado, que trae el `_seqSnapshot` del servidor,
// se descarta lo que el volcado YA incluye y se aplica en orden lo que pasó después.
//
// Lo que NO se retiene: el propio HARD_SYNC (es lo que estamos esperando) y todo lo que no lleve
// número de orden (chat, animaciones, avisos).
//
// Se prueba sobre el motor REAL: `_retenerSiCandado` y `_soltarColaRetenida` son los dos métodos
// por los que pasa la regla, y esta suite se los pregunta a una instancia de Game de verdad.
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const H = fs.readFileSync(path.join(RAIZ, 'tests/harness.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', 'require', '__dirname',
    H + '\n;module.exports.__i={crearContexto,crearJuego,construirEstado,asentar};'
)(mod, mod.exports, require, path.join(RAIZ, 'tests'));
const { crearContexto, crearJuego, construirEstado, asentar } = mod.exports.__i;

let comprobaciones = 0, fallos = 0;
function check(t, ok, extra) {
    comprobaciones++;
    if (ok) console.log('  OK    · ' + t);
    else { fallos++; console.log('  FALLO · ' + t + (extra ? '  [' + extra + ']' : '')); }
}

(async () => {
    const ctx = crearContexto('nueva'); ctx.semilla = 1;
    const g = crearJuego(ctx); await asentar(ctx);
    construirEstado(ctx, g, {
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: ['Karlos'] }, p2: { vanguardia: ['Mini-tigre'] },
    });
    g.gameMode = 'online'; g.myPlayerId = 'p2'; g.roomCode = 'TEST';
    // La cola no debe llegar a correr en esta suite: lo que se comprueba es qué entra en ella.
    const encoladas = [];
    g.processActionQueue = async () => { while (g.actionQueue.length) encoladas.push(g.actionQueue.shift()); };

    console.log('--- Sin candado, todo pasa ---');
    g.awaitingHardSync = false;
    check('una acción ordenada NO se retiene', g._retenerSiCandado({ action: 'PLAY_CARD', _from: 'p1', _seq: 5 }) === false);

    console.log('\n--- Con candado, lo ordenado se retiene (no se tira) ---');
    g.awaitingHardSync = true;
    g._colaRetenida = null;
    check('PLAY_CARD se retiene', g._retenerSiCandado({ action: 'PLAY_CARD', _from: 'p1', _seq: 4 }) === true);
    check('END_TURN también', g._retenerSiCandado({ action: 'END_TURN', _from: 'p1', _seq: 5 }) === true);
    check('...y quedan guardadas, no perdidas', (g._colaRetenida || []).length === 2);
    check('el HARD_SYNC NO se retiene (es lo que esperamos)',
        g._retenerSiCandado({ action: 'HARD_SYNC', _from: 'p1', _seq: 6 }) === false);
    check('lo que no lleva número de orden, tampoco',
        g._retenerSiCandado({ action: 'CHAT_MESSAGE', _from: 'p1' }) === false);

    console.log('\n--- Al llegar el volcado: se tira lo que ya trae y se aplica lo posterior ---');
    // El volcado del servidor dice que p1 va por su acción nº 4: la 4 ya está dentro del estado
    // (se descarta) y la 5 pasó después (se aplica).
    g.lastSeqByRole = { p1: 4, p2: 0 };
    g.awaitingHardSync = false;
    g._soltarColaRetenida();
    check('la acción que el volcado YA incluía se descarta', !encoladas.some(d => d._seq === 4));
    check('...y la posterior se aplica', encoladas.some(d => d._seq === 5 && d.action === 'END_TURN'));
    check('...y el candado queda vacío', !g._colaRetenida);

    console.log('\n--- Y en orden, aunque lleguen desordenadas ---');
    encoladas.length = 0;
    g.awaitingHardSync = true; g._colaRetenida = null;
    [7, 6, 8].forEach(n => g._retenerSiCandado({ action: 'SELECT_CARD', _from: 'p1', _seq: n }));
    g.lastSeqByRole = { p1: 5, p2: 0 };
    g.awaitingHardSync = false;
    g._soltarColaRetenida();
    check('se aplican las tres', encoladas.length === 3);
    check('...y por su número de orden', encoladas.map(d => d._seq).join(',') === '6,7,8', encoladas.map(d => d._seq).join(','));

    console.log('\n--- Un candado nuevo no arrastra lo retenido del anterior ---');
    g.awaitingHardSync = false; g._colaRetenida = null;
    g._retenerSiCandado({ action: 'PLAY_CARD', _from: 'p1', _seq: 9 });   // no hay candado: pasa
    g.awaitingHardSync = true;
    g._retenerSiCandado({ action: 'PLAY_CARD', _from: 'p1', _seq: 10 });
    g.socket = { emit: () => {} };
    g.awaitingHardSync = false;      // requestHardSync sale si ya estaba puesto
    g.requestHardSync();
    check('requestHardSync limpia lo retenido', !g._colaRetenida);
    check('...y deja el candado puesto', g.awaitingHardSync === true);

    console.log('');
    if (fallos) { console.log(`SUITE candado_cola: ${fallos} FALLOS de ${comprobaciones} comprobaciones`); process.exit(1); }
    console.log(`SUITE candado_cola: ${comprobaciones}/${comprobaciones} comprobaciones — EL CANDADO CIERRA`);
})().catch(e => { console.error(e); process.exit(1); });
