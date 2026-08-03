// tests/reconexion_cliente.js — reconexión a mitad de "elige un objetivo del campo".
// NO es una suite viejo-vs-nuevo: monta DOS clientes (el elector y su rival) sobre la MISMA
// base y comprueba que el estado del juego acaba idéntico en los dos aunque uno recargue en
// mitad de la elección. La batería de regresión no puede ver nada de esto: corre UNA sola
// instancia y en modo local, así que todo el camino de red (emitir, replay ordenado,
// REQUEST_SYNC, HARD_SYNC) le es invisible por construcción.
//
// EL BUG QUE FIJA (betasteo de Toto, 31-jul-2026). Al jugar una Ayuda dirigida (Manzanahoria y
// todas sus hermanas), el motor deja a los DOS clientes en `inputState:'SELECT_AYUDA_TARGET'`
// con `selectedCard` puesta, y el clic del elector se replica con un SELECT_CARD que la cola
// entrega a ambos: cada uno ejecuta la Ayuda por su cuenta. Pero `inputState`/`selectedCard`
// son estado LOCAL y NO viajan en exportGameState, así que quien recargaba ahí los perdía:
//   · el elector se quedaba sin rebordes verdes;
//   · y el NO elector -esto era lo grave- volvía en `IDLE`, con lo que el replay del clic ya
//     no encajaba en la rama SELECT_AYUDA_TARGET y NO ejecutaba la Ayuda. La carta se curaba
//     y se descartaba en un cliente y en el otro no: desincronización PERMANENTE, sin red de
//     seguridad (el pick del DSL al menos tenía el volcado de estado posterior).
// El arreglo describe ese momento en `pendingInteraction` (tipo 'ayudaTarget'), que sí viaja,
// y lo re-monta en LOS DOS al importar. Es el mismo patrón que ya se usó para las reacciones,
// con una diferencia deliberada: aquí no hay corrutina viva que dirigir, así que NO se entra
// en modo espejo — basta con devolverle a cada cliente el estado que el replay necesita.
//
// Se ejecuta aparte de la batería: `node tests/reconexion_cliente.js`.

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
function check(titulo, ok, detalle) {
    comprobaciones++;
    if (ok) { console.log('  OK    · ' + titulo); }
    else { fallos++; console.log('  FALLO · ' + titulo + (detalle ? '  [' + detalle + ']' : '')); }
}

// Mini-tigre a 1 de Vida para que la curación sea observable; Manzanahoria cura 2.
const ESC = {
    turno: 2, turnoDe: 'p1', empieza: 'p2',
    p1: { vanguardia: [{ carta: 'Mini-tigre', vida: 1 }], mano: ['Manzanahoria'] },
    p2: {},
};

async function cliente(quienSoy) {
    const ctx = crearContexto('nueva');
    ctx.semilla = 1;
    const g = crearJuego(ctx);
    await asentar(ctx);
    construirEstado(ctx, g, ESC);
    g.gameMode = 'online';
    g.myPlayerId = quienSoy;
    g.roomCode = 'TEST';
    // Socket de mentira: solo anota lo que se habría emitido (aquí el replay se hace a mano).
    g.socket = { id: 'sock_' + quienSoy, emit: (ev, data) => { (g.__emitidos = g.__emitidos || []).push(data); } };
    return { ctx, g };
}

