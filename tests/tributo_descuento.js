// tests/tributo_descuento.js — 'Fusión de planos' abarata los tributos de colocación.
//
// LA REGLA (texto del Excel, pendiente desde que se escribió la carta): mientras 'Fusión de
// planos' esté en juego, los Esbirros con etiqueta 'Monstruo' que pidan tributo de Furor para
// entrar al campo solo pagan la MITAD, redondeando hacia abajo (si era 1, pagan 0), y vale para
// los DOS jugadores.
//
// POR QUÉ ESTABA PENDIENTE: el tributo era un número cerrado en el compilador de
// COSTE_COLOCACION -se horneaba en el filtro del requisito y en el delta del cobro-, así que no
// había forma de rebajarlo desde fuera. Ahora es un punto de consulta (`DSL._costeTributo`), y el
// descuento se declara como una regla más (`GLOBAL_TRIBUTO`), reutilizable por cualquier Evento
// futuro que quiera abaratar o encarecer tributos.
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
    return { ctx, g, paso: async (p) => { await ejecutarPaso(ctx, g, p); await asentar(ctx); } };
}
const enCampo = (g, pid, n) => [...g.players[pid].vanguard, ...g.players[pid].rearguard].some(c => c.name === n);
const buscar = (g, pid, n) => [...g.players[pid].vanguard, ...g.players[pid].rearguard].find(c => c.name === n);

(async () => {
    console.log('--- Sin el Evento: el tributo entero ---');
    {
        // Imp mayor es un Esbirro 'Monstruo' con tributo de 2.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 2 }], mano: ['Imp mayor'] },
            p2: { vanguardia: ['Oso con armadura'] },
        });
        await paso({ jugar: 'Imp mayor' });
        await paso({ elegir: ['Mini-tigre'] });
        check('se coloca', enCampo(g, 'p1', 'Imp mayor'));
        check('...pagando los 2 de Furor', buscar(g, 'p1', 'Mini-tigre').furor === 0);
    }

    console.log('\n--- Con Fusión de planos: la mitad ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 2 }], mano: ['Imp mayor'],
                  evento: { carta: 'Fusión de planos', duracion: 3 } },
            p2: { vanguardia: ['Oso con armadura'] },
        });
        await paso({ jugar: 'Imp mayor' });
        await paso({ elegir: ['Mini-tigre'] });
        check('se coloca', enCampo(g, 'p1', 'Imp mayor'));
        check('...pagando solo 1', buscar(g, 'p1', 'Mini-tigre').furor === 1, 'furor=' + buscar(g, 'p1', 'Mini-tigre').furor);
    }
    {
        // Y vale para los DOS jugadores: el Evento está en el campo del rival.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 1 }], mano: ['Imp mayor'] },
            p2: { vanguardia: ['Oso con armadura'], evento: { carta: 'Fusión de planos', duracion: 3 } },
        });
        await paso({ jugar: 'Imp mayor' });
        await paso({ elegir: ['Mini-tigre'] });
        check('el Evento del RIVAL también abarata', enCampo(g, 'p1', 'Imp mayor'));
        check('...y con 1 de Furor basta', buscar(g, 'p1', 'Mini-tigre').furor === 0);
    }

    console.log('\n--- Y solo a los Esbirros "Monstruo" ---');
    {
        // Edrielle es un Esbirro con tributo (4) pero SIN la etiqueta 'Monstruo' -es 'Invocación'
        // y 'diosa'-, así que paga entero. Hoy es la única de las nueve cartas con tributo que no
        // es 'Monstruo': justo lo que hace falta para ver que el filtro filtra.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 4 }], mano: ['Edrielle'],
                  evento: { carta: 'Fusión de planos', duracion: 3 } },
            p2: { vanguardia: ['Oso con armadura'] },
        });
        await paso({ jugar: 'Edrielle' });
        await paso({ elegir: ['Mini-tigre'] });
        check('Edrielle (no es "Monstruo") paga su tributo entero',
            enCampo(g, 'p1', 'Edrielle') && buscar(g, 'p1', 'Mini-tigre').furor === 0,
            'furor=' + (buscar(g, 'p1', 'Mini-tigre') || {}).furor);
    }
    {
        // Un 'Monstruo' con tributo 1 pasa a pagar 0: se coloca aunque nadie tenga Furor.
        // (Raiju: Esbirro, 'Invocación' + 'Monstruo', tributo 1.)
        const { g, paso, ctx } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 0 }], mano: ['Raiju'],
                  evento: { carta: 'Fusión de planos', duracion: 3 } },
            p2: { vanguardia: ['Oso con armadura'] },
        });
        await paso({ jugar: 'Raiju' });
        if (ctx.pendientes.length) await paso({ elegir: ['Mini-tigre'] });
        check('con la mitad de 1 (=0) entra sin Furor de nadie', enCampo(g, 'p1', 'Raiju'));
        check('...y no le quita Furor a nadie', buscar(g, 'p1', 'Mini-tigre').furor === 0);
    }

    console.log('');
    if (fallos) { console.log(`SUITE tributo_descuento: ${fallos} FALLOS de ${comprobaciones} comprobaciones`); process.exit(1); }
    console.log(`SUITE tributo_descuento: ${comprobaciones}/${comprobaciones} comprobaciones — EL DESCUENTO CUMPLE`);
})().catch(e => { console.error(e); process.exit(1); });
