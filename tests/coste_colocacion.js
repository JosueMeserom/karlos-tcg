// tests/coste_colocacion.js — el trigger COSTE_COLOCACION (20-ago-2026).
//
// "Coste: N de Furor de un aliado" lo pedían DIEZ cartas y las diez lo resolvían llamando a mano
// a `DSL.tributoFuror` desde su propio `onBeforePlayAsync`. El patrón declarativo ya existía y
// estaba probado en Garret (requisito + ANTES_DE_JUGAR con ELEGIR y MODIFICAR_STAT esCoste), así
// que COSTE_COLOCACION no inventa un mecanismo: escribe ESE, para que la carta lo diga en una
// línea y el editor no tenga que enseñar una cadena de tres efectos anidados.
//
// Aserciones directas y no viejo-vs-nuevo: la comparación con la base congelada ya la hacen las
// suites de las cartas migradas (las nueve pasan sin una sola diferencia declarada). Lo que se
// fija aquí es el CONTRATO de la pieza, que es lo que van a heredar las cartas futuras.
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
const enCampo = (g, pid, n) => [...g.players[pid].vanguard, ...g.players[pid].rearguard].find(c => c.name === n);
const enMano = (g, pid, n) => g.players[pid].hand.some(c => c.name === n);

(async () => {
    console.log('--- El tributo se cobra al ELEGIR, no antes ---');
    {
        const { ctx, g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 3 }], mano: ['Raiju'] },
            p2: { vanguardia: ['Aniceto'] },
        });
        const mt = enCampo(g, 'p1', 'Mini-tigre');
        await paso({ jugar: 'Raiju' });
        check('al clicar la carta aún no ha pagado nadie', mt.furor === 3, 'furor=' + mt.furor);
        check('...y la carta sigue en la mano', enMano(g, 'p1', 'Raiju'),
            'mano=' + g.players.p1.hand.map(c => c.name).join(','));
        check('...con la elección de pagador abierta y cancelable',
            (ctx.pendientes[0] || {}).tipo === 'elegirTablero', JSON.stringify((ctx.pendientes[0] || {}).tipo));
        await paso({ elegir: ['Mini-tigre'] });
        check('al elegir, se cobra', mt.furor === 2, 'furor=' + mt.furor);
        check('...y la carta entra al campo', !!enCampo(g, 'p1', 'Raiju'));
    }
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 3 }], mano: ['Raiju'] },
            p2: { vanguardia: ['Aniceto'] },
        });
        const mt = enCampo(g, 'p1', 'Mini-tigre');
        await paso({ jugar: 'Raiju' });
        await paso({ cancelar: true });
        check('cancelar el tributo no cuesta nada', mt.furor === 3, 'furor=' + mt.furor);
        check('...y la carta se queda en la mano', enMano(g, 'p1', 'Raiju'));
        check('...sin entrar al campo', !enCampo(g, 'p1', 'Raiju'));
    }

    console.log('\n--- Sin nadie que pueda pagar, la carta no se juega ---');
    {
        const { ctx, g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            // Nadie llega a 2: el Mini-tigre tiene 1 y el otro, 0.
            p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 1 }, { carta: 'Limo artificial', furor: 0 }],
                  mano: ['Súcubo'] },
            p2: { vanguardia: ['Aniceto'] },
        });
        await paso({ jugar: 'Súcubo' });
        check('no se coloca', !enCampo(g, 'p1', 'Súcubo'));
        check('...sigue en la mano', enMano(g, 'p1', 'Súcubo'));
        check('...y no se abre ninguna elección', ctx.pendientes.length === 0,
            'pendientes=' + ctx.pendientes.length);
        check('nadie ha perdido Furor', enCampo(g, 'p1', 'Mini-tigre').furor === 1);
    }

    console.log('\n--- Quién puede pagar ---');
    {
        // Un Avatar (Kami) es intocable: ni siquiera para pagar un tributo. Lo excluyen `count`
        // y `ELEGIR` por defecto, así que la pieza lo hereda sin decir nada — y por eso mismo
        // conviene fijarlo: si algún día se tocara ese defecto, esto lo diría.
        const { ctx, g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Kami', furor: 5 }, { carta: 'Mini-tigre', furor: 2 }],
                  mano: ['Oni ancho'] },
            p2: { vanguardia: ['Aniceto'] },
        });
        await paso({ jugar: 'Oni ancho' });
        const pool = ((ctx.pendientes[0] || {}).pool || []).map(c => c.name);
        check('el Avatar no aparece como pagador posible',
            pool.length === 1 && pool[0] === 'Mini-tigre', 'pool=[' + pool.join(', ') + ']');
        await paso({ elegir: ['Mini-tigre'] });
        check('paga el que se elige', enCampo(g, 'p1', 'Mini-tigre').furor === 0);
        check('...y el Avatar no ha tocado su Furor', enCampo(g, 'p1', 'Kami').furor === 5);
    }
    {
        // La RETAGUARDIA también paga: el tributo mira todo tu campo, no solo la primera fila.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 0 }], retaguardia: [{ carta: 'Aniceto', furor: 4 }],
                  mano: ['Edrielle'] },
            p2: { vanguardia: ['Karolina'] },
        });
        await paso({ jugar: 'Edrielle' });
        await paso({ elegir: ['Aniceto'] });
        check('un aliado de retaguardia puede pagar el tributo',
            enCampo(g, 'p1', 'Aniceto').furor === 0, 'furor=' + enCampo(g, 'p1', 'Aniceto').furor);
        check('...y la carta entra', !!enCampo(g, 'p1', 'Edrielle'));
    }

    console.log('\n--- El "o bien": varias formas de pagar el peaje ---');
    {
        // Karlos (KL): "Karolina, Karlitos o Igniz en tu campo O BIEN 2 de Furor". Manda la
        // PRIMERA alternativa que se cumpla, y el orden es el del texto: primero lo que no cuesta
        // nada, así el jugador no tiene que elegir entre gratis y pagando -que no es una elección-.
        const { ctx, g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Karolina', furor: 3 }], mano: ['Karlos (KL)'] },
            p2: { vanguardia: ['Aniceto'] },
        });
        await paso({ jugar: 'Karlos (KL)' });
        check('con un amigo delante entra GRATIS', !!enCampo(g, 'p1', 'Karlos (KL)'));
        check('...sin preguntar nada a nadie', ctx.pendientes.length === 0, 'pendientes=' + ctx.pendientes.length);
        check('...y sin tocarle el Furor a Karolina', enCampo(g, 'p1', 'Karolina').furor === 3,
            'furor=' + enCampo(g, 'p1', 'Karolina').furor);
        check('...anunciándolo', g.logHistory.some(e => /se une al grupo sin cobrar/.test(e.msg)));
    }
    {
        // Sin amigos, cae a la segunda alternativa: el tributo de siempre.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 3 }], mano: ['Karlos (KL)'] },
            p2: { vanguardia: ['Aniceto'] },
        });
        await paso({ jugar: 'Karlos (KL)' });
        await paso({ elegir: ['Mini-tigre'] });
        check('sin amigos, se paga el tributo', enCampo(g, 'p1', 'Mini-tigre').furor === 1,
            'furor=' + enCampo(g, 'p1', 'Mini-tigre').furor);
        check('...y entra igualmente', !!enCampo(g, 'p1', 'Karlos (KL)'));
    }
    {
        // El amigo vale AUNQUE no tenga Furor: es un requisito, no un pago.
        const { ctx, g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Igniz', furor: 0 }], mano: ['Karlos (KL)'] },
            p2: { vanguardia: ['Aniceto'] },
        });
        await paso({ jugar: 'Karlos (KL)' });
        check('el amigo vale aunque esté a 0 de Furor', !!enCampo(g, 'p1', 'Karlos (KL)') && ctx.pendientes.length === 0);
    }
    {
        // Y si no se cumple NINGUNA, la carta no se juega.
        const { ctx, g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 1 }], mano: ['Karlos (KL)'] },
            p2: { vanguardia: ['Aniceto'] },
        });
        await paso({ jugar: 'Karlos (KL)' });
        check('sin amigos y sin Furor suficiente, no se coloca', !enCampo(g, 'p1', 'Karlos (KL)'));
        check('...se queda en la mano', enMano(g, 'p1', 'Karlos (KL)'));
        check('...y no se abre ninguna elección', ctx.pendientes.length === 0);
    }

    console.log('\n' + (fallos
        ? `SUITE coste_colocacion: ${comprobaciones - fallos}/${comprobaciones} comprobaciones — ${fallos} FALLOS`
        : `SUITE coste_colocacion: ${comprobaciones}/${comprobaciones} comprobaciones — LA PIEZA CUMPLE`));
    if (fallos) process.exit(1);
})();
