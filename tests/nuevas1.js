// tests/nuevas1.js — CARTAS NUEVAS, tanda 1 (7-ago-2026): los Eventos que otras cartas buscaban.
//
// ════════════════════════════════════════════════════════════════════════════════════════
//  ESTE FICHERO ES EL MOLDE PARA LAS ~148 CARTAS QUE QUEDAN DEL EXCEL. Léelo antes de
//  escribir `nuevas2.js`, y copia su forma.
// ════════════════════════════════════════════════════════════════════════════════════════
//
// POR QUÉ NO ES UNA SUITE DE REGRESIÓN. El arnés comparativo (`correrSuite`) ejecuta el mismo
// escenario contra `cartas_antes_de_dsl.js` (VIEJA, congelada) y `cartas.js` (NUEVA), y compara.
// Con una carta que NO EXISTE en la vieja, la pasada vieja ni siquiera arranca: `construirEstado`
// lanza "carta no encontrada en CARD_DB". No hay nada contra lo que comparar, por definición.
//
// Así que las cartas nuevas se prueban por ASERCIÓN, como ya se hacía con Neo (`carta_neo.js`):
// se monta la mesa, se ejecutan pasos y se comprueba lo que debe pasar. Mismos helpers del arnés
// (crearContexto/crearJuego/construirEstado/ejecutarPaso), solo cambia quién juzga el resultado.
//
// QUÉ COMPROBAR EN UNA CARTA NUEVA, por orden de importancia:
//   1. Que se puede JUGAR cuando debe, y que se RECHAZA cuando no (los requisitos son la mitad
//      del texto de casi toda carta, y son lo primero que se rompe).
//   2. Que su efecto principal hace lo que el texto promete, con un número comprobable.
//   3. Que lo que dura, dura: si es un Evento, que expira cuando toca y que su efecto se va.
//   4. Si la carta DESBLOQUEA a otra, que la otra funcione. Eso es lo que justifica esta tanda.
//
// Lo que NO hace falta comprobar: que el compilador del DSL funcione. Eso ya lo cubren las 64
// suites de regresión. Aquí se comprueba la CARTA, no la maquinaria.

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

// Monta una mesa y devuelve {ctx, g, paso} — `paso` es ejecutarPaso ya atado, para que los
// escenarios se lean como una partida y no como fontanería.
async function mesa(esc) {
    const ctx = crearContexto('nueva');
    ctx.semilla = 1;
    const g = crearJuego(ctx);
    await asentar(ctx);
    construirEstado(ctx, g, esc);
    return { ctx, g, paso: (p) => ejecutarPaso(ctx, g, p) };
}
const enCampo = (g, pid, nombre) => [...g.players[pid].vanguard, ...g.players[pid].rearguard].some(c => c.name === nombre);
const buscar = (g, pid, nombre) => [...g.players[pid].vanguard, ...g.players[pid].rearguard].find(c => c.name === nombre);

