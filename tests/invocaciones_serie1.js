// tests/invocaciones_serie1.js — Erazor Djinn, Elsa y Nethuns, las tres Invocaciones de Serie 1
// (20-ago-2026).
//
// Aserciones directas, no viejo-vs-nuevo: son cartas NUEVAS y no existen en la base congelada.
// Lo que se fija aquí es su contrato y, sobre todo, las dos cosas que pueden romper a otras:
//
//   · El estado `silencio` CON DURACIÓN, que estrena Nethuns. El motor lo soportaba entero
//     -corta las Habilidades, pinta su chapa con la cuenta atrás- pero ninguna carta lo aplicaba:
//     los silencios de hoy son auras sin cuenta (`isSilenced`), que es otro camino. Se comprueba
//     que el silencio MUERDE de verdad, no solo que el campo esté puesto.
//   · El `siObjetivo` de Elsa, que evita congelar a quien acaba de morir del propio golpe.
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

async function mesa(esc, monedas) {
    const ctx = crearContexto('nueva');
    ctx.semilla = 1;
    const g = crearJuego(ctx);
    await asentar(ctx);
    construirEstado(ctx, g, esc);
    // Misma traducción que ejecutarEscenario: la cola guionizada del motor habla en inglés.
    ctx.monedas.push(...(monedas || []).map(m => m === 'cara' ? 'heads' : m === 'cruz' ? 'tails' : m));
    return { ctx, g, paso: (p) => ejecutarPaso(ctx, g, p) };
}
const buscar = (g, pid, nombre) => [...g.players[pid].vanguard, ...g.players[pid].rearguard].find(c => c.name === nombre);
const dur = (c, k) => (c.status && c.status[k] && c.status[k].duration) || 0;

