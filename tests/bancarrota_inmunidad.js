// tests/bancarrota_inmunidad.js — inmunidad a Bancarrota (5-ago-2026), motor real.
//
// NO es una suite viejo-vs-nueva: el bug vivía en public/index.html (el motor, compartido por
// AMBAS bases), así que el arnés comparativo nunca lo habría visto -las dos bases se hubieran
// comportado IGUAL de mal, sin diff que detectar-. Se prueba con aserciones directas, como
// carta_neo.js/reconexion_cliente.js.
//
// Historia: Bancarrota se migró al DSL con un interceptor genérico (GLOBAL_ANTES_DE_CAMBIO_STAT)
// que sí respetaba la inmunidad a Eventos enemigos (Eris) y a Avatares (Kami) desde el principio
// -pero solo en el CONGELADO inicial (SECUESTRAR_STAT) y en ESE interceptor-. Betasteando en
// vivo, Toto encontró que Eris y Kami SEGUÍAN sin ganar Furor y mostrando la X roja: quedaba un
// bloqueo LEGADO, hardcodeado por NOMBRE ("¿hay una Bancarrota en juego?", sin mirar a QUIÉN
// afecta) tanto en modifyStat (bloqueaba la ganancia de la fase de Furor) como en el render del
// badge (pintaba la X a cualquiera, inmune o no). Se quitó el primero (redundante con el
// interceptor genérico) y el segundo se sustituyó por `_statForzadoPorEvento`, que reutiliza el
// MISMO interceptor -así que cualquier carta futura con este trigger queda cubierta gratis-.
//
// Se ejecuta aparte de la batería: `node tests/bancarrota_inmunidad.js`.

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

async function escenario(spec) {
    const ctx = crearContexto('nueva');
    ctx.semilla = 1;
    const g = crearJuego(ctx);
    await asentar(ctx);
    construirEstado(ctx, g, spec);
    return { ctx, g };
}

(async () => {
    console.log('--- Bancarrota: Eris (rival, inmune a Eventos enemigos) y Oso (rival, control) ---');
    {
        const { ctx, g } = await escenario({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Karlos', furor: 3 }], mano: ['Bancarrota'] },
            p2: { vanguardia: [{ carta: 'Eris', furor: 2 }, { carta: 'Oso con armadura', furor: 2 }] },
        });
        await g.playCard(g.players.p1.hand.find(c => c.name === 'Bancarrota').instanceId);
        await asentar(ctx);
        const karlos = g.players.p1.vanguard[0];
        const eris = g.players.p2.vanguard.find(c => c.name === 'Eris');
        const oso = g.players.p2.vanguard.find(c => c.name === 'Oso con armadura');

        check('Karlos (dueño de Bancarrota) se congela a 0', karlos.furor === 0, 'furor=' + karlos.furor);
        check('Oso (rival, sin inmunidad) se congela a 0', oso.furor === 0, 'furor=' + oso.furor);
        check('Eris (rival, inmune a Eventos enemigos) NO se congela', eris.furor === 2, 'furor=' + eris.furor);

        g.modifyStat(karlos, 'furor', 1, 0, 'fase_furor');
        g.modifyStat(oso, 'furor', 1, 0, 'fase_furor');
        g.modifyStat(eris, 'furor', 1, 0, 'fase_furor');
        check('Karlos no gana Furor en la fase de Furor', karlos.furor === 0, 'furor=' + karlos.furor);
        check('Oso no gana Furor en la fase de Furor', oso.furor === 0, 'furor=' + oso.furor);
        check('Eris SÍ gana Furor con normalidad', eris.furor === 3, 'furor=' + eris.furor);

        check('badge/X: Karlos aparece forzado', g._statForzadoPorEvento(karlos, 'furor') === true);
        check('badge/X: Oso aparece forzado', g._statForzadoPorEvento(oso, 'furor') === true);
        check('badge/X: Eris NO aparece forzada (sin X roja)', g._statForzadoPorEvento(eris, 'furor') === false);
    }

    console.log('\n--- Bancarrota: Kami, propia dueña del Evento (Avatar, inmune a TODO) ---');
    {
        const { ctx, g } = await escenario({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Kami', furor: 3 }], mano: ['Bancarrota'] },
            p2: {},
        });
        await g.playCard(g.players.p1.hand.find(c => c.name === 'Bancarrota').instanceId);
        await asentar(ctx);
        const kami = g.players.p1.vanguard[0];
        check('Kami no se congela aunque sea SU PROPIA Bancarrota', kami.furor === 3, 'furor=' + kami.furor);
        g.modifyStat(kami, 'furor', 1, 0, 'fase_furor');
        check('Kami gana Furor con normalidad', kami.furor === 4, 'furor=' + kami.furor);
        check('badge/X: Kami NO aparece forzada', g._statForzadoPorEvento(kami, 'furor') === false);
    }

    console.log('\n--- Bancarrota: Kami, ENEMIGA de quien la juega (mismo resultado: Avatar = intocable) ---');
    {
        const { ctx, g } = await escenario({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Karlos', furor: 3 }], mano: ['Bancarrota'] },
            p2: { vanguardia: [{ carta: 'Kami', furor: 3 }] },
        });
        await g.playCard(g.players.p1.hand.find(c => c.name === 'Bancarrota').instanceId);
        await asentar(ctx);
        const kami = g.players.p2.vanguard[0];
        check('Kami (enemiga) tampoco se congela', kami.furor === 3, 'furor=' + kami.furor);
        g.modifyStat(kami, 'furor', 1, 0, 'fase_furor');
        check('Kami (enemiga) gana Furor con normalidad', kami.furor === 4, 'furor=' + kami.furor);
    }

    console.log('\n--- Ancla de la flecha del detalle: apunta al badge de Furor, no al centro ---');
    {
        const { ctx, g } = await escenario({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Karlos', furor: 3 }], mano: ['Bancarrota'] },
            p2: { vanguardia: [{ carta: 'Eris', furor: 2 }] },
        });
        await g.playCard(g.players.p1.hand.find(c => c.name === 'Bancarrota').instanceId);
        await asentar(ctx);
        const tpl = ctx.CARD_DB.find(c => c.name === 'Bancarrota');
        const ev = g.players.p1.activeEvent;
        const karlos = g.players.p1.vanguard[0];
        const eris = g.players.p2.vanguard.find(c => c.name === 'Eris');
        check('la flecha ancla al badge "furor" en Karlos',
            JSON.stringify(tpl.onGlobalGetPreviewBadges(ev, karlos, g)) === '["furor"]');
        check('...y NO ancla nada en Eris (inmune, sin flecha forzada)',
            JSON.stringify(tpl.onGlobalGetPreviewBadges(ev, eris, g)) === '[]');
    }

    console.log(`\nSUITE bancarrota_inmunidad: ${comprobaciones - fallos}/${comprobaciones} comprobaciones` +
        (fallos ? ` — ${fallos} FALLOS` : ' — INMUNIDAD CORRECTA'));
    if (fallos) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
