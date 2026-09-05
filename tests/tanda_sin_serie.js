// tests/tanda_sin_serie.js — Espectro, Mimo, Maxi-tigre y el Robot espía XR.
//
// Lo que hay que fijar de cada una, que es lo que se puede romper sin que la pasada se entere:
//   · Mimo devuelve el golpe ANTES de encajarlo: si el ataque lo mata, contraataca igual. Esa
//     palabra ("antes") es la carta entera; con TRAS_DEFENDER sería otra cosa.
//   · Maxi-tigre entra GRATIS con un Mini-tigre delante, y su ATQ se cuenta por NOMBRE.
//   · El robot espía solo se camufla si tiene Furor, y atacar lo delata.
//
// (El Robot de limpieza CM se quedó fuera: necesita un requisito que cuente cartas en una
// PILA, y `_pool` solo sabe de campo. Ver el TODO.)
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
    return { ctx, g, paso: async (p) => { await ejecutarPaso(ctx, g, p); await asentar(ctx); } };
}
const buscar = (g, pid, n) => [...g.players[pid].vanguard, ...g.players[pid].rearguard].find(c => c && c.name === n);

(async () => {
    console.log('--- Espectro: APARICIÓN ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Espectro', furor: 1 }] },
            p2: { vanguardia: ['Oso con armadura'] },
        }, ['cara']);
        const oso = buscar(g, 'p2', 'Oso con armadura');
        const v0 = oso.currentHp;
        await paso({ habilidad: 'Espectro' }); await paso({ confirmar: true });
        await paso({ elegir: ['Oso con armadura'] });
        check('el ataque especial le llega pese a la DEF', oso.currentHp < v0, 'vida=' + oso.currentHp);
        check('con cara, lo confunde 2 turnos',
            !!(oso.status && oso.status.confusion && oso.status.confusion.duration === 2));
    }

    console.log('\n--- Mimo: FARSA devuelve el golpe ANTES de encajarlo ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Karlos'] },
            p2: { vanguardia: ['Mimo'] },
        });
        const karlos = buscar(g, 'p1', 'Karlos');
        const mimo = buscar(g, 'p2', 'Mimo');
        const vk = karlos.currentHp;
        await paso({ atacar: 'Karlos', objetivo: 'Mimo' });
        check('el atacante recibe el contraataque', karlos.currentHp < vk, 'vida Karlos=' + karlos.currentHp);
        check('y Mimo encaja su golpe igualmente', mimo.currentHp < 2 || mimo.location === 'discard',
            'vida Mimo=' + mimo.currentHp);
    }
    {
        // Lo que de verdad distingue "antes" de "después": aunque el golpe lo mate, contraataca.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            // Agah con Furor: sus ataques normales cuestan 1, sin él ni siquiera puede atacar.
            p1: { vanguardia: [{ carta: 'Agah', furor: 2 }] },
            p2: { vanguardia: [{ carta: 'Mimo', vida: 1 }] },
        });
        const agah = buscar(g, 'p1', 'Agah');
        const va = agah.currentHp;
        await paso({ atacar: 'Agah', objetivo: 'Mimo' });
        check('contraataca aunque el golpe lo mate', agah.currentHp < va, 'vida Agah=' + agah.currentHp);
        check('...y muere de todas formas', !buscar(g, 'p2', 'Mimo'));
    }

    console.log('\n--- Maxi-tigre: ESTIRPE ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 0 }], mano: ['Maxi-tigre'] },
            p2: { vanguardia: ['Oso con armadura'] },
        });
        const mini = buscar(g, 'p1', 'Mini-tigre');
        await paso({ jugar: 'Maxi-tigre' });
        const maxi = buscar(g, 'p1', 'Maxi-tigre');
        check('con un Mini-tigre delante entra GRATIS', !!maxi && mini.furor === 0);
        g.updatePassives();
        check('...y el Mini-tigre le da +1 de ATQ', maxi.currentAtk === 5, 'atq=' + maxi.currentAtk);
    }
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Guardia', furor: 0 }], mano: ['Maxi-tigre'] },
            p2: { vanguardia: ['Oso con armadura'] },
        });
        await paso({ jugar: 'Maxi-tigre' });
        check('sin Mini-tigre y sin Furor no entra', !buscar(g, 'p1', 'Maxi-tigre'));
    }

    console.log('\n--- Robot espía XR: solo se camufla si tiene Furor ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Robot espía XR', furor: 0 }] },
            p2: { vanguardia: ['Oso con armadura'] },
        });
        const r = buscar(g, 'p1', 'Robot espía XR');
        check('sin Furor no se prepara el camuflaje', !(r.tempEffects || []).length);
    }
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p2', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Robot espía XR', furor: 2 }] },
            p2: { vanguardia: ['Oso con armadura'] },
            // La cruz es para el escondite frágil: al empezar el turno del rival, si su único
            // objetivo está Oculto, echa moneda por si se lo destapa. Con cruz sigue escondido.
        }, ['cruz', 'cruz']);
        const r = buscar(g, 'p1', 'Robot espía XR');
        await paso({ finTurno: true });   // pasa a turno de p1: se prepara
        check('con Furor, al empezar su turno se prepara', (r.tempEffects || []).length > 0,
            'marcas=' + (r.tempEffects || []).length);
        await paso({ finTurno: true });   // turno del rival: ahora sí se esconde
        check('...y en el turno del rival está Oculto',
            !!(r.status && r.status.oculto && r.status.oculto.duration > 0));
    }

    console.log(`\nSUITE tanda_sin_serie: ${fallos ? fallos + ' FALLOS de ' : comprobaciones + '/'}${comprobaciones} comprobaciones` +
        (fallos ? '' : ' — LAS CUATRO CUMPLEN'));
    if (fallos) process.exit(1);
})();