(async () => {
    console.log('--- Erazor Djinn: INCINERAR ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Erazor Djinn', furor: 2 }] },
            p2: { vanguardia: [{ carta: 'Aniceto', vida: 9 }, { carta: 'Karolina', vida: 9 }] },
        });
        const dj = buscar(g, 'p1', 'Erazor Djinn');
        await paso({ habilidad: 'Erazor Djinn' });
        await paso({ confirmar: true });
        await paso({ elegir: ['Aniceto', 'Karolina'] });
        const ani = buscar(g, 'p2', 'Aniceto'), kar = buscar(g, 'p2', 'Karolina');
        check('paga los 2 de Furor de su Activa', dj.furor === 0, 'furor=' + dj.furor);
        check('golpea a los DOS enemigos elegidos', ani.currentHp < 9 && kar.currentHp < 9,
            'aniceto=' + ani.currentHp + ' karolina=' + kar.currentHp);
        check('y a los dos les deja Daño por tiempo (3 turnos)',
            dur(ani, 'dot') === 3 && dur(kar, 'dot') === 3,
            'aniceto=' + dur(ani, 'dot') + ' karolina=' + dur(kar, 'dot'));
    }
    {
        // EL COSTE NO SE COBRA HASTA ELEGIR (Toto, 20-ago-2026, muy enfadado y con razón). Copié
        // de Raiju un `cancelable: false` que es justo el interruptor que apaga la norma: el
        // compilador de ACTIVA deduce la ventana de arrepentimiento mirando si el primer efecto
        // es una elección cancelable, y con el flag puesto cobraba al confirmar la Habilidad.
        // Se comprueba lo de siempre: mientras se elige, NADA ha pasado.
        const { ctx, g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Erazor Djinn', furor: 2 }] },
            p2: { vanguardia: [{ carta: 'Aniceto', vida: 9 }, { carta: 'Karolina', vida: 9 }] },
        });
        const dj = buscar(g, 'p1', 'Erazor Djinn');
        await paso({ habilidad: 'Erazor Djinn' });
        await paso({ confirmar: true });
        check('al confirmar la Activa NO se ha cobrado el Furor todavía', dj.furor === 2, 'furor=' + dj.furor);
        check('...y la elección sigue abierta y es cancelable',
            (ctx.pendientes[0] || {}).tipo === 'elegirTablero' && (ctx.pendientes[0] || {}).cancelable !== false,
            'pendiente=' + JSON.stringify((ctx.pendientes[0] || {}).tipo));
        await paso({ cancelar: true });
        check('al cancelar no pasa NADA: ni Furor gastado ni carta agotada',
            dj.furor === 2 && !dj.exhausted, 'furor=' + dj.furor + ' agotada=' + dj.exhausted);
        check('...y ningún enemigo ha sido tocado',
            buscar(g, 'p2', 'Aniceto').currentHp === 9 && buscar(g, 'p2', 'Karolina').currentHp === 9);
    }
    {
        // Con un solo enemigo no hay dos objetivos distintos que golpear: la Activa no arranca.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Erazor Djinn', furor: 2 }] },
            p2: { vanguardia: [{ carta: 'Aniceto', vida: 9 }] },
        });
        const dj = buscar(g, 'p1', 'Erazor Djinn');
        await paso({ habilidad: 'Erazor Djinn' });
        check('con un solo enemigo en vanguardia, INCINERAR se rechaza', dj.furor === 2, 'furor=' + dj.furor);
        check('...y el enemigo queda intacto', buscar(g, 'p2', 'Aniceto').currentHp === 9);
    }
    {
        // El estado va en `siExito`: a quien muere del golpe no se le prende fuego (y de paso, no
        // se le deja un estado puesto en la pila de descartes).
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Erazor Djinn', furor: 2 }] },
            p2: { vanguardia: [{ carta: 'Aniceto', vida: 1, def: 0 }, { carta: 'Karolina', vida: 9 }] },
        });
        await paso({ habilidad: 'Erazor Djinn' });
        await paso({ confirmar: true });
        await paso({ elegir: ['Aniceto', 'Karolina'] });
        check('el que muere del golpe NO acaba ardiendo',
            !g.players.p2.discard.some(c => c.name === 'Aniceto' && dur(c, 'dot') > 0),
            'descartes=' + g.players.p2.discard.map(c => c.name).join(','));
        check('...pero el que sobrevive sí', dur(buscar(g, 'p2', 'Karolina'), 'dot') === 3);
    }

    console.log('\n--- Elsa: CRIOGENIZAR ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Elsa', furor: 1 }] },
            p2: { vanguardia: [{ carta: 'Aniceto', vida: 9 }] },
        }, ['cara']);
        await paso({ habilidad: 'Elsa' });
        await paso({ confirmar: true });
        await paso({ elegir: ['Aniceto'] });
        const ani = buscar(g, 'p2', 'Aniceto');
        check('el ataque especial entra', ani.currentHp < 9, 'vida=' + ani.currentHp);
        check('con CARA, el enemigo queda marcado', (ani.tempEffects || []).length > 0,
            'tempEffects=' + JSON.stringify(ani.tempEffects || []));
        // Y la marca MUERDE: al llegar el turno de su dueño se agota solo y pierde la acción.
        await paso({ finTurno: true });
        check('...y pierde su turno de verdad (se agota solo)', ani.exhausted === true,
            'exhausted=' + ani.exhausted);
    }
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Elsa', furor: 1 }] },
            p2: { vanguardia: [{ carta: 'Aniceto', vida: 9 }] },
        }, ['cruz']);
        await paso({ habilidad: 'Elsa' });
        await paso({ confirmar: true });
        await paso({ elegir: ['Aniceto'] });
        const ani = buscar(g, 'p2', 'Aniceto');
        check('con CRUZ ataca igual', ani.currentHp < 9, 'vida=' + ani.currentHp);
        check('...pero no congela a nadie', (ani.tempEffects || []).length === 0,
            'tempEffects=' + JSON.stringify(ani.tempEffects || []));
    }
    {
        // La moneda se echa aunque el golpe mate, pero congelar a un muerto no significa nada:
        // eso lo corta el `siObjetivo` (mira al OBJETIVO, no a la carta fuente).
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Elsa', furor: 1 }] },
            p2: { vanguardia: [{ carta: 'Aniceto', vida: 1, def: 0 }] },
        }, ['cara']);
        await paso({ habilidad: 'Elsa' });
        await paso({ confirmar: true });
        await paso({ elegir: ['Aniceto'] });
        const muerto = g.players.p2.discard.find(c => c.name === 'Aniceto');
        check('el golpe letal manda al enemigo al descarte', !!muerto,
            'descartes=' + g.players.p2.discard.map(c => c.name).join(','));
        check('...y no se congela a un muerto', !muerto || (muerto.tempEffects || []).length === 0,
            'tempEffects=' + JSON.stringify((muerto || {}).tempEffects || []));
    }

    console.log('\n--- Nethuns: DERRENGAR ---');
    {
        const { ctx, g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Nethuns', furor: 2 }] },
            p2: { vanguardia: [{ carta: 'Aniceto', furor: 3 }, { carta: 'Karolina', furor: 1 },
                               { carta: 'Mini-tigre', furor: 2 }] },
        });
        await paso({ habilidad: 'Nethuns' });
        await paso({ confirmar: true });
        await paso({ elegir: ['Aniceto', 'Karolina', 'Mini-tigre'] });
        const ani = buscar(g, 'p2', 'Aniceto'), kar = buscar(g, 'p2', 'Karolina'), mt = buscar(g, 'p2', 'Mini-tigre');
        check('les quita 2 de Furor a los tres (sin bajar de 0)',
            ani.furor === 1 && kar.furor === 0 && mt.furor === 0,
            [ani.furor, kar.furor, mt.furor].join(','));
        // El flotante NO debe decir "(Nethuns)": la animación de Habilidad ya enseña de quién
        // viene, y con tres cartas a la vez ese paréntesis hacía que las letras se pisaran
        // (Toto, 20-ago-2026). Se comprueba en la salida de flotantes, que es donde se vería.
        const _fur = ctx.flotantes.filter(f => /FUR/.test(f.texto));
        check('el flotante de Furor no repite la fuente (la animación ya la enseña)',
            !_fur.some(f => /Nethuns/.test(f.texto)), _fur.map(f => f.texto).join(' | '));
        // Uno por enemigo, y el de Karolina es "-1" porque solo tenía 1 de Furor que perder: el
        // flotante dice lo que DE VERDAD pasó, no el -2 declarado.
        const _enem = _fur.filter(f => f.carta.startsWith('inst_p2'));
        check('...pero cada enemigo tiene el suyo, con lo que de verdad perdió',
            _enem.length === 3 && _enem.filter(f => f.texto === '-2 FUR').length === 2
                && _enem.filter(f => f.texto === '-1 FUR').length === 1,
            _enem.map(f => f.texto).join(' | '));
        check('y los deja Silenciados 2 turnos',
            dur(ani, 'silencio') === 2 && dur(kar, 'silencio') === 2 && dur(mt, 'silencio') === 2,
            [dur(ani, 'silencio'), dur(kar, 'silencio'), dur(mt, 'silencio')].join(','));
        // EL SILENCIO MUERDE. No basta con que el campo esté puesto: la comprobación de verdad es
        // que la Habilidad del silenciado no arranque. Aniceto se queda con 1 de Furor, el que
        // cuesta su LUZ VIRTUOSA, así que si la Activa corriera se lo gastaría.
        await paso({ finTurno: true });
        // El Furor se mide JUSTO ANTES del intento: al empezar su turno, p2 cobra Furor y ese +1
        // se comía la prueba (el primer intento marcaba 2 y parecía que no había gastado nada).
        const _antes = ani.furor;
        await paso({ habilidad: 'Aniceto', jugador: 'p2' });
        check('un Silenciado no puede usar su Habilidad',
            ani.furor === _antes && ctx.pendientes.length === 0,
            'furor=' + ani.furor + '/' + _antes + ' pendientes=' + ctx.pendientes.length);
    }
    {
        // HASTA 3, no 3 exactos (Toto, 21-ago-2026): con el cupo fijo la Habilidad quedaba muerta
        // salvo con la vanguardia rival medio llena. Con dos enemigos derrenga a los dos, y al
        // elegir al último que queda arranca sola.
        // OJO al escenario que había aquí antes: comprobaba "se rechaza" mirando que Nethuns no
        // hubiera pagado... pero es que el coste se cobra al ELEGIR, así que pasaba igual sin
        // rechazarse nada. Pasaba por el motivo equivocado.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Nethuns', furor: 2 }] },
            p2: { vanguardia: [{ carta: 'Aniceto', furor: 3 }, { carta: 'Karolina', furor: 1 }] },
        });
        const net = buscar(g, 'p1', 'Nethuns');
        await paso({ habilidad: 'Nethuns' });
        await paso({ confirmar: true });
        await paso({ elegir: ['Aniceto', 'Karolina'] });
        check('con solo 2 enemigos, DERRENGAR ya NO se rechaza: los derrenga', net.furor === 0, 'furor=' + net.furor);
        check('...y los dos pierden su Furor',
            buscar(g, 'p2', 'Aniceto').furor === 1 && buscar(g, 'p2', 'Karolina').furor === 0,
            buscar(g, 'p2', 'Aniceto').furor + ' / ' + buscar(g, 'p2', 'Karolina').furor);
        check('...y quedan Silenciados los dos',
            dur(buscar(g, 'p2', 'Aniceto'), 'silencio') === 2 && dur(buscar(g, 'p2', 'Karolina'), 'silencio') === 2);
    }
    {
        // Sin NINGÚN enemigo en vanguardia sí se rechaza: el requisito baja a 1, no a 0. Y aquí
        // el rechazo se comprueba por donde de verdad se nota: no se abre ninguna elección.
        const { ctx, g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Nethuns', furor: 2 }] },
            p2: { retaguardia: [{ carta: 'Aniceto', furor: 3 }] },
        });
        await paso({ habilidad: 'Nethuns' });
        check('sin enemigos en vanguardia, DERRENGAR se rechaza', ctx.pendientes.length === 0,
            'pendientes=' + ctx.pendientes.length);
        check('...y nadie pierde Furor', buscar(g, 'p1', 'Nethuns').furor === 2 && buscar(g, 'p2', 'Aniceto').furor === 3);
    }

    console.log('\n' + (fallos
        ? `SUITE invocaciones_serie1: ${comprobaciones - fallos}/${comprobaciones} comprobaciones — ${fallos} FALLOS`
        : `SUITE invocaciones_serie1: ${comprobaciones}/${comprobaciones} comprobaciones — LAS TRES CORRECTAS`));
    if (fallos) process.exit(1);
})();
