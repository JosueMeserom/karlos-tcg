// tests/online.js — DOS CLIENTES hablándose, para cazar desincronizaciones.
//
// Toda la batería anterior corre un solo cliente, y hay una familia entera de bugs que ahí no se
// ve: los que hacen que los DOS TABLEROS ACABEN DISTINTOS. Se han arreglado tres o cuatro a
// ciegas (Dobla la ropa, Karlitos, el Limo crecido) porque no había forma de reproducirlos fuera
// del navegador. Esto la da.
//
// Cómo funciona: dos instancias de Game en dos contextos aislados, cada una con su `myPlayerId`,
// y un socket falso que entrega lo que una emite a la otra. No se replica el servidor entero,
// solo el subconjunto que de verdad usa una jugada (ver `entregar`): las acciones convertidas
// -que ambos clientes ejecutan- y las respuestas a modales, que resuelven la Promise que el otro
// tiene esperando. Es exactamente el mecanismo por el que se desincronizan.
//
//   node tests/online.js
//
// ENTRA EN LA PASADA ESTRICTA. Su primer hallazgo: durante una evolución no había ninguna
// corrutina viva, así que el poller daba la partida por asentada a mitad de los ~2 segundos de
// animación y volcaba al rival un estado a medias.
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const H = fs.readFileSync(path.join(RAIZ, 'tests/harness.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', 'require', '__dirname',
    H + '\n;module.exports.__i={crearContexto,crearJuego,construirEstado,asentar,ejecutarPaso};'
)(mod, mod.exports, require, path.join(RAIZ, 'tests'));
const { crearContexto, crearJuego, construirEstado, asentar, ejecutarPaso } = mod.exports.__i;

let comprobaciones = 0, fallos = 0;
function check(titulo, ok, detalle) {
    comprobaciones++;
    if (ok) console.log('  OK    · ' + titulo);
    else { fallos++; console.log('  FALLO · ' + titulo + (detalle ? '\n          ' + detalle : '')); }
}

// LA REGLA QUE HACE QUE ESTO SEA FIEL: el servidor reparte cada acción a LOS DOS clientes,
// emisor incluido. En online, `playCard` no ejecuta nada en local -solo emite y sale-; la jugada
// ocurre cuando la acción vuelve ordenada por el servidor. Por eso existe CONVERTED_ACTIONS: de
// su propio eco, un cliente ejecuta esas y descarta el resto (las que ya corrió en optimista).
// Mandar la acción solo al rival, como hacía la primera versión de este fichero, deja al que
// juega sin hacer nada — y eso NO es el bug, es el cable mal puesto (13-ago-2026).
const CONVERTIDAS = new Set(['END_TURN', 'PLAY_CARD', 'ACTIVATE_ABILITY', 'DIRECT_ATTACK',
    'CONFIRM_ACTION', 'TYPE_SELECTION', 'FINISH_EARLY_TARGETS', 'OPPONENT_DISCARD',
    'DEBUG_RETRIBUTION', 'DEBUG_COIN_MODE']);

// Subconjunto de la tubería del servidor que importa para una jugada. Se copia el `else if` de
// processActionQueue y las tres respuestas inmediatas (que en el cliente real bypasean la cola
// justo para no bloquearla: la cola espera la Promise y la Promise esperaría a la cola).
async function entregar(g, data) {
    // Mi propio eco: solo me interesan las convertidas (el resto ya las ejecuté al emitirlas).
    if (data._from && data._from === g.myPlayerId && !CONVERTIDAS.has(data.action)) return;
    try {
        switch (data.action) {
            case 'CHOICE_SELECTED':        g.executeChoice(data.index, true); break;
            case 'VISUAL_SEARCH_CONFIRM':  g.resolveVisualSearch(data.ids, true); break;
            case 'PLAY_CARD':              await g.playCard(data.cardId, true); break;
            case 'SELECT_CARD':            await g.selectCard(data.cardId, true); break;
            case 'CANCEL_ACTION':          g.cancelAction(true); break;
            case 'ACTIVATE_ABILITY':       g.activateAbility(data.cardId, true); break;
            case 'CONFIRM_ACTION':         await g.confirmAction(true); break;
            case 'END_TURN':               await g.confirmEndTurn(true); break;
            // HARD_SYNC / instantáneas: el estado del emisor manda. Es justo el mecanismo que
            // "arregla" una desincronización tapándola, así que se cuenta aparte para poder
            // distinguir "los dos clientes coincidían" de "coincidieron porque uno se rindió".
            case 'HARD_SYNC':              if (data.state) { g.__sincronizado = (g.__sincronizado || 0) + 1; g.importGameState(data.state); } break;
            default: break;
        }
    } catch (e) { g.__errores = (g.__errores || []); g.__errores.push(String(e && e.message || e)); }
}

// Dos clientes de la MISMA partida, cada uno viéndose a sí mismo como su jugador.
async function mesaOnline(esc) {
    const clientes = {};
    for (const yo of ['p1', 'p2']) {
        const ctx = crearContexto('nueva');
        ctx.semilla = esc.semilla || 1;
        const g = crearJuego(ctx);
        await asentar(ctx);
        construirEstado(ctx, g, esc);
        g.gameMode = 'online';
        g.myPlayerId = yo;
        g.roomCode = 'TEST';
        g.__errores = [];
        clientes[yo] = { ctx, g };
    }
    // El cable: lo que uno emite le llega al otro. `_from` como en el servidor real, para que
    // el emisor ignore su propio eco de las acciones convertidas (ya las ejecutó en optimista).
    for (const yo of ['p1', 'p2']) {
        const otro = yo === 'p1' ? 'p2' : 'p1';
        clientes[yo].g.socket = {
            id: 'sock-' + yo,
            emit: (evt, data) => {
                if (evt !== 'gameAction' || !data) return;
                // A LOS DOS, como el servidor: el emisor también recibe su acción de vuelta.
                for (const dest of ['p1', 'p2']) {
                    Promise.resolve().then(() => entregar(clientes[dest].g, Object.assign({ _from: yo }, data)));
                }
            },
            on: () => {},
        };
    }
    return clientes;
}

// Foto comparable de un tablero: nombres por zona. Los instanceId son iguales en ambos clientes
// (mismo escenario, misma semilla), así que una diferencia aquí es una desincronización real.
const foto = (g) => JSON.stringify({
    p1: { vg: g.players.p1.vanguard.map(c => c.name), rg: g.players.p1.rearguard.map(c => c.name),
          mano: g.players.p1.hand.map(c => c.name).sort(), desc: g.players.p1.discard.map(c => c.name).sort(),
          ev: (g.players.p1.activeEvent || {}).name || null },
    p2: { vg: g.players.p2.vanguard.map(c => c.name), rg: g.players.p2.rearguard.map(c => c.name),
          mano: g.players.p2.hand.map(c => c.name).sort(), desc: g.players.p2.discard.map(c => c.name).sort(),
          ev: (g.players.p2.activeEvent || {}).name || null },
}, null, 1);

// Deja correr las promesas pendientes de los dos clientes (el cable es asíncrono a propósito).
async function reposar(clientes, vueltas = 60) {
    for (let i = 0; i < vueltas; i++) {
        await Promise.resolve();
        await new Promise(r => setImmediate(r));
        for (const yo of ['p1', 'p2']) {
            const ctx = clientes[yo].ctx;
            while (ctx.timers && ctx.timers.length) {
                const t = ctx.timers.shift();
                try { if (typeof t.fn === 'function') t.fn(); } catch (e) {}
            }
        }
    }
}

(async () => {
    console.log('\n--- Limo crecido evoluciona: los dos tableros deben quedar IGUALES ---');
    {
        const esc = {
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Limo artificial'], mano: ['Limo crecido'] },
            p2: { vanguardia: ['Mini-tigre'] },
        };
        const cl = await mesaOnline(esc);
        const A = cl.p1, B = cl.p2;

        // p1 juega: su cliente lo hace en optimista y emite; el de p2 lo replica.
        // No hace falta emitir a mano: playCard ya emite su PLAY_CARD por el socket falso.
        await ejecutarPaso(A.ctx, A.g, { jugar: 'Limo crecido' });
        await reposar(cl);

        check('el modal se abre en el cliente de quien juega', !!(A.ctx.pendientes[0]),
            'pendientes p1=' + A.ctx.pendientes.length + ' p2=' + B.ctx.pendientes.length);

        await ejecutarPaso(A.ctx, A.g, { opcion: 'EVOLUCIONAR LIMO ARTIFICIAL' });
        await reposar(cl);
        await ejecutarPaso(A.ctx, A.g, { elegir: ['Limo artificial'] });
        await reposar(cl);

        check('sin excepciones en ninguno de los dos clientes',
            !A.g.__errores.length && !B.g.__errores.length,
            'p1=' + JSON.stringify(A.g.__errores) + ' p2=' + JSON.stringify(B.g.__errores));
        check('los dos tableros coinciden', foto(A.g) === foto(B.g),
            'JUEGA p1:\n' + foto(A.g) + '\nVE p2:\n' + foto(B.g));
        check('y la evolución ocurrió de verdad',
            A.g.players.p1.vanguard.some(c => c.name === 'Limo crecido'),
            'vg p1=' + JSON.stringify(A.g.players.p1.vanguard.map(c => c.name)));
    }

    // ── EL VUELCO A MITAD DE CADENA ───────────────────────────────────────────────
    // El poller vuelca el estado al rival cuando cree que la partida está ASENTADA. Con tiempos
    // instantáneos eso no se ve, así que aquí se fuerza: se pregunta si está asentada JUSTO en
    // mitad de la animación de la evolución. Si dice que sí, volcará un estado a medias — y ese
    // es exactamente el desincronizado que Toto ve (uno con la carta de vuelta en la mano, el
    // otro con la evolución hecha). La condición real es `_corrutinasVivas`.
    console.log('\n--- A mitad de una evolución, la partida NO puede darse por asentada ---');
    {
        const cl = await mesaOnline({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Limo artificial'], mano: ['Limo crecido'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        const A = cl.p1;
        let vivasEnMedio = null;
        // El gancho: se mira el contador cuando la animación de la evolución está corriendo.
        const orig = A.g.evolucionarDesdeMano.bind(A.g);
        A.g.evolucionarDesdeMano = async function (...args) {
            vivasEnMedio = A.g._corrutinasVivas || 0;
            return orig(...args);
        };
        await ejecutarPaso(A.ctx, A.g, { jugar: 'Limo crecido' });
        await reposar(cl);
        await ejecutarPaso(A.ctx, A.g, { opcion: 'EVOLUCIONAR LIMO ARTIFICIAL' });
        await reposar(cl);
        await ejecutarPaso(A.ctx, A.g, { elegir: ['Limo artificial'] });
        await reposar(cl);
        check('durante la evolución hay una corrutina viva (el poller no volcará a medias)',
            vivasEnMedio > 0, '_corrutinasVivas en mitad de la animación = ' + vivasEnMedio);
        // Y NADIE necesita mandar una foto. Es la distinción que este harness existe para hacer:
        // los dos tableros pueden coincidir porque la réplica es determinista, o porque uno se
        // rindió y copió al otro. Lo segundo se ve como un parpadeo del estado viejo antes de
        // corregirse, que es justo lo que Toto veía (13-ago-2026).
        check('sin instantáneas autoritativas de por medio (la réplica basta)',
            !cl.p1.g.__sincronizado && !cl.p2.g.__sincronizado,
            'HARD_SYNC aplicados: p1=' + (cl.p1.g.__sincronizado || 0) + ' p2=' + (cl.p2.g.__sincronizado || 0));
    }

    console.log('\n--- Vanguardia LLENA: el rival no se queda colgado esperando la eleccion ---');
    {
        // Toto lo vio jugando (18-ago-2026): con el nuevo flujo la carta se presenta y se para en
        // el escaparate a esperar que elijas el Esbirro. En el cliente del RIVAL corre el mismo
        // playCard, asi que tambien se para... y ahi se quedaba colgado, sin aviso de espera y sin
        // que nada lo soltara. Esto reproduce los dos clientes de verdad.
        const esc = {
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Mini-tigre', 'Guardaespaldas', 'Robot de seguridad SP', 'Hechicero'],
                  mano: ['Karlos'] },
            p2: { vanguardia: ['Aniceto'] },
        };
        const cl = await mesaOnline(esc);
        const A = cl.p1.g, B = cl.p2.g;
        const karlos = A.players.p1.hand.find(c => c.name === 'Karlos');
        A.playCard(karlos.instanceId).catch(() => {});
        await reposar(cl);

        check('el que juega pide elegir el Esbirro', A.inputState === 'SELECT_ESBIRRO_TO_SWAP',
            'A.inputState=' + A.inputState);
        check('y el RIVAL sabe que esta esperando una eleccion',
            !!(B.pendingInteraction && B.pendingInteraction.chooserId === 'p1'),
            'B.pendingInteraction=' + JSON.stringify(B.pendingInteraction));

        const robot = A.players.p1.vanguard.find(c => c.name === 'Robot de seguridad SP');
        A.selectCard(robot.instanceId);
        await reposar(cl);

        check('el rival NO se queda colgado: vuelve a IDLE', B.inputState === 'IDLE',
            'B.inputState=' + B.inputState);
        check('y los dos tableros coinciden', foto(A) === foto(B),
            'A=' + foto(A) + '  B=' + foto(B));
    }

    console.log('');
    if (fallos) { console.log(`SUITE online: ${fallos} FALLOS de ${comprobaciones} comprobaciones`); process.exit(1); }
    console.log(`SUITE online: ${comprobaciones}/${comprobaciones} comprobaciones — LOS DOS CLIENTES COINCIDEN`);
})().catch(e => { console.error(e); process.exit(1); });
