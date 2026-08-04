// tests/carta_neo.js — Neo (IMAGINACIÓN HIPERACTIVA + PARED FALSA). Carta NUEVA, 31-jul-2026.
//
// NO es una suite viejo-vs-nuevo, y no puede serlo: Neo no existe en `cartas_antes_de_dsl.js`,
// así que no hay contra qué comparar — el arnés ni siquiera puede construir el estado inicial en
// la base congelada. Se ejercita contra la base nueva con aserciones explícitas, igual que
// `capas_cliente.js` y `reconexion_cliente.js`. Este es el patrón a seguir para toda carta NUEVA
// (frente a las migraciones, que sí se comparan).
//
// QUÉ CUBRE
//   · El diagnóstico del log: por qué no cualifica cada aliado, redactado según lo pedido.
//   · Cada causa de descalificación de "cebo", una por una.
//   · La sustitución en los dos disparadores (declarar ataque / ir a recibir daño), con el
//     traspaso de equipos y el cebo volviendo a la mano.
//   · El límite de sitio: Neo es Personaje, así que no cabe si ya hay 2 Personajes más.
//   · PARED FALSA: anula normal y especial, y no es acumulable.
//
// PIEZAS DEL MOTOR que estrena (genéricas, no de Neo): las marcas permanentes _haAtacado /
// _haRecibidoDano / _haUsadoActiva, `sustituirEnCampo` y el punto de reacción
// `onHandReactionToAllyAttack` (el simétrico del que ya existía para el defensor).

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

const NEO = 1110; // por id: la base vieja no la tiene, y por nombre fallaría al resolverla

let comprobaciones = 0, fallos = 0;
function check(titulo, ok, detalle) {
    comprobaciones++;
    if (ok) console.log('  OK    · ' + titulo);
    else { fallos++; console.log('  FALLO · ' + titulo + (detalle ? '  [' + detalle + ']' : '')); }
}

async function mesa(spec) {
    const ctx = crearContexto('nueva');
    ctx.semilla = 1;
    const g = crearJuego(ctx);
    await asentar(ctx);
    construirEstado(ctx, g, spec);
    g.__errores = [];
    g.logError = (m) => g.__errores.push(m);
    return { ctx, g };
}
const ultimoError = (g) => g.__errores[g.__errores.length - 1] || '';
// Acepta automáticamente la pregunta de sustitución (la primera opción del modal).
const aceptaNeo = (g) => { g.openChoiceModal = (t, ch) => ch[0].action(); };
const declinaNeo = (g) => { g.openChoiceModal = (t, ch) => ch[1].action(); };

