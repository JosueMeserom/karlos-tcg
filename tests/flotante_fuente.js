// tests/flotante_fuente.js — el flotante automático nombra su fuente (5-ago-2026).
//
// Idea de Toto del betasteo de Achmay (31-jul-2026), que quedó apuntada como tarea de diseño:
// un "-1 VIDA" suelto no dice de dónde sale cuando la causa no es el golpe que acabas de ver.
// La nota temía una auditoría transversal de decenas de call-sites de `modifyStat`; al ir a
// hacerla resultó que la migración al DSL ya había consolidado el asunto: de los ~66 call-sites
// del proyecto, **solo dos** pasan una CARTA como fuente (los ops `MODIFICAR_STAT` y `DAÑO`), y
// por ahí pasan las 124 cartas declarativas. El resto pasa una etiqueta suelta ('fase_furor',
// 'healing', 'avatar_passive') o nada.
//
// LA REGLA, en una frase: se nombra la fuente cuando el cambio lo causa OTRA carta.
//   · Sin fuente o fuente-etiqueta -> nada. Aquí caen TODOS los ataques por construcción:
//     dealDamage llama a modifyStat sin `source`, así que el daño de combate se queda limpio
//     sin necesidad de excluirlo a mano (y la animación ya enseña quién pega).
//   · La fuente ES el objetivo -> nada: es el coste de tu propia Habilidad, acabas de clicarla.
//   · Una Ayuda EN LA MANO -> nada: se está jugando en este preciso instante (el motor no la
//     manda al descarte hasta después de resolver sus efectos). Un equipo o una Ayuda ya
//     consumida que dispara turnos más tarde SÍ se nombra: ahí no hay nada obvio.
//   · Lo demás -> "(Nombre de la carta)".
//
// Por qué una suite aparte y no solo las 6 diferencias declaradas en la batería: el arnés
// comparativo solo ve los casos que ALGÚN escenario existente ya provoca, y lo que más importa
// aquí es lo que NO debe pasar (que un ataque normal no ensucie su flotante, que el coste propio
// no se nombre). Eso son aserciones, no comparación viejo-vs-nuevo.
//
// Se ejecuta aparte de la batería: `node tests/flotante_fuente.js`.

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

async function partida(spec) {
    const ctx = crearContexto('nueva');
    ctx.semilla = 1;
    const g = crearJuego(ctx);
    await asentar(ctx);
    construirEstado(ctx, g, spec);
    ctx.flotantes.length = 0;
    return { ctx, g };
}
const textos = (ctx) => ctx.flotantes.map(f => f.texto);

