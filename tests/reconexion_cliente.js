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

// BI-CHOQUE (Activa de Karlos) usa el targeting CRUDO del motor: SELECT_ABILITY_TARGETS +
// abilityContext, que es otro camino distinto de los dos anteriores. Pide 2 objetivos.
const ESC_ACTIVA = {
    turno: 2, turnoDe: 'p1', empieza: 'p2',
    p1: { vanguardia: [{ carta: 'Karlos', furor: 3 }] },
    p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 20 }, { carta: 'Oso con armadura', vida: 20 }] },
};

// Ataque normal corriente: Karlos con Furor de sobra y un enemigo al que pegarle. La Vida alta
// del objetivo es para que el golpe se note sin matarlo (así el estado final compara mejor).
const ESC_ATAQUE = {
    turno: 2, turnoDe: 'p1', empieza: 'p2',
    p1: { vanguardia: [{ carta: 'Karlos', furor: 3 }] },
    p2: { vanguardia: [{ carta: 'Oso con armadura', vida: 20 }] },
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

    // ------------------------------------------------------------------------------------
    console.log('\n--- Activa con targeting crudo (BI-CHOQUE): recarga el rival a medio elegir ---');
    // Tercer camino, el que quedaba sin cubrir: SELECT_ABILITY_TARGETS + abilityContext. No se
    // puede marcar al entrar como los otros dos, porque quien pone ese inputState es CADA carta
    // imperativa por su cuenta (una veintena de sitios); el descriptor se DERIVA en
    // exportGameState. Se prueba además con UN objetivo ya elegido, para verificar que los
    // objetivos acumulados sobreviven al viaje (van como instanceId y se rehidratan).
    {
        const R = await cliente('p1', ESC_ACTIVA); // elector
        const S = await cliente('p2', ESC_ACTIVA); // rival, que recargará

        R.g.activateAbility(R.g.players.p1.vanguard[0].instanceId, true); await asentar(R.ctx);
        S.g.activateAbility(S.g.players.p1.vanguard[0].instanceId, true); await asentar(S.ctx);
        // La Activa pasa primero por su modal de confirmación ("¿Usar Karlos?").
        await R.g.confirmAction(true); await asentar(R.ctx);
        await S.g.confirmAction(true); await asentar(S.ctx);
        check('la Activa abre el targeting crudo', R.g.inputState === 'SELECT_ABILITY_TARGETS', R.g.inputState);

        // Primer objetivo, replicado a los dos como en una partida normal.
        await R.g.selectCard(R.g.players.p2.vanguard[0].instanceId); await asentar(R.ctx);
        await S.g.selectCard(S.g.players.p2.vanguard[0].instanceId, true); await asentar(S.ctx);
        check('queda 1 objetivo fijado de los 2', R.g.abilityContext && R.g.abilityContext.targets.length === 1,
              'targets=' + (R.g.abilityContext && R.g.abilityContext.targets.length));

        const estadoR = JSON.parse(JSON.stringify(R.g.exportGameState()));
        check('exportGameState describe el targeting de Activa en curso',
              !!estadoR.pendingAbilityTarget && estadoR.pendingAbilityTarget.ctx.name === 'BI-CHOQUE',
              JSON.stringify(estadoR.pendingAbilityTarget && estadoR.pendingAbilityTarget.ctx));
        check('...incluidos los objetivos ya elegidos (como instanceId)',
              !!estadoR.pendingAbilityTarget && estadoR.pendingAbilityTarget.ctx.targetsIds.length === 1,
              JSON.stringify(estadoR.pendingAbilityTarget && estadoR.pendingAbilityTarget.ctx.targetsIds));

        // --- S RECARGA a medio targeting ---
        const S2 = await cliente('p2', ESC_ACTIVA);
        S2.g.players.p1.vanguard = []; S2.g.players.p2.vanguard = [];
        S2.g._reconnectRecovery = true;
        S2.g.importGameState(estadoR);

        check('el rival reconectado recupera el targeting de Activa',
              S2.g.inputState === 'SELECT_ABILITY_TARGETS', S2.g.inputState);
        check('...y el objetivo ya elegido, rehidratado como carta',
              !!S2.g.abilityContext && S2.g.abilityContext.targets.length === 1
              && !!S2.g.abilityContext.targets[0] && S2.g.abilityContext.targets[0].name === 'Mini-tigre',
              JSON.stringify(S2.g.abilityContext && S2.g.abilityContext.targets.map(t => t && t.name)));

        // --- Segundo objetivo: completa la Activa en los dos ---
        await R.g.selectCard(R.g.players.p2.vanguard[1].instanceId); await asentar(R.ctx);
        await S2.g.selectCard(S2.g.players.p2.vanguard[1].instanceId, true); await asentar(S2.ctx);
        await dormir(200); await asentar(R.ctx); await asentar(S2.ctx);

        const vidasR = R.g.players.p2.vanguard.map(c => c.currentHp).join('/');
        const vidasS = S2.g.players.p2.vanguard.map(c => c.currentHp).join('/');
        check('BI-CHOQUE golpea a los dos enemigos en el elector', vidasR !== '20/20', 'vidas=' + vidasR);
        check('...y exactamente igual en el rival reconectado', vidasR === vidasS, `R=${vidasR} S=${vidasS}`);
        check('ESTADO DE PARTIDA IDÉNTICO en ambos clientes', primeraDif(R.g, S2.g) === 'sin diferencias',
              primeraDif(R.g, S2.g));
    }

    // ------------------------------------------------------------------------------------
    console.log('\n--- Ataque normal: recarga el rival viendo los rebordes de objetivo ---');
    // El caso MÁS común de los cuatro y el último en cubrirse (betasteo de Toto, 5-ago-2026):
    // clicas tu carta para atacar, y mientras eliges enemigo el otro cliente recarga. Mismo
    // mecanismo exacto que `ayudaTarget` y que el targeting de Activa -el ataque se consuma con
    // el replay del segundo clic (SELECT_CARD), que solo encaja si AMBOS siguen en
    // 'SELECT_TARGET' con la misma carta seleccionada-, y mismo arreglo: un descriptor derivado
    // en exportGameState (`pendingAttackTarget`) que se re-monta en LOS DOS al importar.
    {
        const V = await cliente('p1', ESC_ATAQUE); // ataca
        const W = await cliente('p2', ESC_ATAQUE); // rival, que recargará

        // Primer clic: seleccionar al atacante. Se replica a los dos, como en una partida real.
        await V.g.selectCard(V.g.players.p1.vanguard[0].instanceId); await asentar(V.ctx);
        await W.g.selectCard(W.g.players.p1.vanguard[0].instanceId, true); await asentar(W.ctx);
        check('el atacante entra en el targeting de ataque', V.g.inputState === 'SELECT_TARGET', V.g.inputState);
        check('...y el rival lo espeja (sin haber recargado todavía)', W.g.inputState === 'SELECT_TARGET', W.g.inputState);

        const estadoV = JSON.parse(JSON.stringify(V.g.exportGameState()));
        check('exportGameState describe el targeting de ataque en curso',
              !!estadoV.pendingAttackTarget
              && estadoV.pendingAttackTarget.sourceId === V.g.players.p1.vanguard[0].instanceId,
              JSON.stringify(estadoV.pendingAttackTarget));

        // --- W RECARGA justo aquí, viendo los rebordes ---
        const W2 = await cliente('p2', ESC_ATAQUE);
        W2.g.players.p1.vanguard = []; W2.g.players.p2.vanguard = [];
        W2.g._reconnectRecovery = true;
        W2.g.importGameState(estadoV);

        check('el rival reconectado recupera el targeting de ataque',
              W2.g.inputState === 'SELECT_TARGET', W2.g.inputState);
        check('...con el MISMO atacante seleccionado',
              !!W2.g.selectedCard && W2.g.selectedCard.name === 'Karlos',
              W2.g.selectedCard && W2.g.selectedCard.name);

        // --- Segundo clic: el golpe se consuma en los dos ---
        const vidaAntes = W2.g.players.p2.vanguard[0].currentHp;
        await V.g.selectCard(V.g.players.p2.vanguard[0].instanceId); await asentar(V.ctx);
        await W2.g.selectCard(W2.g.players.p2.vanguard[0].instanceId, true); await asentar(W2.ctx);
        await dormir(200); await asentar(V.ctx); await asentar(W2.ctx);

        const vidaV = V.g.players.p2.vanguard[0].currentHp;
        const vidaW = W2.g.players.p2.vanguard[0].currentHp;
        check('el ataque se ejecuta en el atacante', vidaV < vidaAntes, `antes=${vidaAntes} despues=${vidaV}`);
        check('...y EL RIVAL RECONECTADO lo espeja (era justo lo que se perdía)',
              vidaW === vidaV, `V=${vidaV} W=${vidaW}`);
        check('ESTADO DE PARTIDA IDÉNTICO en ambos clientes', primeraDif(V.g, W2.g) === 'sin diferencias',
              primeraDif(V.g, W2.g));
    }

    // ------------------------------------------------------------------------------------
    console.log('\n--- Moneda ajena y reenvío de animaciones al reconectado ---');
    // Dos límites que quedaban del reanudar-perfecto, los dos por lo mismo: el reconectado
    // recuperaba el ESTADO pero no el espectáculo, porque las animaciones (y el overlay de la
    // moneda) los generaba su corrutina, que murió.
    {
        const T = await cliente('p1', ESC_ACTIVA); // lanza la moneda / ataca
        const U = await cliente('p2', ESC_ACTIVA); // reconectará

        // El descriptor de moneda debe describir de quién es la tirada, no solo que la hay.
        T.g.pendingInteraction = { tipo: 'coin', chooserId: 'p1', playerId: 'p1', count: 1 };
        T.g._interaccionChooser = 'p1';
        const estadoConMoneda = JSON.parse(JSON.stringify(T.g.exportGameState()));
        check('la moneda viaja en el estado con su dueño',
              !!estadoConMoneda.pendingInteraction && estadoConMoneda.pendingInteraction.tipo === 'coin'
              && estadoConMoneda.pendingInteraction.chooserId === 'p1',
              JSON.stringify(estadoConMoneda.pendingInteraction));

        // El rival reconecta: NO es su moneda, pero debe recuperar el overlay para verla caer.
        const U2 = await cliente('p2', ESC_ACTIVA);
        U2.g._reconnectRecovery = true;
        let monedaMontada = null;
        U2.g.triggerCoinFlips = (count, playerId) => { monedaMontada = { count, playerId }; return Promise.resolve([]); };
        U2.g.importGameState(estadoConMoneda);
        check('el espectador reconectado re-monta la moneda del rival',
              !!monedaMontada && monedaMontada.playerId === 'p1', JSON.stringify(monedaMontada));
        check('...y queda marcada como huérfana, para poder cerrarla luego',
              U2.g._monedaHuerfana === true, 'flag=' + U2.g._monedaHuerfana);

        // Si la tirada ya había caído, no llegará ningún COIN_FLIP_REMOTE: el siguiente estado
        // sin moneda debe cerrar el overlay en vez de dejar el velo puesto para siempre.
        T.g.pendingInteraction = null;
        U2.g.importGameState(JSON.parse(JSON.stringify(T.g.exportGameState())));
        check('un estado sin moneda cierra la moneda huérfana', U2.g._monedaHuerfana === false,
              'flag=' + U2.g._monedaHuerfana);

        // --- Reenvío de animaciones ---
        // Solo emite quien DEBE estado (modo espejo o volcado pendiente); el resto del tiempo,
        // las animaciones son locales y no viajan, que es como debe ser.
        const emitidas = () => (T.g.__emitidos || []).filter(d => d.action === 'ANIM_REMOTE');
        T.g.__emitidos = [];
        T.g._espejandoReaccion = false; T.g._reSyncTrasEleccion = false;
        T.ctx.sandbox.animateAttack('a', 'b');
        check('sin nadie a quien deber estado, la animación NO viaja', emitidas().length === 0,
              'emitidas=' + emitidas().length);

        T.g._reSyncTrasEleccion = true; T.g._reSyncTarget = 'sock_p2';
        T.ctx.sandbox.animateAttack('a', 'b');
        const ult = emitidas()[emitidas().length - 1];
        check('debiendo estado, la animación se reenvía', emitidas().length === 1, 'emitidas=' + emitidas().length);
        check('...con la función y sus argumentos', !!ult && ult.fn === 'animateAttack' && ult.args[0] === 'a' && ult.args[1] === 'b',
              JSON.stringify(ult && { fn: ult.fn, args: ult.args }));
        check('...y DIRIGIDA a quien reconectó, no a todos', !!ult && ult.targetId === 'sock_p2',
              'targetId=' + (ult && ult.targetId));
    }

    // ------------------------------------------------------------------------------------
    console.log('\n--- Moneda YA CAÍDA: reconectar no debe relanzarla ---');
    // El descriptor decía "hay una moneda" pero no EN QUÉ PUNTO. Si alguien recargaba con la
    // moneda ya caída y el modal aún abierto, se re-montaba desde cero: el que lanza sacaba un
    // resultado NUEVO -cambiando lo que los dos ya habían visto- y el que mira se quedaba
    // esperando una tirada que ya había caído (softlock). Ahora el descriptor lleva fase.
    {
        const V = await cliente('p1', ESC_ACTIVA);
        V.g.logMsg = () => {};
        delete V.g.triggerCoinFlips; // el arnés lo sustituye por un stub; aquí interesa el real

        const fases = [];
        let _pi = null;
        Object.defineProperty(V.g, 'pendingInteraction', {
            get: () => _pi,
            set: (v) => { _pi = v; if (v && v.tipo === 'coin') fases.push(v.fase); },
            configurable: true,
        });

        V.g.debugCoinMode = 'heads';
        V.g.triggerCoinFlips(1, 'p1');           // Promise viva: espera al "continuar"
        await asentar(V.ctx);
        const hitbox = V.ctx.sandbox.document.getElementById('coin-hitbox');
        check('el que lanza tiene la moneda pinchable', typeof hitbox.onclick === 'function', typeof hitbox.onclick);
        check('arranca en fase "lanzando"', fases[0] === 'lanzando', fases.join(','));

        await hitbox.onclick();                   // lanza
        for (let k = 0; k < 12; k++) await asentar(V.ctx); // deja caer la animación

        check('tras caer, el descriptor pasa a "avanzando"', _pi && _pi.fase === 'avanzando', JSON.stringify(_pi));
        check('...guardando el resultado que ya salió', !!_pi && _pi.resultados[0] === 'heads',
              JSON.stringify(_pi && _pi.resultados));

        // Lo que verá quien reconecte en ese punto.
        const r = V.g._reanudarMoneda(_pi);
        check('al reconectar NO se relanza (se reanuda en "avanzando")', r.fase === 'avanzando', r.fase);
        check('...y el resultado se conserva, no se vuelve a sortear', r.resultados[0] === 'heads',
              JSON.stringify(r.resultados));
        check('...desde la tirada correcta', r.idx === 0, 'idx=' + r.idx);

        // Un descriptor viejo (sin fase) se trata como "aún no lanzada", que es lo que se hacía
        // antes de que existieran las fases: no rompe partidas a medias de una versión anterior.
        const rViejo = V.g._reanudarMoneda({ tipo: 'coin', chooserId: 'p1', playerId: 'p1', count: 1 });
        check('un descriptor sin fase se reanuda como "lanzando"', rViejo.fase === 'lanzando', rViejo.fase);
    }

    console.log(fallos === 0
        ? `\nSUITE reconexion_cliente: ${comprobaciones}/${comprobaciones} comprobaciones — CLIENTES SINCRONIZADOS`
        : `\nSUITE reconexion_cliente: ${fallos} FALLOS de ${comprobaciones} comprobaciones`);
    process.exit(fallos ? 1 : 0);
})().catch(e => { console.log('ERROR: ' + e.message); console.log(e.stack); process.exit(1); });
