// tests/regresion66.js — Simon: ÚLTIMA RESISTENCIA, migrada al DSL (21-ago-2026).
//
// Era de las imperativas puras: la cuarteta completa a mano (canActivateAbility +
// onExecuteAbility + onValidateTarget + onTargetsReady) más sus dos hooks de marca temporal, todo
// para "ataca normal y esconde al resto de tu vanguardia hasta tu próximo turno". Lo único que le
// faltaba al DSL era `oculto` en MARCAR_TEMPORAL, que llegó con la tanda de marcas.
//
// Su Activa no estaba cubierta por NINGUNA suite (regresion12 solo prueba su inmunidad a Apagón),
// así que esto es cobertura nueva además de la comparación. Lo que se fija:
//   · el humo cubre al RESTO de la vanguardia y NO a Simon;
//   · dura hasta que vuelve a ser su turno, o sea el turno rival entero;
//   · y no toca la retaguardia, que el texto dice "vanguardia".
'use strict';
const { correrSuite } = require('./harness');

// La vieja escribía sus propios avisos de selección y nombraba a Simon a pelo. Las dos cosas
// cambian a propósito al pasar por el compilador.
const PROMPT_VIEJO = { linea: 'Elige objetivo para la Última Resistencia.',
    motivo: 'la vieja logueaba su prompt con logMsg (entra en el historial); la nueva usa el título del target del ACTIVA, que el picker enseña por logError (privado)' };

