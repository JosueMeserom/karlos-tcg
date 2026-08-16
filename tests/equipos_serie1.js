// tests/equipos_serie1.js — Hagoromo y Guantes sedientos, las dos primeras Ayudas equipables
// nuevas de la Serie 1 (16-ago-2026).
//
// Aserciones directas, no viejo-vs-nuevo: son cartas NUEVAS, no existen en la base congelada, así
// que no hay con qué comparar. Lo que se fija aquí es su contrato y, sobre todo, las tres piezas
// de motor que hubo que añadir para ellas — que es lo que de verdad puede romper a otras cartas:
//
//   · `mientrasEquipado: { inmuneAEstados: true }` -> `applyStatus` lo respeta, en el mismo sitio
//     donde ya se respetaba la inmunidad de los Avatares (el único por el que pasan todos).
//
// Se comprueba tanto lo que debe hacer como lo que NO: que la inmunidad se cae al desequipar. Si
// se quedara pegada, la carta sería inmune el resto de la partida y no se notaría hasta mucho
// después — es el fallo caro de este tipo de banderas.
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
const buscar = (g, pid, nombre) => [...g.players[pid].vanguard, ...g.players[pid].rearguard].find(c => c.name === nombre);
const contador = (c, k) => (c.counters && c.counters[k] && c.counters[k].count) || 0;

