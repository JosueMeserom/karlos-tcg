// tests/periodicos.js — efectos periódicos con fase y momento declarados (21-ago-2026).
//
// Hasta ahora la fase en la que ocurría algo NO la decidía la carta: la decidía qué hook elegías.
// `INICIO_TURNO` cae en Efectos Iniciales porque es donde el motor lo llama, no porque nadie lo
// dijera. La fase de ROBO era la prueba: no tenía ni un gancho, así que "en tu fase de Robo, roba
// una más" no se podía escribir. Con la fase como DATO, es una línea.
//
// Aserciones directas sobre el mecanismo, no sobre una carta: lo que se fija aquí es el CONTRATO
// que van a heredar las cartas futuras. La Poción, que lo estrena, tiene su comparación
// viejo-vs-nuevo en regresion27 (y allí el escenario de "expira tras 3 turnos" pasa idéntico).
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

(async () => {
    const ctx = crearContexto('nueva');
    ctx.semilla = 1;
    const g = crearJuego(ctx);
    await asentar(ctx);
    const DSL = vm.runInContext('DSL', ctx.sandbox);

    console.log('--- Las seis fases y los tres momentos existen ---');
    check('las seis fases del turno están declaradas',
        JSON.stringify(DSL.FASES) === JSON.stringify(['ROBO', 'EFECTOS INICIALES', 'EVENTO', 'FUROR', 'PRINCIPAL', 'EFECTOS FINALES']),
        JSON.stringify(DSL.FASES));
    check('y los tres momentos',
        JSON.stringify(DSL.MOMENTOS) === JSON.stringify(['ANTES', 'NORMAL', 'DESPUES']));
    // Aunque hoy la mitad no tenga carta: el coste de declararlas es una tabla, y el de NO
    // tenerlas es que la primera carta que las pida obligue a rediseñar.
    const src = fs.readFileSync(path.join(RAIZ, 'public/index.html'), 'utf8');
    DSL.FASES.forEach(f => {
        check(`el motor tiene el punto de la fase ${f}`,
            src.includes(`_periodicos(this, '${f}'`), 'no aparece en index.html');
    });

    console.log('\n--- Cuándo le toca a una declaración ---');
    const toca = (cuando, fase, momento, propietario, activo) => DSL._tocaAhora(cuando, fase, momento, propietario, activo);
    check('la fase tiene que coincidir',
        toca({ fase: 'FUROR' }, 'FUROR', 'DESPUES', 'p1', 'p1') && !toca({ fase: 'FUROR' }, 'ROBO', 'DESPUES', 'p1', 'p1'));
    check('el momento por defecto es NORMAL',
        toca({ fase: 'EFECTOS FINALES' }, 'EFECTOS FINALES', 'NORMAL', 'p1', 'p1')
        && !toca({ fase: 'EFECTOS FINALES' }, 'EFECTOS FINALES', 'ANTES', 'p1', 'p1'));
    // En ROBO y FUROR no hay lista de cartas que recorrer, hay una acción única: ahí NORMAL y
    // DESPUES son el mismo instante. Se admite NORMAL igual, por consistencia con el resto.
    check('en ROBO y FUROR, NORMAL vale como DESPUES',
        toca({ fase: 'ROBO' }, 'ROBO', 'DESPUES', 'p1', 'p1') && toca({ fase: 'FUROR' }, 'FUROR', 'DESPUES', 'p1', 'p1'));
    check('...pero eso NO pasa en las demás fases',
        !toca({ fase: 'EFECTOS INICIALES' }, 'EFECTOS INICIALES', 'DESPUES', 'p1', 'p1'));

    console.log('\n--- De quién es el turno ---');
    const cu = (q) => ({ fase: 'EFECTOS FINALES', deQuien: q });
    check('PROPIO: solo en el turno del dueño de la carta',
        toca(cu('PROPIO'), 'EFECTOS FINALES', 'NORMAL', 'p1', 'p1') && !toca(cu('PROPIO'), 'EFECTOS FINALES', 'NORMAL', 'p1', 'p2'));
    check('RIVAL: solo en el turno del otro',
        !toca(cu('RIVAL'), 'EFECTOS FINALES', 'NORMAL', 'p1', 'p1') && toca(cu('RIVAL'), 'EFECTOS FINALES', 'NORMAL', 'p1', 'p2'));
    check('AMBOS: en los dos',
        toca(cu('AMBOS'), 'EFECTOS FINALES', 'NORMAL', 'p1', 'p1') && toca(cu('AMBOS'), 'EFECTOS FINALES', 'NORMAL', 'p1', 'p2'));
    check('por defecto es PROPIO',
        toca({ fase: 'EFECTOS FINALES' }, 'EFECTOS FINALES', 'NORMAL', 'p1', 'p1')
        && !toca({ fase: 'EFECTOS FINALES' }, 'EFECTOS FINALES', 'NORMAL', 'p1', 'p2'));

    console.log('\n--- La Poción, que lo estrena ---');
    {
        const ctx2 = crearContexto('nueva'); ctx2.semilla = 1;
        const g2 = crearJuego(ctx2); await asentar(ctx2);
        construirEstado(ctx2, g2, {
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Karlos'], mano: ['Poción revitalizante'] },
            p2: { vanguardia: ['Aniceto'] },
        });
        const karlos = () => g2.players.p1.vanguard[0];
        const base = karlos().currentAtk;
        await ejecutarPaso(ctx2, g2, { jugar: 'Poción revitalizante' });
        await ejecutarPaso(ctx2, g2, { elegir: ['Karlos'] });
        g2.updatePassives();
        check('la marca declara su caducidad en vez de llevar un hook',
            ((karlos().tempEffects || [])[0] || {}).caduca !== undefined,
            JSON.stringify((karlos().tempEffects || [])[0]));
        check('el +1 de Atq lo aplica el `stats` de la marca', karlos().currentAtk === base + 1,
            'atk=' + karlos().currentAtk + ' base=' + base);

        // El turno en que se bebe NO cuenta, y solo descuentan los turnos de QUIEN LA JUGÓ.
        const dur = () => (((karlos().tempEffects || [])[0]) || {}).duration;
        await ejecutarPaso(ctx2, g2, { finTurno: true }); await asentar(ctx2);
        check('el turno en que se bebe no gasta cuenta', dur() === 3, 'duracion=' + dur());
        await ejecutarPaso(ctx2, g2, { finTurno: true }); await asentar(ctx2);
        check('el turno del RIVAL tampoco', dur() === 3, 'duracion=' + dur());
        await ejecutarPaso(ctx2, g2, { finTurno: true }); await asentar(ctx2);
        check('el siguiente turno propio sí descuenta', dur() === 2, 'duracion=' + dur());

        for (let i = 0; i < 4; i++) { await ejecutarPaso(ctx2, g2, { finTurno: true }); await asentar(ctx2); }
        g2.updatePassives();
        check('al agotarse, la marca se va', (karlos().tempEffects || []).length === 0,
            JSON.stringify(karlos().tempEffects));
        check('...y el Atq vuelve a su base', karlos().currentAtk === base, 'atk=' + karlos().currentAtk);
        check('...anunciándolo con el texto de la carta',
            g2.logHistory.some(e => /Poción revitalizante sobre .* se han desvanecido/.test(e.msg)),
            g2.logHistory.slice(-4).map(e => e.msg).join(' | '));
    }

    console.log('\n' + (fallos
        ? `SUITE periodicos: ${comprobaciones - fallos}/${comprobaciones} comprobaciones — ${fallos} FALLOS`
        : `SUITE periodicos: ${comprobaciones}/${comprobaciones} comprobaciones — EL MECANISMO CUMPLE`));
    if (fallos) process.exit(1);
})();
