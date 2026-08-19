// tests/al_fenix.js — AL-FÉNIX de Zoe (calcinante) con el campo rival a medio llenar.
//
// Toto (19-ago-2026): "hasta que no hay 4 enemigos en vanguardia NO deja elegir a ninguno". La
// Activa declaraba `cantidad: 4` sin `hastaCantidad`, así que el cupo era 4 FIJO y con menos
// enemigos la elección no llegaba a abrirse: la Habilidad quedaba muerta salvo con la vanguardia
// rival llena. Su texto dice "un MÁXIMO de 3 en vanguardia y 1 en retaguardia", o sea que con un
// solo enemigo ya debe valer.
//
// `hastaCantidad` arregla las dos cosas que pidió, y por eso se fija aquí:
//   · el cupo se ajusta a los enemigos que HAY, así que siempre se puede elegir;
//   · y al elegir al último que queda se alcanza el cupo y los ataques arrancan solos, sin un OK
//     que ya no ofrece ninguna alternativa.
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
const check = (t, ok, extra) => {
    comprobaciones++;
    if (ok) console.log('  OK    · ' + t);
    else { fallos++; console.log('  FALLO · ' + t + (extra ? '  [' + extra + ']' : '')); }
};

async function abrir(p2) {
    const ctx = crearContexto('nueva'); ctx.semilla = 1;
    const g = crearJuego(ctx); await asentar(ctx);
    construirEstado(ctx, g, {
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Zoe (calcinante)', furor: 4 }] }, p2,
    });
    await ejecutarPaso(ctx, g, { habilidad: 'Zoe (calcinante)' });
    await ejecutarPaso(ctx, g, { confirmar: true });
    await asentar(ctx);
    return { ctx, g, pend: ctx.pendientes[0] || {} };
}

(async () => {
    console.log('--- AL-FÉNIX: se puede usar con los enemigos que haya ---');
    for (const [nombre, p2, esperados] of [
        ['con UN solo enemigo', { vanguardia: ['Mini-tigre'] }, 1],
        ['con dos', { vanguardia: ['Mini-tigre', 'Mini-tigre'] }, 2],
        ['con uno en cada fila', { vanguardia: ['Mini-tigre'], retaguardia: ['Mini-tigre'] }, 2],
        ['con la vanguardia llena', { vanguardia: ['Mini-tigre', 'Mini-tigre', 'Mini-tigre', 'Mini-tigre'] }, 4],
    ]) {
        const { pend } = await abrir(p2);
        check(`${nombre}: la elección se abre`, pend.tipo === 'elegirTablero', 'pendiente=' + pend.tipo);
        check(`...y el cupo se ajusta a los que hay (${esperados})`, pend.n === esperados,
            'n=' + pend.n + ' pool=' + (pend.pool || []).length);
    }

    console.log('\n--- Y al elegir al último, los ataques arrancan solos ---');
    {
        // Dos enemigos: al elegir el segundo se alcanza el cupo (que ahora es 2) y la cadena
        // sigue sin pedir OK. Antes el cupo era 4 y el jugador se quedaba mirando un botón que no
        // ofrecía ninguna alternativa, porque ya no quedaba a quién elegir.
        const { ctx, g, pend } = await abrir({ vanguardia: [{ carta: 'Mini-tigre', vida: 9 }, { carta: 'Aniceto', vida: 9 }] });
        check('el cupo es 2, no 4', pend.n === 2, 'n=' + pend.n);
        const vidas0 = g.players.p2.vanguard.map(c => c.currentHp);
        await ejecutarPaso(ctx, g, { elegir: ['Mini-tigre', 'Aniceto'] });
        await asentar(ctx);
        const vidas1 = g.players.p2.vanguard.map(c => c.currentHp);
        check('...y los dos han recibido el ataque sin pulsar OK',
            vidas1.every((v, i) => v < vidas0[i]), 'antes=' + vidas0.join(',') + ' ahora=' + vidas1.join(','));
        check('no queda ninguna interacción pendiente', ctx.pendientes.length === 0,
            JSON.stringify(ctx.pendientes.map(p => p.tipo)));
    }

    console.log('\n' + (fallos
        ? `SUITE al_fenix: ${comprobaciones - fallos}/${comprobaciones} comprobaciones — ${fallos} FALLOS`
        : `SUITE al_fenix: ${comprobaciones}/${comprobaciones} comprobaciones — AL-FÉNIX CORRECTA`));
    if (fallos) process.exit(1);
})();