(async () => {
    console.log('--- Ayuda dirigida (Manzanahoria): el rival recarga antes de que se elija objetivo ---');

    const A = await cliente('p1'); // elector: juega la Ayuda y elegirá objetivo
    const B = await cliente('p2'); // rival

    // En online, playCard(!isRemote) solo EMITE; la ejecución real llega a los dos clientes
    // como replay ordenado. Se reproduce ese reparto tal cual.
    await A.g.playCard(A.g.players.p1.hand[0].instanceId, true); await asentar(A.ctx);
    await B.g.playCard(B.g.players.p1.hand[0].instanceId, true); await asentar(B.ctx);

    check('tras jugar la Ayuda, el elector espera objetivo', A.g.inputState === 'SELECT_AYUDA_TARGET', A.g.inputState);
    check('el momento queda descrito en pendingInteraction (viaja en el estado)',
          !!A.g.pendingInteraction && A.g.pendingInteraction.tipo === 'ayudaTarget',
          JSON.stringify(A.g.pendingInteraction));
    check('pendingInteraction apunta a la carta jugada y a quién elige',
          !!A.g.pendingInteraction && A.g.pendingInteraction.chooserId === 'p1'
          && A.g.pendingInteraction.sourceId === A.g.players.p1.hand[0].instanceId,
          JSON.stringify(A.g.pendingInteraction));

    // exportGameState debe llevarlo: es lo único que verá el reconectado.
    const estadoDeA = JSON.parse(JSON.stringify(A.g.exportGameState()));
    check('exportGameState incluye la interacción pendiente',
          !!estadoDeA.pendingInteraction && estadoDeA.pendingInteraction.tipo === 'ayudaTarget',
          JSON.stringify(estadoDeA.pendingInteraction));

    // --- B RECARGA: pestaña nueva, pierde TODO el estado local ---
    const B2 = await cliente('p2');
    B2.g.players.p1.vanguard = []; B2.g.players.p1.hand = []; // arranca en blanco
    B2.g._reconnectRecovery = true;                            // marca de "vengo de reconectar"
    B2.g.importGameState(estadoDeA);

    check('el rival reconectado recupera el estado de targeting',
          B2.g.inputState === 'SELECT_AYUDA_TARGET', B2.g.inputState);
    check('...y la carta origen, que es la que el replay necesita',
          !!B2.g.selectedCard && B2.g.selectedCard.name === 'Manzanahoria',
          B2.g.selectedCard && B2.g.selectedCard.name);
    check('el rival NO se apropia de la elección (sigue eligiendo el otro)',
          B2.g.pendingInteraction && B2.g.pendingInteraction.chooserId === 'p1',
          JSON.stringify(B2.g.pendingInteraction));

    // --- A elige objetivo; su clic se replica al rival ---
    await A.g.selectCard(A.g.players.p1.vanguard[0].instanceId); await asentar(A.ctx);
    await B2.g.selectCard(B2.g.players.p1.vanguard[0].instanceId, true); await asentar(B2.ctx);

    const vidaA = A.g.players.p1.vanguard[0].currentHp;
    const vidaB = B2.g.players.p1.vanguard[0].currentHp;
    const descA = A.g.players.p1.discard.length;
    const descB = B2.g.players.p1.discard.length;

    check('la Ayuda surte efecto en el elector (1 -> 3 de Vida)', vidaA === 3, 'vida=' + vidaA);
    check('la Ayuda surte el MISMO efecto en el rival reconectado', vidaB === 3, 'vida=' + vidaB);
    check('la carta acaba en descartes en los dos', descA === 1 && descB === 1, `A=${descA} B=${descB}`);
    check('el targeting queda cerrado en los dos (sin interacción colgada)',
          !A.g.pendingInteraction && !B2.g.pendingInteraction,
          `A=${JSON.stringify(A.g.pendingInteraction)} B=${JSON.stringify(B2.g.pendingInteraction)}`);

    // Comparación final de estado, que es lo que de verdad importa: si diverge, la partida
    // queda rota aunque cada paso suelto pareciera correcto.
    const limpio = (g) => {
        const s = JSON.parse(JSON.stringify(g.exportGameState()));
        delete s.logHistory; // los logs privados (logError) no viajan y no son estado de juego
        return JSON.stringify(s);
    };
    check('ESTADO DE PARTIDA IDÉNTICO en ambos clientes', limpio(A.g) === limpio(B2.g),
          'divergen tras la jugada');

    console.log(fallos === 0
        ? `\nSUITE reconexion_cliente: ${comprobaciones}/${comprobaciones} comprobaciones — CLIENTES SINCRONIZADOS`
        : `\nSUITE reconexion_cliente: ${fallos} FALLOS de ${comprobaciones} comprobaciones`);
    process.exit(fallos ? 1 : 0);
})().catch(e => { console.log('ERROR: ' + e.message); console.log(e.stack); process.exit(1); });