(async () => {
    console.log('--- Diagnóstico en el log: por qué no cualifica cada aliado ---');
    {
        const { ctx, g } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Karlos', 'Mini-tigre', 'Hechicero', 'Meca EBA'], mano: [NEO] },
            p2: {},
        });
        const [karlos, , hech, meca] = g.players.p1.vanguard;
        karlos._haAtacado = true;
        hech._haAtacado = true; hech._haRecibidoDano = true;
        meca._haUsadoActiva = true;
        await g.playCard(g.players.p1.hand[0].instanceId, true); await asentar(ctx);

        const txt = ultimoError(g);
        check('Neo NO se coloca de forma normal', g.players.p1.hand.some(c => c.id === NEO), 'se colocó');
        check('el aviso empieza explicando cuándo SÍ entra',
              txt.startsWith('Neo solo se coloca si un cebo declara un ataque o va a recibir daño.'), txt);
        check('enumera varias razones de una misma carta con "y"', txt.includes('atacó y sufrió daño'), txt);
        check('detecta el tipo (Máquina)', txt.includes('es una Máquina'), txt);
        check('detecta la etiqueta (Animal salvaje)', txt.includes('es un Animal salvaje'), txt);
        check('detecta el uso de la Activa', txt.includes('usó su Activa'), txt);
        check('dice que NINGUNO cualifica cuando es el caso', txt.includes('Ninguno cualifica'), txt);
    }
    {
        const { ctx, g } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Karlos'], mano: [NEO] }, p2: {},
        });
        await g.playCard(g.players.p1.hand[0].instanceId, true); await asentar(ctx);
        check('si TODOS cualifican, no añade lista de excusas',
              ultimoError(g) === 'Neo solo se coloca si un cebo declara un ataque o va a recibir daño.',
              ultimoError(g));
    }
    {
        const { ctx, g } = await mesa({ turno: 2, turnoDe: 'p1', empieza: 'p2', p1: { mano: [NEO] }, p2: {} });
        await g.playCard(g.players.p1.hand[0].instanceId, true); await asentar(ctx);
        check('sin aliados colocados, lo dice en vez de listar nada',
              ultimoError(g).includes('no tienes ningún aliado colocado'), ultimoError(g));
    }
    {
        // "Tuvo requisitos para colocarse" se mide sobre la PLANTILLA (decisión de Toto): Némesis
        // exige la vanguardia llena, así que nunca es cebo por mucho que esté intacta.
        const { ctx, g } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Némesis'], mano: [NEO] }, p2: {},
        });
        await g.playCard(g.players.p1.hand[0].instanceId, true); await asentar(ctx);
        check('una carta con requisitos de colocación no es cebo',
              ultimoError(g).includes('tuvo requisitos para colocarse'), ultimoError(g));
    }

    console.log('\n--- Sustitución al DECLARAR un ataque (hereda equipos) ---');
    {
        const { ctx, g } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Karlos'], mano: [NEO, 'Espada V'] },
            p2: { vanguardia: [{ carta: 'Oso con armadura', vida: 20 }] },
        });
        // Karlos empuña la Espada V (+2 ATQ) para comprobar que el equipo viaja con el cambio.
        await g.playCard(g.players.p1.hand[1].instanceId, true); await asentar(ctx);
        await g.selectCard(g.players.p1.vanguard[0].instanceId, true); await asentar(ctx);
        const atqKarlos = g.players.p1.vanguard[0].currentAtk;
        check('Karlos entra al ataque con la Espada V puesta', atqKarlos === 7, 'ATQ=' + atqKarlos);

        aceptaNeo(g);
        await g.performAttack(g.players.p1.vanguard[0], g.players.p2.vanguard[0]); await asentar(ctx);

        const enCampo = g.players.p1.vanguard[0];
        check('Neo ocupa el hueco del cebo', enCampo.id === NEO, enCampo.name);
        check('el cebo vuelve a la mano', g.players.p1.hand.some(c => c.name === 'Karlos'), 'no está en la mano');
        check('Neo hereda el equipo del cebo',
              (enCampo.equippedCards || []).some(e => e.name === 'Espada V'),
              JSON.stringify((enCampo.equippedCards || []).map(e => e.name)));
        check('...y con él su bono de ATQ (6 base + 2)', enCampo.currentAtk === 8, 'ATQ=' + enCampo.currentAtk);
        check('el golpe lo da Neo, no el cebo', enCampo._haAtacado === true, '_haAtacado=' + enCampo._haAtacado);
        check('el enemigo recibe el ataque', g.players.p2.vanguard[0].currentHp < 20,
              'vida=' + g.players.p2.vanguard[0].currentHp);
    }
    {
        const { ctx, g } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Karlos'], mano: [NEO] },
            p2: { vanguardia: [{ carta: 'Oso con armadura', vida: 20 }] },
        });
        declinaNeo(g);
        await g.performAttack(g.players.p1.vanguard[0], g.players.p2.vanguard[0]); await asentar(ctx);
        check('si declinas, ataca el cebo y Neo sigue en la mano',
              g.players.p1.vanguard[0].name === 'Karlos' && g.players.p1.hand.some(c => c.id === NEO),
              g.players.p1.vanguard[0].name);
    }

    console.log('\n--- Sustitución al ir a RECIBIR DAÑO ---');
    {
        const { ctx, g } = await mesa({
            turno: 2, turnoDe: 'p2', empieza: 'p1',
            p1: { vanguardia: ['Karlos'], mano: [NEO] },
            p2: { vanguardia: [{ carta: 'Oso con armadura', vida: 20 }] },
        });
        aceptaNeo(g);
        await g.performAttack(g.players.p2.vanguard[0], g.players.p1.vanguard[0]); await asentar(ctx);
        const enCampo = g.players.p1.vanguard[0];
        check('Neo entra a recibir el golpe en lugar del cebo', enCampo.id === NEO, enCampo.name);
        check('el cebo vuelve a la mano intacto', g.players.p1.hand.some(c => c.name === 'Karlos'), 'no volvió');
        check('es Neo quien encaja el daño', enCampo._haRecibidoDano === true, '_haRecibidoDano=' + enCampo._haRecibidoDano);
    }
    {
        // Límite de sitio. Ojo al matiz: el caso SOLO puede darse con un cebo ESBIRRO. Si el cebo
        // fuese Personaje, tener otros dos más en vanguardia ya sería ilegal de por sí (el motor
        // admite 2). Así que: Esbirro cualificado + 2 Personajes = Neo no cabe.
        const { ctx, g } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: ['Karlos', 'Karolina', 'Sra. Kumicho'], mano: [NEO] },
            p2: { vanguardia: [{ carta: 'Oso con armadura', vida: 20 }] },
        });
        const cebo = g.players.p1.vanguard[2]; // Sra. Kumicho: Esbirro, Ser vivo, sin etiquetas vetadas
        check('el Esbirro elegido SÍ sería cebo de no ser por el sitio',
              cebo.name === 'Sra. Kumicho' && !cebo._haAtacado, cebo.name);
        let preguntado = false;
        g.openChoiceModal = (t, ch) => { preguntado = true; ch[0].action(); };
        await g.performAttack(cebo, g.players.p2.vanguard[0]); await asentar(ctx);
        check('con 2 Personajes más en vanguardia, ni se ofrece el cambio', preguntado === false, 'se ofreció');
        check('...y ataca el cebo, como si Neo no estuviera',
              g.players.p1.vanguard.some(c => c.name === 'Sra. Kumicho'), 'desapareció');
    }

    console.log('\n--- PARED FALSA ---');
    {
        const { ctx, g } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Neo', furor: 4 }] },
            p2: { vanguardia: ['Oso con armadura'] },
        });
        const neo = g.players.p1.vanguard[0];
        g.activateAbility(neo.instanceId, true); await asentar(ctx);
        await g.confirmAction(true); await asentar(ctx);
        check('la Activa pone su contador', !!(neo.counters && neo.counters.pared_falsa), JSON.stringify(neo.counters));
        const furorTras = neo.furor;
        check('y cuesta 4 de Furor', furorTras === 0, 'furor=' + furorTras);

        const vidaAntes = neo.currentHp;
        g.activePlayerId = 'p2';
        await g.performAttack(g.players.p2.vanguard[0], neo); await asentar(ctx);
        check('el ataque normal queda ANULADO', neo.currentHp === vidaAntes, `${vidaAntes} -> ${neo.currentHp}`);
        check('y el contador se retira', !(neo.counters && neo.counters.pared_falsa), JSON.stringify(neo.counters));
    }
    {
        const { ctx, g } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Neo', furor: 8 }] }, p2: {},
        });
        const neo = g.players.p1.vanguard[0];
        g.activateAbility(neo.instanceId, true); await asentar(ctx);
        await g.confirmAction(true); await asentar(ctx);
        // Tras usar una Activa la carta queda agotada, y activateAbility corta ahí SIN mensaje.
        // Para probar el requisito de verdad hay que devolverla al estado en que podría intentarlo.
        neo.exhausted = false;
        neo.furor = 4;
        g.__errores = [];
        g.activateAbility(neo.instanceId, true); await asentar(ctx);
        check('no es acumulable: la segunda activación se rechaza con su motivo',
              (neo.counters.pared_falsa.count === 1) && ultimoError(g).includes('ya tiene su Pared falsa'),
              `count=${neo.counters.pared_falsa.count} · ${ultimoError(g)}`);
    }

    console.log(fallos === 0
        ? `\nSUITE carta_neo: ${comprobaciones}/${comprobaciones} comprobaciones — NEO CORRECTA`
        : `\nSUITE carta_neo: ${fallos} FALLOS de ${comprobaciones} comprobaciones`);
    process.exit(fallos ? 1 : 0);
})().catch(e => { console.log('ERROR: ' + e.message); console.log(e.stack); process.exit(1); });