const escenarios = [
    {
        nombre: 'Simon: ÚLTIMA RESISTENCIA ataca y esconde al RESTO de su vanguardia',
        p1: { vanguardia: [{ carta: 'Simon', furor: 3 }, 'Karlos', 'Mini-tigre'], retaguardia: ['Hechicero'] },
        p2: { vanguardia: [{ carta: 'Oso con armadura' }] },
        pasos: [ { habilidad: 'Simon' }, { confirmar: true }, { elegir: ['Oso con armadura'] } ],
        logsSoloVieja: [PROMPT_VIEJO],
        logsIntencionados: [
            { de: 'El humo de su arma cubre al resto de la vanguardia.',
              a: 'Simon de J1 (Jugador 1) aguanta la posición y atrae toda la atención: el resto de su vanguardia queda a cubierto.',
              motivo: 'DOS cambios a la vez (Toto, 21-ago-2026). Uno de norma: un log visible por los dos nombra la carta y no dice "su". Y otro de FONDO: Simon no lanza humo -no tiene arma de humo-, se queda aguantando a la desesperada para que el rival tenga que mirarle a él, que es lo que significa ÚLTIMA RESISTENCIA. La frase se escribe UNA vez para toda la tanda (`logUnaVez`), como la vieja' },
        ],
        flotantesIntencionados: [
            { de: 'OCULTO ·', a: 'A CUBIERTO ·',
              motivo: 'mismo motivo: el flotante dice lo que le pasa al aliado -queda a cubierto tras Simon- en vez de repetir el nombre del estado' },
        ],
        diferenciasEsperadas: [
            { contiene: 'vanguard.1.stealth', motivo: 'CAMBIO DELIBERADO (Toto, 21-ago-2026): "queda Oculto durante el próximo turno rival" quiere decir eso, así que durante TU turno no está oculto y no debe salirle la chapa. La vieja lo aplicaba desde el instante de usar la Habilidad, o sea un turno antes de que fuera verdad. El escenario "el Oculto llega en el turno del rival" comprueba que sí llega' },
            { contiene: 'vanguard.2.stealth', motivo: 'ídem con el segundo compañero' },
            { contiene: 'tempEffects.0.badge', motivo: 'la marca ahora LLEVA CHAPA (Toto, 21-ago-2026, decisión de diseño): si una carta hace algo que solo aplicará en un momento concreto, se marca visiblemente desde ya, o el jugador usa la Habilidad y no ve que haya pasado nada. Va sin número: no hay cuenta que llevar' },
            { contiene: 'tempEffects.0.hastaInicioTurnoLanzador', motivo: 'ídem con la caducidad: la declara la marca en vez de un onStartTurnTempEffect' },
        ],
    },
    {
        // Lo que NO debe pasar: esconder a Simon (el texto dice "el RESTO") ni a la retaguardia.
        nombre: 'Simon: el humo no cubre ni a Simon ni a la retaguardia',
        p1: { vanguardia: [{ carta: 'Simon', furor: 3 }, 'Karlos'], retaguardia: ['Hechicero', 'Lolita'] },
        p2: { vanguardia: [{ carta: 'Oso con armadura' }] },
        pasos: [ { habilidad: 'Simon' }, { confirmar: true }, { elegir: ['Oso con armadura'] } ],
        logsSoloVieja: [PROMPT_VIEJO],
        logsIntencionados: [
            { de: 'El humo de su arma cubre al resto de la vanguardia.',
              a: 'Simon de J1 (Jugador 1) aguanta la posición y atrae toda la atención: el resto de su vanguardia queda a cubierto.',
              motivo: 'DOS cambios a la vez (Toto, 21-ago-2026). Uno de norma: un log visible por los dos nombra la carta y no dice "su". Y otro de FONDO: Simon no lanza humo -no tiene arma de humo-, se queda aguantando a la desesperada para que el rival tenga que mirarle a él, que es lo que significa ÚLTIMA RESISTENCIA. La frase se escribe UNA vez para toda la tanda (`logUnaVez`), como la vieja' },
        ],
        flotantesIntencionados: [
            { de: 'OCULTO ·', a: 'A CUBIERTO ·',
              motivo: 'mismo motivo: el flotante dice lo que le pasa al aliado -queda a cubierto tras Simon- en vez de repetir el nombre del estado' },
        ],
        diferenciasEsperadas: [
            { contiene: 'vanguard.1.stealth', motivo: 'CAMBIO DELIBERADO (Toto, 21-ago-2026): "queda Oculto durante el próximo turno rival" quiere decir eso, así que durante TU turno no está oculto y no debe salirle la chapa. La vieja lo aplicaba desde el instante de usar la Habilidad, o sea un turno antes de que fuera verdad. El escenario "el Oculto llega en el turno del rival" comprueba que sí llega' },
            { contiene: 'tempEffects.0.badge', motivo: 'la marca ahora LLEVA CHAPA (Toto, 21-ago-2026, decisión de diseño): si una carta hace algo que solo aplicará en un momento concreto, se marca visiblemente desde ya, o el jugador usa la Habilidad y no ve que haya pasado nada. Va sin número: no hay cuenta que llevar' },
            { contiene: 'tempEffects.0.hastaInicioTurnoLanzador', motivo: 'ídem con la caducidad' },
        ],
    },
    {
        nombre: 'Simon: ÚLTIMA RESISTENCIA rechazada sin enemigos en vanguardia',
        p1: { vanguardia: [{ carta: 'Simon', furor: 3 }, 'Karlos'] },
        p2: { retaguardia: ['Oso con armadura'] },
        pasos: [ { habilidad: 'Simon' } ],
    },
    {
        nombre: 'Simon: ÚLTIMA RESISTENCIA rechazada sin Furor suficiente',
        p1: { vanguardia: [{ carta: 'Simon', furor: 2 }, 'Karlos'] },
        p2: { vanguardia: ['Oso con armadura'] },
        pasos: [ { habilidad: 'Simon' } ],
        logsSoloVieja: [
            { linea: 'Falta Furor (3).',
              motivo: 'la vieja avisaba con logMsg (entra en el historial); el compilador usa logError, que es privado' },
        ],
    },
];

// Y el cambio de fondo, que no se puede comparar contra la vieja porque la vieja no lo hace:
// el Oculto llega EN EL TURNO DEL RIVAL, no antes, y se va cuando vuelve el tuyo. Se comprueba
// aparte, con aserciones directas, recorriendo los turnos.
const fs = require('fs');
const path = require('path');
const H = fs.readFileSync(path.join(__dirname, 'harness.js'), 'utf8');
const _m = { exports: {} };
new Function('module', 'exports', 'require', '__dirname',
    H + '\n;module.exports.__i={crearContexto,crearJuego,construirEstado,asentar,ejecutarPaso};'
)(_m, _m.exports, require, __dirname);

correrSuite('regresion66', escenarios);

