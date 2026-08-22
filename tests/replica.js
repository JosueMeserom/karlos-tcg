// tests/replica.js — RÉPLICA de NoName: el anuncio espera al punto de compromiso.
//
// Copiar la Habilidad de otro son DOS decisiones seguidas: a quién escaneas y, después, lo que
// pida la habilidad copiada. Hasta el 22-ago-2026 el anuncio (log + flotante + enlace mental)
// salía al terminar la PRIMERA, así que cancelar la segunda dejaba dicho en público algo que no
// llegaba a pasar — y, peor, dejaba el `mimicId` puesto: el siguiente clic en RÉPLICA entraba
// directo a elegir objetivos de la OTRA habilidad, con los dos clientes desincronizados.
//
// Ahora el anuncio se ARMA y lo dispara `DSL._comprometer` en el mismo instante en que la
// habilidad copiada deja de poder deshacerse (§14, la misma regla del cobro y la presentación).
//
// Aserciones directas: la base congelada anuncia en otro momento a propósito, así que no hay
// nada que comparar. Lo que se fija es que cancelar no deje rastro y que completar sí lo deje,
// en el orden correcto.
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
        logs: () => g.logHistory.map(e => e.msg),
        flotantes: () => ctx.flotantes.map(f => f.texto),
    };
}
const MESA = {
    turno: 2, turnoDe: 'p1', empieza: 'p2',
    p1: { vanguardia: [{ carta: 'NoName', furor: 4 }, { carta: 'Mini-tigre', furor: 3 }] },
    p2: { vanguardia: [{ carta: 'Nethuns', furor: 2 }, { carta: 'Oso con armadura', furor: 2 }] },
};
const anuncio = (l) => l.some(m => m.includes('escanea y replica'));

(async () => {
    console.log('--- Cancelar la elección de la habilidad copiada no deja rastro ---');
    {
        const { ctx, g, paso, logs, flotantes } = await mesa(MESA);
        const noname = g.players.p1.vanguard[0];
        await paso({ habilidad: 'NoName' });
        await paso({ confirmar: true });
        await paso({ seleccionar: 'Nethuns', jugador: 'p2' });
        // Escaneado, pero la habilidad copiada (DERRENGAR) está pidiendo a quién derrengar.
        check('todavía NO se ha anunciado nada', !anuncio(logs()));
        check('...ni se ha pintado el flotante de RÉPLICA', !flotantes().includes('RÉPLICA'));
        check('...ni se ha cobrado Furor', noname.furor === 4, 'furor=' + noname.furor);

        g.cancelAction(); await asentar(ctx);
        check('tras cancelar, sigue sin anunciarse', !anuncio(logs()));
        check('...NoName olvida la habilidad copiada', !noname.mimicId, 'mimicId=' + noname.mimicId);
        check('...y el enemigo sigue intacto',
            g.players.p2.vanguard.every(c => c.furor === 2 && !(c.status && c.status.silencio)));
    }

    console.log('--- Completar la elección sí lo anuncia, y en su orden ---');
    {
        const { g, paso, logs, flotantes } = await mesa(MESA);
        const noname = g.players.p1.vanguard[0];
        await paso({ habilidad: 'NoName' });
        await paso({ confirmar: true });
        await paso({ seleccionar: 'Nethuns', jugador: 'p2' });
        await paso({ elegirTablero: ['Oso con armadura', 'Nethuns'] });

        const l = logs();
        check('se anuncia la RÉPLICA', anuncio(l));
        check('...nombrando la Habilidad copiada', l.some(m => m.includes('[DERRENGAR]')));
        // El anuncio va ANTES del log de la habilidad copiada: primero se dice que la copia,
        // luego lo que hace.
        const iRep = l.findIndex(m => m.includes('escanea y replica'));
        const iHab = l.findIndex(m => m.includes('arrastra a la vanguardia'));
        check('...antes del log de la habilidad en sí', iRep !== -1 && iHab !== -1 && iRep < iHab,
            `réplica=${iRep} habilidad=${iHab}`);
        // Y ese log habla de QUIEN la está usando, no de la carta copiada: es NoName quien
        // arrastra, aunque la frase sea de Nethuns.
        check('...y la habilidad copiada nombra a NoName, no a Nethuns',
            l.some(m => m.includes('¡NoName arrastra a la vanguardia enemiga bajo la marea!')),
            l.find(m => m.includes('arrastra')) || '(no está)');
        check('el flotante anuncia la Habilidad copiada, no "RÉPLICA" dos veces',
            flotantes().filter(t => t === 'RÉPLICA').length === 1 && flotantes().includes('DERRENGAR'),
            flotantes().join(' · '));
        check('se cobra el coste de la copiada (2 de Furor)', noname.furor === 2, 'furor=' + noname.furor);
        check('y el efecto cae sobre los elegidos',
            g.players.p2.vanguard.every(c => c.furor === 0 && c.status && c.status.silencio));
    }

    console.log('--- Copiando una Habilidad IMPERATIVA se anuncia al momento ---');
    {
        // La rama de respaldo: sin declaración no hay forma de saber dónde está su punto de
        // compromiso, así que se anuncia al escanear, como se hacía siempre.
        const { g, paso, logs } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'NoName', furor: 4 }] },
            p2: { vanguardia: [{ carta: 'Karolina', furor: 2 }] },
        });
        await paso({ habilidad: 'NoName' });
        await paso({ confirmar: true });
        await paso({ seleccionar: 'Karolina', jugador: 'p2' });
        check('se anuncia nada más escanear', anuncio(logs()));
        check('...nombrando su Habilidad', logs().some(m => m.includes('[HOSTIA MÁGICA TERRIBLE]')));
    }

    console.log('');
    if (fallos) { console.log(`SUITE replica: ${fallos} FALLOS de ${comprobaciones} comprobaciones`); process.exit(1); }
    console.log(`SUITE replica: ${comprobaciones}/${comprobaciones} comprobaciones — RÉPLICA EN VERDE`);
})().catch(e => { console.error(e); process.exit(1); });
