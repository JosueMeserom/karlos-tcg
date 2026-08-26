// tests/estasis.js — ESTASIS: el segundo estado de la familia VELO, hermano del Oculto.
//
// LA REGLA (especificación de Toto, 25-ago-2026; implementada el 26): una carta en Estasis
//   · no puede ser objetivo de NINGÚN ataque, ni normal ni especial;
//   · es inmune al daño y a los efectos de cualquier carta (Personaje, Evento o Ayuda);
//   · pero está SIEMPRE agotada y NO gana Furor;
//   · y no hace de muro: si es tu único aliado, el rival puede atacarte directamente.
//
// O sea, un Kami al que además le cobran el alquiler. Ese contrapeso es lo que impide que sea un
// refugio gratis: te ocupa un hueco sin hacer nada ni acumular energía, y de ahí se sale por un
// contador o por la condición que ponga la carta que la causó.
//
// La primera carta que la usará es del crossover de Hollow Knight; esto va delante para que
// cuando llegue solo tenga que declarar el estado.
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
async function mesa(esc, monedas = []) {
    const ctx = crearContexto('nueva'); ctx.semilla = 1;
    const g = crearJuego(ctx); await asentar(ctx);
    construirEstado(ctx, g, esc);
    ctx.monedas = monedas.map(m => (m === 'cara' ? 'heads' : m === 'cruz' ? 'tails' : m));
    return { ctx, g, paso: async (p) => { await ejecutarPaso(ctx, g, p); await asentar(ctx); },
             logs: () => g.logHistory.map(e => e.msg) };
}
// El estado se pone como cualquier otro: por el cauce del motor.
const enEstasis = (g, card, turnos = 3) => { g.applyStatus(card, 'estasis', turnos, null, null); g.updatePassives(); };

(async () => {
    console.log('--- No puede ser objetivo de ningún ataque ---');
    {
        const { g } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Karlos'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        const karlos = g.players.p1.vanguard[0];
        const tigre = g.players.p2.vanguard[0];
        check('sin Estasis se le puede atacar', g.motivoNoAtacable(tigre, karlos) === null);
        enEstasis(g, karlos);
        check('en Estasis, no', /ESTASIS/.test(g.motivoNoAtacable(tigre, karlos) || ''));
        // Simon puede señalar Ocultos (OJO BIÓNICO): la Estasis no es "difícil de ver", es que
        // no está, así que a él tampoco le vale.
        const { g: g2 } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Karlos'] }, p2: { vanguardia: ['Simon'] },
        });
        const k2 = g2.players.p1.vanguard[0];
        enEstasis(g2, k2);
        check('...ni siquiera para quien puede atacar Ocultos', /ESTASIS/.test(g2.motivoNoAtacable(g2.players.p2.vanguard[0], k2) || ''));
    }

    console.log('\n--- Inmune al daño y a lo que le quiten ---');
    {
        const { g } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Karlos', furor: 1 }] },
            p2: { vanguardia: ['Oso con armadura'] },
        });
        const karlos = g.players.p1.vanguard[0];
        enEstasis(g, karlos);
        const vida = karlos.currentHp;
        await g.dealDamage(g.players.p2.vanguard[0], karlos, 3, false);
        check('el golpe la atraviesa', karlos.currentHp === vida, 'vida=' + karlos.currentHp);
        g.modifyStat(karlos, 'currentHp', -2);
        check('...y tampoco le baja la Vida un efecto', karlos.currentHp === vida);
        g.modifyStat(karlos, 'furor', -1);
        check('...ni le drenan el Furor', karlos.furor === 1);
        g.modifyStat(karlos, 'furor', 1, 0, 'fase_furor');
        check('pero TAMPOCO gana Furor', karlos.furor === 1, 'furor=' + karlos.furor);
        g.applyStatus(karlos, 'sueno', 2, null, null);
        check('...ni le entran estados nuevos', !(karlos.status.sueno && karlos.status.sueno.duration > 0));
        check('...y la propia Estasis sí se puede refrescar', karlos.status.estasis.duration > 0);
    }

    console.log('\n--- Siempre agotada ---');
    {
        const { g } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Karlos'] }, p2: { vanguardia: ['Mini-tigre'] },
        });
        const karlos = g.players.p1.vanguard[0];
        enEstasis(g, karlos);
        check('entra agotada', karlos.exhausted === true);
        karlos.exhausted = false;      // alguien intenta "despertarla"
        g.updatePassives();
        check('...y vuelve a estarlo en la siguiente pasada', karlos.exhausted === true);
    }

    console.log('\n--- No hace de muro: el ataque directo sigue disponible ---');
    {
        const { g } = await mesa({
            turno: 2, turnoDe: 'p2', empieza: 'p2',
            p1: { vanguardia: ['Karlos'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        const karlos = g.players.p1.vanguard[0];
        const tigre = g.players.p2.vanguard[0];
        g.selectedCard = tigre; g.inputState = 'SELECT_TARGET';
        check('con un aliado normal, no hay ataque directo', g.checkDirectAttackOpportunity() === false);
        enEstasis(g, karlos);
        check('...pero en Estasis deja de contar como defensora', g.checkDirectAttackOpportunity() === true);
    }

    console.log('\n--- Y las Habilidades tampoco la alcanzan ---');
    {
        // El pool del DSL la excluye por defecto, igual que a un Avatar: Kyle no puede repararla.
        const { g, paso, logs } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Kyle', furor: 1 }, { carta: 'Mini-tigre', vida: 1 }] },
            p2: { vanguardia: ['Oso con armadura'] },
        });
        const tigre = g.players.p1.vanguard[1];
        enEstasis(g, tigre);
        await paso({ habilidad: 'Kyle' });
        check('sin más aliados curables, la Activa ni arranca',
            logs().concat(g.logHistory.map(e => e.msg)).some(m => /No hay/i.test(m)) || g.inputState !== 'SELECT_ABILITY_TARGETS');
    }

    console.log('');
    if (fallos) { console.log(`SUITE estasis: ${fallos} FALLOS de ${comprobaciones} comprobaciones`); process.exit(1); }
    console.log(`SUITE estasis: ${comprobaciones}/${comprobaciones} comprobaciones — ESTASIS EN VERDE`);
})().catch(e => { console.error(e); process.exit(1); });
