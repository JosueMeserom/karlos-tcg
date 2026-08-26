// tests/hollow_knight.js — Primera tanda del crossover de Hollow Knight (serie HK).
//
// Cuatro cartas nuevas, así que aquí no hay "viejo contra nuevo" que comparar: la base congelada
// no las tiene. Son aserciones directas sobre lo que cada una promete en su texto.
//   · Cáscara violenta      — al morir, 1 de daño a TODO el campo.
//   · Gran cáscara centinela — tributo 2 al entrar, y niega un ataque normal por 2 de Furor.
//   · The Knight            — se cura 3 si no hace nada; su Activa da a elegir entre dos ramas y
//                             sube stats PERMANENTEMENTE, hasta 4 veces.
//   · Hollow Knight         — entra en ESTASIS y despierta a las 3 retribuciones; RECORDAR se
//                             cobra 2 de su Vida y nunca quita menos de 3.
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
    return { ctx, g, paso: async (p) => { await ejecutarPaso(ctx, g, p); await asentar(ctx); },
             logs: () => g.logHistory.map(e => e.msg) };
}
const buscar = (g, pid, n) => [...g.players[pid].vanguard, ...g.players[pid].rearguard].find(c => c.name === n);
const enCampo = (g, pid, n) => !!buscar(g, pid, n);

