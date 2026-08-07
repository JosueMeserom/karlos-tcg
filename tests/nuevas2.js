// tests/nuevas2.js — CARTAS NUEVAS, tanda 2 (7-ago-2026): cinco piezas sueltas del Excel,
// elegidas por ser 100% declarables con lo que el DSL ya tiene (mecánica de replicación, sin
// pieza nueva). Misma forma que nuevas1.js — léelo si esto es lo primero que abres.
//
// Quema de maná, Cóctel molotov: Ayudas Consumibles de un solo golpe (ELEGIR + efecto).
// Consagración: Evento con curación periódica (FIN_TURNO) + curación al expirar (AL_CADUCAR).
// Robot de asalto AU: Esbirro con Pasiva de autodaño condicional (FIN_TURNO + if sobre self).
// Nigromántica: Esbirro con Activa de resurrección desde descartes (BUSCAR destino RETAGUARDIA),
//   la primera carta nueva que usa ese destino — hasta ahora estaba escrito pero sin estrenar
//   (Cápsula de bio-regeneración, ya migrada, es el único precedente). Su filtro "sin coste ni
//   condiciones extra" se apoya en `plantillaSin` sobre dos hooks: `onBeforePlayAsync` (tributos
//   imperativos) y `canPlayCard` (requisitos JUGAR declarativos) — Xanadu y Diego Antonio son el
//   caso de prueba perfecto porque YA sabemos que su canPlayCard rechaza sin 'Una buena razón'.

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
    console.log('--- Quema de maná: quita 2 de Furor a un enemigo elegido ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { mano: ['Quema de maná'] },
            p2: { vanguardia: [{ carta: 'Mini-tigre', furor: 3 }] },
        });
        await paso({ jugar: 'Quema de maná' });
        await paso({ elegir: ['Mini-tigre'] });
        check('el enemigo pierde 2 de Furor', buscar(g, 'p2', 'Mini-tigre').furor === 1,
            'furor=' + buscar(g, 'p2', 'Mini-tigre').furor);
    }
    {
        // El Furor no baja de 0.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { mano: ['Quema de maná'] },
            p2: { vanguardia: [{ carta: 'Mini-tigre', furor: 1 }] },
        });
        await paso({ jugar: 'Quema de maná' });
        await paso({ elegir: ['Mini-tigre'] });
        check('...y con menos de 2 se queda en 0, no en negativo', buscar(g, 'p2', 'Mini-tigre').furor === 0,
            'furor=' + buscar(g, 'p2', 'Mini-tigre').furor);
    }

    console.log('\n--- Cóctel molotov: -1 Vida verdadera + Daño por tiempo 2 turnos ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { mano: ['Cóctel molotov'] },
            p2: { vanguardia: [{ carta: 'Oso con armadura', vida: 3 }] }, // Def 5: si fuera daño normal, no pasaría nada
        });
        await paso({ jugar: 'Cóctel molotov' });
        await paso({ elegir: ['Oso con armadura'] });
        const objetivo = buscar(g, 'p2', 'Oso con armadura');
        check('quita 1 de Vida IGNORANDO la Def (daño verdadero)', objetivo.currentHp === 2,
            'vida=' + objetivo.currentHp);
        check('aplica Daño por tiempo durante 2 turnos', objetivo.status && objetivo.status.dot && objetivo.status.dot.duration === 2,
            JSON.stringify(objetivo.status));
    }

    console.log('\n--- Consagración: cura 1 a cada aliado al final de tu turno, y también al expirar ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Oso con armadura', vida: 1 }, 'Mini-tigre'], mano: ['Consagración'] }, // Mini-tigre entra a Vida completa
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ jugar: 'Consagración' });
        await paso({ finTurno: true }); // fin del turno 2 (propio): 1er tic
        check('el aliado herido se cura 1 de Vida al final de tu turno',
            buscar(g, 'p1', 'Oso con armadura').currentHp === 2, 'vida=' + buscar(g, 'p1', 'Oso con armadura').currentHp);
        check('...y el aliado sano no revienta el tope ni casca nada',
            buscar(g, 'p1', 'Mini-tigre').currentHp === buscar(g, 'p1', 'Mini-tigre').maxHp);
        // logResumen (Toto, 7-ago-2026): UN log agregado, solo con quien de verdad se curó.
        check('...y el log anuncia la curación con el número real',
            g.logHistory.some(l => /cura \+1 de Vida a/.test(l.msg) && /Oso con armadura/.test(l.msg)),
            JSON.stringify(g.logHistory.map(l => l.msg)));
        check('...sin mencionar a quien ya estaba a Vida llena (nunca se curó)',
            !g.logHistory.some(l => /cura \+1 de Vida a/.test(l.msg) && /Mini-tigre/.test(l.msg)));

        await paso({ finTurno: true }); // turno del rival: no cuenta
        await paso({ finTurno: true }); // 2º tic propio
        check('...y NO cura en el turno del rival, solo en el tuyo (2 tics propios = +2, no +3)',
            buscar(g, 'p1', 'Oso con armadura').currentHp === 3, 'vida=' + buscar(g, 'p1', 'Oso con armadura').currentHp);

        const _logAntesDeExpirar = g.logHistory.length;
        for (let i = 0; i < 6 && g.players.p1.activeEvent; i++) await paso({ finTurno: true });
        check('al expirar (3 turnos), se descarta', !g.players.p1.activeEvent);
        check('...y cura una última vez antes de irse',
            buscar(g, 'p1', 'Oso con armadura').currentHp === buscar(g, 'p1', 'Oso con armadura').maxHp,
            'vida=' + buscar(g, 'p1', 'Oso con armadura').currentHp);
        // A estas alturas ya está a Vida llena (se curó del todo en los tics anteriores): el
        // AL_CADUCAR no tiene a quién curar, así que su logResumen NO debe sonar (silencio total,
        // no un "+0 de Vida a nadie"). El aviso de despedida estático sí sigue sonando siempre.
        const _logsFinal = g.logHistory.slice(_logAntesDeExpirar).map(l => l.msg);
        check('...pero sin logResumen (no había nadie que curar)',
            !_logsFinal.some(m => /Antes de apagarse del todo, cura/.test(m)), JSON.stringify(_logsFinal));
        check('...la despedida estática sí suena siempre', _logsFinal.some(m => /se desvanece con una última bendición/.test(m)),
            JSON.stringify(_logsFinal));
    }
    {
        // Y el camino contrario: si SÍ queda alguien herido cuando expira, el AL_CADUCAR cura y
        // el logResumen de despedida SÍ suena (con su propio flavor text, distinto del de cada
        // turno). Ojo al reloj real del Evento (comprobado con un probe): la DURACIÓN baja al
        // INICIO de cada turno propio (no al final), mientras que el tic de curación es al
        // FINAL — van desfasados. Con duración 3: fin de turno2 (tic, cura), inicio turno3
        // (duración 3->2), fin de turno3 (tic, ya a Vida llena), inicio turno4 (2->1), fin de
        // turno4 (tic sin efecto, ya lleno), inicio turno5 (1->0: EXPIRA). Se hiere a Oso justo
        // antes de ese último paso para que el AL_CADUCAR tenga a quién curar.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Oso con armadura', vida: 1 }], mano: ['Consagración'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ jugar: 'Consagración' });
        await paso({ finTurno: true }); // fin turno2 (p1): tic, 1 -> 2
        await paso({ finTurno: true }); // fin turno2 (p2) / inicio turno3 (p1): duración 3 -> 2
        await paso({ finTurno: true }); // fin turno3 (p1): tic, 2 -> 3 (a Vida llena)
        await paso({ finTurno: true }); // fin turno3 (p2) / inicio turno4 (p1): duración 2 -> 1
        await paso({ finTurno: true }); // fin turno4 (p1): tic sin efecto (ya lleno)
        // Se hiere DESPUÉS del último tic periódico, para que solo el AL_CADUCAR pueda curarlo.
        buscar(g, 'p1', 'Oso con armadura').currentHp = 1;
        const _logAntes = g.logHistory.length;
        await paso({ finTurno: true }); // fin turno4 (p2) / inicio turno5 (p1): duración 1 -> 0, expira
        check('el Evento expira en este fin de turno', !g.players.p1.activeEvent);
        check('AL_CADUCAR cura al que seguía herido', buscar(g, 'p1', 'Oso con armadura').currentHp === 2,
            'vida=' + buscar(g, 'p1', 'Oso con armadura').currentHp);
        const _logs = g.logHistory.slice(_logAntes).map(l => l.msg);
        check('...y esta vez SÍ suena el logResumen de despedida',
            _logs.some(m => /Antes de apagarse del todo, cura \+1 de Vida a/.test(m) && /Oso con armadura/.test(m)),
            JSON.stringify(_logs));
    }

    console.log('\n--- Robot de asalto AU: SOBRECALENTAMIENTO, -3 Vida si acaba el turno con 2+ de Furor ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Robot de asalto AU', furor: 2 }] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ finTurno: true });
        check('con 2+ de Furor pierde 3 de Vida al final de SU turno',
            buscar(g, 'p1', 'Robot de asalto AU').currentHp === 2, 'vida=' + buscar(g, 'p1', 'Robot de asalto AU').currentHp);
    }
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Robot de asalto AU', furor: 1 }] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ finTurno: true });
        check('con menos de 2 de Furor NO pierde Vida', buscar(g, 'p1', 'Robot de asalto AU').currentHp === 5,
            'vida=' + buscar(g, 'p1', 'Robot de asalto AU').currentHp);
    }

    console.log('\n--- Nigromántica: ARTES PROHIBIDAS resucita desde descartes a retaguardia ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Nigromántica', furor: 1 }], descartes: ['Mini-tigre'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ habilidad: 'Nigromántica' });
        await paso({ confirmar: true }); // "¿Usar Nigromántica?"
        await paso({ elegir: ['Mini-tigre'] });
        // Sin Necronomicón en mano, la pregunta opcional ni siquiera se abre (pool vacío = 'skip'
        // silencioso, sin modal): no hace falta declinar nada.
        // "Colócalo en tu campo" = las reglas de playCard: a VANGUARDIA mientras quepa (Toto,
        // 7-ago-2026). Antes bajaba siempre a retaguardia, que no lo pedía ningún texto.
        check('el caído vuelve a la VANGUARDIA, que tiene hueco', g.players.p1.vanguard.some(c => c.name === 'Mini-tigre'),
            'vanguardia=' + JSON.stringify(g.players.p1.vanguard.map(c => c.name)));
        check('...ya no está en descartes', !g.players.p1.discard.some(c => c.name === 'Mini-tigre'));
        check('se cobra 1 de Furor', buscar(g, 'p1', 'Nigromántica').furor === 0,
            'furor=' + buscar(g, 'p1', 'Nigromántica').furor);
    }
    {
        // Vanguardia LLENA (4): entonces sí baja a retaguardia, como al jugarlo desde la mano.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            // La propia Nigromántica cuenta como 4ª: la vanguardia queda llena. (No vale ponerla
            // en retaguardia — desde ahí no puede usar su Activa.)
            p1: { vanguardia: ['Mini-tigre', 'Oso con armadura', 'Guardia', { carta: 'Nigromántica', furor: 1 }],
                  descartes: ['Limo artificial'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ habilidad: 'Nigromántica' });
        await paso({ confirmar: true });
        await paso({ elegir: ['Limo artificial'] });
        check('con la vanguardia llena, baja a retaguardia', g.players.p1.rearguard.some(c => c.name === 'Limo artificial'),
            'retaguardia=' + JSON.stringify(g.players.p1.rearguard.map(c => c.name)));
    }
    {
        // El filtro "sin coste ni condiciones extra": Xanadu tiene canPlayCard (requiere 'Una
        // buena razón' en juego) y NO debe poder elegirse.
        // OJO al contrato del visor de pila: `cartas` es la pila ENTERA (se ve todo el descarte)
        // y `elegibles` son las que llevan el reborde verde. Comprobar sobre `cartas` sería
        // comprobar que la pila existe, no que el filtro funciona.
        const { ctx, g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Nigromántica', furor: 1 }], descartes: ['Xanadu', 'Mini-tigre'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ habilidad: 'Nigromántica' });
        await paso({ confirmar: true });
        const pend = ctx.pendientes[0] || {};
        check('se abre el VISOR DE PILA, no el modal genérico', pend.tipo === 'visorMazo' && pend.zona === 'discard',
            'tipo=' + pend.tipo + ' zona=' + pend.zona);
        check('...y enseña el descarte ENTERO, Xanadu incluido',
            (pend.cartas || []).map(c => c.name).sort().join(',') === 'Mini-tigre,Xanadu',
            JSON.stringify((pend.cartas || []).map(c => c.name)));
        const elegibles = (pend.elegibles || []).map(c => c.name);
        check('Xanadu (canPlayCard con condiciones) NO es elegible', !elegibles.includes('Xanadu'), JSON.stringify(elegibles));
        check('...pero Mini-tigre (sin condiciones) SÍ', elegibles.includes('Mini-tigre'), JSON.stringify(elegibles));
        await paso({ elegir: ['Mini-tigre'] });
    }
    {
        // Límite de 2 Personajes en vanguardia (misma regla que playCard): con 2 ya puestos y la
        // vanguardia a medias, un Personaje del descarte NO se ofrece — no "baja a retaguardia".
        const { ctx, g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Karlos', 'Agah', { carta: 'Nigromántica', furor: 1 }],
                  descartes: ['Goodman', 'Mini-tigre'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ habilidad: 'Nigromántica' });
        await paso({ confirmar: true });
        const elegibles = ((ctx.pendientes[0] || {}).elegibles || []).map(c => c.name);
        check('con 2 Personajes en vanguardia, un Personaje del descarte NO es elegible',
            !elegibles.includes('Goodman'), JSON.stringify(elegibles));
        check('...pero un Esbirro sí', elegibles.includes('Mini-tigre'), JSON.stringify(elegibles));
        await paso({ elegir: ['Mini-tigre'] });
    }
    {
        // Si en descartes solo hay caídos NO aptos (Xanadu), la Activa no debe cobrar Furor ni
        // gastar la acción: `costeDiferido` + `abortaSiVacio` cubren este borde.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Nigromántica', furor: 1 }], descartes: ['Xanadu'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ habilidad: 'Nigromántica' });
        await paso({ confirmar: true });
        check('sin caídos aptos, NO se cobra Furor', buscar(g, 'p1', 'Nigromántica').furor === 1,
            'furor=' + buscar(g, 'p1', 'Nigromántica').furor);
        check('...ni se agota la carta (la acción no se gasta)', !buscar(g, 'p1', 'Nigromántica').exhausted);
    }
    {
        // Aceptar la pregunta del Necronomicón: se descarta y Nigromántica gana 1 de Furor.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Nigromántica', furor: 1 }], mano: ['Necronomicón'], descartes: ['Mini-tigre'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await paso({ habilidad: 'Nigromántica' });
        await paso({ confirmar: true });
        await paso({ elegir: ['Mini-tigre'] });
        await paso({ elegir: ['Necronomicón'] });
        check('el Necronomicón sale de la mano', !g.players.p1.hand.some(c => c.name === 'Necronomicón'));
        check('...y cae a descartes', g.players.p1.discard.some(c => c.name === 'Necronomicón'));
        check('Furor neto: -1 del coste +1 del Necronomicón = se queda en 1',
            buscar(g, 'p1', 'Nigromántica').furor === 1, 'furor=' + buscar(g, 'p1', 'Nigromántica').furor);
    }

    console.log(`\nSUITE nuevas2: ${comprobaciones - fallos}/${comprobaciones} comprobaciones`
        + (fallos ? ` — ${fallos} FALLOS` : ' — CARTAS NUEVAS CORRECTAS'));
    if (fallos) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
