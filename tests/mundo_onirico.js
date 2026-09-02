// tests/mundo_onirico.js — MORFEO, y el arquetipo 'Mundo onírico' que Grimm llevaba solo.
//
// Lo que hay que fijar, que es lo que se puede romper sin que se note:
//   · REY DE LA IMAGINACIÓN duerme las DOS vanguardias, la propia incluida. Es simétrico a
//     propósito: lo que lo hace bueno es ELEGIR el momento, no que perdone a los tuyos.
//   · Morfeo es inmune al Sueño, y esa inmunidad es a UN estado, no a todos: los demás sí le
//     entran (si no, sería un Hagoromo gratis pegado a la carta).
//   · ORIGEN sube stats BASE, no bonos temporales: tienen que sobrevivir a una pasada de
//     pasivas, que es donde mueren los bonos mal puestos.
//   · Y toca a los enemigos con la etiqueta también. Es una carta de arquetipo, no un buff.
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
const buscar = (g, pid, nombre) =>
    [...g.players[pid].vanguard, ...g.players[pid].rearguard].find(c => c && c.name === nombre);
const duerme = (c) => !!(c && c.status && c.status.sueno && c.status.sueno.duration > 0);

(async () => {
    console.log('--- REY DE LA IMAGINACIÓN: duerme las dos vanguardias ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Mini-tigre', 'Guardia'], mano: ['Morfeo'] },
            p2: { vanguardia: ['Oso con armadura', 'Hechicero'] },
        });
        await paso({ jugar: 'Morfeo' });
        const morfeo = buscar(g, 'p1', 'Morfeo');
        check('Morfeo entra en la vanguardia', !!morfeo);
        check('duerme a los enemigos', duerme(buscar(g, 'p2', 'Oso con armadura')) && duerme(buscar(g, 'p2', 'Hechicero')));
        check('...y también a los tuyos, que es el precio', duerme(buscar(g, 'p1', 'Mini-tigre')) && duerme(buscar(g, 'p1', 'Guardia')));
        check('...pero a él no le entra: es inmune al Sueño', !duerme(morfeo));
        // SIN CUENTA: el Sueño de Morfeo no lleva número de turnos, así que no caduca solo. Se
        // sale echando una moneda y sacando cara, que es la regla del estado.
        const tigre = buscar(g, 'p1', 'Mini-tigre');
        check('el Sueño entra sin cuenta atrás', g.constructor.sinCuenta(tigre.status.sueno.duration),
            'duracion=' + tigre.status.sueno.duration);
        await paso({ finTurno: true });
        check('...y no se le va al terminar el turno', duerme(tigre),
            'duracion=' + (tigre.status.sueno ? tigre.status.sueno.duration : 'sin estado'));
        check('y el log lo dice con el nombre del estado, no con la clave interna',
            g.logHistory.some(e => /inmune a Sueño/.test(e.msg)) , 'sin línea de inmunidad');
    }

    console.log('\n--- La inmunidad es SOLO al Sueño ---');
    {
        const { g } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Morfeo'] }, p2: { vanguardia: ['Mini-tigre'] },
        });
        const morfeo = buscar(g, 'p1', 'Morfeo');
        g.applyStatus(morfeo, 'sueno', 2, null, null);
        check('el Sueño rebota', !duerme(morfeo));
        g.applyStatus(morfeo, 'ceguera', 2, null, null);
        check('la Ceguera SÍ le entra', !!(morfeo.status.ceguera && morfeo.status.ceguera.duration > 0));
    }

    console.log('\n--- ORIGEN: +1 permanente a todo lo del Mundo onírico ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Morfeo', furor: 2 }, 'Mini-tigre'] },
            p2: { vanguardia: ['Grimm'] },
        });
        const morfeo = buscar(g, 'p1', 'Morfeo');
        const tigre = buscar(g, 'p1', 'Mini-tigre');
        const grimm = buscar(g, 'p2', 'Grimm');
        const antes = { m: [morfeo.maxHp, morfeo.currentDef, morfeo.currentAtk],
                        t: [tigre.maxHp, tigre.currentDef, tigre.currentAtk],
                        gr: [grimm.maxHp, grimm.currentDef, grimm.currentAtk] };
        await paso({ habilidad: 'Morfeo' }); await paso({ confirmar: true });
        check('Morfeo se sube a sí mismo (lleva la etiqueta)',
            morfeo.maxHp === antes.m[0] + 1 && morfeo.currentDef === antes.m[1] + 1 && morfeo.currentAtk === antes.m[2] + 1,
            `${morfeo.maxHp}/${morfeo.currentDef}/${morfeo.currentAtk}`);
        check('...y al Grimm ENEMIGO, que también la lleva',
            grimm.maxHp === antes.gr[0] + 1 && grimm.currentDef === antes.gr[1] + 1 && grimm.currentAtk === antes.gr[2] + 1,
            `${grimm.maxHp}/${grimm.currentDef}/${grimm.currentAtk}`);
        check('...pero no al Mini-tigre, que no es del sueño',
            tigre.maxHp === antes.t[0] && tigre.currentDef === antes.t[1] && tigre.currentAtk === antes.t[2]);
        check('cobra sus 2 de Furor', morfeo.furor === 0, 'furor=' + morfeo.furor);
        // Lo importante: son stats BASE. Una pasada de pasivas recalcula currentAtk/currentDef
        // desde la base, así que un bono mal puesto se evapora justo aquí.
        g.updatePassives();
        check('y sobreviven a una pasada de pasivas',
            morfeo.currentDef === antes.m[1] + 1 && morfeo.currentAtk === antes.m[2] + 1,
            `${morfeo.currentDef}/${morfeo.currentAtk}`);
    }

    console.log('\n--- El Sueño no se lo come su propia inmunidad al volver a jugarse ---');
    {
        // Morfeo entrando con un Morfeo enemigo ya en mesa: el de enfrente TAMPOCO se duerme.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Mini-tigre'], mano: ['Morfeo'] },
            p2: { vanguardia: ['Morfeo'] },
        });
        await paso({ jugar: 'Morfeo' });
        check('el Morfeo enemigo tampoco se duerme', !duerme(buscar(g, 'p2', 'Morfeo')));
        check('pero el resto de su vanguardia sí lo habría hecho', duerme(buscar(g, 'p1', 'Mini-tigre')));
    }

    console.log('\n--- Comedor de sueños: entra por la puerta que le abre Morfeo ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 0 }], mano: ['Comedor de sueños'] },
            p2: { vanguardia: ['Oso con armadura'] },
        });
        // Sin nadie dormido y sin Furor que tributar, no puede entrar.
        await paso({ jugar: 'Comedor de sueños' });
        check('sin aliado dormido y sin Furor, no entra', !buscar(g, 'p1', 'Comedor de sueños'));
        // Con un aliado dormido entra GRATIS: nadie paga Furor.
        const tigre = buscar(g, 'p1', 'Mini-tigre');
        g.applyStatus(tigre, 'sueno', 2, null, null);
        await paso({ jugar: 'Comedor de sueños' });
        check('con un aliado dormido entra gratis', !!buscar(g, 'p1', 'Comedor de sueños'));
        check('...y no le cuesta Furor a nadie', tigre.furor === 0);
    }

    console.log('\n--- TERROR NOCTURNO: una ventana, no una ejecución ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Comedor de sueños', furor: 1 }] },
            p2: { vanguardia: ['Agah'] },
        });
        const comedor = buscar(g, 'p1', 'Comedor de sueños');
        const agah = buscar(g, 'p2', 'Agah');
        const vida0 = agah.currentHp;
        // Sin Sueño encima no se puede usar.
        await paso({ habilidad: 'Comedor de sueños' });
        check('sin enemigos dormidos no se puede usar', comedor.furor === 1);
        g.applyStatus(agah, 'sueno', 2, null, null);
        await paso({ habilidad: 'Comedor de sueños' }); await paso({ confirmar: true });
        await paso({ elegir: ['Agah'] });
        check('la VIDA se le queda en 1', agah.currentHp === 1, 'vida=' + agah.currentHp);
        check('...la DEF también', agah.currentDef === 1, 'def=' + agah.currentDef);
        check('...y el ATQ también', agah.currentAtk === 1, 'atq=' + agah.currentAtk);
        g.updatePassives();
        check('y aguantan una pasada de pasivas', agah.currentDef === 1 && agah.currentAtk === 1);
        // Al terminar TU turno vuelve a ser el que era: es una ventana, no un asesinato.
        await paso({ finTurno: true });
        check('al acabar tu turno recupera la VIDA', agah.currentHp === vida0, 'vida=' + agah.currentHp);
        check('...y las otras dos', agah.currentDef > 1 && agah.currentAtk > 1,
            `${agah.currentDef}/${agah.currentAtk}`);
    }

    console.log('\n--- La raíz: una subida PERMANENTE de stat sobrevive a la pasada ---');
    {
        // El +1 de DEF del Gólem multielemental no hacía NADA desde que se escribió: subía su base
        // y updatePassives volvía a leer la de la plantilla. Se arregló al escribir ORIGEN, que
        // tropezaba con lo mismo, y se queda aquí fijado con la carta que lo destapó.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Mini-tigre'] },
            p2: { vanguardia: ['Gólem multielemental'] },
        });
        const golem = buscar(g, 'p2', 'Gólem multielemental');
        const def0 = golem.currentDef;
        await paso({ atacar: 'Mini-tigre', objetivo: 'Gólem multielemental' });
        check('CAMBIO DE COLOR sube la DEF de verdad', golem.currentDef === def0 + 1, 'def=' + golem.currentDef);
        g.updatePassives();
        check('...y sigue ahí tras recalcular las pasivas', golem.currentDef === def0 + 1, 'def=' + golem.currentDef);
    }

    console.log(`\nSUITE mundo_onirico: ${fallos ? fallos + ' FALLOS de ' : comprobaciones + '/'}${comprobaciones} comprobaciones` +
        (fallos ? '' : ' — MORFEO CUMPLE'));
    if (fallos) process.exit(1);
})();
