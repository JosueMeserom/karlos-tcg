// tests/conteo_pilas.js — un requisito sabe contar cartas en una PILA (19-oct-2026).
//
// Hasta hoy `DSL._zone` solo entendía el campo, la mano y el Evento, y cualquier otra zona caía
// al campo SIN AVISAR. Un `count: { zona: "DESCARTES" }` contaba aliados en mesa: Nigromántica
// dejaba pagar su Activa con el campo lleno de 'Seres vivos' y los descartes vacíos. La copia a
// mano de los requisitos de JUGAR sí entendía los DESCARTES propios, pero nada más (ni mazo, ni
// retribución, ni las pilas del rival). Las dos pasan ahora por `_zone`.
//
// Tres partes:
//   1. AUDITORÍA: toda `zona` declarada en un `count` de cualquier carta es una zona que `_zone`
//      conoce. Una zona mal escrita volvería a contar el campo en silencio.
//   2. El conteo de cada pila, por los dos motores (`_count` y el `canPlayCard` de JUGAR).
//   3. Las dos cartas afectadas, de punta a punta: Nigromántica y el Robot de limpieza CM, que
//      esperaba a esto para poder implementarse.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
    const DSL = vm.runInContext('DSL', ctx.sandbox);
    const tmpl = vm.runInContext('getCardTemplate', ctx.sandbox);
    return { ctx, g, DSL, tmpl, paso: (p) => ejecutarPaso(ctx, g, p) };
}
const enCampo = (g, pid, nombre) => [...g.players[pid].vanguard, ...g.players[pid].rearguard].find(c => c.name === nombre);
const nombres = (arr) => arr.map(c => c.name);