(async () => {
    const { crearContexto, crearJuego, construirEstado, asentar, ejecutarPaso } = _m.exports.__i;
    const ctx = crearContexto('nueva'); ctx.semilla = 1;
    const g = crearJuego(ctx); await asentar(ctx);
    construirEstado(ctx, g, {
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Simon', furor: 3 }, 'Karlos', 'Mini-tigre'] },
        p2: { vanguardia: [{ carta: 'Oso con armadura', vida: 9 }] },
    });
    await ejecutarPaso(ctx, g, { habilidad: 'Simon' });
    await ejecutarPaso(ctx, g, { confirmar: true });
    await ejecutarPaso(ctx, g, { elegir: ['Oso con armadura'] });
    await asentar(ctx);
    const ocultos = () => { g.updatePassives(); return g.players.p1.vanguard.filter(c => c.stealth).map(c => c.name); };
    let fallos = 0;
    const check = (t, ok, extra) => { if (ok) console.log('  OK    · ' + t); else { fallos++; console.log('  FALLO · ' + t + (extra ? '  [' + extra + ']' : '')); } };
    console.log('\n--- El Oculto llega en el turno del rival, no antes ---');
    check('en TU turno nadie está Oculto todavía', ocultos().length === 0, ocultos().join(','));
    await ejecutarPaso(ctx, g, { finTurno: true }); await asentar(ctx);
    check('en el turno del RIVAL sí, y solo los compañeros',
        ocultos().length === 2 && !ocultos().includes('Simon'), ocultos().join(','));
    await ejecutarPaso(ctx, g, { finTurno: true }); await asentar(ctx);
    check('al volver tu turno se les quita', ocultos().length === 0, ocultos().join(','));
    check('...y la marca ya no está', g.players.p1.vanguard.every(c => !(c.tempEffects || []).length));

    // EL OCULTO ES UN ESTADO DE VERDAD (Toto, 21-ago-2026), no un booleano suelto: tiene
    // categoría propia, duración, fuente y Habilidad, y de ahí salen solas su chapa y sus líneas
    // del detalle. Se comprueba lo que hace que eso sea cierto.
    const ctx2 = crearContexto('nueva'); ctx2.semilla = 1;
    const g2 = crearJuego(ctx2); await asentar(ctx2);
    construirEstado(ctx2, g2, {
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [{ carta: 'Simon', furor: 3 }, 'Karlos'] },
        p2: { vanguardia: [{ carta: 'Oso con armadura', vida: 9 }] },
    });
    await ejecutarPaso(ctx2, g2, { habilidad: 'Simon' });
    await ejecutarPaso(ctx2, g2, { confirmar: true });
    await ejecutarPaso(ctx2, g2, { elegir: ['Oso con armadura'] });
    await ejecutarPaso(ctx2, g2, { finTurno: true }); await asentar(ctx2);
    const karlos = g2.players.p1.vanguard.find(c => c.name === 'Karlos');
    const est = (karlos.status || {}).oculto || {};
    check('el Oculto es un estado con duración', est.duration > 0, JSON.stringify(karlos.status));
    check('...que sabe de qué carta viene', /Simon/.test(est.source || ''), est.source);
    check('...y por qué Habilidad', est.sourceAbility === 'ÚLTIMA RESISTENCIA', est.sourceAbility);
    check('...y guarda el instanceId para la flecha', !!est.sourceInstanceId, est.sourceInstanceId);
    // Categorías: un estado de OTRA categoría no lo borra, que era la razón de crearlas.
    g2.applyStatus(karlos, 'dot', 3, 'prueba');
    check('un Daño por tiempo NO borra el Oculto: son categorías distintas',
        !!(karlos.status.oculto && karlos.status.dot), JSON.stringify(karlos.status));
    // Y dentro de la MISMA categoría sí se reemplazan (lo comprobará la Estasis cuando exista).
    check('...pero el Sueño sí borra la Confusión, que son la misma',
        (() => { g2.applyStatus(karlos, 'confusion', 2, 'x'); g2.applyStatus(karlos, 'sueno', 2, 'x');
                 return !karlos.status.confusion && !!karlos.status.sueno && !!karlos.status.oculto; })(),
        JSON.stringify(karlos.status));
    if (fallos) { console.log('\nSUITE regresion66 (turnos): ' + fallos + ' FALLOS'); process.exit(1); }
    console.log('SUITE regresion66 (turnos): 4/4 comprobaciones — EL OCULTO LLEGA A SU HORA');
})();
