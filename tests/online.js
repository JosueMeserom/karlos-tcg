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
// ESTADO (13-ago-2026): EN CONSTRUCCIÓN, y NO forma parte todavía de la pasada estricta. Ya
// reproduce una asimetría real -al jugar Limo crecido, el modal se abre en el cliente del RIVAL
// y no en el de quien juega, y el playCard de quien juega se sale sin dejar rastro ni log de
// error-, que es exactamente la forma del bug que Toto ve en el navegador. Falta encontrar el
// `return` silencioso que se lo come; el guard de "No es tu turno" no es (se comprobó) y ningún
// logError salta.
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

// Subconjunto de la tubería del servidor que importa para una jugada. Se copia el `else if` de
// processActionQueue y las tres respuestas inmediatas (que en el cliente real bypasean la cola
// justo para no bloquearla: la cola espera la Promise y la Promise esperaría a la cola).
async function entregar(g, data) {
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
                Promise.resolve().then(() => entregar(clientes[otro].g, Object.assign({ _from: yo }, data)));
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

    console.log('');
    if (fallos) { console.log(`SUITE online: ${fallos} FALLOS de ${comprobaciones} comprobaciones`); process.exit(1); }
    console.log(`SUITE online: ${comprobaciones}/${comprobaciones} comprobaciones — LOS DOS CLIENTES COINCIDEN`);
})().catch(e => { console.error(e); process.exit(1); });
