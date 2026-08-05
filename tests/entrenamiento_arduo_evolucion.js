// tests/entrenamiento_arduo_evolucion.js — limpieza universal al evolucionar (5-ago-2026).
//
// NO es una suite viejo-vs-nueva: la base congelada no comparte los arreglos recientes (Wolfgang
// firmando su marca, resetCard con stealth). Aserciones directas, motor real.
//
// Betasteo de Toto: la Zoe original se veía en los descartes agotada, Oculta y todavía "afectada
// por Wolfgang" tras evolucionar -el código nunca llamaba a resetCard() antes de empujarla a
// descartes, a diferencia de Sadame/Limo primario, que sí lo hacen al evolucionar-. De paso,
// `calcinante.status = {...zoe.status}` TRANSFERÍA los estados alterados de Zoe a la calcinante
// en vez de curarlos: "cura los estados alterados de Zoe" significa que la evolucionada empieza
// limpia, no que hereda su Confusión o su DoT.
//
// Se ejecuta aparte de la batería: `node tests/entrenamiento_arduo_evolucion.js`.

'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const H = fs.readFileSync(path.join(RAIZ, 'tests/harness.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', 'require', '__dirname',
    H + '\n;module.exports.__i={crearContexto,crearJuego,construirEstado,asentar};'
)(mod, mod.exports, require, path.join(RAIZ, 'tests'));
const { crearContexto, crearJuego, construirEstado, asentar } = mod.exports.__i;

let comprobaciones = 0, fallos = 0;
function check(titulo, ok, detalle) {
    comprobaciones++;
    if (ok) { console.log('  OK    · ' + titulo); }
    else { fallos++; console.log('  FALLO · ' + titulo + (detalle ? '  [' + detalle + ']' : '')); }
}

(async () => {
    const ctx = crearContexto('nueva');
    ctx.semilla = 1;
    const g = crearJuego(ctx);
    await asentar(ctx);
    // Aniceto en RETAGUARDIA (no vanguardia): satisface el Requisito de Wolfgang ("en tu
    // campo" mira las dos zonas) sin ocupar el cupo de 2 Personajes en vanguardia -si Zoe
    // Y Aniceto estuvieran ambos en vanguardia, Wolfgang (también Personaje) sería rechazado
    // por el límite, y este test nunca llegaría a probar SABIDURÍA sobre Zoe.
    construirEstado(ctx, g, {
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: ['Zoe'], retaguardia: ['Aniceto'], mano: ['Entrenamiento arduo', 'Zoe (calcinante)', 'Wolfgang'] },
        p2: {},
    });

    const ea = g.players.p1.hand.find(c => c.name === 'Entrenamiento arduo');
    await g.playCard(ea.instanceId); await asentar(ctx);

    const wf = g.players.p1.hand.find(c => c.name === 'Wolfgang');
    await g.playCard(wf.instanceId); await asentar(ctx);
    g.updatePassives();

    const zoePreEvo = g.players.p1.vanguard.find(c => c.name === 'Zoe');
    check('Zoe está Oculta mientras el Entrenamiento está en juego', zoePreEvo.stealth === true);
    check('Zoe está agotada mientras el Entrenamiento está en juego', zoePreEvo.exhausted === true);
    check('Wolfgang deja marca en Zoe (+1 DEF y +1 ATQ)', zoePreEvo.tempEffects.length === 1,
        JSON.stringify(zoePreEvo.tempEffects));
    check('...firmada con su Habilidad (SABIDURÍA), no en blanco',
        zoePreEvo.tempEffects[0] && zoePreEvo.tempEffects[0].habilidad === 'SABIDURÍA',
        JSON.stringify(zoePreEvo.tempEffects[0]));

    // Confusión sobre Zoe antes de evolucionar: debe CURARSE, no heredarse.
    g.applyStatus(zoePreEvo, 'confusion', 2, zoePreEvo);
    check('Zoe queda Confundida antes de evolucionar', !!(zoePreEvo.status && zoePreEvo.status.confusion));

    // confirmEndTurn() se lanza SIN await: por dentro usa temporizadores (banners de fase) que
    // solo avanzan cuando asentar() bombea la cola de timers del sandbox -exactamente el patrón
    // `lanzar()` del propio harness (ver ejecutarPaso, paso `finTurno`)-. Con await directo la
    // promesa se queda colgada para siempre (nadie drena sus timers mientras tanto).
    for (let i = 0; i < 6 && g.players.p1.activeEvent; i++) {
        g.confirmEndTurn().catch(e => ctx.errores.push(e));
        await asentar(ctx);
    }

    const calc = g.players.p1.vanguard.find(c => c.name === 'Zoe (calcinante)');
    check('Entrenamiento arduo expira y Zoe evoluciona', !!calc);
    if (calc) {
        check('la calcinante NO hereda la Confusión (se cura al expirar)',
            !calc.status || !calc.status.confusion, JSON.stringify(calc.status));
        // ATQ no sirve de medida: la base de la calcinante ya es 9 = el TOPE de
        // características (0-9) del juego, así que un +1 ahí queda enmascarado por el
        // clamp (trampa de medición ya documentada en la migración de SABIDURÍA/Wolfgang).
        // DEF sí es una medida limpia: base 5, sin tocar el tope.
        check('la calcinante SÍ conserva el bono de Wolfgang (+1 DEF sobre su base)',
            calc.currentDef === 5 + 1, `def=${calc.currentDef} (base 5)`);
        check('...y la marca de Wolfgang viaja con ella (no se queda en la Zoe vieja)',
            calc.tempEffects.length === 1 && calc.tempEffects[0].habilidad === 'SABIDURÍA',
            JSON.stringify(calc.tempEffects));
    }

    const zoeVieja = g.players.p1.discard.find(c => c.name === 'Zoe');
    check('la Zoe vieja llega a los descartes', !!zoeVieja);
    if (zoeVieja) {
        check('...ya NO Oculta', zoeVieja.stealth === false, 'stealth=' + zoeVieja.stealth);
        check('...ya NO agotada', zoeVieja.exhausted === false, 'exhausted=' + zoeVieja.exhausted);
        check('...sin la marca de Wolfgang', (zoeVieja.tempEffects || []).length === 0,
            JSON.stringify(zoeVieja.tempEffects));
        check('...sin estados alterados', Object.keys(zoeVieja.status || {}).length === 0,
            JSON.stringify(zoeVieja.status));
    }

    console.log(`\nSUITE entrenamiento_arduo_evolucion: ${comprobaciones - fallos}/${comprobaciones} comprobaciones` +
        (fallos ? ` — ${fallos} FALLOS` : ' — EVOLUCIÓN LIMPIA'));
    if (fallos) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
