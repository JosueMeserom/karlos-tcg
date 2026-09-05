// tests/forzar_escenario.js — el escenario forzado desde el lobby, y su validador.
//
// La pieza central es `validarEscenario` (cartas.js), que responde a UNA pregunta desde DOS
// sitios: la lucecita del panel del lobby y la partida al montar la mesa. Si cada uno tuviera su
// criterio, el lobby enseñaría verde y la mesa reventaría al empezar, que es el único fallo
// realmente feo que puede tener esto.
//
// Lo demás son comprobaciones de que la cadena está enganchada de punta a punta: el lobby lo
// guarda, el servidor lo deja pasar, y el cliente lo lee y lo monta. Son de fuente (como las de
// auditar_marcas) porque el panel es interfaz y no hay DOM que ejecutar aquí.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
let comprobaciones = 0, fallos = 0;
function check(t, ok, extra) {
    comprobaciones++;
    if (ok) console.log('  OK    · ' + t);
    else { fallos++; console.log('  FALLO · ' + t + (extra ? '  [' + extra + ']' : '')); }
}

const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    document: { getElementById: () => ({ style: {}, classList: { add() {}, remove() {} } }),
        createElement: () => ({ style: {}, classList: { add() {} }, appendChild() {} }),
        querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem() {} },
    setTimeout() {}, clearTimeout() {}, alert() {},
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'public/reglas.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'public/cartas.js'), 'utf8'), sandbox);
const validarEscenario = vm.runInContext('validarEscenario', sandbox);

console.log('--- El validador acepta lo bueno ---');
const BUENO = { turno: 2, turnoDe: 'p1', empieza: 'p2',
    p1: { vanguardia: ['Mini-tigre', { carta: 'Karlos', furor: 2 }], mano: ['Morfeo'] },
    p2: { vanguardia: [{ carta: 'Agah', estado: { sueno: { duration: 900 } } }] } };
check('un escenario correcto pasa', validarEscenario(BUENO).ok === true, JSON.stringify(validarEscenario(BUENO)));
check('...y uno mínimo también', validarEscenario({ turno: 2, p1: { vanguardia: ['Mini-tigre'] } }).ok === true);
check('la retribución explícita vale', validarEscenario({ turno: 2, p1: { vanguardia: ['Mini-tigre'], retribucion: ['Guardia'] } }).ok === true);
check('los alias en inglés valen', validarEscenario({ turno: 2, p1: { vanguard: ['Mini-tigre'], hand: ['Karlos'] } }).ok === true);

console.log('\n--- ...y rechaza lo malo, diciendo POR QUÉ ---');
const malo = (nombre, spec, trozo) => {
    const r = validarEscenario(spec);
    check(nombre, r.ok === false && (!trozo || (r.motivo || '').includes(trozo)), r.ok ? 'lo aceptó' : r.motivo);
};
malo('no es un objeto', 'pues no', 'objeto JSON');
malo('una lista tampoco', [1, 2, 3], 'objeto JSON');
malo('sin jugadores', { turno: 2 }, 'no monta a nadie');
malo('turno 1 (no se puede atacar)', { turno: 2 - 1, p1: { vanguardia: ['Mini-tigre'] } }, 'Pon 2');
malo('turnoDe raro', { turno: 2, turnoDe: 'p3', p1: { vanguardia: ['Mini-tigre'] } }, 'turnoDe');
malo('carta inexistente', { turno: 2, p1: { vanguardia: ['Pikachu'] } }, 'Pikachu');
malo('id inexistente', { turno: 2, p1: { vanguardia: [99999] } }, '99999');
malo('zona inventada', { turno: 2, p1: { banquillo: ['Mini-tigre'] } }, 'banquillo');
malo('zona que no es lista', { turno: 2, p1: { vanguardia: 'Mini-tigre' } }, 'lista');
malo('5 en vanguardia', { turno: 2, p1: { vanguardia: ['Mini-tigre', 'Guardia', 'Uniojo', 'Frikazo', 'Matón'] } }, 'límite son 4');
malo('3 Personajes delante', { turno: 2, p1: { vanguardia: ['Karlos', 'Zoe', 'Kyle'] } }, 'límite son 2');
malo('retaguardia con la vanguardia a medias', { turno: 2, p1: { vanguardia: ['Mini-tigre'], retaguardia: ['Guardia'] } }, 'las 4 de delante');

console.log('\n--- La cadena está enganchada de punta a punta ---');
const lobby = fs.readFileSync(path.join(RAIZ, 'public/lobby.html'), 'utf8');
const idx = fs.readFileSync(path.join(RAIZ, 'public/index.html'), 'utf8');
const srv = fs.readFileSync(path.join(RAIZ, 'server.js'), 'utf8');

check('el lobby pregunta al MISMO validador', /validarEscenario\(/.test(lobby));
check('el lobby pinta el panel del escenario', /📋 Escenario/.test(lobby) && /'sc-head'/.test(lobby));
check('...con su botón de Pegar', /'sc-paste'/.test(lobby) && /pegarEscenario/.test(lobby));
check('...que flota por encima en vez de empujar la columna',
    /id="tp-ovl"/.test(lobby) && /function colocarFlotante/.test(lobby) && !/overflow-y: auto; min-height: 0;/.test(lobby));
check('...y su cuadro de texto', /id="sc-text"/.test(lobby));
check('el botón de Pegar no despliega el panel (para el clic)', /data-pegar\][\s\S]{0,180}stopPropagation/.test(lobby));
check('las opciones se marcan en rojo si el escenario las pisa', /hayEscenarioValido\(testCfg\)/.test(lobby) && /#f87171/.test(lobby));
check('a quien no es admin se le dice sin detalles', /El anfitrión forzó un escenario/.test(lobby));
check('restablecer las opciones NO borra el escenario', /_esc = testCfg\.escenario/.test(lobby));
check('el servidor deja pasar el escenario, acotado', /escenario: \(typeof c\.escenario === 'string'/.test(srv) && /slice\(0, 20000\)/.test(srv));
check('el cliente lo lee de la config activa', /escenario: typeof c\.escenario === 'string'/.test(idx));
// Y lo hace ANTES de preparar nada: montar la mesa y luego pisarla dejaba viva la
// preparación (con "Inicio rápido" notándose aunque hubiera escenario), y encima se saltaba
// el cierre del setup.
check('...y se salta la preparación entera', /if \(this\.hayEscenarioForzado\(\) && !ignorarInicioRapido\) \{/.test(idx));
check('...cerrando el setup igual que el camino normal',
    /hayEscenarioForzado\(\) && !ignorarInicioRapido[\s\S]{0,900}setupComplete[\s\S]{0,300}NOTIFY_SETUP_COMPLETE/.test(idx));
check('...validándolo otra vez antes de montarlo', /aplicarEscenarioForzado\(\)[\s\S]{0,900}validarEscenario\(spec\)/.test(idx));
check('...y lo monta UN solo cliente, el resto lo recibe sincronizado',
    /aplicarEscenarioForzado\(\)[\s\S]{0,900}this\.myPlayerId !== 'p1'/.test(idx));

console.log(`\nSUITE forzar_escenario: ${fallos ? fallos + ' FALLOS de ' : comprobaciones + '/'}${comprobaciones} comprobaciones` +
    (fallos ? '' : ' — EL ESCENARIO FORZADO CUMPLE'));
if (fallos) process.exit(1);
