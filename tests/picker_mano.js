// tests/picker_mano.js — elegir una carta DE LA MANO (7-ago-2026).
//
// Antes, cualquier elección sobre una mano abría `openVisualSearchModal`: un modal que saca las
// cartas de su sitio y las lista aparte. Toto pidió el mismo lenguaje visual que el tablero —
// oscurecer todo menos la mano y clicar la carta — con dos matices suyos:
//   · Si TODA la mano es elegible, NO se pinta reborde verde: no discriminaría nada y solo mete
//     ruido (`_manoEnteraElegible`).
//   · Si no hay ninguna carta elegible, no se abre nada y se avisa por el log, como siempre.
//
// Y una variante que salió de ahí: elegir de la mano del RIVAL **a ciegas**. El modal genérico
// se la DIBUJABA entera, o sea que Zoe (SISAR) te enseñaba la mano rival y elegías con la
// información puesta — cosa que su texto no promete. Con el picker se ven los DORSOS.
//
// Se reutiliza `pickBoardTargets` con `{mano:true}` en vez de escribir un picker nuevo: así el
// chooser, el cancelado, la cola de red y el reanudar-perfecto se heredan ya resueltos. Por eso
// el arnés ve estas elecciones como `elegirTablero`: SON el mismo picker.
//
//   node tests/picker_mano.js

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
async function mesa(esc, monedas) {
    const ctx = crearContexto('nueva');
    ctx.semilla = 1;
    if (monedas) ctx.monedas = monedas.map(m => m === 'cara' ? 'heads' : m === 'cruz' ? 'tails' : m);
    const g = crearJuego(ctx);
    await asentar(ctx);
    construirEstado(ctx, g, esc);
    return { ctx, g, paso: (p) => ejecutarPaso(ctx, g, p) };
}
const MAZO = ['Mini-tigre', 'Mini-tigre', 'Mini-tigre', 'Mini-tigre', 'Mini-tigre'];

