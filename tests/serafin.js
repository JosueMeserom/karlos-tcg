// tests/serafin.js — MARAVILLA reformulada (Toto, 21-ago-2026).
//
// Antes la carta se COLOCABA y acto seguido se autodestruía si ya había otro Serafín: gastabas el
// tributo para ver cómo se desvanece. Ahora son dos cosas distintas y cada una en su sitio:
//   · un REQUISITO, con su aviso, para que ni se juegue si ya tienes uno;
//   · y la Pasiva, que se queda solo para lo que el requisito no puede cubrir -que lleguen dos por
//     otra vía, una resurrección o un clon-, destruyendo los MÁS ANTIGUOS hasta que quede uno.
//
// Aserciones directas: el comportamiento es nuevo, así que no hay nada que comparar contra la base
// congelada. Lo que se fija es que las dos mitades hagan su parte y no se pisen.
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
    // `paso` deja asentado el tablero después de cada acción: hay efectos -los periódicos de
    // fase- que corren en corrutinas y sin esto se miraría el estado a medias.
    return { ctx, g, paso: async (p) => { await ejecutarPaso(ctx, g, p); await asentar(ctx); } };
}
const enCampo = (g) => [...g.players.p1.vanguard, ...g.players.p1.rearguard];

(async () => {
    console.log('--- El Requisito: no se juega si ya tienes uno ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Serafín', { carta: 'Karlos', furor: 4 }], mano: ['Serafín'] },
            p2: { vanguardia: ['Aniceto'] },
        });
        await paso({ jugar: 'Serafín' });
        check('la carta se queda en la mano', g.players.p1.hand.some(c => c.name === 'Serafín'));
        check('...y no entra un segundo al campo', enCampo(g).filter(c => c.name === 'Serafín').length === 1);
        check('...sin cobrarle el tributo a nadie', enCampo(g).find(c => c.name === 'Karlos').furor === 4,
            'furor=' + enCampo(g).find(c => c.name === 'Karlos').furor);
    }
    {
        // Y sin ninguno, se juega con normalidad: tributo, colocación y curación.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Karlos', furor: 4, vida: 3 }, { carta: 'Mini-tigre', vida: 1 }], mano: ['Serafín'] },
            p2: { vanguardia: ['Aniceto'] },
        });
        await paso({ jugar: 'Serafín' });
        await paso({ elegir: ['Karlos'] });
        check('sin ninguno en campo, entra', enCampo(g).some(c => c.name === 'Serafín'));
        check('paga el tributo de 4', enCampo(g).find(c => c.name === 'Karlos').furor === 0,
            'furor=' + enCampo(g).find(c => c.name === 'Karlos').furor);
        check('y cura 2 a la vanguardia herida',
            enCampo(g).find(c => c.name === 'Karlos').currentHp === 5 && enCampo(g).find(c => c.name === 'Mini-tigre').currentHp === 3,
            enCampo(g).map(c => c.name + ':' + c.currentHp).join(' '));
        check('...con UN solo log para todos', g.logHistory.filter(e => /MARAVILLA.*purifica/.test(e.msg)).length === 1,
            g.logHistory.filter(e => /purifica/.test(e.msg)).map(e => e.msg).join(' | '));
    }

    console.log('\n--- La red de seguridad: si llegan dos por otra vía ---');
    {
        // El requisito no ve una resurrección ni un clon, así que la Pasiva lo remata al empezar
        // el turno. Se destruyen los MÁS ANTIGUOS: sobrevive el que llegó el último.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Serafín', 'Karlos', 'Serafín'] },
            p2: { vanguardia: ['Aniceto'] },
        });
        check('parten dos en el campo', enCampo(g).filter(c => c.name === 'Serafín').length === 2);
        await paso({ finTurno: true }); await paso({ finTurno: true });
        check('al empezar el turno solo queda uno', enCampo(g).filter(c => c.name === 'Serafín').length === 1,
            enCampo(g).map(c => c.name).join(', '));
        check('...y se anuncia', g.logHistory.some(e => /MARAVILLA.*no puede haber dos/i.test(e.msg)),
            g.logHistory.slice(-3).map(e => e.msg).join(' | '));
        check('el que sobrevive es el MÁS RECIENTE (el último del campo)',
            enCampo(g).map(c => c.name).join(',') === 'Karlos,Serafín', enCampo(g).map(c => c.name).join(','));
    }
    {
        // Y con uno solo no hace nada: la red no debe saltar sin motivo.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Serafín', 'Karlos'] },
            p2: { vanguardia: ['Aniceto'] },
        });
        await paso({ finTurno: true }); await paso({ finTurno: true });
        check('con uno solo, no se destruye nada', enCampo(g).filter(c => c.name === 'Serafín').length === 1);
        check('...ni se anuncia nada', !g.logHistory.some(e => /no puede haber dos/i.test(e.msg)));
    }

    console.log('\n' + (fallos
        ? `SUITE serafin: ${comprobaciones - fallos}/${comprobaciones} comprobaciones — ${fallos} FALLOS`
        : `SUITE serafin: ${comprobaciones}/${comprobaciones} comprobaciones — MARAVILLA CUMPLE`));
    if (fallos) process.exit(1);
})();