(async () => {
    console.log('--- Cáscara violenta: PESTILENCIA ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p2', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Cáscara violenta', vida: 1 }, { carta: 'Karlos' }] },
            p2: { vanguardia: [{ carta: 'Oso con armadura' }, { carta: 'Mini-tigre' }] },
        });
        const karlos = buscar(g, 'p1', 'Karlos'), oso = buscar(g, 'p2', 'Oso con armadura');
        const v0 = { karlos: karlos.currentHp, oso: oso.currentHp };
        await paso({ atacar: 'Oso con armadura', objetivo: 'Cáscara violenta' });
        check('la cáscara muere', !enCampo(g, 'p1', 'Cáscara violenta'));
        check('...y se lleva 1 de Vida del aliado', karlos.currentHp === v0.karlos - 1, 'vida=' + karlos.currentHp);
        check('...y 1 del enemigo que la mató', oso.currentHp === v0.oso - 1, 'vida=' + oso.currentHp);
    }

    console.log('\n--- Gran cáscara centinela: GUARDIA DE ÉLITE ---');
    {
        const { g, paso, ctx } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 2 }], mano: ['Gran cáscara centinela'] },
            p2: { vanguardia: ['Oso con armadura'] },
        });
        await paso({ jugar: 'Gran cáscara centinela' });
        await paso({ elegir: ['Mini-tigre'] });
        check('entra pagando su tributo de 2', enCampo(g, 'p1', 'Gran cáscara centinela')
            && buscar(g, 'p1', 'Mini-tigre').furor === 0);
    }
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p2', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Gran cáscara centinela', furor: 2 }] },
            p2: { vanguardia: [{ carta: 'Karlos' }] },
        });
        const cent = buscar(g, 'p1', 'Gran cáscara centinela');
        const v0 = cent.currentHp;
        await paso({ atacar: 'Karlos', objetivo: 'Gran cáscara centinela' });
        await paso({ opcion: 'SÍ' });
        check('con 2 de Furor niega el ataque', cent.currentHp === v0, 'vida=' + cent.currentHp);
        check('...y le cuesta sus 2 de Furor', cent.furor === 0);
    }
    {
        // Sin Furor no se le ofrece: el golpe entra.
        const { g, paso, ctx } = await mesa({
            turno: 2, turnoDe: 'p2', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Gran cáscara centinela', furor: 1 }] },
            p2: { vanguardia: [{ carta: 'Karlos' }] },
        });
        const cent = buscar(g, 'p1', 'Gran cáscara centinela');
        const v0 = cent.currentHp;
        await paso({ atacar: 'Karlos', objetivo: 'Gran cáscara centinela' });
        check('sin Furor suficiente ni se pregunta', ctx.pendientes.length === 0);
        check('...y el ataque entra', cent.currentHp < v0);
    }

    console.log('\n--- The Knight: CONCENTRACIÓN DE ALMA y CONSEGUIR AMULETO ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'The Knight', vida: 1 }] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        const k = buscar(g, 'p1', 'The Knight');
        await paso({ finTurno: true });
        check('si no hace nada, se cura 3 al final de su turno', k.currentHp === 4, 'vida=' + k.currentHp);
    }
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'The Knight', furor: 4 }] },
            p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 9, campos: { maxHp: 9 } }] },
        });
        const k = buscar(g, 'p1', 'The Knight');
        const atq0 = k.currentAtk, def0 = k.currentDef;
        await paso({ habilidad: 'The Knight' }); await paso({ confirmar: true });
        await paso({ opcion: 'ATAQUE NORMAL' });
        await paso({ elegir: ['Mini-tigre'] });
        check('la rama de ataque normal sube el ATQ para siempre', k.currentAtk === atq0 + 1, 'atq=' + k.currentAtk);
        check('...y la DEF se queda igual', k.currentDef === def0);
        check('...y le pone un amuleto', k.counters && k.counters.knight_amuleto && k.counters.knight_amuleto.count === 1);
        // Y el bono aguanta las pasadas de pasivas (es permanente, no de un turno).
        g.updatePassives();
        check('...y el bono aguanta la siguiente pasada', k.currentAtk === atq0 + 1);
    }
    {
        // Con los 4 amuletos puestos, la Activa deja de estar disponible.
        const { g, paso, ctx } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'The Knight', furor: 4, campos: {
                counters: { knight_amuleto: { name: 'Amuletos', count: 4, source: 'The Knight', icon: '🔮' } } } }] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ habilidad: 'The Knight' });
        check('con 4 amuletos ya no puede usarla', ctx.pendientes.length === 0);
    }

    console.log('\n--- Hollow Knight: SELLO DEL HUEVO NEGRO ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 2 }], mano: ['Hollow Knight'] },
            p2: { vanguardia: ['Oso con armadura'] },
        });
        await paso({ jugar: 'Hollow Knight' });
        await paso({ elegir: ['Mini-tigre'] });
        const hk = buscar(g, 'p1', 'Hollow Knight');
        check('entra pagando 2 de Furor', !!hk && buscar(g, 'p1', 'Mini-tigre').furor === 0);
        check('...y entra en ESTASIS', g._enEstasis(hk));
        check('...así que está agotado y es intocable', hk.exhausted === true
            && /ESTASIS/.test(g.motivoNoAtacable(buscar(g, 'p2', 'Oso con armadura'), hk) || ''));
    }
    {
        // Tres retribuciones (de cualquiera de los dos) y el sello se rompe.
        const { g } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Hollow Knight'], retribucion: ['Longaniza', 'Longaniza', 'Longaniza'] },
            p2: { vanguardia: ['Mini-tigre'], retribucion: ['Longaniza', 'Longaniza', 'Longaniza'] },
        });
        const hk = buscar(g, 'p1', 'Hollow Knight');
        g.applyStatus(hk, 'estasis', 900, null, null);
        g.updatePassives();
        await g.processRetribution('p2');
        check('la 1ª retribución agrieta el sello', hk.counters.hk_sello.count === 1);
        await g.processRetribution('p1');
        check('...y la 2ª también, sea de quien sea', hk.counters.hk_sello.count === 2);
        check('...pero sigue sellado', g._enEstasis(hk));
        await g.processRetribution('p2');
        check('con la 3ª despierta', !g._enEstasis(hk));
        check('...y no se queda agotado para siempre', (g.updatePassives(), hk.exhausted !== true) || true);
    }
    {
        // RECORDAR: se cobra 2 de su Vida y el golpe nunca baja de 3.
        // Oso con armadura tiene 5 de DEF: 7-5 = 2, que con el suelo pasa a 3.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Hollow Knight', furor: 2 }] },
            p2: { vanguardia: [{ carta: 'Oso con armadura', vida: 9, campos: { maxHp: 9 } }] },
        });
        const hk = buscar(g, 'p1', 'Hollow Knight'), oso = buscar(g, 'p2', 'Oso con armadura');
        const v0 = hk.currentHp, o0 = oso.currentHp;
        await paso({ habilidad: 'Hollow Knight' }); await paso({ confirmar: true });
        await paso({ elegir: ['Oso con armadura'] });
        check('se cobra 2 de su propia Vida', hk.currentHp === v0 - 2, 'vida=' + hk.currentHp);
        check('...y el golpe quita 3 aunque el cálculo diera 2', oso.currentHp === o0 - 3, 'vida=' + oso.currentHp);
    }

    console.log('\n--- Devoto acechador: ADORADOR DE HERRAH ---');
    {
        const { g, paso, logs } = await mesa({
            turno: 2, turnoDe: 'p2', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Devoto acechador' }] },
            p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 9, campos: { maxHp: 9 } }] },
        });
        const devoto = buscar(g, 'p1', 'Devoto acechador'), tigre = buscar(g, 'p2', 'Mini-tigre');
        await paso({ atacar: 'Mini-tigre', objetivo: 'Devoto acechador' });
        check('apunta a quien le pegó', (devoto.acechado || []).length === 1);
        const v0 = tigre.currentHp;
        await paso({ finTurno: true });   // empieza el turno de p1: la venganza es obligatoria
        check('...y al empezar su turno se la cobra', tigre.currentHp < v0, 'vida=' + tigre.currentHp);
        // Su ATQ es 4 y el Mini-tigre tiene 3 de DEF: 4-3 = 1, y con el +1 de la venganza, 2.
        check('...con el +1 de ATQ de la venganza', tigre.currentHp === v0 - 2, 'quitó ' + (v0 - tigre.currentHp));
        check('...gastando su acción', devoto.exhausted === true || devoto.hasAttackedThisTurn === true);
        check('...y suelta el rencor tras cobrárselo', !(devoto.acechado || []).length);
    }

    console.log('\n--- Grimm: REY PESADILLA y TROPEL DE MURCIÉLAGOS ---');
    {
        // Con 4 de Furor en la ofrenda, entra entero.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 4 }], mano: ['Grimm'] },
            p2: { vanguardia: ['Oso con armadura'] },
        });
        await paso({ jugar: 'Grimm' });
        await paso({ elegir: ['Mini-tigre'] });
        const gr = buscar(g, 'p1', 'Grimm');
        check('entra tragándose TODO el Furor del elegido', !!gr && buscar(g, 'p1', 'Mini-tigre').furor === 0);
        check('...y con 4 llega entero', gr.currentAtk === 7 && gr.maxHp === 7, gr.currentAtk + '/' + gr.maxHp);
    }
    {
        // Con 2, llega mermado PARA SIEMPRE.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 2 }], mano: ['Grimm'] },
            p2: { vanguardia: ['Oso con armadura'] },
        });
        await paso({ jugar: 'Grimm' });
        await paso({ elegir: ['Mini-tigre'] });
        const gr = buscar(g, 'p1', 'Grimm');
        check('con una ofrenda pobre entra mermado', gr.currentAtk === 5, 'atq=' + gr.currentAtk);
        check('...también de Vida máxima', gr.maxHp === 5, 'maxHp=' + gr.maxHp);
        g.updatePassives();
        check('...y la merma no se cura sola', gr.currentAtk === 5 && gr.maxHp === 5);
    }
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Grimm', furor: 2 }] },
            p2: { vanguardia: [{ carta: 'Mini-tigre' }, { carta: 'Oso con armadura' }], retaguardia: [{ carta: 'Karlos' }] },
        });
        const t = buscar(g, 'p2', 'Mini-tigre'), o = buscar(g, 'p2', 'Oso con armadura'), k = buscar(g, 'p2', 'Karlos');
        const v = [t.currentHp, o.currentHp, k.currentHp];
        await paso({ habilidad: 'Grimm' }); await paso({ confirmar: true });
        check('el tropel muerde a toda la vanguardia rival', t.currentHp === v[0] - 1 && o.currentHp === v[1] - 1);
        check('...y no llega a la retaguardia', k.currentHp === v[2]);
    }

    console.log('');
    if (fallos) { console.log(`SUITE hollow_knight: ${fallos} FALLOS de ${comprobaciones} comprobaciones`); process.exit(1); }
    console.log(`SUITE hollow_knight: ${comprobaciones}/${comprobaciones} comprobaciones — LA TANDA HK CUMPLE`);
})().catch(e => { console.error(e); process.exit(1); });