(async () => {
    console.log('--- Hagoromo: cura, viste y vuelve inmune ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 2, vida: 1 }], mano: ['Hagoromo'] },
            p2: { vanguardia: ['Aniceto'] },
        });
        const tigre = buscar(g, 'p1', 'Mini-tigre');
        const defBase = tigre.currentDef;
        await paso({ jugar: 'Hagoromo' });
        await paso({ elegir: ['Mini-tigre'] });
        g.updatePassives();
        check('el aliado TRIBUTA 1 de Furor (es Coste, no Requisito)', tigre.furor === 1,
            'furor=' + tigre.furor + ' (partia de 2)');
        check('cura 2 de Vida al equiparse', tigre.currentHp === 3, 'vida=' + tigre.currentHp);
        check('+1 de Def mientras lo lleve', tigre.currentDef === defBase + 1,
            'def=' + tigre.currentDef + ' base=' + defBase);
        check('queda marcado como inmune a estados', tigre.inmuneAEstados === true,
            'inmuneAEstados=' + tigre.inmuneAEstados);

        // Lo que de verdad importa: que la inmunidad SIRVA. Se prueba por el único camino por el
        // que pasan todos los estados alterados.
        g.applyStatus(tigre, 'dot', 3, 'prueba');
        check('un estado alterado no le entra', !(tigre.status && tigre.status.dot),
            'status=' + JSON.stringify(tigre.status));
    }
    {
        // La inmunidad NO puede quedarse pegada: la reimpone onEquipUpdate en cada pasada, así que
        // al desequipar debe caerse sola en la siguiente. Si se quedara, la carta sería inmune el
        // resto de la partida y no se notaría hasta mucho después.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 2, vida: 1 }], mano: ['Hagoromo'] },
            p2: { vanguardia: ['Aniceto'] },
        });
        const tigre = buscar(g, 'p1', 'Mini-tigre');
        await paso({ jugar: 'Hagoromo' });
        await paso({ elegir: ['Mini-tigre'] });
        g.updatePassives();
        const eq = (tigre.equippedCards || [])[0];
        check('el Hagoromo queda anexado', !!eq && eq.name === 'Hagoromo', 'equipos=' + (tigre.equippedCards || []).length);
        if (eq) g.unequipAll(tigre);
        g.updatePassives();
        check('al desequiparlo deja de ser inmune', !tigre.inmuneAEstados, 'inmuneAEstados=' + tigre.inmuneAEstados);
        g.applyStatus(tigre, 'dot', 3, 'prueba');
        check('...y ya sí le entra un estado', !!(tigre.status && tigre.status.dot), 'status=' + JSON.stringify(tigre.status));
    }
    {
        // Limpia lo que tuviera al ponérselo.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 2 }], mano: ['Hagoromo'] },
            p2: { vanguardia: ['Aniceto'] },
        });
        const tigre = buscar(g, 'p1', 'Mini-tigre');
        // El estado se pone por el camino de verdad (applyStatus) y no con el `estado:` del
        // escenario, que lo deja como una cadena suelta en vez de con la forma que usa el motor.
        g.applyStatus(tigre, 'dot', 3, 'prueba');
        check('parte con un estado alterado puesto', !!(tigre.status && tigre.status.dot),
            'status=' + JSON.stringify(tigre.status));
        await paso({ jugar: 'Hagoromo' });
        await paso({ elegir: ['Mini-tigre'] });
        check('se equipa igualmente aunque el aliado esté sano', ((tigre.equippedCards || [])[0] || {}).name === 'Hagoromo',
            'equipos=' + (tigre.equippedCards || []).length);
        check('al equiparlo se le limpian los estados que tuviera',
            !(tigre.status && tigre.status.dot && tigre.status.dot.duration > 0),
            'status=' + JSON.stringify(tigre.status));
    }

    {
        // La otra mitad de que sea un COSTE: sin Furor con el que pagar, la carta no se puede
        // jugar. Un Requisito se comprobaría igual, pero no dejaría a nadie a 0 al usarla.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Mini-tigre', furor: 0, vida: 1 }], mano: ['Hagoromo'] },
            p2: { vanguardia: ['Aniceto'] },
        });
        const tigre = buscar(g, 'p1', 'Mini-tigre');
        await paso({ jugar: 'Hagoromo' });
        check('sin Furor con el que pagar, no se equipa a nadie', (tigre.equippedCards || []).length === 0,
            'equipos=' + (tigre.equippedCards || []).length);
        check('...y el Hagoromo sigue en la mano', g.players.p1.hand.some(c => c.name === 'Hagoromo'),
            'mano=' + g.players.p1.hand.map(c => c.name).join(','));
    }

    console.log('\n--- Hagoromo sobre Zoe (calcinante): le corta su propio Daño por tiempo ---');
    {
        // Idea de Toto (16-ago-2026). JUSTICIERA ABRASADORA se aplica Daño por tiempo A SÍ MISMA
        // tras combatir, y su pasiva convierte ese daño en curación y +2 de Def. Con el Hagoromo
        // puesto, ese autoaplicado pasa por applyStatus como cualquier otro y se bloquea — o sea
        // que el Hagoromo le QUITA un beneficio en vez de protegerla. Es consecuente con las
        // reglas, pero es una interacción que conviene tener fijada por escrito y no descubrir
        // jugando: si algún día se decide que Zoe debe ser la excepción, esta prueba lo dirá.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Zoe (calcinante)', furor: 2 }], mano: ['Hagoromo'] },
            p2: { vanguardia: ['Aniceto'] },
        });
        const zoe = buscar(g, 'p1', 'Zoe (calcinante)');
        const defSinDot = zoe.currentDef;
        g.applyStatus(zoe, 'dot', 2, zoe);
        g.updatePassives();
        check('sin Hagoromo, su propio Daño por tiempo le entra y le da +2 de Def',
            !!(zoe.status && zoe.status.dot) && zoe.currentDef === defSinDot + 2,
            'def=' + zoe.currentDef + ' base=' + defSinDot + ' status=' + JSON.stringify(zoe.status));

        zoe.status = {};
        await paso({ jugar: 'Hagoromo' });
        await paso({ elegir: ['Zoe (calcinante)'] });
        g.updatePassives();
        g.applyStatus(zoe, 'dot', 2, zoe);
        check('con Hagoromo puesto, ya no se lo puede aplicar ni a sí misma',
            !(zoe.status && zoe.status.dot), 'status=' + JSON.stringify(zoe.status));
    }

    console.log('\n--- Guantes sedientos: 3 turnos bebiendo, luego +2 de Atq ---');
    {
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Karlos', vida: 3 }], mano: ['Guantes sedientos'] },
            p2: { vanguardia: [{ carta: 'Guardaespaldas', vida: 9 }] },
        });
        const karlos = buscar(g, 'p1', 'Karlos');
        const atkBase = karlos.currentAtk;
        await paso({ jugar: 'Guantes sedientos' });
        await paso({ elegir: ['Karlos'] });
        g.updatePassives();
        check('el contador entra con 3 y vive en el PORTADOR, no en la Ayuda',
            contador(karlos, 'guantes_sed') === 3, 'contador=' + contador(karlos, 'guantes_sed'));
        check('el contador tiene nombre e icono para el badge',
            !!(karlos.counters.guantes_sed.name && karlos.counters.guantes_sed.icon)
            || !!(karlos.counters.guantes_sed.nombre && karlos.counters.guantes_sed.icono),
            JSON.stringify(karlos.counters.guantes_sed));
        check('todavía NO da el +2 de Atq (aún tiene sed)', karlos.currentAtk === atkBase,
            'atk=' + karlos.currentAtk + ' base=' + atkBase);

        // El golpe: es la pieza de motor nueva (un TRAS_ATACAR declarado en un EQUIPO).
        const vidaAntes = karlos.currentHp;
        await paso({ atacar: 'Karlos', objetivo: 'Guardaespaldas' });
        check('al golpear con un ataque normal, los guantes le curan 1 de Vida',
            karlos.currentHp === vidaAntes + 1, 'vida=' + karlos.currentHp + ' antes=' + vidaAntes);
    }
    {
        // El tic de cada turno propio, la otra pieza nueva (los equipos en la fase de efectos
        // finales), y el cambio de efecto al llegar a 0.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Karlos', vida: 3 }], mano: ['Guantes sedientos'] },
            p2: { vanguardia: [{ carta: 'Guardaespaldas', vida: 9 }] },
        });
        const karlos = buscar(g, 'p1', 'Karlos');
        const atkBase = karlos.currentAtk;
        await paso({ jugar: 'Guantes sedientos' });
        await paso({ elegir: ['Karlos'] });
        await paso({ finTurno: true }); await paso({ finTurno: true });
        g.updatePassives();
        check('tras un turno propio el contador baja a 2', contador(karlos, 'guantes_sed') === 2,
            'contador=' + contador(karlos, 'guantes_sed'));
        check('...y con sed todavía, sigue sin el +2 de Atq', karlos.currentAtk === atkBase,
            'atk=' + karlos.currentAtk);
        await paso({ finTurno: true }); await paso({ finTurno: true });
        await paso({ finTurno: true }); await paso({ finTurno: true });
        g.updatePassives();
        check('a los 3 turnos propios el contador llega a 0', contador(karlos, 'guantes_sed') === 0,
            'contador=' + contador(karlos, 'guantes_sed'));
        check('...y entonces sí da el +2 de Atq', karlos.currentAtk === atkBase + 2,
            'atk=' + karlos.currentAtk + ' base=' + atkBase);
        // Y ya no bebe: el contador no puede bajar de 0 y la curación está condicionada a él.
        const vidaAntes = karlos.currentHp;
        await paso({ atacar: 'Karlos', objetivo: 'Guardaespaldas' });
        check('saciados, ya no curan al golpear', karlos.currentHp === vidaAntes,
            'vida=' + karlos.currentHp + ' antes=' + vidaAntes);
        check('el contador no baja de 0', contador(karlos, 'guantes_sed') === 0,
            'contador=' + contador(karlos, 'guantes_sed'));
    }

    {
        // EL CASO QUE MOTIVÓ TODO (Toto, 16-ago-2026): el mínimo de daño del juego NO es 1. Un
        // Esbirro que golpea a un Personaje hace 0,5, y entonces los guantes deben curar 0,5, no
        // 1. La carta se diseñó dando por hecho el mínimo 1, como bastantes otras.
        const { g, paso } = await mesa({
            turno: 2, turnoDe: 'p1', empieza: 'p2',
            p1: { vanguardia: [{ carta: 'Guardaespaldas', vida: 2 }], mano: ['Guantes sedientos'] },
            // Karlos tiene 6 de Def y el Guardaespaldas 3 de Atq: atq - def <= 0, que es la
            // condición exacta del mínimo (index.html). Esbirro contra Personaje -> 0,5.
            p2: { vanguardia: [{ carta: 'Karlos', vida: 9 }] },
        });
        const esbirro = buscar(g, 'p1', 'Guardaespaldas');
        await paso({ jugar: 'Guantes sedientos' });
        await paso({ elegir: ['Guardaespaldas'] });
        const vidaAntes = esbirro.currentHp;
        const rivalAntes = buscar(g, 'p2', 'Karlos').currentHp;
        await paso({ atacar: 'Guardaespaldas', objetivo: 'Karlos' });
        const dano = rivalAntes - buscar(g, 'p2', 'Karlos').currentHp;
        check('un Esbirro contra un Personaje hace 0,5 de daño', dano === 0.5, 'dano=' + dano);
        check('...y los guantes le curan ESA cantidad, no 1', esbirro.currentHp === vidaAntes + 0.5,
            'vida=' + esbirro.currentHp + ' antes=' + vidaAntes);
    }

    console.log('\n' + (fallos
        ? `SUITE equipos_serie1: ${comprobaciones - fallos}/${comprobaciones} comprobaciones — ${fallos} FALLOS`
        : `SUITE equipos_serie1: ${comprobaciones}/${comprobaciones} comprobaciones — LOS DOS EQUIPOS CORRECTOS`));
    if (fallos) process.exit(1);
})();
