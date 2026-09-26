// tests/identidad_sala.js — de quién es un asiento.
//
// EL AGUJERO (Toto, 26-sep-2026): la identidad en una sala era EL NICK. El re-enganche comparaba
// `pl.name === username`, así que tu asiento era de quien escribiera tu nombre en su navegador.
// Se aguantaba mientras la sala era abierta y entre amigos; con contraseñas y expulsiones de por
// medio, no: bastaba con saber el nombre del anfitrión para entrar como él.
//
// Desde que la sesión de Express viaja con el socket hay identidad de verdad, así que un asiento
// de usuario registrado se ata a su `uid` y el nick queda solo para los invitados, que es lo
// único que tienen.
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const srv = fs.readFileSync(path.join(RAIZ, 'server.js'), 'utf8');

let comprobaciones = 0, fallos = 0;
const check = (t, ok, extra) => { comprobaciones++; console.log((ok ? '  OK    · ' : '  FALLO · ') + t + (!ok && extra ? '  [' + extra + ']' : '')); if (!ok) fallos++; };

// Los dos helpers se ejecutan de verdad: son el corazón del permiso y una regex no prueba nada.
const trozo = (nombre) => {
    const i = srv.indexOf('function ' + nombre + '(');
    return srv.slice(i, srv.indexOf('\n}', i) + 2);
};
const identidad = new Function('return ' + trozo('identidad'))();
const esSuyo = new Function('return ' + trozo('esSuyo'))();

const sockDe = (userId, username) => ({ request: { session: userId ? { userId, username } : {} } });
const invitado = { request: {} };

console.log('--- Quién eres ---');
{
    const yo = identidad(sockDe(7, 'Ultra_K'), 'me-llamo-otra-cosa');
    check('registrado: uid estable y nombre DEL SERVIDOR', yo.uid === 'u:7' && yo.nombre === 'Ultra_K',
        JSON.stringify(yo));
}
{
    const yo = identidad(invitado, 'Invitado_932');
    check('invitado: sin uid, y su nick', yo.uid === null && yo.nombre === 'Invitado_932');
}
check('sin nombre ni sesión, no revienta', identidad(invitado, undefined).nombre === 'Invitado');
check('...y un socket roto tampoco', identidad({}, 'Pepe').nombre === 'Pepe');

console.log('\n--- De quién es el asiento ---');
const ultra = identidad(sockDe(7, 'Ultra_K'), null);
const otro = identidad(sockDe(9, 'Otro'), null);
const impostor = identidad(invitado, 'Ultra_K');   // un invitado que se pone TU nombre
const asientoUltra = { uid: 'u:7', name: 'Ultra_K' };
const asientoInvitado = { uid: null, name: 'Invitado_932' };

check('tu asiento es tuyo', esSuyo(asientoUltra, ultra));
check('...y no de otro registrado', !esSuyo(asientoUltra, otro));
// ESTE es el agujero que se cierra.
check('...y NO de quien se pone tu nombre', !esSuyo(asientoUltra, impostor));
check('el asiento de un invitado sigue siendo suyo por el nick',
    esSuyo(asientoInvitado, identidad(invitado, 'Invitado_932')));
check('...pero no de otro invitado', !esSuyo(asientoInvitado, identidad(invitado, 'Invitado_1')));
check('un registrado no hereda el asiento de un invitado homónimo',
    !esSuyo({ uid: null, name: 'Ultra_K' }, ultra));
check('un asiento vacío no es de nadie', !esSuyo(null, ultra));

console.log('\n--- Y se usa en TODAS partes ---');
check('ya no queda ninguna comparación por nick',
    !/\.name === data\.username/.test(srv) && !/\.name === username/.test(srv.replace(/^\/\/.*$/gm, '')));
for (const [donde, patron] of [
    ['al entrar en la sala', /socket\.on\('joinRoom'[\s\S]{0,1200}esSuyo\(pl, _yo\)/],
    ['al volver a una sala terminada', /returnToFinishedRoom'[\s\S]{0,600}esSuyo\(room\.players\.p1, _yo\)/],
    ['al ocupar asiento', /occupySeat'[\s\S]{0,1800}esSuyo\(x, _yo\)/],
    ['al abandonar', /abandonGame'[\s\S]{0,1800}esSuyo\(room\.players\.p1, _yo\)/],
]) check(donde, patron.test(srv));
check('el asiento guarda el uid', /room\.players\[seatLibre\] = \{ id: socket\.id, uid: _yo\.uid/.test(srv));
check('y el chat de la sala lo firma el servidor',
    /roomChat'[\s\S]{0,200}username: identidad\(socket, data\.username\)\.nombre/.test(srv));

console.log(`\nSUITE identidad_sala: ${fallos ? fallos + ' FALLOS de ' : comprobaciones + '/'}${comprobaciones} comprobaciones` + (fallos ? '' : ' — LA IDENTIDAD CUMPLE'));
if (fallos) process.exit(1);