(async () => {
    console.log('--- Dobla la ropa: elige 3 de TU mano, en la mano (no en un modal) ---');
    {
        const { ctx, g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Mini-tigre'], mazo: MAZO,
                  mano: ['Dobla la ropa', 'Longaniza', 'Oso con armadura', 'Guardia', 'Droide antidisturbios'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ jugar: 'Dobla la ropa' });
        const pend = ctx.pendientes[0] || {};
        check('abre el PICKER, no el modal genérico', pend.tipo === 'elegirTablero', 'tipo=' + pend.tipo);
        check('...marcado como elección de MANO', g.dslPick && g.dslPick.mano === true);
        check('...sobre MI mano', g.dslPick && g.dslPick.manoDe === 'p1', 'manoDe=' + (g.dslPick && g.dslPick.manoDe));
        // La propia Dobla la ropa NO está en el pool (se está jugando), así que la mano NO es
        // "entera elegible" y el reborde verde SÍ aporta: distingue qué puedes descartar.
        check('la mano no es entera elegible -> SÍ hay reborde verde', g._manoEnteraElegible() === false);
        check('...y el pool son las 4 descartables, sin la propia carta jugada',
            (pend.pool || []).length === 4 && !(pend.pool || []).some(c => c.name === 'Dobla la ropa'),
            JSON.stringify((pend.pool || []).map(c => c.name)));
        await paso({ elegir: ['Longaniza', 'Oso con armadura', 'Guardia'] });
        check('las 3 elegidas van al descarte',
            ['Longaniza', 'Oso con armadura', 'Guardia'].every(n => g.players.p1.discard.some(c => c.name === n)),
            JSON.stringify(g.players.p1.discard.map(c => c.name)));
    }

    console.log('\n--- Zoe (SISAR): la mano del RIVAL, a ciegas ---');
    {
        const { ctx, g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Zoe', furor: 3 }] },
            p2: { vanguardia: ['Mini-tigre'], mano: ['Longaniza', 'Oso con armadura', 'Guardia'] },
        }, ['cara']);
        await paso({ habilidad: 'Zoe' });
        await paso({ confirmar: true });
        const pend = ctx.pendientes[0] || {};
        check('abre el PICKER sobre la mano rival', pend.tipo === 'elegirTablero' && g.dslPick.mano === true);
        check('...apuntando a la mano del RIVAL', g.dslPick.manoDe === 'p2', 'manoDe=' + g.dslPick.manoDe);
        check('...con TODA la mano elegible', (pend.pool || []).length === 3, JSON.stringify((pend.pool || []).map(c => c.name)));
        // La clave de "a ciegas": con la mano entera elegible no se pinta reborde en ninguna, así
        // que no hay forma de distinguirlas — que es justo el punto.
        check('...y por eso NO se pinta reborde verde (se elige a ciegas)', g._manoEnteraElegible() === true);
        await paso({ elegir: ['Oso con armadura'] });
        check('la carta elegida sale de la mano rival', !g.players.p2.hand.some(c => c.name === 'Oso con armadura'),
            JSON.stringify(g.players.p2.hand.map(c => c.name)));
        check('...y cae a SU pila de descartes', g.players.p2.discard.some(c => c.name === 'Oso con armadura'));
    }

    console.log('\n--- Karlitos (APRENDIZ DE ARMAS): filtra la mano, así que el reborde SÍ discrimina ---');
    {
        const { ctx, g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Karlitos', furor: 1 }], mazo: MAZO,
                  mano: ['Espada V', 'Longaniza', 'Mini-tigre'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ habilidad: 'Karlitos' });
        await paso({ confirmar: true });
        const pend = ctx.pendientes[0] || {};
        check('solo el arma es elegible', (pend.pool || []).length === 1 && pend.pool[0].name === 'Espada V',
            JSON.stringify((pend.pool || []).map(c => c.name)));
        check('...así que la mano NO es entera elegible: reborde verde puesto', g._manoEnteraElegible() === false);
    }

    console.log('\n--- Sin cartas elegibles: no se abre nada ---');
    {
        // Nigromántica ofrece descartar un Necronomicón para ganar Furor. Sin ninguno en la mano
        // el ELEGIR es `opcional`, así que se salta en silencio: no debe abrirse ningún picker.
        const { ctx, g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Nigromántica', furor: 1 }], descartes: ['Mini-tigre'], mano: ['Longaniza'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ habilidad: 'Nigromántica' });
        await paso({ confirmar: true });
        await paso({ elegir: ['Mini-tigre'] });   // el visor de descartes
        check('sin Necronomicón en mano, NO se abre picker alguno', ctx.pendientes.length === 0,
            'pendientes=' + JSON.stringify(ctx.pendientes.map(p => p.tipo)));
        check('...y la Activa se resuelve igual', g.players.p1.vanguard.some(c => c.name === 'Mini-tigre'));
    }
    {
        // Y con el Necronomicón en mano, SÍ se abre — sobre la mano propia.
        const { ctx, g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Nigromántica', furor: 1 }], descartes: ['Mini-tigre'], mano: ['Necronomicón', 'Longaniza'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ habilidad: 'Nigromántica' });
        await paso({ confirmar: true });
        await paso({ elegir: ['Mini-tigre'] });
        const pend = ctx.pendientes[0] || {};
        check('con Necronomicón en mano SÍ se abre el picker', pend.tipo === 'elegirTablero' && g.dslPick.mano === true,
            'tipo=' + pend.tipo);
        check('...y solo el Necronomicón es elegible (reborde verde)',
            (pend.pool || []).length === 1 && g._manoEnteraElegible() === false,
            JSON.stringify((pend.pool || []).map(c => c.name)));
        await paso({ elegir: ['Necronomicón'] });
        check('se descarta y da su Furor', g.players.p1.discard.some(c => c.name === 'Necronomicón'));
    }

    console.log(`\nSUITE picker_mano: ${comprobaciones - fallos}/${comprobaciones} comprobaciones`
        + (fallos ? ` — ${fallos} FALLOS` : ' — PICKER DE MANO CORRECTO'));
    if (fallos) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
