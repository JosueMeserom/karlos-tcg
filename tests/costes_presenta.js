// tests/costes_presenta.js — costes y requisitos enseñados en la presentación.
//
// La característica (Toto, 8-ago-2026): una carta no se presenta sola, se presenta CON lo que ha
// costado. El motor ANOTA quién paga o quién cumple el requisito (`game._costesPresenta`) y el
// cliente dibuja una flecha desde cada uno. Y `esCoste` hace además que el cobro se APARQUE hasta
// que la carta llega al escaparate, para que el "-1 FUR" salga a la vez que se enseña.
//
// Lo que se comprueba aquí no es la animación (eso lo valida Toto en el navegador) sino las dos
// cosas de las que depende y que sí son estado:
//   · que se anota a QUIÉN, con el tipo correcto (coste vs requisito);
//   · que el cobro aparcado NO SE PIERDE. Esto es lo importante: la cola de presentaciones se
//     traga las excepciones con un .catch, así que un fallo dibujando una flecha se llevaba por
//     delante un cobro entero sin dejar rastro. Por eso el drenaje tiene red de seguridad en
//     _comprometer, y por eso se prueba también el camino en el que la animación no corre.
//
//   node tests/costes_presenta.js
'use strict';
const fs = require('fs');
const path = require('path');

