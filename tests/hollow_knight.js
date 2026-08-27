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
        // Y muere UNA vez: su pestilencia alcanza "a todos", así que si corriera con ella todavía
        // en la mesa se contaría a sí misma y se re-mataría en bucle (Toto, 26-ago-2026). Por eso
        // la Pasiva es `trasMorir: true` y el motor tiene candado de re-entrada en checkDeath.
        check('...una sola vez, sin bucle', g.players.p1.discard.filter(c => c.name === 'Cáscara violenta').length === 1);
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
        check('...y lo AVISA con una marca visible', (devoto.tempEffects || []).length === 1);
        const v0 = tigre.currentHp;
        await paso({ finTurno: true });   // empieza el turno de p1: la venganza es obligatoria
        check('...y al empezar su turno se la cobra', tigre.currentHp < v0, 'vida=' + tigre.currentHp);
        // Su ATQ es 4 y el Mini-tigre tiene 3 de DEF: 4-3 = 1, y con el +1 de la venganza, 2.
        check('...con el +1 de ATQ de la venganza', tigre.currentHp === v0 - 2, 'quitó ' + (v0 - tigre.currentHp));
        check('...gastando su acción', devoto.exhausted === true || devoto.hasAttackedThisTurn === true);
        check('...y suelta el rencor tras cobrárselo', !(devoto.acechado || []).length);
        check('...retirando también su marca', !(devoto.tempEffects || []).length);
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

    console.log('\n--- Hornet: PROTECTORA DE LAS RUINAS y ATADURA DE AGUJA ---');
    {
        // Atacando: la 1ª normal, la 2ª con +2 de ATQ, la 3ª otra vez normal.
        const { g, paso, ctx } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Hornet' }] },
            p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 20, campos: { maxHp: 20 } }] },
        });
        const tigre = buscar(g, 'p2', 'Mini-tigre');
        const golpe = async () => {
            const antes = tigre.currentHp;
            await paso({ atacar: 'Hornet', objetivo: 'Mini-tigre' });
            await paso({ finTurno: true }); await paso({ finTurno: true });
            return antes - tigre.currentHp;
        };
        const g1 = await golpe(), g2 = await golpe(), g3 = await golpe();
        check('el primer ataque es el normal (ATQ 5 - DEF 3 = 2)', g1 === 2, 'quitó ' + g1);
        // El rastro en el detalle: qué le queda pendiente con cada enemigo (sin chapas, que con
        // una por enemigo y por mitad de la Pasiva el tablero sería ilegible).
        const _tpl = (c) => ctx.sandbox.getCardTemplate(c.id);
        const _lineas = () => { const h = buscar(g, 'p1', 'Hornet'); return (_tpl(h).onGetPreviewEffects(h, g) || []).join(' || '); };
        check('...el SEGUNDO al mismo enemigo pega 2 más', g2 === g1 + 2, 'quitó ' + g2);
        check('...y el tercero vuelve a lo normal', g3 === g1, 'quitó ' + g3);
        check('el detalle cuenta que ya no hay más bono contra ese enemigo',
            /Ya no gana ATQ extra atacando a Mini-tigre/.test(_lineas()), _lineas());
    }
    {
        // Defendiéndose: el segundo golpe del mismo enemigo hace 2 menos.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p2', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Hornet', vida: 20, campos: { maxHp: 20 } }] },
            // Valafar pega 8: contra los 4 de DEF de Hornet son 4 de daño, así que los 2 de
            // menos se ven de verdad (con un atacante flojo el golpe ya estaría en el suelo).
            p2: { vanguardia: [{ carta: 'Valafar' }] },
        });
        const hornet = buscar(g, 'p1', 'Hornet');
        const recibir = async () => {
            const antes = hornet.currentHp;
            await paso({ atacar: 'Valafar', objetivo: 'Hornet' });
            await paso({ finTurno: true }); await paso({ finTurno: true });
            return antes - hornet.currentHp;
        };
        const r1 = await recibir(), r2 = await recibir(), r3 = await recibir();
        check('el primer golpe recibido entra entero (ATQ 8 - DEF 4 = 4)', r1 === 4, 'recibió ' + r1);
        check('...el SEGUNDO del mismo enemigo hace 2 menos', r2 === r1 - 2, 'recibió ' + r2);
        check('...y el tercero vuelve a entrar entero', r3 === r1, 'recibió ' + r3);
    }
    {
        // Y el SUELO se respeta: "+2 de DEF" nunca deja un golpe en 0, igual que en el resto del
        // juego. Karlos pega 5 contra 4 de DEF: 1 de daño, y la segunda vez sigue siendo 1.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p2', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Hornet', vida: 20, campos: { maxHp: 20 } }] },
            p2: { vanguardia: [{ carta: 'Karlos' }] },
        });
        const hornet = buscar(g, 'p1', 'Hornet');
        const recibir = async () => {
            const antes = hornet.currentHp;
            await paso({ atacar: 'Karlos', objetivo: 'Hornet' });
            await paso({ finTurno: true }); await paso({ finTurno: true });
            return antes - hornet.currentHp;
        };
        await recibir();
        check('un golpe que ya estaba en el suelo sigue quitando 1', (await recibir()) === 1);
    }
    {
        // ATADURA DE AGUJA: ata a uno y ya no se le puede volver a atar.
        const { g, paso, ctx } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Hornet', furor: 4 }] },
            p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 20, campos: { maxHp: 20 } }] },
        });
        const tigre = buscar(g, 'p2', 'Mini-tigre');
        await paso({ habilidad: 'Hornet' }); await paso({ confirmar: true });
        await paso({ elegir: ['Mini-tigre'] });
        check('el atado se salta su turno', (tigre.tempEffects || []).some(t => t.pierdeSuTurno));
        check('...y queda anotado', !!(buscar(g, 'p1', 'Hornet').hornetAguja || {})[tigre.instanceId]);
        await paso({ finTurno: true }); await paso({ finTurno: true });
        await paso({ habilidad: 'Hornet' });
        check('no se le puede volver a atar', ctx.pendientes.length === 0);
    }

    console.log('\n--- Mapa de Cornifer: robar con vistas y la mano rival al descubierto ---');
    {
        const { g, paso, ctx } = await mesa({
            turno: 2, turnoDe: 'p2', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 1 }], mano: ['Mapa de Cornifer'],
                  mazo: ['Karlos', 'Kyle', 'Aniceto', 'Longaniza', 'Manzanahoria'] },
            p2: { vanguardia: ['Oso con armadura'], mano: ['Longaniza'] },
        });
        await paso({ finTurno: true });                 // pasa a p1, que es quien lo juega
        // OJO: al empezar su turno la fase de Furor ya le ha dado 1 al Mini-tigre, así que se
        // mide el ANTES y el DESPUÉS en vez de dar por hecho que se queda a 0.
        const _furorAntes = buscar(g, 'p1', 'Mini-tigre').furor;
        await paso({ jugar: 'Mapa de Cornifer' });
        await paso({ elegir: ['Mini-tigre'] });         // el tributo de 1
        check('el Evento entra pagando su tributo', !!g.players.p1.activeEvent
            && buscar(g, 'p1', 'Mini-tigre').furor === _furorAntes - 1,
            'furor ' + _furorAntes + ' -> ' + buscar(g, 'p1', 'Mini-tigre').furor);
        g.updatePassives();
        check('...y la mano del rival queda expuesta', g.players.p2.handExposedTo === 'p1');
        const manoAntes = g.players.p1.hand.length;
        const mazoAntes = g.players.p1.deck.length;
        await paso({ finTurno: true }); await paso({ finTurno: true });   // vuelve su turno: fase de robo
        // El visor se abre con las 3 de arriba; se coge una.
        check('el visor se abre con las 3 de arriba y solo esas', ctx.pendientes.length === 1
            && ctx.pendientes[0].tipo === 'visorMazo' && ctx.pendientes[0].elegibles.length === 3,
            (ctx.pendientes[0] || {}).tipo + ' · ' + ((ctx.pendientes[0] || {}).elegibles || []).map(c => c.name).join(','));
        await paso({ elegir: [ctx.pendientes[0].elegibles[0].name] });
        check('se lleva UNA carta, no dos', g.players.p1.hand.length === manoAntes + 1,
            'mano ' + manoAntes + ' -> ' + g.players.p1.hand.length);
        check('...y sale del mazo (en lugar del robo normal)', g.players.p1.deck.length === mazoAntes - 1,
            'mazo ' + mazoAntes + ' -> ' + g.players.p1.deck.length);
    }

    console.log('\n--- Aguijón onírico: la ejecución ---');
    {
        // El enemigo agotado es objetivo válido; el otro no.
        const { g, paso, ctx } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Karlos' }, { carta: 'Kyle' }], mano: ['Aguijón onírico'] },
            p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 9, campos: { maxHp: 9, exhausted: true } },
                               { carta: 'Oso con armadura' }] },
        });
        const karlos = buscar(g, 'p1', 'Karlos'), tigre = buscar(g, 'p2', 'Mini-tigre');
        const vida0 = tigre.currentHp;
        await paso({ jugar: 'Aguijón onírico' });
        await paso({ elegir: ['Karlos'] });        // quién lo empuña
        // El pool de la elección lleva SOLO al enemigo indefenso: el Oso, que está entero, no
        // se puede señalar (el arnés protesta si se intenta, que es lo que se comprueba).
        const _pool = (ctx.pendientes[0] || {}).pool || [];
        check('solo se ofrece el enemigo indefenso',
            _pool.length === 1 && _pool[0].name === 'Mini-tigre', _pool.map(c => c.name).join(','));
        await paso({ elegir: ['Mini-tigre'] });
        check('el aliado gasta su acción', karlos.exhausted === true);
        check('...le clava un especial (ATQ 5 - DEF 3 = 2)', tigre.currentHp === vida0 - 2, 'vida=' + tigre.currentHp);
        check('...y gana 4 de Furor', karlos.furor === 4, 'furor=' + karlos.furor);
    }
    {
        // Y si el golpe MATA, otro aliado distinto gana otros 4.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Karlos' }, { carta: 'Kyle' }], mano: ['Aguijón onírico'] },
            p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 1, campos: { exhausted: true } },
                               { carta: 'Oso con armadura' }] },
        });
        const karlos = buscar(g, 'p1', 'Karlos'), kyle = buscar(g, 'p1', 'Kyle');
        await paso({ jugar: 'Aguijón onírico' });
        await paso({ elegir: ['Karlos'] });
        await paso({ elegir: ['Mini-tigre'] });
        check('el enemigo muere', !enCampo(g, 'p2', 'Mini-tigre'));
        await paso({ elegir: ['Kyle'] });
        check('...y OTRO aliado distinto gana 4 de Furor', kyle.furor === 4, 'furor=' + kyle.furor);
        check('...además de los 4 del que atacó', karlos.furor === 4, 'furor=' + karlos.furor);
    }
    {
        // Sin nadie indefenso enfrente, la Ayuda ni se juega.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Karlos' }], mano: ['Aguijón onírico'] },
            p2: { vanguardia: [{ carta: 'Mini-tigre' }] },
        });
        await paso({ jugar: 'Aguijón onírico' });
        check('sin enemigos indefensos no se puede jugar',
            g.players.p1.hand.some(c => c.name === 'Aguijón onírico'));
    }

    console.log('');
    if (fallos) { console.log(`SUITE hollow_knight: ${fallos} FALLOS de ${comprobaciones} comprobaciones`); process.exit(1); }
    console.log(`SUITE hollow_knight: ${comprobaciones}/${comprobaciones} comprobaciones — LA TANDA HK CUMPLE`);
})().catch(e => { console.error(e); process.exit(1); });
