// tests/equipos_serie1.js — Hagoromo, la primera Ayuda equipable nueva de la Serie 1
// (16-ago-2026). Guantes sedientos entra en cuanto tenga su pieza de motor (los equipos no
// participan todavía en los triggers de ataque), y esta suite crece con ella.
//
// Aserciones directas, no viejo-vs-nuevo: son cartas NUEVAS, no existen en la base congelada, así
// que no hay con qué comparar. Lo que se fija aquí es su contrato y, sobre todo, las tres piezas
// de motor que hubo que añadir para ellas — que es lo que de verdad puede romper a otras cartas:
//
//   · `mientrasEquipado: { inmuneAEstados: true }` -> `applyStatus` lo respeta, en el mismo sitio
//     donde ya se respetaba la inmunidad de los Avatares (el único por el que pasan todos).
//
// Se comprueba tanto lo que debe hacer como lo que NO: que la inmunidad se cae al desequipar. Si
// se quedara pegada, la carta sería inmune el resto de la partida y no se notaría hasta mucho
// después — es el fallo caro de este tipo de banderas.
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
const contador = (c, k) => (c.counters && c.counters[k] && c.counters[k].count) || 0;

(async () => {
    console.log('--- Hagoromo: cura, viste y vuelve inmune ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 2, vida: 1 }], mano: ['Hagoromo'] },
            p2: { vanguardia: ['Aniceto'] },
        });
        const tigre = buscar(g, 'p1', 'Mini-tigre');
        const defBase = tigre.currentDef;
        await paso({ jugar: 'Hagoromo' });
        await paso({ elegir: ['Mini-tigre'] });
        g.updatePassives();
        check('cura 2 de Vida al equiparse', tigre.currentHp === 3, 'vida=' + tigre.currentHp);
        check('+1 de Def mientras lo lleve', tigre.currentDef === defBase + 1,
            'def=' + tigre.currentDef + ' base=' + defBase);
        check('queda marcado como inmune a estados', tigre.inmuneAEstados === true,
            'inmuneAEstados=' + tigre.inmuneAEstados);

        // Lo que de verdad importa: que la inmunidad SIRVA. Se prueba por el único camino por el
        // que pasan todos los estados alterados.
        g.applyStatus(tigre, 'dot', 3, 'prueba');
        check('un estado alterado no le entra', !(tigre.status && tigre.status.dot),
            'status=' + JSON.stringify(tigre.status));
    }
    {
        // La inmunidad NO puede quedarse pegada: la reimpone onEquipUpdate en cada pasada, así que
        // al desequipar debe caerse sola en la siguiente. Si se quedara, la carta sería inmune el
        // resto de la partida y no se notaría hasta mucho después.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 2, vida: 1 }], mano: ['Hagoromo'] },
            p2: { vanguardia: ['Aniceto'] },
        });
        const tigre = buscar(g, 'p1', 'Mini-tigre');
        await paso({ jugar: 'Hagoromo' });
        await paso({ elegir: ['Mini-tigre'] });
        g.updatePassives();
        const eq = (tigre.equippedCards || [])[0];
        check('el Hagoromo queda anexado', !!eq && eq.name === 'Hagoromo', 'equipos=' + (tigre.equippedCards || []).length);
        if (eq) g.unequipAll(tigre);
        g.updatePassives();
        check('al desequiparlo deja de ser inmune', !tigre.inmuneAEstados, 'inmuneAEstados=' + tigre.inmuneAEstados);
        g.applyStatus(tigre, 'dot', 3, 'prueba');
        check('...y ya sí le entra un estado', !!(tigre.status && tigre.status.dot), 'status=' + JSON.stringify(tigre.status));
    }
    {
        // Limpia lo que tuviera al ponérselo.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 2 }], mano: ['Hagoromo'] },
            p2: { vanguardia: ['Aniceto'] },
        });
        const tigre = buscar(g, 'p1', 'Mini-tigre');
        // El estado se pone por el camino de verdad (applyStatus) y no con el `estado:` del
        // escenario, que lo deja como una cadena suelta en vez de con la forma que usa el motor.
        g.applyStatus(tigre, 'dot', 3, 'prueba');
        check('parte con un estado alterado puesto', !!(tigre.status && tigre.status.dot),
            'status=' + JSON.stringify(tigre.status));
        await paso({ jugar: 'Hagoromo' });
        await paso({ elegir: ['Mini-tigre'] });
        check('se equipa igualmente aunque el aliado esté sano', ((tigre.equippedCards || [])[0] || {}).name === 'Hagoromo',
            'equipos=' + (tigre.equippedCards || []).length);
        check('al equiparlo se le limpian los estados que tuviera',
            !(tigre.status && tigre.status.dot && tigre.status.dot.duration > 0),
            'status=' + JSON.stringify(tigre.status));
    }

    console.log('\n--- Hagoromo sobre Zoe (calcinante): le corta su propio Daño por tiempo ---');
    {
        // Idea de Toto (16-ago-2026). JUSTICIERA ABRASADORA se aplica Daño por tiempo A SÍ MISMA
        // tras combatir, y su pasiva convierte ese daño en curación y +2 de Def. Con el Hagoromo
        // puesto, ese autoaplicado pasa por applyStatus como cualquier otro y se bloquea — o sea
        // que el Hagoromo le QUITA un beneficio en vez de protegerla. Es consecuente con las
        // reglas, pero es una interacción que conviene tener fijada por escrito y no descubrir
        // jugando: si algún día se decide que Zoe debe ser la excepción, esta prueba lo dirá.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Zoe (calcinante)', furor: 2 }], mano: ['Hagoromo'] },
            p2: { vanguardia: ['Aniceto'] },
        });
        const zoe = buscar(g, 'p1', 'Zoe (calcinante)');
        const defSinDot = zoe.currentDef;
        g.applyStatus(zoe, 'dot', 2, zoe);
        g.updatePassives();
        check('sin Hagoromo, su propio Daño por tiempo le entra y le da +2 de Def',
            !!(zoe.status && zoe.status.dot) && zoe.currentDef === defSinDot + 2,
            'def=' + zoe.currentDef + ' base=' + defSinDot + ' status=' + JSON.stringify(zoe.status));

        zoe.status = {};
        await paso({ jugar: 'Hagoromo' });
        await paso({ elegir: ['Zoe (calcinante)'] });
        g.updatePassives();
        g.applyStatus(zoe, 'dot', 2, zoe);
        check('con Hagoromo puesto, ya no se lo puede aplicar ni a sí misma',
            !(zoe.status && zoe.status.dot), 'status=' + JSON.stringify(zoe.status));
    }

    console.log('\n' + (fallos
        ? `SUITE equipos_serie1: ${comprobaciones - fallos}/${comprobaciones} comprobaciones — ${fallos} FALLOS`
        : `SUITE equipos_serie1: ${comprobaciones}/${comprobaciones} comprobaciones — HAGOROMO CORRECTO`));
    if (fallos) process.exit(1);
})();