(async () => {
    console.log('--- 1. Auditoría: toda zona de un count es una zona conocida ---');
    {
        const { ctx } = await mesa({ turno: 2, turnoDe: 'p1', empieza: 'p2' });
        const CONOCIDAS = new Set(['vanguardia', 'retaguardia', 'mano', 'mazo', 'descartes', 'retribucion', 'retribución', 'evento']);
        const malas = [], vistas = new Set();
        const recorrer = (nodo, carta) => {
            if (!nodo || typeof nodo !== 'object') return;
            if (Array.isArray(nodo)) { nodo.forEach(x => recorrer(x, carta)); return; }
            if (nodo.count && typeof nodo.count === 'object' && nodo.count.zona !== undefined) {
                const z = String(nodo.count.zona).toLowerCase();
                vistas.add(z);
                if (!CONOCIDAS.has(z)) malas.push(`${carta}: zona "${nodo.count.zona}"`);
            }
            Object.values(nodo).forEach(v => { if (v && typeof v === 'object') recorrer(v, carta); });
        };
        ctx.CARD_DB.filter(Boolean).forEach(c => recorrer(c.abilities, c.name));
        check('ningún count declara una zona que `_zone` no conozca', malas.length === 0, malas.join(' | '));
        check('...y la auditoría ve de verdad zonas de pila (no está mirando el vacío)', vistas.has('descartes') && vistas.has('mano'),
            [...vistas].join(','));
    }

    console.log('\n--- 2. Cada pila se cuenta en su sitio, no en el campo ---');
    {
        const { g, DSL, tmpl } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            // El campo lleno de 'Seres vivos': es lo que antes se contaba en lugar de la pila.
            p1: { vanguardia: ['Karlos', 'Mini-tigre'], mano: ['Zoe', 'Manzanahoria'],
                  mazo: ['Guardia', 'Agah', 'Mimo'], descartes: ['Té helado'], retribucion: ['Lupa', 'Kyle'] },
            p2: { vanguardia: ['Agah'], descartes: ['Mini-tigre', 'Xanadu'] },
        });
        const rob = { owner: 'p1', instanceId: 'x' };
        const n = (spec) => DSL._count('p1', g, spec, rob);
        const serVivo = [ { campo: 'subtype', op: '==', valor: 'Ser vivo' } ];
        check('MANO cuenta la mano (2)', n({ zona: 'MANO' }) === 2, n({ zona: 'MANO' }));
        check('MAZO cuenta el mazo (3)', n({ zona: 'MAZO' }) === 3, n({ zona: 'MAZO' }));
        check('DESCARTES cuenta los descartes (1)', n({ zona: 'DESCARTES' }) === 1, n({ zona: 'DESCARTES' }));
        check('RETRIBUCION cuenta la retribución (2)', n({ zona: 'RETRIBUCION' }) === 2, n({ zona: 'RETRIBUCION' }));
        check('"Ser vivo" en DESCARTES = 0 aunque el campo esté lleno de ellos (el fallo de Nigromántica)',
            n({ zona: 'DESCARTES', filtros: serVivo }) === 0, n({ zona: 'DESCARTES', filtros: serVivo }));
        check('...y en el campo siguen contándose donde toca (2)', n({ filtros: serVivo }) === 2, n({ filtros: serVivo }));
        check('las pilas del RIVAL: quien ENEMIGO + DESCARTES (2)', n({ quien: 'ENEMIGO', zona: 'DESCARTES' }) === 2,
            n({ quien: 'ENEMIGO', zona: 'DESCARTES' }));
        check('`plantillaSin` también filtra aquí: Xanadu (pide condiciones) queda fuera',
            n({ quien: 'ENEMIGO', zona: 'DESCARTES', plantillaSin: ['onBeforePlayAsync', 'canPlayCard'] }) === 1);

        // El otro motor: la copia de requisitos de JUGAR (Líquido mortal pide un 'Ser vivo' sin
        // condiciones en TUS descartes).
        const liquido = tmpl(28);
        const p1 = g.players.p1;
        check('JUGAR: Líquido mortal NO se puede jugar sin Seres vivos en descartes, con el campo lleno de ellos',
            liquido.canPlayCard({ owner: 'p1', id: 28 }, g, p1) !== true);
        p1.discard.push(Object.assign({}, p1.vanguard.find(c => c.name === 'Mini-tigre'), { instanceId: 'mt-d', location: 'discard' }));
        check('...y SÍ en cuanto hay uno', liquido.canPlayCard({ owner: 'p1', id: 28 }, g, p1) === true);
    }

    console.log('\n--- 3a. Nigromántica: sin caídos en descartes, la Activa no se abre ---');
    {
        const { ctx, g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Karlos', 'Mini-tigre', { carta: 'Nigromántica', furor: 1 }] },
            p2: { vanguardia: ['Agah'] },
        });
        await paso({ habilidad: 'Nigromántica' });
        check('con el campo lleno de Seres vivos y los descartes vacíos, no llega a preguntar nada', !ctx.pendientes.length,
            JSON.stringify(ctx.pendientes.map(x => x.tipo)));
        const ni = enCampo(g, 'p1', 'Nigromántica');
        check('...ni cobra Furor ni gasta la acción', ni.furor === 1 && !ni.exhausted, `furor=${ni.furor} exhausted=${ni.exhausted}`);
    }

    console.log('\n--- 3b. Robot de limpieza CM: una carta de la mano por una Ayuda de los descartes ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Robot de limpieza CM', furor: 1 }], mano: ['Mini-tigre', 'Guardia'],
                  descartes: ['Té helado', 'Oso con armadura'] },
            p2: { vanguardia: ['Agah'] },
        });
        await paso({ habilidad: 'Robot de limpieza CM' });
        await paso({ confirmar: true });
        await paso({ elegir: ['Mini-tigre'] });
        await paso({ elegir: ['Té helado'] });
        const p1 = g.players.p1, rob = enCampo(g, 'p1', 'Robot de limpieza CM');
        check('la Ayuda pasa de los descartes a la mano', nombres(p1.hand).includes('Té helado') && !nombres(p1.discard).includes('Té helado'),
            `mano=${nombres(p1.hand)} descartes=${nombres(p1.discard)}`);
        check('...la carta elegida se descarta', nombres(p1.discard).includes('Mini-tigre') && !nombres(p1.hand).includes('Mini-tigre'));
        check('...la otra se queda en la mano', nombres(p1.hand).includes('Guardia'));
        check('...se cobra 1 de Furor y gasta su acción', rob.furor === 0 && rob.exhausted, `furor=${rob.furor} exhausted=${rob.exhausted}`);
    }
    {
        // El visor de descartes enseña la pila entera pero solo deja elegir Ayudas, y la carta que
        // pagas NO está en él: se descarta al final.
        const { ctx, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Robot de limpieza CM', furor: 1 }], mano: ['Manzanahoria'],
                  descartes: ['Té helado', 'Oso con armadura'] },
            p2: { vanguardia: ['Agah'] },
        });
        await paso({ habilidad: 'Robot de limpieza CM' });
        await paso({ confirmar: true });
        await paso({ elegir: ['Manzanahoria'] });
        const v = ctx.pendientes[0] || {};
        check('se abre el VISOR de pila, no el modal genérico', v.tipo === 'visorMazo', v.tipo);
        check('...solo las Ayudas son elegibles', JSON.stringify(nombres(v.elegibles || [])) === '["Té helado"]', JSON.stringify(nombres(v.elegibles || [])));
        check('...y la carta que vas a pagar (otra Ayuda) no se cuela en la búsqueda', !nombres(v.elegibles || []).includes('Manzanahoria'));
    }
    {
        // Cancelar la búsqueda: los descartes se cancelan siempre, y no ha pasado nada.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Robot de limpieza CM', furor: 1 }], mano: ['Mini-tigre'], descartes: ['Té helado'] },
            p2: { vanguardia: ['Agah'] },
        });
        await paso({ habilidad: 'Robot de limpieza CM' });
        await paso({ confirmar: true });
        await paso({ elegir: ['Mini-tigre'] });
        await paso({ cancelar: true });
        const p1 = g.players.p1, rob = enCampo(g, 'p1', 'Robot de limpieza CM');
        check('cancelar el visor: la carta elegida sigue en la mano', nombres(p1.hand).includes('Mini-tigre'), nombres(p1.hand));
        check('...la Ayuda sigue en descartes', nombres(p1.discard).includes('Té helado'));
        check('...y no se cobra Furor ni se gasta la acción', rob.furor === 1 && !rob.exhausted, `furor=${rob.furor} exhausted=${rob.exhausted}`);
    }
    {
        // Requisitos: sin Ayudas en descartes (aunque haya Ayudas en la MANO y en el campo nada
        // que valga) y con la mano vacía.
        const sinAyuda = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Robot de limpieza CM', furor: 1 }], mano: ['Té helado'], descartes: ['Mini-tigre'] },
            p2: { vanguardia: ['Agah'] },
        });
        await sinAyuda.paso({ habilidad: 'Robot de limpieza CM' });
        check('sin Ayudas en descartes no se abre (una Ayuda en la mano no cuenta)', !sinAyuda.ctx.pendientes.length);
        const manoVacia = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Robot de limpieza CM', furor: 1 }], descartes: ['Té helado'] },
            p2: { vanguardia: ['Agah'] },
        });
        await manoVacia.paso({ habilidad: 'Robot de limpieza CM' });
        check('con la mano vacía no se abre', !manoVacia.ctx.pendientes.length);
    }

    console.log(`\nSUITE conteo_pilas: ${fallos ? fallos + ' FALLOS de ' : comprobaciones + '/'}${comprobaciones} comprobaciones` + (fallos ? '' : ' — LAS PILAS SE CUENTAN DONDE TOCA'));
    if (fallos) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