// El harness no exporta sus internos (solo correrSuite): se reinyecta como hacen el resto de
// suites de aserción, que necesitan montar la mesa a mano en vez de comparar vieja-vs-nueva.
const RAIZ = path.join(__dirname, '..');
const H = fs.readFileSync(path.join(RAIZ, 'tests/harness.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', 'require', '__dirname',
    H + '\n;module.exports.__i={crearContexto,crearJuego,construirEstado,asentar,ejecutarPaso};'
)(mod, mod.exports, require, path.join(RAIZ, 'tests'));
const { crearContexto, crearJuego, construirEstado, asentar, ejecutarPaso } = mod.exports.__i;

let fallos = 0, total = 0;
function check(nombre, cond, detalle) {
    total++;
    if (cond) { console.log('  OK    · ' + nombre); return; }
    fallos++;
    console.log('  FALLO · ' + nombre + (detalle ? '\n          ' + detalle : ''));
}

// El marcaje se CONSUME al encolar la presentación, así que mirarlo desde fuera después de un
// paso siempre da vacío. Se espía en el origen: DSL._marcarCoste, en el sandbox del escenario.
async function montar(esc) {
    const ctx = crearContexto('nueva');
    ctx.semilla = esc.semilla || 1;
    const g = crearJuego(ctx);
    await asentar(ctx);
    construirEstado(ctx, g, esc);
    const marcas = [];
    // El sandbox es un contexto vm: se le inyecta el espía por dentro, no desde fuera.
    ctx.sandbox.__espiaMarcas = (nombre, id, tipo, etiqueta) => marcas.push({ nombre, id, tipo, etiqueta });
    require('vm').runInContext(`(() => {
        const _orig = DSL._marcarCoste.bind(DSL);
        DSL._marcarCoste = (juego, cartas, tipo, etiqueta) => {
            const lista = Array.isArray(cartas) ? cartas : [cartas];
            lista.filter(Boolean).forEach(c => __espiaMarcas(c.name, c.instanceId, tipo, etiqueta));
            return _orig(juego, cartas, tipo, etiqueta);
        };
    })()`, ctx.sandbox);
    return { ctx, g, marcas };
}

(async () => {
    console.log('\n--- Rezo en grupo: los dos pagadores quedan marcados como COSTE ---');
    {
        const { ctx, g, marcas } = await montar({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Karlos', furor: 3 }, { carta: 'Agah', furor: 3 }],
                  mano: ['Rezo en grupo'], mazo: ['Némesis', 'Mini-tigre'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await ejecutarPaso(ctx, g, { jugar: 'Rezo en grupo' });
        await ejecutarPaso(ctx, g, { elegir: ['Karlos', 'Agah'] });
        // El marcaje se consume al ENCOLAR la presentación, así que hay que mirarlo aquí: en
        // cuanto el visor del mazo se abre, _comprometer ya lo ha vaciado.
        const ids = new Set([...g.players.p1.vanguard].map(c => c.instanceId));
        check('se anotan exactamente 2 pagadores', marcas.length === 2, 'marcados=' + marcas.length);
        // TRIBUTO, no "coste" a secas: pagan Furor y se quedan en el campo. Y la etiqueta lleva
        // la cantidad REAL de cada uno, porque puede ser distinta carta por carta.
        check('los dos son del tipo "tributo"', marcas.every(m => m.tipo === 'tributo'),
            JSON.stringify(marcas.map(m => m.tipo)));
        check('...y su etiqueta dice cuánto tributa cada uno',
            marcas.every(m => m.etiqueta === 'Tributa 1 FUR'), JSON.stringify(marcas.map(m => m.etiqueta)));
        check('y son los dos aliados elegidos, que están en el campo',
            marcas.every(m => ids.has(m.id)) && marcas.map(m => m.nombre).sort().join(',') === 'Agah,Karlos',
            marcas.map(m => m.nombre).join(','));

        await ejecutarPaso(ctx, g, { elegir: ['Némesis'] });
        check('el tributo acaba cobrado, una sola vez por pagador (3,3 -> 2,2)',
            g.players.p1.vanguard.map(c => c.furor).join(',') === '2,2',
            g.players.p1.vanguard.map(c => c.furor).join(','));
        check('la cola de cobros queda vacía', !(g._cobrosPendientes || []).length);
        check('el marcaje se consume (no contamina la siguiente presentación)',
            !(g._costesPresenta || []).length);
        check('un solo flotante de -1 FUR por pagador',
            ctx.flotantes.filter(f => f.texto === '-1 FUR').length === 2,
            'hay ' + ctx.flotantes.filter(f => f.texto === '-1 FUR').length);
    }

    console.log('\n--- El cobro aparcado NO se pierde aunque la animación no corra ---');
    {
        // isSkippingAnim es el camino por el que la presentación se salta entera. Si el cobro
        // viviera dentro de la animación, aquí el Furor se quedaría sin pagar y la carta se
        // jugaría gratis. Es el escenario que justifica la red de seguridad de _comprometer.
        const { ctx, g } = await montar({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Karlos', furor: 3 }], mano: ['Pago por adelantado'],
                  mazo: ['Gladiador', 'Mini-tigre'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        g.isSkippingAnim = true;
        await ejecutarPaso(ctx, g, { jugar: 'Pago por adelantado' });
        await ejecutarPaso(ctx, g, { elegir: ['Karlos'] });
        await ejecutarPaso(ctx, g, { elegir: ['Gladiador'] });
        check('con la animación saltada, el tributo se cobra igual (3 -> 1)',
            g.players.p1.vanguard[0].furor === 1, 'furor=' + g.players.p1.vanguard[0].furor);
        check('sin cobros huérfanos en la cola', !(g._cobrosPendientes || []).length);
    }

    console.log('\n--- Wolfgang: Manzanahoria es COSTE, Aniceto es REQUISITO ---');
    {
        const { ctx, g, marcas } = await montar({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Mini-tigre'], mano: ['Wolfgang', 'Manzanahoria'] },
            p2: {},
        });
        await ejecutarPaso(ctx, g, { jugar: 'Wolfgang' });
        check('la Manzanahoria se descarta', g.players.p1.discard.some(c => c.name === 'Manzanahoria'));
        check('...y queda marcada como COSTE (viaja al escaparate al lado de Wolfgang)',
            marcas.some(m => m.nombre === 'Manzanahoria' && m.tipo === 'coste'), JSON.stringify(marcas));
        check('Wolfgang entra en el campo', g.players.p1.vanguard.some(c => c.name === 'Wolfgang'));
    }
    {
        const { ctx, g, marcas } = await montar({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Aniceto'], mano: ['Wolfgang'] },
            p2: {},
        });
        await ejecutarPaso(ctx, g, { jugar: 'Wolfgang' });
        check('con Aniceto en el campo, Wolfgang entra sin descartar nada',
            g.players.p1.vanguard.some(c => c.name === 'Wolfgang') && !g.players.p1.discard.length);
        check('Aniceto queda marcado como REQUISITO, no como coste (se queda donde está)',
            marcas.some(m => m.nombre === 'Aniceto' && m.tipo === 'requisito'), JSON.stringify(marcas));
    }

    console.log('\n--- Un coste aparcado que es el ÚLTIMO de su lista se cobra igual ---');
    {
        // Garret: su tributo va DENTRO de un ELEGIR que es el ÚNICO efecto de la lista, así que
        // no lleva nada detrás. Aparcar cambia dónde se ejecuta un efecto, nunca SI se ejecuta -y
        // aquí no había ni efecto posterior que drenara la cola ni nada que disparara la
        // presentación-, así que se cobraba cero y la carta se quedaba sin presentar.
        const { ctx, g, marcas } = await montar({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Aniceto', furor: 4 }], mano: ['Garret'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await ejecutarPaso(ctx, g, { jugar: 'Garret' });
        await ejecutarPaso(ctx, g, { elegir: ['Aniceto'] });
        check('el tributo del último efecto de la lista se cobra (4 -> 0)',
            g.players.p1.vanguard[0].furor === 0, 'furor=' + g.players.p1.vanguard[0].furor);
        check('sin cobros huérfanos', !(g._cobrosPendientes || []).length);
        check('y sin presentación colgada', !g._presentacionArmada);
        check('marcado como tributo, con su cantidad',
            marcas.some(m => m.tipo === 'tributo' && m.etiqueta === 'Tributa 4 FUR'), JSON.stringify(marcas));
    }

    console.log('\n--- Wolfgang con las dos opciones: se puede CANCELAR ---');
    {
        const { ctx, g, marcas } = await montar({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Aniceto'], mano: ['Wolfgang', 'Manzanahoria'] },
            p2: {},
        });
        await ejecutarPaso(ctx, g, { jugar: 'Wolfgang' });
        const pend = ctx.pendientes[0] || {};
        check('con Aniceto Y Manzanahoria se pregunta cómo pagar', pend.tipo === 'opcion', 'tipo=' + pend.tipo);
        check('...y una de las opciones es CANCELAR',
            (pend.etiquetas || []).includes('CANCELAR'), JSON.stringify(pend.etiquetas));
        await ejecutarPaso(ctx, g, { opcion: 'CANCELAR' });
        // Cancelar es cancelar: ni carta jugada, ni Manzanahoria descartada, ni nada marcado.
        check('al cancelar, Wolfgang sigue en la mano',
            g.players.p1.hand.some(c => c.name === 'Wolfgang'),
            'mano=' + g.players.p1.hand.map(c => c.name).join(','));
        check('al cancelar, la Manzanahoria NO se descarta', !g.players.p1.discard.length,
            'descartes=' + g.players.p1.discard.map(c => c.name).join(','));
        check('al cancelar no queda nada marcado como coste ni requisito',
            !marcas.length && !(g._costesPresenta || []).length, JSON.stringify(marcas));
        check('y no queda ninguna presentación armada', !g._presentacionArmada);
    }

    // ── LO QUE DE VERDAD DECIDE SI SE VE LA FLECHA ────────────────────────────────
    // No basta con marcar: la marca tiene que EXISTIR en el instante en que la presentación se
    // encola, que es cuando se consume. Toto lo pilló con Hexagrama, que estaba marcada y no
    // dibujaba nada: en una Ayuda dirigida el compromiso es confirmar el objetivo, así que la
    // carta se presenta ANTES de correr sus efectos y la marca llegaba con el escaparate ya
    // cerrado (y encima se la comía la presentación siguiente, la de la carta encontrada).
    // Esta comprobación mira justo eso: marcas pendientes al encolar la presentación.
    console.log('\n--- La marca llega A TIEMPO de que se dibuje la flecha ---');
    {
        const casos = [
            { n: 'Hexagrama (Ayuda dirigida, paga el objetivo)', et: 'Tributa 1 FUR',
              esc: { turno: 2, turnoDe: 'p1', empieza: 'p2', semilla: 11,
                     p1: { vanguardia: [{ carta: 'Karlos', furor: 3 }], mano: ['Hexagrama'], mazo: ['La Bestia', 'Mini-tigre'] },
                     p2: { vanguardia: ['Mini-tigre'] } },
              pasos: [{ jugar: 'Hexagrama' }, { elegir: ['Karlos'] }, { elegir: ['La Bestia'] }] },
            { n: 'Necronomicón (marca al elegir pagador, cobra al final)', et: 'Tributa 2 FUR',
              esc: { turno: 2, turnoDe: 'p1', empieza: 'p2',
                     p1: { vanguardia: [{ carta: 'Karlos', furor: 3 }], mano: ['Necronomicón'], descartes: ['Mini-tigre'] },
                     p2: { vanguardia: ['Mini-tigre'] } },
              pasos: [{ jugar: 'Necronomicón' }, { elegir: ['Karlos'] }, { elegir: ['Mini-tigre'] }] },
            { n: 'Garret (unidad: presenta por otra vía)', et: 'Tributa 4 FUR',
              esc: { turno: 2, turnoDe: 'p1', empieza: 'p2',
                     p1: { vanguardia: [{ carta: 'Aniceto', furor: 4 }], mano: ['Garret'] },
                     p2: { vanguardia: ['Mini-tigre'] } },
              pasos: [{ jugar: 'Garret' }, { elegir: ['Aniceto'] }] },
        ];
        for (const c of casos) {
            const { ctx, g } = await montar(c.esc);
            let alEncolar = null;
            ctx.sandbox.__vio = (l) => { if (alEncolar === null) alEncolar = l; };
            require('vm').runInContext("(function(){var o=animarPresentacionCarta;animarPresentacionCarta=function(){"
                + "__vio(((window.game._costesPresenta)||[]).map(function(m){return m.etiqueta;}));"
                + "return o.apply(null,arguments);};})()", ctx.sandbox);
            for (const p of c.pasos) await ejecutarPaso(ctx, g, p);
            check(c.n, !!(alEncolar && alEncolar.includes(c.et)),
                'al encolar la presentación había: ' + JSON.stringify(alEncolar));
        }
    }

    // ── REQUISITOS VISIBLES (tanda 1) ─────────────────────────────────────────────
    // `requisitoVisible` dice a qué carta del campo apunta la flecha lima. Se comprueba lo
    // mismo que en los tributos: que la marca EXISTA cuando la presentación se encola.
    console.log('\n--- Requisitos visibles: la flecha lima apunta a quien cumple ---');
    {
        const casos = [
            { n: 'Entrenamiento arduo señala a Zoe',
              esc: { turno: 2, turnoDe: 'p1', empieza: 'p2',
                     p1: { vanguardia: ['Zoe'], mano: ['Entrenamiento arduo'] }, p2: { vanguardia: ['Mini-tigre'] } },
              pasos: [{ jugar: 'Entrenamiento arduo' }], quien: 'Zoe' },
            { n: 'Xanadu señala al Evento, aunque sea del RIVAL',
              esc: { turno: 2, turnoDe: 'p1', empieza: 'p2',
                     p1: { vanguardia: ['Mini-tigre'], mano: ['Xanadu'] },
                     p2: { vanguardia: ['Mini-tigre'], evento: { carta: 'Una buena razón', duracion: 3 } } },
              pasos: [{ jugar: 'Xanadu' }], quien: 'Una buena razón' },
            { n: 'Shichishito señala al Karlos de vanguardia',
              esc: { turno: 2, turnoDe: 'p1', empieza: 'p2',
                     p1: { vanguardia: [{ carta: 'Karlos', furor: 2 }], mano: ['Shichishito'] }, p2: { vanguardia: ['Mini-tigre'] } },
              pasos: [{ jugar: 'Shichishito' }, { elegir: ['Karlos'] }], quien: 'Karlos' },
            { n: 'Giro de guion señala a TU Evento, no al del rival',
              esc: { turno: 2, turnoDe: 'p1', empieza: 'p2',
                     p1: { vanguardia: ['Mini-tigre'], mano: ['Giro de guion'], evento: { carta: 'Dáedra', duracion: 2 } },
                     p2: { vanguardia: ['Mini-tigre'], evento: { carta: 'Una buena razón', duracion: 2 } } },
              pasos: [{ jugar: 'Giro de guion' }], quien: 'Dáedra' },
        ];
        for (const c of casos) {
            const { ctx, g, marcas } = await montar(c.esc);
            let alEncolar = null;
            ctx.sandbox.__vio = (l) => { if (alEncolar === null) alEncolar = l; };
            require('vm').runInContext("(function(){var o=animarPresentacionCarta;animarPresentacionCarta=function(){"
                + "__vio(((window.game._costesPresenta)||[]).map(function(m){return m.tipo;}));"
                + "return o.apply(null,arguments);};})()", ctx.sandbox);
            for (const p of c.pasos) await ejecutarPaso(ctx, g, p);
            check(c.n, !!(alEncolar && alEncolar.includes('requisito'))
                    && marcas.some(m => m.nombre === c.quien && m.tipo === 'requisito'),
                'al encolar: ' + JSON.stringify(alEncolar) + ' · marcas: ' + JSON.stringify(marcas.map(m => m.nombre + '/' + m.tipo)));
        }
        // Un requisito de RECUENTO sí lleva flecha, y a TODAS las que lo cumplen: "3 aliados en
        // vanguardia" lo cumplen tres cartas concretas, no ninguna. La comprobación decía lo
        // contrario y fijaba un criterio que Toto corrigió (14-ago-2026).
        const { ctx, g, marcas } = await montar({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Mini-tigre', 'Oso con armadura', 'Karlos'], mano: ['Esfuerzo dividido'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await ejecutarPaso(ctx, g, { jugar: 'Esfuerzo dividido' });
        check('un requisito de RECUENTO (Esfuerzo dividido) señala a los tres aliados',
            marcas.filter(m => m.tipo === 'requisito').length === 3,
            JSON.stringify(marcas.map(m => m.nombre + '/' + m.tipo)));
    }

    // ── UNA AYUDA QUE SE EQUIPA NO SE DESCARTA ────────────────────────────────────
    // La presentación manda al descarte a toda Ayuda por defecto, y EQUIPAR saca la carta DE LA
    // MANO: con el descarte adelantado, ese splice no encontraba nada y la carta acababa a la vez
    // en la pila y en `equippedCards`. Shichishito volaba al descarte sin que Karlos la equipara;
    // Espada V poblaba la pila un instante (Toto, 13-ago-2026).
    console.log('\n--- Las Ayudas que se equipan acaban EN el aliado, no en la pila ---');
    for (const nombre of ['Shichishito', 'Espada V', 'Poder Legado']) {
        const { ctx, g } = await montar({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Karlos', furor: 2, vida: 1 }], mano: [nombre] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await ejecutarPaso(ctx, g, { jugar: nombre });
        await ejecutarPaso(ctx, g, { elegir: ['Karlos'] });
        const k = g.players.p1.vanguard[0];
        check(nombre + ' queda equipada en Karlos',
            (k.equippedCards || []).some(c => c.name === nombre),
            'equipadas=' + JSON.stringify((k.equippedCards || []).map(c => c.name)));
        check(nombre + ' NO pasa por los descartes', !g.players.p1.discard.length,
            'descartes=' + JSON.stringify(g.players.p1.discard.map(c => c.name)));
    }

    // ── LO QUE SE HACE "ANTES DE COLOCARLA" OCURRE EN EL ESCAPARATE ───────────────
    // La presentación se RETIENE en el centro mientras corren esos efectos, y solo entonces la
    // carta viaja a su sitio. Con Giro de guion se veía al revés: llegaba a la ranura, se
    // desvanecía, ENTONCES se disolvían los Eventos, y solo después aparecía (Toto, 13-ago-2026).
    // Lo que se comprueba aquí es lo que puede matar la partida: que la retención SIEMPRE se
    // suelte. Abre una promesa, y si algo no la resuelve la cadena se cuelga para siempre.
    console.log('\n--- El "antes de colocarla" retiene la carta, y la retención SIEMPRE se suelta ---');
    {
        const { ctx, g } = await montar({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Mini-tigre'], mano: ['Giro de guion'], evento: { carta: 'Dáedra', duracion: 2 } },
            p2: { vanguardia: ['Mini-tigre'], evento: { carta: 'Una buena razón', duracion: 2 } },
        });
        await ejecutarPaso(ctx, g, { jugar: 'Giro de guion' });
        check('Giro de guion acaba colocado en su ranura',
            (g.players.p1.activeEvent || {}).name === 'Giro de guion',
            'evento=' + ((g.players.p1.activeEvent || {}).name || '(ninguno)'));
        check('...el Evento anterior propio se ha ido al descarte',
            g.players.p1.discard.some(c => c.name === 'Dáedra'),
            'descartes=' + JSON.stringify(g.players.p1.discard.map(c => c.name)));
        check('...y el del rival ha desaparecido', !g.players.p2.activeEvent);
        check('la retención queda suelta (si no, la siguiente cadena se cuelga)',
            !g._retenerEscaparate && !g._soltarEscaparate && !g._restoPresentacion,
            'retener=' + !!g._retenerEscaparate + ' soltar=' + !!g._soltarEscaparate + ' resto=' + !!g._restoPresentacion);
    }

    // ── EL COSTE QUE DESTRUYE CARTAS SE VE EN EL ESCAPARATE ───────────────────────
    // Se comprueba el ORDEN, no el resultado: con el estado final no se distingue una pausa que
    // funciona de una que no existe, y por eso di por bueno un Giro de guion que se comportaba
    // exactamente igual que antes (Toto, 13-ago-2026). Aquí se anotan los hitos y se exige que
    // las destrucciones caigan ENTRE que la carta sale de la mano y que se coloca.
    console.log('\n--- Lo que cuesta cartas del campo se destruye con la carta en el centro ---');
    for (const c of [
        { n: 'Giro de guion destruye los dos Eventos antes de colocarse',
          esc: { turno: 2, turnoDe: 'p1', empieza: 'p2',
                 p1: { vanguardia: ['Mini-tigre'], mano: ['Giro de guion'], evento: { carta: 'Dáedra', duracion: 2 } },
                 p2: { vanguardia: ['Mini-tigre'], evento: { carta: 'Una buena razón', duracion: 2 } } },
          pasos: [{ jugar: 'Giro de guion' }], destruidas: 2 },
        { n: 'Némesis aniquila su vanguardia antes de colocarse',
          esc: { turno: 2, turnoDe: 'p1', empieza: 'p2',
                 p1: { vanguardia: ['Mini-tigre', 'Oso con armadura', 'Karlos', 'Agah'], mano: ['Némesis'] },
                 p2: { vanguardia: ['Mini-tigre'] } },
          pasos: [{ jugar: 'Némesis' }], destruidas: 4 },
    ]) {
        const { ctx, g } = await montar(c.esc);
        const hitos = [];
        ctx.sandbox.__hito = (s) => hitos.push(s);
        require('vm').runInContext("(function(){var a=animarPresentacionCarta;animarPresentacionCarta=function(){"
            + "__hito('presenta');return a.apply(null,arguments);};"
            + "var d=animateDeath;animateDeath=function(){__hito('destruye');return d.apply(null,arguments);};})()", ctx.sandbox);
        const ode = g.destroyEvent.bind(g);
        g.destroyEvent = function (pid) { hitos.push('destruye'); return ode(pid); };
        for (const p of c.pasos) await ejecutarPaso(ctx, g, p);
        const iPres = hitos.indexOf('presenta');
        const nDestr = hitos.filter((h, i) => h === 'destruye' && i > iPres).length;
        check(c.n, iPres === 0 && nDestr === c.destruidas,
            'hitos=' + JSON.stringify(hitos));
    }
    {
        // Y aterriza DONDE DEBE. Es lo que rompió el primer intento: su zona se decidía antes de
        // pagar el coste, con la vanguardia aún llena, así que se iba a retaguardia. Por eso
        // `zonaSel` admite una función y se resuelve tras el escaparate.
        const { ctx, g } = await montar({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Mini-tigre', 'Oso con armadura', 'Karlos', 'Agah'], mano: ['Némesis'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await ejecutarPaso(ctx, g, { jugar: 'Némesis' });
        check('Némesis acaba colocada, sola en su vanguardia',
            g.players.p1.vanguard.length === 1 && g.players.p1.vanguard[0].name === 'Némesis',
            'vanguardia=' + JSON.stringify(g.players.p1.vanguard.map(x => x.name)));
    }

    // ── ORDEN DE LAS DESTRUCCIONES Y DE LA EVOLUCIÓN ──────────────────────────────
    console.log('\n--- Orden: el Evento propio primero, y la evolución se presenta antes del cambio ---');
    {
        const { ctx, g } = await montar({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Mini-tigre'], mano: ['Giro de guion'], evento: { carta: 'Dáedra', duracion: 2 } },
            p2: { vanguardia: ['Mini-tigre'], evento: { carta: 'Una buena razón', duracion: 2 } },
        });
        const orden = [];
        const od = g.destroyEvent.bind(g);
        g.destroyEvent = (pid) => { orden.push(pid); return od(pid); };
        await ejecutarPaso(ctx, g, { jugar: 'Giro de guion' });
        // El propio va PRIMERO: es el que estás sustituyendo. Antes salía al revés porque el tuyo
        // lo destruía `canReplaceEvent` más tarde, fuera de la habilidad.
        check('Giro de guion destruye tu Evento antes que el del rival',
            orden.join('>') === 'p1>p2', 'orden=' + orden.join('>'));
    }
    {
        // La evolución se presenta y se deshace sobre la carta base, así que la presentación
        // tiene que ocurrir ANTES del intercambio: si no, la base ya no está en el tablero y no
        // hay hacia dónde disolverse.
        const { ctx, g } = await montar({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Sadame', 'Erasmo'], mano: ['Sadame (retornada)'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        let baseEnMesaAlPresentar = null;
        ctx.sandbox.__vio = () => {
            if (baseEnMesaAlPresentar === null) {
                baseEnMesaAlPresentar = g.players.p1.vanguard.some(c => c.name === 'Sadame');
            }
        };
        require('vm').runInContext("(function(){var a=animarPresentacionCarta;animarPresentacionCarta=function(){"
            + "__vio();return a.apply(null,arguments);};})()", ctx.sandbox);
        await ejecutarPaso(ctx, g, { jugar: 'Sadame (retornada)' });
        check('al presentarse, la Sadame base SIGUE en el tablero (hay hacia dónde disolverse)',
            baseEnMesaAlPresentar === true, 'baseEnMesa=' + baseEnMesaAlPresentar);
        check('...y al terminar, la evolución ocupa su sitio y la base está en el descarte',
            g.players.p1.vanguard.some(c => c.name === 'Sadame (retornada)')
            && g.players.p1.discard.some(c => c.name === 'Sadame'),
            'vg=' + JSON.stringify(g.players.p1.vanguard.map(c => c.name)));
    }

    // ── EL EVENTO SALE DE LA MANO AL PRESENTARSE, NO AL ATERRIZAR ─────────────────
    // Entre medias hay repintados (las destrucciones de Eventos tienen animación), y una carta
    // que sigue en `p.hand` se vuelve a dibujar ahí mientras su clon está en el escaparate: Toto
    // la vio a la vez en la mano y en el centro (13-ago-2026).
    console.log('\n--- El Evento sale de la mano en cuanto se presenta ---');
    {
        const { ctx, g } = await montar({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Mini-tigre'], mano: ['Giro de guion'], evento: { carta: 'Dáedra', duracion: 2 } },
            p2: { vanguardia: ['Mini-tigre'], evento: { carta: 'Una buena razón', duracion: 2 } },
        });
        let enManoAlDestruir = null;
        const od = g.destroyEvent.bind(g);
        g.destroyEvent = (pid) => {
            if (enManoAlDestruir === null) enManoAlDestruir = g.players.p1.hand.some(c => c.name === 'Giro de guion');
            return od(pid);
        };
        await ejecutarPaso(ctx, g, { jugar: 'Giro de guion' });
        check('mientras se destruyen los Eventos, ya NO está en la mano',
            enManoAlDestruir === false, 'enMano=' + enManoAlDestruir);
        check('...y acaba en su ranura', (g.players.p1.activeEvent || {}).name === 'Giro de guion');
        check('...sin destruirse a sí misma (la vieja sí lo hacía)',
            !g.players.p1.discard.some(c => c.name === 'Giro de guion'),
            'descartes=' + JSON.stringify(g.players.p1.discard.map(c => c.name)));
    }

    // ── EVOLUCIONES: CANCELAR CANCELA, Y ZOE PREGUNTA DE DÓNDE ────────────────────
    console.log('\n--- Evoluciones: cancelar, y de dónde sale la calcinante ---');
    {
        // Cancelar el objetivo de Limo crecido caía en "colócala normal": el jugador cancelaba y
        // le salía un Esbirro nuevo, con los dos clientes desincronizándose a base de re-syncs.
        const { ctx, g } = await montar({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Limo artificial'], mano: ['Limo crecido'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await ejecutarPaso(ctx, g, { jugar: 'Limo crecido' });
        const pend = ctx.pendientes[0] || {};
        check('el modal de Limo crecido ofrece CANCELAR',
            (pend.etiquetas || []).includes('CANCELAR'), JSON.stringify(pend.etiquetas));
        await ejecutarPaso(ctx, g, { opcion: 'EVOLUCIONAR LIMO ARTIFICIAL' });
        await ejecutarPaso(ctx, g, { cancelar: true });
        check('cancelar el objetivo CANCELA la jugada, no la coloca de Esbirro nuevo',
            g.players.p1.hand.some(c => c.name === 'Limo crecido')
            && g.players.p1.vanguard.length === 1 && g.players.p1.vanguard[0].name === 'Limo artificial',
            'mano=' + JSON.stringify(g.players.p1.hand.map(c => c.name)) + ' vg=' + JSON.stringify(g.players.p1.vanguard.map(c => c.name)));
    }
    {
        // Con una calcinante en la mano SIEMPRE se pregunta: el jugador no tiene por qué saber si
        // le queda otra en el mazo. Y si elige mazo y no hay, el efecto se acaba sin evolucionar.
        const relleno = ['Mini-tigre', 'Mini-tigre', 'Mini-tigre', 'Mini-tigre'];
        const evento = { carta: 'Entrenamiento arduo', duracion: 1 };
        for (const c of [
            { n: 'elige la de la mano', mazo: [...relleno, 'Zoe (calcinante)'], mano: ['Zoe (calcinante)'],
              pasos: [{ opcion: 'USAR LA DE TU MANO' }], evoluciona: true },
            { n: 'elige buscar en el mazo', mazo: [...relleno, 'Zoe (calcinante)'], mano: ['Zoe (calcinante)'],
              pasos: [{ opcion: 'BUSCAR EN EL MAZO' }, { elegir: ['Zoe (calcinante)'] }], evoluciona: true },
            { n: 'busca en el mazo y no hay: NO evoluciona', mazo: relleno, mano: ['Zoe (calcinante)'],
              pasos: [{ opcion: 'BUSCAR EN EL MAZO' }, { elegir: [] }], evoluciona: false },
            { n: 'sin ninguna en mano: visor del mazo directo', mazo: [...relleno, 'Zoe (calcinante)'], mano: [],
              pasos: [{ elegir: ['Zoe (calcinante)'] }], evoluciona: true },
        ]) {
            const { ctx, g } = await montar({
                turno: 2, turnoDe: 'p1', empieza: 'p2',
                p1: { vanguardia: ['Zoe'], mano: c.mano, mazo: c.mazo, evento },
                p2: { vanguardia: ['Mini-tigre'] },
            });
            await ejecutarPaso(ctx, g, { finTurno: true });
            await ejecutarPaso(ctx, g, { finTurno: true });
            for (const paso of c.pasos) await ejecutarPaso(ctx, g, paso);
            const evolucionada = g.players.p1.vanguard.some(x => x.name === 'Zoe (calcinante)');
            check('Zoe, ' + c.n, evolucionada === c.evoluciona,
                'vanguardia=' + JSON.stringify(g.players.p1.vanguard.map(x => x.name)));
        }
    }

    // ── TANDA 2: los tributos imperativos ─────────────────────────────────────────
    // Nueve cartas pagan por DSL.tributoFuror y tres por `tributeSourceId`. Se comprueban las dos
    // vías: que marquen su flecha CON LA CANTIDAD REAL y que cobren esa misma cantidad — el Gólem
    // declaraba `tributeCost: 1` y el motor le cobraba un 4 escrito a mano (Toto, 13-ago-2026).
    console.log('\n--- Tanda 2: tributos imperativos, flecha y cobro ---');
    for (const c of [
        { n: 'Imp mayor', furor: 3, coste: 2 },        // vía DSL.tributoFuror
        { n: 'Ángel', furor: 3, coste: 2 },            // ídem, otra carta del grupo
        { n: 'Gólem multielemental', furor: 4, coste: 1 },  // vía tributeSourceId, coste propio
        { n: 'Valafar', furor: 4, coste: 4 },          // vía tributeSourceId, coste por defecto
    ]) {
        const { ctx, g, marcas } = await montar({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Karlos', furor: c.furor }], mano: [c.n] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await ejecutarPaso(ctx, g, { jugar: c.n });
        if (ctx.pendientes.length) await ejecutarPaso(ctx, g, { elegir: ['Karlos'] });
        const k = g.players.p1.vanguard.find(x => x.name === 'Karlos');
        check(c.n + ': cobra ' + c.coste + ' de Furor, ni más ni menos',
            k && k.furor === c.furor - c.coste, 'furor=' + (k ? k.furor : '(no está)') + ' esperado=' + (c.furor - c.coste));
        check(c.n + ': marca su flecha con esa misma cantidad',
            marcas.some(m => m.tipo === 'tributo' && m.etiqueta === 'Tributa ' + c.coste + ' FUR'),
            JSON.stringify(marcas.map(m => m.tipo + '/' + m.etiqueta)));
    }

    // ── LO QUE VA A LA MANO ATERRIZA EN ELLA, NO SE DESVANECE ENCIMA ──────────────
    // El aterrizaje con deslizamiento estaba solo para las FILAS. A la mano, la carta se
    // desvanecía sobre la zona y no entraba hasta que terminaba toda la cadena; Toto lo vio con
    // la búsqueda de Goodman al morir (13-ago-2026). La mano es una fila más.
    console.log('\n--- Lo que va a la mano entra en ella al aterrizar ---');
    {
        const { ctx, g } = await montar({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Karlos', furor: 3 }], mano: ['Pago por adelantado'],
                  mazo: ['Gladiador', 'Mini-tigre'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        let enManoAlAterrizar = null;
        ctx.sandbox.__vio = (v) => { if (enManoAlAterrizar === null) enManoAlAterrizar = v; };
        // El gancho mira el estado DENTRO de la animación, cuando el clon llega a su hueco: es
        // ahí donde la carta tiene que existir ya en la mano, no al final de la cadena.
        require('vm').runInContext("(function(){var o=animarPresentacionCarta;"
            + "animarPresentacionCarta=function(id,org,dst,dor,opts){"
            + "  if(opts&&opts.colocar&&String(dst||'').indexOf('-hand')!==-1){"
            + "    var c=opts.colocar; opts=Object.assign({},opts,{colocar:function(){"
            + "      var r=c.apply(null,arguments);"
            + "      __vio(window.game.players.p1.hand.some(function(x){return x.name==='Gladiador';}));"
            + "      return r; }});}"
            + "  return o.call(null,id,org,dst,dor,opts);};})()", ctx.sandbox);
        await ejecutarPaso(ctx, g, { jugar: 'Pago por adelantado' });
        await ejecutarPaso(ctx, g, { elegir: ['Karlos'] });
        await ejecutarPaso(ctx, g, { elegir: ['Gladiador'] });
        check('la carta entra en la mano DENTRO de la animación, no al final de la cadena',
            enManoAlAterrizar === true, 'estaba en la mano al aterrizar = ' + enManoAlAterrizar);
        check('...y acaba efectivamente en la mano',
            g.players.p1.hand.some(c => c.name === 'Gladiador'),
            'mano=' + JSON.stringify(g.players.p1.hand.map(c => c.name)));
    }

    // ── BÚSQUEDAS IMPERATIVAS SIN PAREJA EN LA BASE VIEJA ─────────────────────────
    // La Bestia busca 'Fusión de planos' e Igniz una Ayuda: las dos cartas son de serie 2 o su
    // flujo no existe en la vieja, así que regresion64 no puede compararlas. Se caracterizan
    // aquí, por aserción, ANTES de migrarlas a BUSCAR (Toto, 13-ago-2026).
    console.log('\n--- Búsquedas imperativas: comportamiento de HOY, antes de migrar ---');
    {
        const { ctx, g } = await montar({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Karlos', furor: 4 }, { carta: 'Agah', furor: 2 }],
                  mano: ['La Bestia'], mazo: ['Fusión de planos', 'Mini-tigre'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await ejecutarPaso(ctx, g, { jugar: 'La Bestia' });
        // El tributo de 6 se reparte a golpe de clic, uno por vez. OJO: su búsqueda de 'Fusión de
        // planos' NO es de colocación, es su ACTIVA (CATÁSTROFE, 1F) — se caracteriza aparte.
        for (const quien of ['Karlos', 'Karlos', 'Karlos', 'Karlos', 'Agah', 'Agah']) {
            await ejecutarPaso(ctx, g, { elegir: [quien] });
        }
        check('La Bestia: el tributo de 6 deja a los dos pagadores a 0',
            g.players.p1.vanguard.filter(c => c.name !== 'La Bestia' && c.furor === 0).length === 2,
            JSON.stringify(g.players.p1.vanguard.map(c => c.name + '=' + c.furor)));
        check('La Bestia: y ella entra en el campo',
            [...g.players.p1.vanguard, ...g.players.p1.rearguard].some(c => c.name === 'La Bestia'));
    }
    {
        // Su BÚSQUEDA es su ACTIVA (CATÁSTROFE, 1F), no la colocación. Migrada a BUSCAR: antes
        // sacaba sus avisos por logError -el canal de ERRORES, en rojo, para información normal-
        // y la carta encontrada no se presentaba, así que el rival no la veía.
        const { ctx, g } = await montar({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'La Bestia', furor: 2 }], mazo: ['Fusión de planos', 'Mini-tigre'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        const bestia = g.players.p1.vanguard[0];
        await ejecutarPaso(ctx, g, { habilidad: 'La Bestia' });
        await ejecutarPaso(ctx, g, { confirmar: true });   // "¿Usar La Bestia?"
        if (ctx.pendientes.length) await ejecutarPaso(ctx, g, { elegir: ['Fusión de planos'] });
        check('La Bestia: CATÁSTROFE se lleva Fusión de planos a la mano',
            g.players.p1.hand.some(c => c.name === 'Fusión de planos'),
            'mano=' + JSON.stringify(g.players.p1.hand.map(c => c.name)));
        check('La Bestia: ...cobrando su Furor (2 -> 1) y agotándose',
            bestia.furor === 1 && bestia.exhausted,
            'furor=' + bestia.furor + ' agotada=' + bestia.exhausted);
    }
    {
        const { ctx, g } = await montar({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Mini-tigre'], mano: ['Igniz'], mazo: ['Longaniza', 'Mini-tigre', 'Oso con armadura'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await ejecutarPaso(ctx, g, { jugar: 'Igniz' });
        if (ctx.pendientes.length && ctx.pendientes[0].tipo === 'opcion') {
            await ejecutarPaso(ctx, g, { opcion: 'BUSCAR AYUDA EN EL MAZO' });
        }
        if (ctx.pendientes.length) await ejecutarPaso(ctx, g, { elegir: ['Longaniza'] });
        check('Igniz: CONOCIMIENTO TEÓRICO se lleva la Ayuda elegida a la mano',
            g.players.p1.hand.some(c => c.name === 'Longaniza'),
            'mano=' + JSON.stringify(g.players.p1.hand.map(c => c.name)));
        check('Igniz: ...y esa Ayuda ya no está en el mazo',
            !g.players.p1.deck.some(c => c.name === 'Longaniza'),
            'mazo=' + JSON.stringify(g.players.p1.deck.map(c => c.name)));
    }

    // ── NÉMESIS: SU COSTE SON CARTAS, ASÍ QUE LA FLECHA ES ÁMBAR ──────────────────
    // Es la única carta cuyo coste DESTRUYE cartas propias del campo. Ámbar y no rojo: lo que se
    // pierde son CARTAS, no Furor (§14.bis). Y una flecha por cada una (Toto, 14-ago-2026).
    console.log('\n--- Némesis marca como COSTE a toda la vanguardia que aniquila ---');
    {
        const { ctx, g, marcas } = await montar({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Mini-tigre', 'Oso con armadura', 'Karlos', 'Agah'], mano: ['Némesis'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await ejecutarPaso(ctx, g, { jugar: 'Némesis' });
        check('las cuatro sacrificadas quedan marcadas', marcas.length === 4, JSON.stringify(marcas.map(m => m.nombre)));
        check('...como COSTE (ámbar), no como tributo de Furor',
            marcas.every(m => m.tipo === 'coste'), JSON.stringify(marcas.map(m => m.tipo)));
        check('...y Némesis acaba sola en su vanguardia',
            g.players.p1.vanguard.length === 1 && g.players.p1.vanguard[0].name === 'Némesis',
            JSON.stringify(g.players.p1.vanguard.map(c => c.name)));
    }

    // ── CANDADO DE RECOLOCACIÓN ───────────────────────────────────────────────────
    // Si varias cartas mueren en el mismo instante lógico, la retaguardia NO sube hasta que hayan
    // caído todas. Sin esto los de atrás se metían en los huecos entre muerte y muerte -con
    // Némesis, en los que ella venía a ocupar- y se veía un baile (Toto, 14-ago-2026).
    console.log('\n--- La retaguardia no sube hasta que caen todos ---');
    {
        const { ctx, g } = await montar({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Mini-tigre', 'Oso con armadura', 'Karlos', 'Agah'],
                  retaguardia: ['Droide antidisturbios', 'Robot de seguridad SP'], mano: ['Némesis'] },
            p2: { vanguardia: ['Mini-tigre'] },
        });
        await ejecutarPaso(ctx, g, { jugar: 'Némesis' });
        const vg = g.players.p1.vanguard.map(c => c.name);
        check('Némesis ocupa el hueco ANTES que nadie de retaguardia',
            vg[0] === 'Némesis', 'vanguardia=' + JSON.stringify(vg));
        check('...y luego suben TODOS los que caben, uno por hueco',
            vg.length === 3 && !g.players.p1.rearguard.length,
            'vanguardia=' + JSON.stringify(vg) + ' retaguardia=' + JSON.stringify(g.players.p1.rearguard.map(c => c.name)));
    }

    console.log('');
    if (fallos) { console.log(`SUITE costes_presenta: ${fallos} FALLOS de ${total} comprobaciones`); process.exit(1); }
    console.log(`SUITE costes_presenta: ${total}/${total} comprobaciones — COSTES Y REQUISITOS CORRECTOS`);
})().catch(e => { console.error(e); process.exit(1); });
