// tests/costes_presenta.js — costes y requisitos enseñados en la presentación.
//
// La característica (Toto, 8-ago-2026): una carta no se presenta sola, se presenta CON lo que ha
// costado. El motor ANOTA quién paga o quién cumple el requisito (`game._costesPresenta`) y el
// cliente dibuja una flecha desde cada uno. Y `esCoste` hace además que el cobro se APARQUE hasta
// que la carta llega al escaparate, para que el "-1 FUR" salga a la vez que se enseña.
//
// Lo que se comprueba aquí no es la animación (eso lo valida Toto en el navegador) sino las dos
// cosas de las que depende y que sí son estado:
//   · que se anota a QUIÉN, con el tipo correcto (coste vs requisito);
//   · que el cobro aparcado NO SE PIERDE. Esto es lo importante: la cola de presentaciones se
//     traga las excepciones con un .catch, así que un fallo dibujando una flecha se llevaba por
//     delante un cobro entero sin dejar rastro. Por eso el drenaje tiene red de seguridad en
//     _comprometer, y por eso se prueba también el camino en el que la animación no corre.
//
//   node tests/costes_presenta.js
'use strict';
const fs = require('fs');
const path = require('path');

// El harness no exporta sus internos (solo correrSuite): se reinyecta como hacen el resto de
// suites de aserción, que necesitan montar la mesa a mano en vez de comparar vieja-vs-nueva.
const RAIZ = path.join(__dirname, '..');
const H = fs.readFileSync(path.join(RAIZ, 'tests/harness.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', 'require', '__dirname',
    H + '\n;module.exports.__i={crearContexto,crearJuego,construirEstado,asentar,ejecutarPaso};'
)(mod, mod.exports, require, path.join(RAIZ, 'tests'));
const { crearContexto, crearJuego, construirEstado, asentar, ejecutarPaso } = mod.exports.__i;

let fallos = 0, total = 0;
function check(nombre, cond, detalle) {
    total++;
    if (cond) { console.log('  OK    · ' + nombre); return; }
    fallos++;
    console.log('  FALLO · ' + nombre + (detalle ? '\n          ' + detalle : ''));
}

// El marcaje se CONSUME al encolar la presentación, así que mirarlo desde fuera después de un
// paso siempre da vacío. Se espía en el origen: DSL._marcarCoste, en el sandbox del escenario.
async function montar(esc) {
    const ctx = crearContexto('nueva');
    ctx.semilla = esc.semilla || 1;
    const g = crearJuego(ctx);
    await asentar(ctx);
    construirEstado(ctx, g, esc);
    const marcas = [];
    // El sandbox es un contexto vm: se le inyecta el espía por dentro, no desde fuera.
    ctx.sandbox.__espiaMarcas = (nombre, id, tipo) => marcas.push({ nombre, id, tipo });
    require('vm').runInContext(`(() => {
        const _orig = DSL._marcarCoste.bind(DSL);
        DSL._marcarCoste = (juego, cartas, tipo) => {
            const lista = Array.isArray(cartas) ? cartas : [cartas];
            lista.filter(Boolean).forEach(c => __espiaMarcas(c.name, c.instanceId, tipo));
            return _orig(juego, cartas, tipo);
        };
    })()`, ctx.sandbox);
    return { ctx, g, marcas };
}

(async () => {
    console.log('\n--- Rezo en grupo: los dos pagadores quedan marcados como COSTE ---');
    {
        const { ctx, g, marcas } = await montar({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Karlos', furor: 3 }, { carta: 'Agah', furor: 3 }],
                  mano: ['Rezo en grupo'], mazo: ['Némesis', 'Mini-tigre'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await ejecutarPaso(ctx, g, { jugar: 'Rezo en grupo' });
        await ejecutarPaso(ctx, g, { elegir: ['Karlos', 'Agah'] });
        // El marcaje se consume al ENCOLAR la presentación, así que hay que mirarlo aquí: en
        // cuanto el visor del mazo se abre, _comprometer ya lo ha vaciado.
        const ids = new Set([...g.players.p1.vanguard].map(c => c.instanceId));
        check('se anotan exactamente 2 pagadores', marcas.length === 2, 'marcados=' + marcas.length);
        check('los dos son del tipo "coste"', marcas.every(m => m.tipo === 'coste'),
            JSON.stringify(marcas.map(m => m.tipo)));
        check('y son los dos aliados elegidos, que están en el campo',
            marcas.every(m => ids.has(m.id)) && marcas.map(m => m.nombre).sort().join(',') === 'Agah,Karlos',
            marcas.map(m => m.nombre).join(','));

        await ejecutarPaso(ctx, g, { elegir: ['Némesis'] });
        check('el tributo acaba cobrado, una sola vez por pagador (3,3 -> 2,2)',
            g.players.p1.vanguard.map(c => c.furor).join(',') === '2,2',
            g.players.p1.vanguard.map(c => c.furor).join(','));
        check('la cola de cobros queda vacía', !(g._cobrosPendientes || []).length);
        check('el marcaje se consume (no contamina la siguiente presentación)',
            !(g._costesPresenta || []).length);
        check('un solo flotante de -1 FUR por pagador',
            ctx.flotantes.filter(f => f.texto === '-1 FUR').length === 2,
            'hay ' + ctx.flotantes.filter(f => f.texto === '-1 FUR').length);
    }

    console.log('\n--- El cobro aparcado NO se pierde aunque la animación no corra ---');
    {
        // isSkippingAnim es el camino por el que la presentación se salta entera. Si el cobro
        // viviera dentro de la animación, aquí el Furor se quedaría sin pagar y la carta se
        // jugaría gratis. Es el escenario que justifica la red de seguridad de _comprometer.
        const { ctx, g } = await montar({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Karlos', furor: 3 }], mano: ['Pago por adelantado'],
                  mazo: ['Gladiador', 'Mini-tigre'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        g.isSkippingAnim = true;
        await ejecutarPaso(ctx, g, { jugar: 'Pago por adelantado' });
        await ejecutarPaso(ctx, g, { elegir: ['Karlos'] });
        await ejecutarPaso(ctx, g, { elegir: ['Gladiador'] });
        check('con la animación saltada, el coste se cobra igual (3 -> 1)',
            g.players.p1.vanguard[0].furor === 1, 'furor=' + g.players.p1.vanguard[0].furor);
        check('sin cobros huérfanos en la cola', !(g._cobrosPendientes || []).length);
    }

    console.log('\n--- Wolfgang: Manzanahoria es COSTE, Aniceto es REQUISITO ---');
    {
        const { ctx, g, marcas } = await montar({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Mini-tigre'], mano: ['Wolfgang', 'Manzanahoria'] },
            p2: {},
        });
        await ejecutarPaso(ctx, g, { jugar: 'Wolfgang' });
        check('la Manzanahoria se descarta', g.players.p1.discard.some(c => c.name === 'Manzanahoria'));
        check('...y queda marcada como COSTE (viaja al escaparate al lado de Wolfgang)',
            marcas.some(m => m.nombre === 'Manzanahoria' && m.tipo === 'coste'), JSON.stringify(marcas));
        check('Wolfgang entra en el campo', g.players.p1.vanguard.some(c => c.name === 'Wolfgang'));
    }
    {
        const { ctx, g, marcas } = await montar({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Aniceto'], mano: ['Wolfgang'] },
            p2: {},
        });
        await ejecutarPaso(ctx, g, { jugar: 'Wolfgang' });
        check('con Aniceto en el campo, Wolfgang entra sin descartar nada',
            g.players.p1.vanguard.some(c => c.name === 'Wolfgang') && !g.players.p1.discard.length);
        check('Aniceto queda marcado como REQUISITO, no como coste (se queda donde está)',
            marcas.some(m => m.nombre === 'Aniceto' && m.tipo === 'requisito'), JSON.stringify(marcas));
    }

    console.log('\n--- Wolfgang con las dos opciones: se puede CANCELAR ---');
    {
        const { ctx, g, marcas } = await montar({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Aniceto'], mano: ['Wolfgang', 'Manzanahoria'] },
            p2: {},
        });
        await ejecutarPaso(ctx, g, { jugar: 'Wolfgang' });
        const pend = ctx.pendientes[0] || {};
        check('con Aniceto Y Manzanahoria se pregunta cómo pagar', pend.tipo === 'opcion', 'tipo=' + pend.tipo);
        check('...y una de las opciones es CANCELAR',
            (pend.etiquetas || []).includes('CANCELAR'), JSON.stringify(pend.etiquetas));
        await ejecutarPaso(ctx, g, { opcion: 'CANCELAR' });
        // Cancelar es cancelar: ni carta jugada, ni Manzanahoria descartada, ni nada marcado.
        check('al cancelar, Wolfgang sigue en la mano',
            g.players.p1.hand.some(c => c.name === 'Wolfgang'),
            'mano=' + g.players.p1.hand.map(c => c.name).join(','));
        check('al cancelar, la Manzanahoria NO se descarta', !g.players.p1.discard.length,
            'descartes=' + g.players.p1.discard.map(c => c.name).join(','));
        check('al cancelar no queda nada marcado como coste ni requisito',
            !marcas.length && !(g._costesPresenta || []).length, JSON.stringify(marcas));
        check('y no queda ninguna presentación armada', !g._presentacionArmada);
    }

    console.log('');
    if (fallos) { console.log(`SUITE costes_presenta: ${fallos} FALLOS de ${total} comprobaciones`); process.exit(1); }
    console.log(`SUITE costes_presenta: ${total}/${total} comprobaciones — COSTES Y REQUISITOS CORRECTOS`);
})().catch(e => { console.error(e); process.exit(1); });
