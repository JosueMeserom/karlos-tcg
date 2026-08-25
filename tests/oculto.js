// tests/oculto.js — ESCONDITE FRÁGIL: la regla universal que impide el candado del Oculto.
//
// EL PROBLEMA QUE RESUELVE (Toto, 23-ago-2026). El Oculto está diseñado para obligar al rival a
// llevar respuestas: ataques especiales, daño sin atacar. Si no las lleva —o se le acaban—, una
// carta Oculta a la que además no se puede llegar de ninguna otra forma CIERRA la partida: eres
// intocable y le desgastas la Retribución sin que pueda hacer nada. No es "difícil de ganar", es
// que no hay jugada posible.
//
// LA REGLA: si al final de tu Fase de efectos iniciales no tienes NADA a lo que atacar (ni una
// carta suya alcanzable ni el ataque directo), echas una moneda POR CADA carta Oculta del rival:
// con CARA se le quita ese Oculto durante este turno. La tiras tú, el bloqueado, y cara es el
// resultado bueno para quien lanza, como en todas las monedas del juego.
//
// NO alcanza a una carta Oculta que además esté AGOTADA: si no puede actuar no está encerrando a
// nadie (Zoe entrenando, alguien paralizado por el PEM).
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
    // El candado se mira al final de los Efectos Iniciales de quien está bloqueado, así que los
    // escenarios pasan turno UNA vez: la moneda cae al empezar el turno del que no puede atacar.
    console.log('--- Sola y Oculta: la moneda decide ---');
    {
        // Edrielle es Oculta PERMANENTE por Pasiva: aun así, el escondite frágil la alcanza.
        const { g, paso, logs } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Edrielle'] },
            p2: { vanguardia: ['Mini-tigre'] },
        }, ['cara']);
        const edrielle = g.players.p1.vanguard[0];
        g.updatePassives();
        check('empieza Oculta', edrielle.stealth === true);
        await paso({ finTurno: true });
        check('con CARA queda expuesta', edrielle._expuesto === true);
        check('...y el motor deja de verla Oculta, aunque su Pasiva la reponga',
            edrielle.stealth === false, 'stealth=' + edrielle.stealth);
        check('...y se cuenta', logs().some(m => m.includes('expuesta durante este turno')));
        check('...en el turno de quien estaba bloqueado', g.activePlayerId === 'p2');
    }
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Edrielle'] },
            p2: { vanguardia: ['Mini-tigre'] },
        }, ['cruz']);
        const edrielle = g.players.p1.vanguard[0];
        await paso({ finTurno: true });
        check('con CRUZ sigue escondida', !edrielle._expuesto && edrielle.stealth === true);
    }

    console.log('--- La exposición dura ese turno y se acaba con el siguiente ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Edrielle'] },
            p2: { vanguardia: ['Mini-tigre'] },
        }, ['cara']);
        const edrielle = g.players.p1.vanguard[0];
        await paso({ finTurno: true });          // turno de p2: expuesta y atacable
        check('durante el turno del bloqueado, expuesta', edrielle.stealth === false);
        await paso({ finTurno: true });          // vuelve el turno de p1
        check('al turno siguiente, escondida otra vez', edrielle.stealth === true && !edrielle._expuesto);
    }

    console.log('--- Con alguien a quien atacar, no hay moneda ---');
    {
        // El Mini-tigre aliado SÍ es alcanzable: p2 tiene a quién pegar, así que Edrielle se
        // esconde detrás de algo de verdad. Sin monedas guionizadas: si pidiera una, se vería.
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

    console.log('--- Si el bloqueado PUEDE atacar Ocultos, tampoco hay candado ---');
    {
        // Simon puede atacar a enemigos Ocultos de vanguardia (OJO BIÓNICO): no hay partida
        // cerrada y la moneda no entra. Mismo predicado que usa un ataque normal.
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

    console.log('--- También alcanza al Oculto TEMPORAL (Mill) ---');
    {
        // Mill se camufla al terminar su turno, así que cuando el rival llega a sus Efectos
        // Iniciales SÍ está Oculto: por eso el candado se mira aquí y no al final del turno del
        // que se esconde (Toto, 23-ago-2026). En la primera versión, Mill no entraba nunca.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Mill'] },
            p2: { vanguardia: ['Mini-tigre'] },
        }, ['cara']);
        const mill = g.players.p1.vanguard[0];
        await paso({ finTurno: true });
        check('Mill camuflado y solo también echa moneda', mill._expuesto === true);
        check('...y queda al descubierto', mill.stealth === false);
    }

    console.log('--- Una Oculta AGOTADA no encierra a nadie: exenta ---');
    {
        // Zoe entrenando está Oculta y agotada mientras dure 'Entrenamiento arduo': no puede
        // atacar, así que no es ella quien cierra la partida y la moneda no la toca (Toto,
        // 23-ago-2026). Vale igual para cualquiera que no pueda actuar, p. ej. paralizado.
        const { g, paso, monedasSinUsar } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Zoe'], evento: { carta: 'Entrenamiento arduo', duracion: 3 } },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        const zoe = g.players.p1.vanguard[0];
        g.updatePassives();
        check('Zoe entrenando está Oculta y agotada', zoe.stealth === true && zoe.exhausted === true);
        await paso({ finTurno: true });
        check('...y no se le echa moneda', monedasSinUsar() === 0 && zoe._expuesto !== true);
        check('...sigue entrenando a salvo', zoe.stealth === true);
    }

    console.log('');
    if (fallos) { console.log(`SUITE oculto: ${fallos} FALLOS de ${comprobaciones} comprobaciones`); process.exit(1); }
    console.log(`SUITE oculto: ${comprobaciones}/${comprobaciones} comprobaciones — ESCONDITE FRÁGIL EN VERDE`);
})().catch(e => { console.error(e); process.exit(1); });
