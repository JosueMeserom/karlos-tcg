// tests/hueco_vanguardia.js — jugar un Personaje con la VANGUARDIA LLENA.
//
// Toto lo encontró con Wolfgang y confirmó despues que le pasa a CUALQUIER Personaje: con la
// vanguardia llena, la carta NO se presentaba. El motor suspendía la jugada en `_decidirZona`
// -antes de sacarla de la mano y antes de cualquier animación-, pedía el Esbirro a retirar por el
// log, y al elegir lo colocaba todo de golpe. Con Wolfgang eso significaba ademas que su coste (la
// Manzanahoria) se descartaba antes de que la carta se hubiera visto (18-ago-2026).
//
// El flujo correcto, que es el que fija esta suite: la carta SE PRESENTA y se queda parada en el
// escaparate, ENTONCES se pide el Esbirro, y al elegirlo la carta baja a SU hueco -el que deja el
// retirado, no el final de la fila- mientras el Esbirro se va a retaguardia.
//
// Lo que se comprueba es el CONTRATO, que es lo que una animación no debe cambiar:
//   · mientras se elige, la carta ya NO está en la mano (está en el escaparate),
//   · el Esbirro elegido acaba en la retaguardia,
//   · la carta ocupa la posición EXACTA que ocupaba él,
//   · y el turno vuelve a IDLE sin dejar `pendingPlayCard` colgando.
// Y los dos casos vecinos, que NO deben pedir nada: con 2 Personajes ya en vanguardia, y un
// Esbirro. Los dos van a retaguardia sin preguntar.
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const H = fs.readFileSync(path.join(RAIZ, 'tests/harness.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', 'require', '__dirname',
    H + '\n;module.exports.__i={crearContexto,crearJuego,construirEstado,asentar,ejecutarPaso};'
)(mod, mod.exports, require, path.join(RAIZ, 'tests'));
const { crearContexto, crearJuego, construirEstado, asentar } = mod.exports.__i;

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
    return { ctx, g };
}
const LLENA = ['Mini-tigre', 'Guardaespaldas', 'Robot de seguridad SP', 'Hechicero'];

(async () => {
    console.log('--- Personaje con la vanguardia llena: se presenta ANTES de pedir el hueco ---');
    {
        const { ctx, g } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: LLENA, mano: ['Karlos'] },
            p2: { vanguardia: ['Aniceto'] },
        });
        const p = g.players.p1;
        const karlos = p.hand.find(c => c.name === 'Karlos');
        g.playCard(karlos.instanceId).catch(e => ctx.errores.push(e));
        await asentar(ctx);

        check('se pide elegir el Esbirro', g.inputState === 'SELECT_ESBIRRO_TO_SWAP', 'inputState=' + g.inputState);
        // LA COMPROBACIÓN CLAVE: si la carta sigue en la mano es que no se ha presentado.
        check('...con la carta YA FUERA de la mano (está en el escaparate)',
            !p.hand.some(c => c.name === 'Karlos'), 'mano=' + p.hand.map(c => c.name).join(','));
        check('...y la vanguardia intacta mientras se decide', p.vanguard.length === 4,
            'van=' + p.vanguard.map(c => c.name).join(','));

        const robot = p.vanguard.find(c => c.name === 'Robot de seguridad SP');
        const idxRobot = p.vanguard.indexOf(robot);
        g.selectCard(robot.instanceId);
        await asentar(ctx);

        check('el Esbirro elegido se va a la retaguardia',
            p.rearguard.some(c => c.name === 'Robot de seguridad SP'),
            'ret=' + p.rearguard.map(c => c.name).join(','));
        check('la carta ocupa SU hueco exacto, no el final de la fila',
            p.vanguard[idxRobot] && p.vanguard[idxRobot].name === 'Karlos',
            'van=' + p.vanguard.map(c => c.name).join(','));
        check('la vanguardia sigue teniendo 4', p.vanguard.length === 4, 'n=' + p.vanguard.length);
        check('el turno vuelve a IDLE y no queda jugada colgando',
            g.inputState === 'IDLE' && !g.pendingPlayCard,
            'inputState=' + g.inputState + ' pending=' + (g.pendingPlayCard && g.pendingPlayCard.name));
        check('sin errores por el camino', ctx.errores.length === 0,
            (ctx.errores[0] && ctx.errores[0].message) || '');
    }

    console.log('\n--- Los vecinos, que NO deben preguntar nada ---');
    {
        // Con 2 Personajes ya en vanguardia, el tercero va a retaguardia sin elegir nada.
        const { ctx, g } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Karlos', 'Aniceto', 'Mini-tigre', 'Hechicero'], mano: ['Karolina'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        const p = g.players.p1;
        g.playCard(p.hand.find(c => c.name === 'Karolina').instanceId).catch(e => ctx.errores.push(e));
        await asentar(ctx);
        check('con 2 Personajes ya puestos, el tercero NO pide hueco', g.inputState !== 'SELECT_ESBIRRO_TO_SWAP',
            'inputState=' + g.inputState);
        check('...y se va a la retaguardia', p.rearguard.some(c => c.name === 'Karolina'),
            'ret=' + p.rearguard.map(c => c.name).join(','));
    }
    {
        // Un Esbirro con la vanguardia llena tampoco pregunta: va a retaguardia.
        const { ctx, g } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: LLENA, mano: ['Mini-tigre'] },
            p2: { vanguardia: ['Aniceto'] },
        });
        const p = g.players.p1;
        g.playCard(p.hand.find(c => c.name === 'Mini-tigre').instanceId).catch(e => ctx.errores.push(e));
        await asentar(ctx);
        check('un Esbirro con la vanguardia llena tampoco pide hueco', g.inputState !== 'SELECT_ESBIRRO_TO_SWAP',
            'inputState=' + g.inputState);
        check('...y se va a la retaguardia', p.rearguard.some(c => c.name === 'Mini-tigre'),
            'ret=' + p.rearguard.map(c => c.name).join(','));
    }

    console.log('\n' + (fallos
        ? `SUITE hueco_vanguardia: ${comprobaciones - fallos}/${comprobaciones} comprobaciones — ${fallos} FALLOS`
        : `SUITE hueco_vanguardia: ${comprobaciones}/${comprobaciones} comprobaciones — HUECO CORRECTO`));
    if (fallos) process.exit(1);
})();
