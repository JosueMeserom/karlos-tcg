// tests/oculto.js — ESCONDITE FRÁGIL: la regla universal que impide el candado del Oculto.
//
// EL PROBLEMA QUE RESUELVE (Toto, 23-ago-2026). El Oculto está diseñado para obligar al rival a
// llevar respuestas: ataques especiales, daño sin atacar. Si no las lleva —o se le acaban—, una
// carta Oculta a la que además no se puede llegar de ninguna otra forma CIERRA la partida: eres
// intocable y le desgastas la Retribución sin que pueda hacer nada. No es "difícil de ganar", es
// que no hay jugada posible.
//
// LA REGLA: al final de tu turno, si tu rival no tiene NADA a lo que atacar (ni una carta tuya
// alcanzable ni el ataque directo), cada carta Oculta tuya echa una moneda; con cruz queda
// expuesta durante todo el turno del rival.
//
// ALCANCE (comprobado abajo): la moneda se mira al terminar TU turno, así que alcanza a los
// Ocultos que ya están puestos -los permanentes, que son los que montan el candado de verdad- y
// no a los que llegan al empezar el turno del rival (el camuflaje de Mill). No hace falta que los
// alcance: quien se camufla por no atacar no está desgastando a nadie.
//
// La condición NO es "es tu única carta" sino "no hay a quién atacar", y eso importa: así se
// cubren solos los casos que aún no existen (una carta que viva siempre en retaguardia, dos
// Ocultas tapándose entre ellas) y también el contrario (si el rival puede atacar Ocultos, no hay
// candado y no hay moneda). Se pregunta con el MISMO predicado que decide un ataque normal.
//
// Antes esto era la Pasiva de Edrielle, con dos diferencias que la hacían casi inofensiva: la
// moneda era al EMPEZAR su turno —así que podías anular el resultado colocando cualquier aliado
// después— y solo la miraba ella.
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
function check(t, ok, extra) {
    comprobaciones++;
    if (ok) console.log('  OK    · ' + t);
    else { fallos++; console.log('  FALLO · ' + t + (extra ? '  [' + extra + ']' : '')); }
}
async function mesa(esc, monedas = []) {
    const ctx = crearContexto('nueva'); ctx.semilla = 1;
    const g = crearJuego(ctx); await asentar(ctx);
    construirEstado(ctx, g, esc);
    ctx.monedas = monedas.map(m => (m === 'cara' ? 'heads' : m === 'cruz' ? 'tails' : m));
    return {
        ctx, g,
        paso: async (p) => { await ejecutarPaso(ctx, g, p); await asentar(ctx); },
        logs: () => g.logHistory.map(e => e.msg),
        monedasSinUsar: () => ctx.monedas.length,
    };
}

(async () => {
    console.log('--- Sola y Oculta: la moneda decide ---');
    {
        // Edrielle es Oculta PERMANENTE por Pasiva: aun así, el escondite frágil la alcanza.
        const { g, paso, logs } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Edrielle'] },
            p2: { vanguardia: ['Mini-tigre'] },
        }, ['cruz']);
        const edrielle = g.players.p1.vanguard[0];
        g.updatePassives();
        check('empieza Oculta', edrielle.stealth === true);
        await paso({ finTurno: true });
        check('con CRUZ queda expuesta', edrielle._expuesto === true);
        check('...y el motor deja de verla Oculta, aunque su Pasiva la reponga',
            edrielle.stealth === false, 'stealth=' + edrielle.stealth);
        check('...y se cuenta', logs().some(m => m.includes('expuesta durante el turno del rival')));
    }
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Edrielle'] },
            p2: { vanguardia: ['Mini-tigre'] },
        }, ['cara']);
        const edrielle = g.players.p1.vanguard[0];
        await paso({ finTurno: true });
        check('con CARA sigue escondida', !edrielle._expuesto && edrielle.stealth === true);
    }

    console.log('--- La exposición dura el turno del rival y se acaba con el tuyo ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Edrielle'] },
            p2: { vanguardia: ['Mini-tigre'] },
        }, ['cruz']);
        const edrielle = g.players.p1.vanguard[0];
        await paso({ finTurno: true });          // p1 -> p2: expuesta
        check('durante el turno del rival, expuesta', edrielle.stealth === false);
        await paso({ finTurno: true });          // p2 -> p1: vuelve su turno
        check('al volver su turno, escondida otra vez', edrielle.stealth === true && !edrielle._expuesto);
    }

    console.log('--- Con alguien a quien atacar, no hay moneda ---');
    {
        // El Mini-tigre aliado SÍ es alcanzable: el rival tiene a quién pegar, así que Edrielle
        // se esconde detrás de algo de verdad y la regla no entra. Sin monedas guionizadas: si
        // pidiera una, el arnés lo cantaría.
        const { g, paso, monedasSinUsar } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Edrielle', 'Mini-tigre'] },
            p2: { vanguardia: ['Oso con armadura'] },
        });
        const edrielle = g.players.p1.vanguard[0];
        await paso({ finTurno: true });
        check('no se echa moneda', monedasSinUsar() === 0);
        check('...y sigue Oculta', edrielle.stealth === true && !edrielle._expuesto);
    }

    console.log('--- Si el rival PUEDE atacar Ocultos, tampoco hay candado ---');
    {
        // Simon puede atacar a enemigos Ocultos de vanguardia (OJO BIÓNICO), así que no hay
        // partida cerrada y la moneda no entra. Es el mismo predicado que usa un ataque normal:
        // no hay que enumerar quién puede y quién no.
        const { g, paso, monedasSinUsar } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Edrielle'] },
            p2: { vanguardia: ['Simon'] },
        });
        const edrielle = g.players.p1.vanguard[0];
        await paso({ finTurno: true });
        check('no se echa moneda', monedasSinUsar() === 0);
        check('...y sigue Oculta', edrielle.stealth === true);
    }

    console.log('--- El Oculto que llega DESPUÉS (Mill) no entra, y está bien que no entre ---');
    {
        // HALLAZGO al escribir esta suite: el camuflaje de Mill se aplica al EMPEZAR el turno del
        // rival, así que al terminar el suyo -que es cuando se mira el candado- todavía no está
        // Oculto y no echa moneda.
        //
        // Y no hace falta que la eche: el candado de verdad lo montan los Ocultos PERMANENTES,
        // que pueden atacarte cada turno sin dejar de ser intocables. Mill no puede: si ataca
        // pierde el camuflaje, y si no ataca no te está desgastando. Esconderse sin pegar no
        // cierra ninguna partida, solo la alarga.
        const { g, paso, monedasSinUsar } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Mill'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        const mill = g.players.p1.vanguard[0];
        await paso({ finTurno: true });
        check('Mill se camufla al terminar su turno', mill.stealth === true);
        check('...sin echar moneda: cuando se mira el candado aún no estaba Oculto',
            monedasSinUsar() === 0 && mill._expuesto !== true);
    }

    console.log('');
    if (fallos) { console.log(`SUITE oculto: ${fallos} FALLOS de ${comprobaciones} comprobaciones`); process.exit(1); }
    console.log(`SUITE oculto: ${comprobaciones}/${comprobaciones} comprobaciones — ESCONDITE FRÁGIL EN VERDE`);
})().catch(e => { console.error(e); process.exit(1); });
