// tests/modales_pilas.js — la norma de modales, comprobada por COMPORTAMIENTO (7-ago-2026).
//
// Hermano de `auditar_imperativas.js`, que hace la misma vigilancia pero con grep: aquel ve si
// una carta LLAMA al modal equivocado; este ve si el jugador acaba con el estado equivocado.
// Hacen falta los dos, porque el fallo que destapó todo esto no era de modal sino de CONTRATO:
//
//   const chosen = await game.openVisualSearchModal(...);   // devuelve un ARRAY
//   if (!chosen) return;                                    // [] es TRUTHY -> cuela
//   const idx = p.discard.findIndex(c => c.instanceId === chosen.instanceId);  // -> -1
//   const recovered = p.discard.splice(idx, 1)[0];          // splice(-1,1) = LA ÚLTIMA del descarte
//
// O sea: CANCELAR revivía una carta al azar, saltándose todos los filtros. Estaba en Líquido
// mortal (corregido al migrarla), en Necronomicón y en Sadame (retornada) -aquí encima dentro de
// un bucle de 2, así que podía pasar dos veces seguidas-. Un grep no lo habría visto nunca:
// la llamada tenía buena pinta. Por eso cada carta que se pase al visor deja aquí su caso de
// cancelación, que es donde vivía el bicho.
//
//   node tests/modales_pilas.js

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
const enCampo = (g, pid) => [...g.players[pid].vanguard, ...g.players[pid].rearguard].map(c => c.name);

(async () => {
    console.log('--- Sadame (retornada): VUELVE A LA VIDA busca en el visor de DESCARTES ---');
    {
        const { ctx, g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Sadame (retornada)', furor: 3 }],
                  descartes: ['Mini-tigre', 'Oso con armadura'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ habilidad: 'Sadame (retornada)' });
        await paso({ confirmar: true });
        const pend = ctx.pendientes[0] || {};
        check('abre el VISOR de la pila de descartes, no el modal genérico',
            pend.tipo === 'visorMazo' && pend.zona === 'discard', 'tipo=' + pend.tipo + ' zona=' + pend.zona);
        check('...y enseña la pila entera', (pend.cartas || []).length === 2,
            JSON.stringify((pend.cartas || []).map(c => c.name)));
    }
    {
        // EL CASO DEL BUG. Cancelar no puede revivir nada. Antes revivía 'Oso con armadura'
        // (la última del descarte) por el splice(-1, 1).
        const { ctx, g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Sadame (retornada)', furor: 3 }],
                  descartes: ['Mini-tigre', 'Oso con armadura'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ habilidad: 'Sadame (retornada)' });
        await paso({ confirmar: true });
        await paso({ cancelar: true });
        check('CANCELAR no revive a nadie', enCampo(g, 'p1').length === 1, JSON.stringify(enCampo(g, 'p1')));
        check('...y el descarte queda intacto', g.players.p1.discard.length === 2,
            JSON.stringify(g.players.p1.discard.map(c => c.name)));
    }
    {
        // Y el camino feliz: elegir de verdad revive A LA ELEGIDA, no a otra.
        const { ctx, g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Sadame (retornada)', furor: 3 }],
                  descartes: ['Mini-tigre', 'Oso con armadura'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ habilidad: 'Sadame (retornada)' });
        await paso({ confirmar: true });
        await paso({ elegir: ['Mini-tigre'] });      // 1ª de las 2
        await paso({ cancelar: true });              // se declina la 2ª
        check('revive EXACTAMENTE a la elegida', enCampo(g, 'p1').includes('Mini-tigre'),
            JSON.stringify(enCampo(g, 'p1')));
        check('...y no arrastra a la otra', !enCampo(g, 'p1').includes('Oso con armadura'),
            JSON.stringify(enCampo(g, 'p1')));
    }

    console.log('\n--- Limo crecido: el limo a evolucionar se elige EN EL TABLERO ---');
    {
        const { ctx, g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Limo artificial'], mano: ['Limo crecido'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ jugar: 'Limo crecido' });
        await paso({ opcion: 'EVOLUCIONAR LIMO ARTIFICIAL' });
        const pend = ctx.pendientes[0] || {};
        check('la elección del limo es en TABLERO (reborde verde)', pend.tipo === 'elegirTablero',
            'tipo=' + pend.tipo);
        await paso({ elegir: ['Limo artificial'] });
        check('el Limo crecido ocupa su sitio', enCampo(g, 'p1').includes('Limo crecido'),
            JSON.stringify(enCampo(g, 'p1')));
        check('...y el Limo artificial ya no está en el campo', !enCampo(g, 'p1').includes('Limo artificial'),
            JSON.stringify(enCampo(g, 'p1')));
    }

    console.log('\n--- Karlos (KL): el tributo de DAME TRABAJOS se elige en el tablero ---');
    {
        const { ctx, g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 3 }], mano: ['Karlos (KL)'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ jugar: 'Karlos (KL)' });
        const pend = ctx.pendientes[0] || {};
        check('el pagador se elige en TABLERO', pend.tipo === 'elegirTablero', 'tipo=' + pend.tipo);
        await paso({ elegir: ['Mini-tigre'] });
        const pagador = g.players.p1.vanguard.find(c => c.name === 'Mini-tigre');
        check('se le cobran los 2 de Furor', pagador && pagador.furor === 1,
            'furor=' + (pagador && pagador.furor));
        check('y Karlos (KL) entra al campo', enCampo(g, 'p1').includes('Karlos (KL)'),
            JSON.stringify(enCampo(g, 'p1')));
    }

    console.log(`\nSUITE modales_pilas: ${comprobaciones - fallos}/${comprobaciones} comprobaciones`
        + (fallos ? ` — ${fallos} FALLOS` : ' — MODALES CORRECTOS'));
    if (fallos) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
