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
const ESC_AYUDA = {
    turno: 2, turnoDe: 'p1', empieza: 'p2',
    p1: { vanguardia: [{ carta: 'Mini-tigre', vida: 1 }], mano: ['Manzanahoria'] },
    p2: {},
};

// Poder Legado exige un Karlos con 1 de Vida o menos; al equiparse le fija los stats a 9.
const ESC_EQUIPO = {
    turno: 2, turnoDe: 'p1', empieza: 'p2',
    p1: { vanguardia: [{ carta: 'Karlos', vida: 1 }], mano: ['Poder Legado'] },
    p2: {},
};

async function cliente(quienSoy, esc) {
    const ctx = crearContexto('nueva');
    ctx.semilla = 1;
    const g = crearJuego(ctx);
    await asentar(ctx);
    construirEstado(ctx, g, esc);
    g.gameMode = 'online';
    g.myPlayerId = quienSoy;
    g.roomCode = 'TEST';
    // Socket de mentira: anota lo emitido y, si hay un par conectado, lo ENTREGA como haría el
    // servidor. Solo se enrutan las dos acciones que este test necesita, que además son
    // exactamente las que el listener real atiende FUERA de la cola de acciones:
    //   · VISUAL_SEARCH_CONFIRM -> resolveVisualSearch(ids, true)  (línea del listener)
    //   · HARD_SYNC dirigido    -> importGameState(state)
    g.socket = {
        id: 'sock_' + quienSoy,
        emit: (ev, data) => {
            (g.__emitidos = g.__emitidos || []).push(data);
            const par = g.__par;
            if (!par) return;
            if (data.action === 'VISUAL_SEARCH_CONFIRM') par.resolveVisualSearch(data.ids, true);
            else if (data.action === 'HARD_SYNC') { par.importGameState(JSON.parse(JSON.stringify(data.state))); }
        },
    };
    return { ctx, g };
}

const dormir = (ms) => new Promise(r => setTimeout(r, ms));

// Primera diferencia real entre dos estados, para que un fallo diga QUÉ divergió y no solo que
// divergió (si no, depurar una desincronización desde aquí es imposible).
// `_dslPasN` es bookkeeping interno del trigger PASIVA_CONTINUA (cuánto aportó la pasiva en la
// última pasada, solo para decidir si anunciar activación/desactivación). Nunca lo lee el motor
// ni ninguna carta, y difiere aquí porque importGameState llama a updatePassives() al terminar:
// cada cliente recalcula desde un punto distinto del ciclo. La batería de regresión ya lo trata
// como diff INERTE en todo el proyecto (ver esDiffInerte en harness.js), y aquí se aplica el
// mismo criterio en vez de dar por bueno un estado que no lo es.
const INERTES = /\._dslPas(Hp)?\d+$/;

function primeraDif(gA, gB) {
    const lim = (g) => { const s = JSON.parse(JSON.stringify(g.exportGameState())); delete s.logHistory; return s; };
    const out = [];
    const rec = (x, y, ruta) => {
        if (out.length) return;
        if (JSON.stringify(x) === JSON.stringify(y)) return;
        if (typeof x !== 'object' || typeof y !== 'object' || !x || !y) {
            if (INERTES.test(ruta)) return;
            out.push(`${ruta}: A=${JSON.stringify(x)} B=${JSON.stringify(y)}`); return;
        }
        new Set([...Object.keys(x), ...Object.keys(y)]).forEach(k => rec(x[k], y[k], ruta + '.' + k));
    };
    rec(lim(gA), lim(gB), 'estado');
    return out[0] || 'sin diferencias';
}

