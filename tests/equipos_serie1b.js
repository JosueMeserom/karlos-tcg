// tests/equipos_serie1b.js — Bastón astral, Permiso especial y Alabanza.
//
// La segunda mitad de las Ayudas equipables de la Serie 1 (19-ago-2026). Se separaron de las dos
// primeras porque las tres dependen de DOS piezas de motor que no existían, y son esas piezas lo
// que de verdad hay que vigilar aquí — no las cartas:
//
//   1. `furorPorTurno` en un equipo. La cadena de ganancia de Furor consultaba a la propia carta,
//      a los Eventos y a la vanguardia, pero NO a lo que uno lleva anexado. Ahora sí.
//   2. `mientrasEquipado` CALCULADO, que antes era un objeto fijo:
//        · `segun`   — ramas por filtros sobre el PORTADOR; gana la primera que cumpla.
//        · `porCampo` — el bono se multiplica por un número guardado en el propio equipo.
//      Y su pareja `guardaCuantosEnSelf`, que apunta a cuántos alcanzó un efecto (Alabanza no
//      sabe su bono hasta cobrar el tributo: solo pagan los que pueden).
//
// Se comprueba lo que hacen y lo que NO: que el Bastón no puede empuñarlo un 'Animal salvaje',
// que un 'Guardia Real' NO se lleva los stats del 'Policía', y que Alabanza cuenta SOLO a los que
// de verdad tributaron.
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
async function mesa(esc) {
    const ctx = crearContexto('nueva'); ctx.semilla = 1;
    const g = crearJuego(ctx); await asentar(ctx);
    construirEstado(ctx, g, esc);
    return { ctx, g, paso: (p) => ejecutarPaso(ctx, g, p) };
}
const buscar = (g, pid, n) => [...g.players[pid].vanguard, ...g.players[pid].rearguard].find(c => c.name === n);
const pool = (ctx) => ((ctx.pendientes[0] || {}).pool || []).map(c => c.name);