(async () => {
    console.log('--- La regla, directamente sobre el helper ---');
    {
        const { g } = await partida({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Karlos', 'Mini-tigre'], mano: ['Manzanahoria'] },
            p2: { vanguardia: ['Oso con armadura'] },
        });
        const karlos = g.players.p1.vanguard[0];
        const tigre = g.players.p1.vanguard[1];
        const oso = g.players.p2.vanguard[0];
        const manzana = g.players.p1.hand[0];

        check('sin fuente (null) -> no se nombra nada', g._fuenteFlotante(karlos, null) === '');
        check('fuente-etiqueta suelta -> no se nombra nada',
            g._fuenteFlotante(karlos, 'fase_furor') === '', g._fuenteFlotante(karlos, 'fase_furor'));
        check('la fuente ES el objetivo (coste propio) -> no se nombra',
            g._fuenteFlotante(karlos, karlos) === '', g._fuenteFlotante(karlos, karlos));
        check('otra carta aliada -> se nombra',
            g._fuenteFlotante(tigre, karlos) === 'Karlos', g._fuenteFlotante(tigre, karlos));
        check('una carta enemiga -> se nombra',
            g._fuenteFlotante(karlos, oso) === 'Oso con armadura', g._fuenteFlotante(karlos, oso));
        check('una Ayuda EN LA MANO (se está jugando ahora) -> no se nombra',
            g._fuenteFlotante(tigre, manzana) === '', g._fuenteFlotante(tigre, manzana));
        manzana.location = 'discard';
        check('...esa MISMA Ayuda ya consumida (dispara más tarde) -> sí se nombra',
            g._fuenteFlotante(tigre, manzana) === 'Manzanahoria', g._fuenteFlotante(tigre, manzana));
    }

    console.log('\n--- Un ataque normal NO ensucia su flotante (el caso que más importa) ---');
    {
        const { ctx, g } = await partida({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 1 }] },
            p2: { vanguardia: [{ carta: 'Oso con armadura', vida: 20 }] },
        });
        await g.selectCard(g.players.p1.vanguard[0].instanceId); await asentar(ctx);
        await g.selectCard(g.players.p2.vanguard[0].instanceId); await asentar(ctx);
        const dano = textos(ctx).filter(t => /VIDA/.test(t));
        check('el daño de combate sale sin paréntesis de fuente', dano.length > 0 && dano.every(t => !t.includes('(')),
            JSON.stringify(dano));
    }

    console.log('\n--- Una Pasiva ajena SÍ se nombra (Achmay/YOLOLO: el detonante original) ---');
    {
        const { ctx, g } = await partida({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 1 }] },
            p2: { vanguardia: [{ carta: 'Achmay', vida: 20 }] },
        });
        await g.selectCard(g.players.p1.vanguard[0].instanceId); await asentar(ctx);
        await g.selectCard(g.players.p2.vanguard[0].instanceId); await asentar(ctx);
        const conFuente = textos(ctx).filter(t => t.includes('(Achmay)'));
        check('el pinchazo de la barrera se atribuye a Achmay', conFuente.length === 1, JSON.stringify(textos(ctx)));
        check('...y el daño que el atacante SÍ hace sigue limpio',
            textos(ctx).some(t => /VIDA/.test(t) && !t.includes('(')), JSON.stringify(textos(ctx)));
    }

    console.log('\n--- Un Evento SÍ se nombra (Bancarrota vaciando el Furor) ---');
    {
        const { ctx, g } = await partida({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Karlos', furor: 3 }], mano: ['Bancarrota'] },
            p2: { vanguardia: [{ carta: 'Oso con armadura', furor: 2 }] },
        });
        await g.playCard(g.players.p1.hand[0].instanceId); await asentar(ctx);
        // Bancarrota secuestra el Furor por asignación directa (SECUESTRAR_STAT), sin flotante:
        // lo que se comprueba aquí es que el helper la trataría como fuente nombrable, que es
        // la decisión de diseño -un Evento que lleva turnos en mesa nunca es "obvio"-.
        const ev = g.players.p1.activeEvent;
        check('un Evento en mesa es fuente nombrable para un aliado',
            g._fuenteFlotante(g.players.p1.vanguard[0], ev) === 'Bancarrota');
        check('...y para un enemigo',
            g._fuenteFlotante(g.players.p2.vanguard[0], ev) === 'Bancarrota');
    }

    console.log('\n--- El coste de tu propia Activa sigue sin nombrarse ---');
    {
        const { ctx, g } = await partida({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Karlos', furor: 3 }] },
            p2: { vanguardia: [{ carta: 'Mini-tigre', vida: 20 }, { carta: 'Oso con armadura', vida: 20 }] },
        });
        g.activateAbility(g.players.p1.vanguard[0].instanceId, true); await asentar(ctx);
        await g.confirmAction(true); await asentar(ctx);
        const coste = textos(ctx).filter(t => /FUR/.test(t));
        check('el "-N FUR" del coste propio no lleva paréntesis', coste.every(t => !t.includes('(')),
            JSON.stringify(coste));
    }

    console.log(`\nSUITE flotante_fuente: ${comprobaciones - fallos}/${comprobaciones} comprobaciones` +
        (fallos ? ` — ${fallos} FALLOS` : ' — FUENTES CORRECTAS'));
    if (fallos) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