(async () => {
    console.log('--- Ayuda dirigida (Manzanahoria): el rival recarga antes de que se elija objetivo ---');

    const A = await cliente('p1', ESC_AYUDA); // elector: juega la Ayuda y elegirá objetivo
    const B = await cliente('p2', ESC_AYUDA); // rival

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
    const B2 = await cliente('p2', ESC_AYUDA);
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
    check('ESTADO DE PARTIDA IDÉNTICO en ambos clientes', primeraDif(A.g, B2.g) === 'sin diferencias',
          primeraDif(A.g, B2.g));


    // ------------------------------------------------------------------------------------
    console.log('\n--- Equipo con pick de tablero (Poder Legado): recarga EL QUE ELIGE ---');
    // Este es el caso peor: el elector reconectado recupera sus rebordes verdes, pero su clic
    // no tiene ninguna Promise local que resolver -su corrutina murió al recargar-. Quien lo
    // ejecuta es la corrutina VIVA del rival, que por tanto le debe el estado resultante. Ese
    // volcado solo estaba cableado a los modales de reacción (executeChoice), no a las
    // elecciones visuales: el elector clicaba, "no pasaba nada" en su pantalla, y sí se
    // equipaba en la del rival. Desincronización PERMANENTE, no lenta.
    {
        const P = await cliente('p1', ESC_EQUIPO); // elector (juega el equipo) - recargará
        const Q = await cliente('p2', ESC_EQUIPO); // rival estable, con la corrutina viva

        await P.g.playCard(P.g.players.p1.hand[0].instanceId, true); await asentar(P.ctx);
        await Q.g.playCard(Q.g.players.p1.hand[0].instanceId, true); await asentar(Q.ctx);

        check('el elector tiene el pick de tablero abierto', !!P.g.dslPick, 'sin dslPick');
        check('el rival NO monta picker local, solo espera la resolución',
              !Q.g.dslPick && !!Q.g.currentVisualResolve, 'dslPick=' + !!Q.g.dslPick);

        // --- P RECARGA. El rival estable atiende su REQUEST_SYNC y entra en MODO ESPEJO ---
        const P2 = await cliente('p1', ESC_EQUIPO);
        P2.g.players.p1.vanguard = []; P2.g.players.p1.hand = [];
        P2.g._reconnectRecovery = true;
        Q.g.__par = P2.g;                    // a partir de aquí, lo que emita Q le llega a P2
        Q.g._atenderRequestSync({ requesterId: 'sock_p1' });

        check('el rival estable entra en modo espejo', Q.g._espejandoReaccion === true, 'no entró');
        check('el elector reconectado recupera sus rebordes verdes', !!P2.g.dslPick, 'sin dslPick');

        // --- P2 clica su objetivo: sin Promise local, dirige la corrutina viva de Q ---
        P2.g.__par = Q.g;
        const karlos = P2.g.players.p1.vanguard[0];
        P2.g._dslPickClick(karlos);
        await asentar(Q.ctx);
        await dormir(400);                   // deja asentar el poller del espejo (60 ms/sondeo)
        await asentar(Q.ctx); await asentar(P2.ctx);

        const eqQ = (Q.g.players.p1.vanguard[0].equippedCards || []).length;
        const eqP = (P2.g.players.p1.vanguard[0].equippedCards || []).length;
        check('el equipo se anexa en el rival (su corrutina hizo el trabajo)', eqQ === 1, 'equipos=' + eqQ);
        check('...y el volcado del espejo lo devuelve al elector reconectado', eqP === 1, 'equipos=' + eqP);
        check('el modo espejo se apaga tras asentar', Q.g._espejandoReaccion === false, 'sigue encendido');
        check('los stats bloqueados a 9 llegan a los dos',
              P2.g.players.p1.vanguard[0].currentAtk === 9 && Q.g.players.p1.vanguard[0].currentAtk === 9,
              `P=${P2.g.players.p1.vanguard[0].currentAtk} Q=${Q.g.players.p1.vanguard[0].currentAtk}`);

        check('ESTADO DE PARTIDA IDÉNTICO en ambos clientes', primeraDif(P2.g, Q.g) === 'sin diferencias',
              primeraDif(P2.g, Q.g));
    }

    console.log(fallos === 0
        ? `\nSUITE reconexion_cliente: ${comprobaciones}/${comprobaciones} comprobaciones — CLIENTES SINCRONIZADOS`
        : `\nSUITE reconexion_cliente: ${fallos} FALLOS de ${comprobaciones} comprobaciones`);
    process.exit(fallos ? 1 : 0);
})().catch(e => { console.log('ERROR: ' + e.message); console.log(e.stack); process.exit(1); });
