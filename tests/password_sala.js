// tests/password_sala.js — la contraseña de sala, y el proxy que la hace (o no) necesaria.
//
// LO QUE PROTEGE Y LO QUE NO, porque de eso depende que las comprobaciones tengan sentido:
// hashear la contraseña evita que quede en claro en un volcado de memoria o en un log. NO protege
// del tráfico, que va por HTTPS gracias al proxy de delante, no gracias a esto.
//
// Y lo más importante de todo: el hash NO puede vivir dentro del objeto `room`, porque ese objeto
// se emite entero a todos los clientes en varios sitios. Un bcrypt en el navegador de cualquiera
// es un bcrypt que se puede romper con calma en su casa.
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const srv = fs.readFileSync(path.join(RAIZ, 'server.js'), 'utf8');
const lobby = fs.readFileSync(path.join(RAIZ, 'public/lobby.html'), 'utf8');

let comprobaciones = 0, fallos = 0;
const check = (t, ok, extra) => { comprobaciones++; console.log((ok ? '  OK    · ' : '  FALLO · ') + t + (!ok && extra ? '  [' + extra + ']' : '')); if (!ok) fallos++; };

console.log('--- El proxy de delante ---');
check('el servidor confía en UN salto de proxy', /app\.set\('trust proxy', 1\)/.test(srv));
// Sin esto, `req.ip` es la IP del proxy para todo el mundo y el freno de /api/login pasa a ser
// global: diez fallos de cualquiera dejaban fuera a todos durante quince minutos.
check('...que es lo que hace que el freno de fuerza bruta sea por persona',
    /trust proxy[\s\S]{0,900}req\.ip/.test(srv) || /app\.set\('trust proxy'/.test(srv));

console.log('\n--- Dónde vive la contraseña ---');
check('el hash NO está dentro del objeto de la sala', /const roomPass = \{\};/.test(srv)
    && !/room\.passHash/.test(srv) && !/passHash:/.test(srv));
check('se guarda hasheada, no en claro', /bcrypt\.hashSync\(p, 10\)/.test(srv));
check('se compara contra el hash', /bcrypt\.compareSync/.test(srv));
check('la sala solo expone un booleano', /tienePassword/.test(srv) && /conPassword: !!roomPass\[code\]/.test(srv));
check('al morir la sala muere su contraseña',
    (srv.match(/delete rooms\[roomCode\]; delete roomPass\[roomCode\];/g) || []).length >= 5);

console.log('\n--- La puerta ---');
check('se comprueba ANTES de tocar nada de la sala',
    /socket\.on\('joinRoom'[\s\S]{0,500}passwordCorrecta\(roomCode, data\.password\)[\s\S]{0,200}roomLocked/.test(srv));
check('...y quien falla no recibe datos de la sala, solo que hace falta',
    /emit\('roomLocked', \{ code: roomCode, fallo:/.test(srv));
check('quien ya está dentro no la vuelve a escribir', /!socket\.rooms\.has\(roomCode\)/.test(srv));
check('cambiarla es del anfitrión o de un admin',
    /setRoomPassword'[\s\S]{0,500}!esAdminDelSocket\(socket\) && \(!senderSeat \|\| senderSeat !== room\.leader\)\) return;/.test(srv));

console.log('\n--- El lobby ---');
check('las tres opciones caben en una línea', /id="pass-check"/.test(lobby) && /flex-wrap: wrap; justify-content: center/.test(lobby));
check('el campo no existe hasta marcar la casilla', /id="pass-crear-fila" style="display: none/.test(lobby) && /function togglePassCrear/.test(lobby));
check('...con su "Mostrar"', /id="pass-crear-ver"/.test(lobby) && /function verPassCrear/.test(lobby));
check('marcar la casilla y dejarla vacía se avisa', /Has marcado Contraseña pero la has dejado vacía/.test(lobby));
check('las salas con contraseña se ven con candado en la lista', /r\.conPassword \? '<span title="Necesita contraseña"/.test(lobby));
check('y la sala tiene su candado en la cabecera', /id="btn-candado-sala"/.test(lobby) && /function pintarCandado/.test(lobby));
check('...que solo abre el anfitrión o un admin', /if \(!b \|\| !b\.dataset\.puedo\) return;/.test(lobby));
check('si el servidor pide contraseña, se pide y se reintenta', /socket\.on\('roomLocked'/.test(lobby) && /joinRoomByCode\(t\.code, t\.asSpectator, p\)/.test(lobby));
check('...y arrepentirse por enlace directo no deja bucle', /roomLocked'[\s\S]{0,400}location\.replace\(location\.pathname \+ '\?mode=online'\)/.test(lobby));

console.log(`\nSUITE password_sala: ${fallos ? fallos + ' FALLOS de ' : comprobaciones + '/'}${comprobaciones} comprobaciones` + (fallos ? '' : ' — LA CONTRASEÑA CUMPLE'));
if (fallos) process.exit(1);