(async () => {
    console.log('--- Bastón astral: +1 de Atq y 1 de Furor más por turno ---');
    {
        const { ctx, g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Aniceto', furor: 0 }, 'Mini-tigre', 'Muro parlante'], mano: ['Bastón astral'] },
            p2: { vanguardia: ['Karolina'] },
        });
        const aniceto = buscar(g, 'p1', 'Aniceto');
        const atkBase = aniceto.currentAtk;
        await paso({ jugar: 'Bastón astral' });
        const _p = pool(ctx);
        check('un "Animal salvaje" no puede empuñarlo', !_p.includes('Mini-tigre'), 'pool=' + JSON.stringify(_p));
        check('...ni una "Cosa"', !_p.includes('Muro parlante'), 'pool=' + JSON.stringify(_p));
        check('...pero Aniceto sí', _p.includes('Aniceto'), 'pool=' + JSON.stringify(_p));

        await paso({ elegir: ['Aniceto'] });
        g.updatePassives();
        check('+1 de Atq mientras lo lleve', aniceto.currentAtk === atkBase + 1,
            'atk=' + aniceto.currentAtk + ' base=' + atkBase);

        // La pieza de motor: el Furor de la fase pasa por los equipos.
        const furorAntes = aniceto.furor;
        await paso({ finTurno: true }); await paso({ finTurno: true });
        check('gana 2 de Furor en su fase (1 de siempre + 1 del Bastón)',
            aniceto.furor === furorAntes + 2, 'furor=' + aniceto.furor + ' antes=' + furorAntes);
    }

    console.log('\n--- Permiso especial: da cosas distintas según la etiqueta ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Eris', furor: 0 }], mano: ['Permiso especial'] },
            p2: { vanguardia: ['Karolina'] },
        });
        const eris = buscar(g, 'p1', 'Eris');
        const atk0 = eris.currentAtk, def0 = eris.currentDef, fur0 = eris.furor;
        await paso({ jugar: 'Permiso especial' });
        await paso({ elegir: ['Eris'] });
        g.updatePassives();
        check('a un "Policía" le da +1 de Atq y +1 de Def',
            eris.currentAtk === atk0 + 1 && eris.currentDef === def0 + 1,
            'atk=' + eris.currentAtk + '/' + atk0 + ' def=' + eris.currentDef + '/' + def0);
        await paso({ finTurno: true }); await paso({ finTurno: true });
        check('...y 1 de Furor más por turno', eris.furor === fur0 + 2,
            'furor=' + eris.furor + ' antes=' + fur0);
    }
    {
        const { ctx, g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Capitán Guardia Real', furor: 0 }], mano: ['Permiso especial'],
                  mazo: ['Mini-tigre', 'Longaniza'] },
            p2: { vanguardia: ['Karolina'] },
        });
        const cap = buscar(g, 'p1', 'Capitán Guardia Real');
        const atk0 = cap.currentAtk, def0 = cap.currentDef, fur0 = cap.furor;
        await paso({ jugar: 'Permiso especial' });
        await paso({ elegir: ['Capitán Guardia Real'] });
        // Y ABRE EL VISOR DEL MAZO, que es lo suyo del Guardia Real. Hoy no hay ninguna carta con
        // la etiqueta 'Tecnología' implementada, así que el visor se abre vacío y con su aviso —
        // que es el comportamiento correcto (§12.bis: el mazo se enseña igual) y de paso deja
        // fijado que la búsqueda se dispara SOLO en esta rama.
        check('el "Guardia Real" dispara la búsqueda de Tecnología',
            (ctx.pendientes[0] || {}).tipo === 'visorMazo', 'pendiente=' + JSON.stringify((ctx.pendientes[0] || {}).tipo));
        await paso({ elegir: [] });
        g.updatePassives();
        check('un "Guardia Real" NO se lleva los stats del "Policía"',
            cap.currentAtk === atk0 && cap.currentDef === def0,
            'atk=' + cap.currentAtk + '/' + atk0 + ' def=' + cap.currentDef + '/' + def0);
        await paso({ finTurno: true }); await paso({ finTurno: true });
        check('...pero sí el Furor extra', cap.furor === fur0 + 2, 'furor=' + cap.furor + ' antes=' + fur0);
    }

    console.log('\n--- Alabanza: el bono es CUÁNTOS tributaron ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            // Tres en vanguardia; solo DOS llegan a 2 de Furor, así que solo esos dos tributan.
            p1: { vanguardia: [{ carta: 'Némesis', furor: 3 }, { carta: 'Aniceto', furor: 2 }, { carta: 'Mini-tigre', furor: 1 }],
                  mano: ['Alabanza'] },
            p2: { vanguardia: ['Karolina'] },
        });
        const nem = buscar(g, 'p1', 'Némesis'), ani = buscar(g, 'p1', 'Aniceto'), mt = buscar(g, 'p1', 'Mini-tigre');
        const atk0 = nem.currentAtk, def0 = nem.currentDef, hp0 = nem.maxHp;
        await paso({ jugar: 'Alabanza' });
        await paso({ elegir: ['Némesis'] });
        g.updatePassives();
        check('tributan los que PUEDEN pagar (Némesis y Aniceto)', nem.furor === 1 && ani.furor === 0,
            'nemesis=' + nem.furor + ' aniceto=' + ani.furor);
        check('...y el que no llega a 2 NO tributa', mt.furor === 1, 'mini-tigre=' + mt.furor);
        check('el bono es +2 en Def y Vida Máx.: dos tributaron',
            nem.currentDef === def0 + 2 && nem.maxHp === hp0 + 2,
            'def=' + nem.currentDef + '/' + def0 + ' vidaMax=' + nem.maxHp + '/' + hp0);
        // El Atq NO sirve de medida con Némesis: su base es 8 y el tope de características del
        // juego es 9, así que el segundo punto se lo come el clamp. Es la misma trampa de medición
        // que ya documentó la migración de SABIDURÍA/Wolfgang, y por eso se comprueba el TOPE en
        // vez del +2: si el bono no llegara, se quedaría en 8.
        check('...y el Atq llega al tope de 9 (su base es 8: el clamp se come el segundo punto)',
            nem.currentAtk === 9, 'atk=' + nem.currentAtk + ' base=' + atk0);
    }

    console.log('\n' + (fallos
        ? `SUITE equipos_serie1b: ${comprobaciones - fallos}/${comprobaciones} comprobaciones — ${fallos} FALLOS`
        : `SUITE equipos_serie1b: ${comprobaciones}/${comprobaciones} comprobaciones — LAS TRES CORRECTAS`));
    if (fallos) process.exit(1);
})();
