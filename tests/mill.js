// tests/mill.js — CAMUFLAJE ÓPTICO: el Oculto de Mill, ahora como ESTADO.
//
// Mill no tenía ninguna suite. Su Pasiva encendía el booleano `stealth` a pelo, que es la vista
// rápida que el motor consulta pero no lo que el jugador ve: sin chapa, sin cuenta atrás y sin
// líneas de "Afectado por:" salvo un onGetPreviewEffects escrito a mano. Al migrarla al estado
// `oculto` todo eso sale solo, así que las salidas divergen de la base congelada a propósito y
// esto son aserciones directas, no comparación.
//
// Y de paso fija el arreglo que destapó la migración: hasta hoy, el daño apagaba `stealth` pero
// NO quitaba el estado, así que la siguiente pasada de pasivas lo volvía a encender. "El daño lo
// revela" no funcionaba para NINGÚN Oculto puesto como estado (Simon incluido).
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
async function mesa(esc) {
    const ctx = crearContexto('nueva'); ctx.semilla = 1;
    const g = crearJuego(ctx); await asentar(ctx);
    construirEstado(ctx, g, esc);
    return {
        ctx, g,
        paso: async (p) => { await ejecutarPaso(ctx, g, p); await asentar(ctx); },
        logs: () => g.logHistory.map(e => e.msg),
    };
}
const MESA = {
    turno: 2, turnoDe: 'p1', empieza: 'p2',
    p1: { vanguardia: ['Mill', 'Mini-tigre'], retribucion: ['Longaniza', 'Longaniza'] },
    p2: { vanguardia: [{ carta: 'Oso con armadura', vida: 9 }] },
};
const oculto = (c) => !!(c.status && c.status.oculto && c.status.oculto.duration > 0);

(async () => {
    console.log('--- No ataca: se camufla para el turno del rival ---');
    {
        const { g, paso, logs } = await mesa(MESA);
        const mill = g.players.p1.vanguard[0];
        await paso({ finTurno: true });
        check('gana el estado Oculto', oculto(mill), JSON.stringify(mill.status));
        check('...con una cuenta de 1 turno (el del rival)', mill.status.oculto.duration === 1,
            mill.status.oculto && String(mill.status.oculto.duration));
        check('...y el motor lo ve como Oculto (stealth derivado)', mill.stealth === true);
        check('...anunciándolo', logs().some(m => m.includes('CAMUFLAJE ÓPTICO') && m.includes('(Oculto)')));
    }

    console.log('--- Ataca: no hay camuflaje ---');
    {
        const { g, paso } = await mesa(MESA);
        const mill = g.players.p1.vanguard[0];
        await paso({ atacar: 'Mill', objetivo: 'Oso con armadura' });
        await paso({ finTurno: true });
        check('no gana el Oculto', !oculto(mill));
        check('...ni queda con stealth', !mill.stealth);
    }

    console.log('--- Al empezar SU turno, el camuflaje se apaga ---');
    {
        const { g, paso, logs } = await mesa(MESA);
        const mill = g.players.p1.vanguard[0];
        await paso({ finTurno: true });   // p1 -> p2: se camufla
        check('sigue Oculto durante todo el turno del rival', oculto(mill));
        await paso({ finTurno: true });   // p2 -> p1: empieza el turno de Mill
        check('al empezar el suyo, ya no está Oculto', !oculto(mill), JSON.stringify(mill.status));
        check('...ni le queda el stealth derivado', !mill.stealth);
        check('...y se dice', logs().some(m => m.includes('apaga su Camuflaje Óptico')));
    }

    console.log('--- El daño lo revela: el estado se va, no solo el booleano ---');
    {
        // El arreglo del 23-ago-2026. Antes se apagaba `stealth` y el estado se quedaba, así que
        // la siguiente pasada de pasivas volvía a encenderlo: la carta seguía Oculta después de
        // recibir el golpe. Se comprueba con daño DIRECTO (a una carta Oculta no se la puede
        // atacar de forma normal, que es justo el sentido de la Pasiva).
        const { g, paso } = await mesa(MESA);
        const mill = g.players.p1.vanguard[0];
        await paso({ finTurno: true });
        check('de partida, Oculto', oculto(mill) && mill.stealth === true);
        g.modifyStat(mill, 'currentHp', -1);
        g.updatePassives();
        await asentar(g._ctx || { timers: [] }).catch(() => {});
        check('tras el daño, el estado desaparece', !oculto(mill), JSON.stringify(mill.status));
        check('...y no vuelve en la siguiente pasada de pasivas', !mill.stealth);
    }

    console.log('');
    if (fallos) { console.log(`SUITE mill: ${fallos} FALLOS de ${comprobaciones} comprobaciones`); process.exit(1); }
    console.log(`SUITE mill: ${comprobaciones}/${comprobaciones} comprobaciones — CAMUFLAJE ÓPTICO EN VERDE`);
})().catch(e => { console.error(e); process.exit(1); });
