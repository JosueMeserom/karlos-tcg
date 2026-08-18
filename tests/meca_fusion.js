// tests/meca_fusion.js — EMPLAZAR PILOTO: el piloto del CAMPO se funde con el Meca.
//
// La animación pasó de "intercambian posiciones y acto seguido el piloto se parte por la mitad"
// a una FUSIÓN: el Meca es llamado a la casilla del piloto mientras este salta dentro (Toto,
// 18-ago-2026). Eso obligó a reescribir la mutación de estado -antes se intercambiaban las dos
// posiciones y luego moría el piloto; ahora el Meca ocupa la del piloto y su casilla vieja queda
// libre-, así que esta suite fija que el RESULTADO es el mismo de siempre.
//
// Lo que se comprueba es justo lo que la animación no debe haber cambiado:
//   · el Meca acaba en la casilla que ocupaba el piloto, y en su ZONA (aquí, la retaguardia),
//   · su casilla anterior queda libre y la fila se cierra,
//   · el piloto acaba en los descartes,
//   · y la Pasiva del Meca queda anulada, que es el efecto de la Activa.
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

(async () => {
    const ctx = crearContexto('nueva'); ctx.semilla = 1;
    const g = crearJuego(ctx); await asentar(ctx);
    construirEstado(ctx, g, {
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Meca EBA', furor: 2 }, 'Mini-tigre'], retaguardia: ['Yuriy'] },
        p2: { vanguardia: ['Aniceto'] },
    });
    console.log('--- EMPLAZAR PILOTO: fusión con un piloto del campo ---');
    await ejecutarPaso(ctx, g, { habilidad: 'Meca EBA' });
    for (let i = 0; i < 6 && ctx.pendientes.length; i++) {
        const p = ctx.pendientes[0];
        if (p.tipo === 'confirmar') await ejecutarPaso(ctx, g, { confirmar: true });
        else if (p.tipo === 'opcion') await ejecutarPaso(ctx, g, { opcion: (p.etiquetas || [])[0] });
        else if (p.tipo === 'elegirTablero') await ejecutarPaso(ctx, g, { elegir: [(p.pool || [])[0].name] });
        else break;
        await asentar(ctx);
    }
    const van = g.players.p1.vanguard.map(c => c.name);
    const ret = g.players.p1.rearguard.map(c => c.name);
    const meca = [...g.players.p1.vanguard, ...g.players.p1.rearguard].find(c => c.name === 'Meca EBA');

    check('el Meca ocupa la casilla del piloto (su zona)', ret.includes('Meca EBA'), 'ret=' + ret.join(','));
    check('...y deja libre la suya: la vanguardia se cierra', !van.includes('Meca EBA') && van.length === 1,
        'van=' + van.join(','));
    check('el piloto acaba en los descartes', g.players.p1.discard.some(c => c.name === 'Yuriy'),
        'descartes=' + g.players.p1.discard.map(c => c.name).join(','));
    check('...y no queda en ninguna fila', !van.includes('Yuriy') && !ret.includes('Yuriy'));
    check('la Pasiva del Meca queda anulada', !!(meca && meca.pilotoEmplazado),
        'pilotoEmplazado=' + (meca && meca.pilotoEmplazado));

    console.log('\n' + (fallos
        ? `SUITE meca_fusion: ${comprobaciones - fallos}/${comprobaciones} comprobaciones — ${fallos} FALLOS`
        : `SUITE meca_fusion: ${comprobaciones}/${comprobaciones} comprobaciones — FUSION CORRECTA`));
    if (fallos) process.exit(1);
})();
