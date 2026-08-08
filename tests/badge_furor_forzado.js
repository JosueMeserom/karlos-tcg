// tests/badge_furor_forzado.js — la X roja del badge de Furor (7-ago-2026).
//
// Bancarrota ya la tenía (fija Furor a 0 para TODOS vía GLOBAL_ANTES_DE_CAMBIO_STAT, que
// intercepta CUALQUIER cambio). Toto pidió lo mismo para Deuda con la mafia, que bloquea
// Furor de un modo distinto y más estrecho: solo GANANCIAS de la fase de Furor
// (GLOBAL_MODIFICAR_FUROR / onGlobalBeforeGainFuror), para que un drenaje enemigo contra el
// deudor SIGA funcionando -el texto dice "no gana Furor", no "es inmune a perderlo"-.
//
// `_statForzadoPorEvento` (index.html), que pinta el badge, solo sondeaba el hook de
// Bancarrota. Se le añadió el sondeo del hook de Deuda, con la MISMA fuente ('fase_furor')
// que la fase real usa -si no, el sondeo no ve nada y el badge no sale-. Ningún cambio de
// mecánica: Deuda sigue bloqueando exactamente lo mismo que antes, solo que ahora el badge
// lo refleja. Por eso este fichero es de ASERCIÓN (comprueba el método directamente), no
// comparativo: no hay nada que la base vieja pueda comparar, es puramente visual/nuevo.
//
//   node tests/badge_furor_forzado.js

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
async function mesa(esc) {
    const ctx = crearContexto('nueva');
    ctx.semilla = 1;
    const g = crearJuego(ctx);
    await asentar(ctx);
    construirEstado(ctx, g, esc);
    return { ctx, g, paso: (p) => ejecutarPaso(ctx, g, p) };
}
const buscar = (g, pid, nombre) => [...g.players[pid].vanguard, ...g.players[pid].rearguard].find(c => c.name === nombre);

(async () => {
    console.log('--- Deuda con la mafia: el badge rojo reconoce el bloqueo de Furor ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Oso con armadura', furor: 0 }, { carta: 'Mini-tigre', furor: 0 }], mano: ['Deuda con la mafia'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ jugar: 'Deuda con la mafia' });
        await paso({ elegir: ['Oso con armadura'] });
        // 'ganancia', NO 'total': Deuda solo corta la ENTRADA de Furor, así que el badge lleva
        // su propia marca (un "+" tachado ámbar) y el número se ve normal — lo que la carta ya
        // tiene lo puede gastar. Distinguirlos es justo lo que pidió Toto.
        check('el deudor está bloqueado SOLO en la ganancia',
            g._statForzadoPorEvento(buscar(g, 'p1', 'Oso con armadura'), 'furor') === 'ganancia');
        check('el resto de aliados no está bloqueado', g._statForzadoPorEvento(buscar(g, 'p1', 'Mini-tigre'), 'furor') === null);
        check('un enemigo tampoco (Deuda no le afecta)', g._statForzadoPorEvento(g.players.p2.vanguard[0], 'furor') === null);
    }

    console.log('\n--- Bancarrota sigue intacta (no se tocó su camino) ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { mano: ['Bancarrota'] },
            p2: { vanguardia: [{ carta: 'Mini-tigre', furor: 2 }] },
        });
        await paso({ jugar: 'Bancarrota' });
        check('Bancarrota bloquea en TOTAL (X roja, número apagado)',
            g._statForzadoPorEvento(g.players.p2.vanguard[0], 'furor') === 'total');
    }

    console.log('\n--- Sin ningún Evento activo, nadie está forzado ---');
    {
        const { g } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Mini-tigre'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        check('sin Eventos, el badge normal (no forzado)', g._statForzadoPorEvento(g.players.p1.vanguard[0], 'furor') === null);
    }

    console.log(`\nSUITE badge_furor_forzado: ${comprobaciones - fallos}/${comprobaciones} comprobaciones`
        + (fallos ? ` — ${fallos} FALLOS` : ' — BADGE CORRECTO'));
    if (fallos) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
