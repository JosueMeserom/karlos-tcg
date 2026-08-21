// tests/uniojo.js — COMENSAL: la reacción desde la mano a la MUERTE de un aliado.
//
// Aserciones directas y no comparación viejo-vs-nuevo: la migración al DSL (trigger REACCION con
// `sobre: 'MUERTE_ALIADO'` + op COLOCARSE) arregla de paso dos cosas de la versión imperativa, así
// que las salidas TIENEN que divergir de la base congelada:
//
//   1. La vieja hacía `handCard.location = deadCard.location` para copiar la zona del muerto...
//      pero para cuando el motor llama a esta reacción, la carta muerta YA está en el descarte
//      (resetCard le pone location='discard' unas líneas antes). Resultado: Uniojo entraba
//      SIEMPRE a la retaguardia y encima con location='discard' estando en el campo. Ahora la
//      zona la pasa el motor aparte, que es el único que la sabe.
//   2. Si la vanguardia se ha vuelto a llenar entre medias (alguien sube de retaguardia al
//      recolocar los huecos, y eso pasa ANTES de esta reacción), Uniojo entra atrás en vez de
//      colarse como quinto.
//
// Y el [n] de copia, que la vieja no asignaba al salir de la mano.
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
    return {
        ctx, g,
        paso: async (p) => { await ejecutarPaso(ctx, g, p); await asentar(ctx); },
        // Cuántas preguntas SÍ/NO se han abierto: es lo que distingue "he dicho que no" de
        // "ni se me ha ofrecido".
        modales: () => ctx.pendientes.filter(p => p.tipo === 'opcion'),
    };
}
const uniojo = (g) => [...g.players.p1.vanguard, ...g.players.p1.rearguard].find(c => c.name === 'Uniojo');
const enMano = (g) => g.players.p1.hand.some(c => c.name === 'Uniojo');

(async () => {
    console.log('--- Acepta: ocupa el hueco del muerto ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p2', empieza: 'p1',
            p1: { vanguardia: ['Karlos', { carta: 'Mini-tigre', vida: 1 }], mano: ['Uniojo'], retribucion: ['Longaniza', 'Longaniza'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ atacar: 'Mini-tigre', objetivo: 'Mini-tigre' });
        await paso({ opcion: 'SÍ' });
        const u = uniojo(g);
        check('Uniojo entra al campo', !!u);
        check('...en la MISMA zona en la que murió el aliado (vanguardia)', !!u && u.location === 'vanguard', u && u.location);
        check('...y de verdad está en el array de vanguardia', g.players.p1.vanguard.some(c => c.name === 'Uniojo'));
        check('...sale de la mano', !enMano(g));
        check('...con su [n] de copia asignado', !!u && !!u.copyId, u && String(u.copyId));
        check('...con +2 de Vida máxima', !!u && u.maxHp === 4, u && String(u.maxHp));
        check('...y esa Vida es efectiva, no un hueco vacío', !!u && u.currentHp === 4, u && String(u.currentHp));
    }

    console.log('--- Declina: no pasa nada ---');
    {
        const { g, paso, modales } = await mesa({
            turno: 2, turnoDe: 'p2', empieza: 'p1',
            p1: { vanguardia: ['Karlos', { carta: 'Mini-tigre', vida: 1 }], mano: ['Uniojo'], retribucion: ['Longaniza', 'Longaniza'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ atacar: 'Mini-tigre', objetivo: 'Mini-tigre' });
        check('se le ha preguntado', modales().length === 1);
        await paso({ opcion: 'NO' });
        check('Uniojo se queda en la mano', enMano(g));
        check('...y no entra al campo', !uniojo(g));
    }

    console.log('--- El muerto no es "Ser vivo": ni se ofrece ---');
    {
        const { g, paso, modales } = await mesa({
            turno: 2, turnoDe: 'p2', empieza: 'p1',
            p1: { vanguardia: ['Karlos', { carta: 'Robot de seguridad SP', vida: 1 }], mano: ['Uniojo'], retribucion: ['Longaniza', 'Longaniza'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ atacar: 'Mini-tigre', objetivo: 'Robot de seguridad SP' });
        check('el robot muere', !g.players.p1.vanguard.some(c => c.name === 'Robot de seguridad SP'));
        check('...sin abrir ninguna pregunta', modales().length === 0, 'modales=' + modales().length);
        check('...y Uniojo sigue en la mano', enMano(g));
    }

    console.log('--- La vanguardia se ha vuelto a llenar: entra atrás ---');
    {
        // Cuatro en vanguardia y uno detrás. Al morir el tigre, el motor sube al de retaguardia
        // ANTES de ofrecer esta reacción: el hueco ya no existe cuando Uniojo llega.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p2', empieza: 'p1',
            p1: {
                vanguardia: ['Karlos', { carta: 'Mini-tigre', vida: 1 }, 'Robot de seguridad SP', 'Hechicero'],
                retaguardia: ['Oso con armadura'],
                mano: ['Uniojo'],
                retribucion: ['Longaniza', 'Longaniza'],
            },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ atacar: 'Mini-tigre', objetivo: 'Mini-tigre' });
        await paso({ opcion: 'SÍ' });
        const u = uniojo(g);
        check('Uniojo entra igualmente', !!u);
        check('...pero a la RETAGUARDIA', !!u && u.location === 'rearguard', u && u.location);
        check('...sin dejar la vanguardia con cinco', g.players.p1.vanguard.length === 4,
            'vanguardia=' + g.players.p1.vanguard.length);
    }

    console.log('--- Sigue siendo un Esbirro normal ---');
    {
        const { ctx } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Karlos'], mano: ['Uniojo'], retribucion: ['Longaniza', 'Longaniza'] }, p2: { vanguardia: ['Mini-tigre'] },
        });
        // El compilador de REACCION deja injugables las AYUDAS de reacción (se quedan en la mano
        // esperando su momento). Uniojo no es una Ayuda: su reacción es una vía alternativa de
        // entrar, no un sustituto de colocarlo a mano.
        const t = ctx.CARD_DB.find(c => c.name === 'Uniojo');
        check('no se le ha puesto un canPlayCard que lo bloquee', typeof t.canPlayCard !== 'function');
    }

    console.log('');
    if (fallos) { console.log(`SUITE uniojo: ${fallos} FALLOS de ${comprobaciones} comprobaciones`); process.exit(1); }
    console.log(`SUITE uniojo: ${comprobaciones}/${comprobaciones} comprobaciones — COMENSAL EN VERDE`);
})().catch(e => { console.error(e); process.exit(1); });