(async () => {
    console.log('--- Una buena razón: desbloquea a Xanadu, Diego Antonio y Silhouette ---');
    // El motivo de que esta tanda vaya primera. Las dos cartas están implementadas desde hace
    // tiempo y eran INCOLOCABLES: su canPlayCard busca este Evento por nombre y no existía.
    // Silhouette se suma el 25-ago-2026, al migrar su requisito al DSL: las tres comparten
    // ahora el mismo `eventoEnJuego`, así que se comprueban juntas.
    for (const carta of ['Xanadu', 'Diego Antonio', 'Silhouette']) {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { mano: [carta], evento: 'Una buena razón' },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ jugar: carta });
        check(`${carta} SÍ se coloca con el Evento en juego`, enCampo(g, 'p1', carta));
    }
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { mano: ['Xanadu'] }, p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ jugar: 'Xanadu' });
        check('...y NO se coloca sin él (el requisito sigue vivo)', !enCampo(g, 'p1', 'Xanadu'));
    }

    console.log('\n--- Una buena razón: sus propios requisitos ---');
    {
        // "Sólo si tu rival no tiene Evento en juego."
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { mano: ['Una buena razón'] },
            p2: { vanguardia: ['Mini-tigre'], evento: 'Apagón' },
        });
        await paso({ jugar: 'Una buena razón' });
        check('rechazada si el RIVAL ya tiene un Evento', !g.players.p1.activeEvent,
            g.players.p1.activeEvent && g.players.p1.activeEvent.name);
    }
    {
        // "No puedes volver a usarla en toda la partida (pero tu rival sí)". Se apoya en el
        // patrón de Espada V/Shichishito: MARCAR_JUGADOR + requisito sobre el campo del jugador.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { mano: ['Una buena razón', 'Una buena razón'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ jugar: 'Una buena razón', indice: 0 });
        check('se juega la primera vez', !!g.players.p1.activeEvent);
        check('...y deja la marca en el JUGADOR, no en la carta', g.players.p1.usadaUnaBuenaRazon === true);
        // Se destruye el Evento para que el hueco quede libre y el segundo intento sea limpio.
        g.players.p1.activeEvent = null;
        await paso({ jugar: 'Una buena razón', indice: 0 });
        check('la SEGUNDA vez se rechaza en la misma partida', !g.players.p1.activeEvent);
        check('...pero el rival no queda marcado (es por jugador)', !g.players.p2.usadaUnaBuenaRazon);
    }

    console.log('\n--- Fusión de planos: desbloquea la Activa de La Bestia ---');
    {
        // CATÁSTROFE busca esta carta en el mazo. Antes no podía encontrarla nunca.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'La Bestia', furor: 1 }], mazo: ['Fusión de planos', 'Mini-tigre', 'Mini-tigre'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ habilidad: 'La Bestia' });
        await paso({ confirmar: true });
        await paso({ elegir: ['Fusión de planos'] });
        check('CATÁSTROFE encuentra Fusión de planos y la lleva a la mano',
            g.players.p1.hand.some(c => c.name === 'Fusión de planos'),
            JSON.stringify(g.players.p1.hand.map(c => c.name)));
    }
    {
        // Su efecto al expirar: -2 de Furor a todos los enemigos.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Mini-tigre'], evento: 'Fusión de planos' },
            p2: { vanguardia: ['Droide antidisturbios'],
                  retaguardia: [{ carta: 'Oso con armadura', furor: 4 }, { carta: 'Mini-tigre', furor: 1 }] },
        });
        for (let i = 0; i < 6 && g.players.p1.activeEvent; i++) await paso({ finTurno: true });
        check('al expirar, el enemigo con 4 de Furor baja a 2',
            buscar(g, 'p2', 'Oso con armadura').furor === 2, 'furor=' + buscar(g, 'p2', 'Oso con armadura').furor);
        check('...y el que tenía 1 se queda en 0, sin bajar de ahí (el Furor no es negativo)',
            buscar(g, 'p2', 'Mini-tigre').furor === 0, 'furor=' + buscar(g, 'p2', 'Mini-tigre').furor);
    }

    console.log('\n--- Cambio de canal y Publicidad mental: completan la Activa de Berry ---');
    {
        // INTERFAZ promete buscar 'Rebobinar', 'Cambio de canal' o 'Publicidad mental'. Solo
        // existía la primera, así que ofrecía un tercio de lo que dice su texto.
        const { ctx, g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Mini-tigre', 'Oso con armadura', 'Droide antidisturbios', 'Guardia'],
                  retaguardia: [{ carta: 'Berry', furor: 1 }],
                  mazo: ['Cambio de canal', 'Publicidad mental', 'Mini-tigre'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ habilidad: 'Berry' });
        await paso({ confirmar: true });
        // INTERFAZ migrada a `confirmarPorZona` (7-ago-2026): antes mezclaba mazo y descartes en
        // un modal genérico -que revelaba qué copias tenías en el mazo sin haber decidido
        // mirarlo-. Ahora pregunta primero la ZONA, y el mazo abre su visor completo.
        const zona = ctx.pendientes[0] || {};
        check('INTERFAZ pregunta primero en qué zona buscar', zona.tipo === 'opcion',
            'tipo=' + zona.tipo);
        await paso({ opcion: 'BUSCAR EN EL MAZO' });
        const pend = ctx.pendientes[0] || {};
        check('...y el mazo se enseña con su visor, no con el modal genérico', pend.tipo === 'visorMazo',
            'tipo=' + pend.tipo);
        const nombres = (pend.elegibles || []).map(c => c.name);
        check('INTERFAZ ofrece las dos cartas nuevas como elegibles',
            nombres.includes('Cambio de canal') && nombres.includes('Publicidad mental'),
            JSON.stringify(nombres));
        await paso({ elegir: ['Cambio de canal'] });
        check('la elegida acaba en la mano', g.players.p1.hand.some(c => c.name === 'Cambio de canal'),
            JSON.stringify(g.players.p1.hand.map(c => c.name)));
    }
    {
        // Cambio de canal: lo único que hace es robar 3 al expirar.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Mini-tigre'], evento: 'Cambio de canal',
                  mazo: ['Mini-tigre', 'Mini-tigre', 'Mini-tigre', 'Mini-tigre', 'Mini-tigre', 'Mini-tigre', 'Mini-tigre', 'Mini-tigre'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        const manoAntes = g.players.p1.hand.length;
        let turnos = 0;
        for (let i = 0; i < 8 && g.players.p1.activeEvent; i++) { await paso({ finTurno: true }); turnos++; }
        // Roba 1 por turno propio (fase de robo) + 3 de golpe al expirar.
        check('al expirar roba 3 de golpe, además del robo normal',
            g.players.p1.hand.length >= manoAntes + 3,
            `antes=${manoAntes} después=${g.players.p1.hand.length} en ${turnos} pasos`);
    }

    console.log('\n--- Publicidad mental: el aura sobre el elegido Y sobre todos los enemigos ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Oso con armadura', 'Mini-tigre'], mano: ['Publicidad mental'] },
            p2: { vanguardia: ['Droide antidisturbios', 'Guardia'] },
        });
        const baseOso = buscar(g, 'p1', 'Oso con armadura').currentAtk;
        const baseTigre = buscar(g, 'p1', 'Mini-tigre').currentAtk;
        const baseDroide = buscar(g, 'p2', 'Droide antidisturbios').currentAtk;
        await paso({ jugar: 'Publicidad mental' });
        await paso({ elegir: ['Oso con armadura'] });
        g.updatePassives();

        check('el aliado elegido pierde 2 de Atq',
            buscar(g, 'p1', 'Oso con armadura').currentAtk === baseOso - 2,
            `${baseOso} -> ${buscar(g, 'p1', 'Oso con armadura').currentAtk}`);
        check('el aliado NO elegido no se ve afectado',
            buscar(g, 'p1', 'Mini-tigre').currentAtk === baseTigre,
            `${baseTigre} -> ${buscar(g, 'p1', 'Mini-tigre').currentAtk}`);
        check('TODOS los enemigos pierden 2 de Atq',
            buscar(g, 'p2', 'Droide antidisturbios').currentAtk === baseDroide - 2
            && buscar(g, 'p2', 'Guardia').currentAtk === 1,
            `droide=${buscar(g, 'p2', 'Droide antidisturbios').currentAtk} guardia=${buscar(g, 'p2', 'Guardia').currentAtk}`);

        // Y lo que más se olvida al escribir un aura: que se VAYA al expirar.
        for (let i = 0; i < 8 && g.players.p1.activeEvent; i++) await paso({ finTurno: true });
        g.updatePassives();
        check('al expirar, el Atq del elegido vuelve a su sitio',
            buscar(g, 'p1', 'Oso con armadura').currentAtk === baseOso,
            'atq=' + buscar(g, 'p1', 'Oso con armadura').currentAtk);
        check('...y el de los enemigos también',
            buscar(g, 'p2', 'Droide antidisturbios').currentAtk === baseDroide,
            'atq=' + buscar(g, 'p2', 'Droide antidisturbios').currentAtk);
    }

    console.log('\n--- Exhibicionismo: la gemela, con Def ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Oso con armadura'], mano: ['Exhibicionismo'] },
            p2: { vanguardia: ['Droide antidisturbios'] },
        });
        const baseOso = buscar(g, 'p1', 'Oso con armadura').currentDef;
        const baseDroide = buscar(g, 'p2', 'Droide antidisturbios').currentDef;
        await paso({ jugar: 'Exhibicionismo' });
        await paso({ elegir: ['Oso con armadura'] });
        g.updatePassives();
        check('el elegido pierde 2 de Def',
            buscar(g, 'p1', 'Oso con armadura').currentDef === baseOso - 2,
            `${baseOso} -> ${buscar(g, 'p1', 'Oso con armadura').currentDef}`);
        check('y los enemigos también',
            buscar(g, 'p2', 'Droide antidisturbios').currentDef === baseDroide - 2,
            `${baseDroide} -> ${buscar(g, 'p2', 'Droide antidisturbios').currentDef}`);
    }

    console.log(`\nSUITE nuevas1: ${comprobaciones - fallos}/${comprobaciones} comprobaciones`
        + (fallos ? ` — ${fallos} FALLOS` : ' — CARTAS NUEVAS CORRECTAS'));
    if (fallos) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
