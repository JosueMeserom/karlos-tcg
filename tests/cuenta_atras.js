// tests/cuenta_atras.js — el final del reloj (5-ago-2026).
//
// Por qué esto NO puede vivir en la suite comparativa (regresion63): **la Diego Antonio VIEJA
// se rompe justo en ese momento**. Su onEndTurn hace
//
//     game.modifyCounters(card, 'diego_timer', -1, ...);
//     const left = card.counters['diego_timer'].count;   // <- TypeError
//
// y `modifyCounters` BORRA el contador en cuanto llega a 0 (index.html), así que leerlo a
// continuación revienta con "Cannot read properties of undefined". O sea que la carta no podía
// morir de su propio reloj: lanzaba una excepción en su lugar. Nunca se vio en partida porque
// Diego Antonio exige el Evento 'Una buena razón', **que no existe en CARD_DB** — la carta es
// incolocable hoy, y por eso el fallo llevaba ahí desde siempre sin que nadie lo notase.
//
// El op `CUENTA_ATRAS` lee el valor con un helper que trata "contador ausente" como 0, así que
// el caso del borrado deja de ser un borde y pasa a ser el camino normal.
//
// Se ejecuta aparte de la batería: `node tests/cuenta_atras.js`.

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
    else { fallos++; console.log('  FALLO · ' + titulo + (detalle ? '  [' + detalle + ']' : '')); }
}

async function partida(base, esc) {
    const ctx = crearContexto(base);
    ctx.semilla = 1;
    const g = crearJuego(ctx);
    await asentar(ctx);
    construirEstado(ctx, g, esc);
    return { ctx, g };
}

const conReloj = (n) => ({
    turno: 2, turnoDe: 'p1', empieza: 'p2',
    p1: { vanguardia: [{ carta: 'Diego Antonio', furor: 3,
        campos: { counters: { diego_timer: { count: n, name: 'Turnos de Cólera', icon: '⏳' } } } }] },
    p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 20 }] },
});

(async () => {
    console.log('--- El reloj de Diego Antonio llega a 0 ---');
    {
        const { ctx, g } = await partida('nueva', conReloj(1));
        const d = g.players.p1.vanguard[0];
        await ejecutarPaso(ctx, g, { finTurno: true });   // 1 -> 0

        check('el contador desaparece al agotarse', !(d.counters && d.counters.diego_timer),
            JSON.stringify(d.counters));
        check('Diego Antonio muere', d.location === 'discard', 'location=' + d.location);
        check('...y sale de la vanguardia', g.players.p1.vanguard.length === 0,
            'quedan ' + g.players.p1.vanguard.length);
        check('...SIN dar Retribución al rival', (g.players.p2.retribution || []).length === 0,
            'retribución de p2 = ' + (g.players.p2.retribution || []).length);
        check('el log lo anuncia', g.logHistory.some(l => /se ha agotado/.test(l.msg)),
            JSON.stringify(g.logHistory.map(l => l.msg).slice(-3)));
    }

    console.log('\n--- La MISMA situación en la base congelada: revienta ---');
    {
        // Se documenta el bug que la migración corrige. Si algún día esto dejara de lanzar,
        // querría decir que la vieja cambió (no debe: es una base congelada) o que el borrado
        // de contadores a 0 dejó de ocurrir, y entonces habría que revisar el op.
        const { ctx, g } = await partida('vieja', conReloj(1));
        let peto = null;
        try { await ejecutarPaso(ctx, g, { finTurno: true }); }
        catch (e) { peto = e.message; }
        check('la vieja lanza al leer el contador ya borrado', !!peto && /count/.test(peto),
            peto || 'no lanzó');
    }

    console.log('\n--- Meca EBA: el mismo op sobre un STAT en vez de un contador ---');
    {
        const { ctx, g } = await partida('nueva', {
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Meca EBA', furor: 1 }] },
            p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 20 }] },
        });
        const m = g.players.p1.vanguard[0];
        await ejecutarPaso(ctx, g, { finTurno: true });   // 1 -> 0
        check('Meca EBA se desploma al quedarse sin Furor', m.location === 'discard', 'location=' + m.location);
        check('...sin dar Retribución', (g.players.p2.retribution || []).length === 0);
    }

    console.log('\n--- `salvoSi` congela el tic, y la bandera se consume ---');
    {
        const { ctx, g } = await partida('nueva', conReloj(3));
        const d = g.players.p1.vanguard[0];
        await ejecutarPaso(ctx, g, { habilidad: 'Diego Antonio' });
        await ejecutarPaso(ctx, g, { confirmar: true });
        check('PACIFISMO cobra sus 3 de Furor', d.furor === 0, 'furor=' + d.furor);
        check('...y enciende la bandera', d.pacifismoActive === true, 'bandera=' + d.pacifismoActive);

        await ejecutarPaso(ctx, g, { finTurno: true });
        check('ese turno el reloj NO baja', d.counters.diego_timer.count === 3,
            'contador=' + d.counters.diego_timer.count);
        check('...y la bandera se ha consumido', !d.pacifismoActive, 'bandera=' + d.pacifismoActive);

        await ejecutarPaso(ctx, g, { finTurno: true });   // turno del rival: tampoco baja
        check('el turno del rival tampoco lo baja', d.counters.diego_timer.count === 3,
            'contador=' + d.counters.diego_timer.count);

        await ejecutarPaso(ctx, g, { finTurno: true });   // siguiente turno propio: ya sin bandera
        check('al siguiente turno propio vuelve a bajar', d.counters.diego_timer.count === 2,
            'contador=' + d.counters.diego_timer.count);
    }

    console.log(`\nSUITE cuenta_atras: ${comprobaciones - fallos}/${comprobaciones} comprobaciones`
        + (fallos ? ` — ${fallos} FALLOS` : ' — RELOJES CORRECTOS'));
    if (fallos) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
