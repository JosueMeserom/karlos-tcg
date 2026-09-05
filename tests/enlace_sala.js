// tests/enlace_sala.js — el enlace directo a una sala, y quién puede cerrar salas.
//
// Dos cosas que solo se ven cuando fallan:
//   · Un enlace a una sala que ya no existe NO puede dejar el navegador en bucle: el manejador de
//     error recarga la página, y con el parámetro puesto volvería a intentar entrar y a fallar.
//   · Copiar al portapapeles por HTTPS no está disponible aquí (esto se sirve por HTTP), así que
//     tiene que haber camino alternativo o el botón no hace nada y no lo dice.
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const lobby = fs.readFileSync(path.join(RAIZ, 'public/lobby.html'), 'utf8');
const srv = fs.readFileSync(path.join(RAIZ, 'server.js'), 'utf8');

let comprobaciones = 0, fallos = 0;
const check = (t, ok, extra) => { comprobaciones++; console.log((ok ? '  OK    · ' : '  FALLO · ') + t + (!ok && extra ? '  [' + extra + ']' : '')); if (!ok) fallos++; };

console.log('--- Entrar por enlace ---');
check('se lee `sala` de la URL, y se valida el formato', /new URLSearchParams\(location\.search\)\.get\('sala'\)/.test(lobby) && /\^\[A-Z0-9\]\{4\}\$/.test(lobby));
check('con `?sala=` el modo online se sobreentiende', /urlParams\.get\('sala'\) \? 'online' : 'local'/.test(lobby));
check('se entra solo cuando el socket está listo', /socket\.on\('connect', \(\) => joinRoomByCode\(_sala\)\)/.test(lobby));
check('...y NO si el guardián ha visto una partida en curso', /_sala && !localStorage\.getItem\('karlos_partida_en_curso'\)/.test(lobby));
check('una sala que ya no existe no deja el navegador en bucle',
    /if \(salaDeLaURL\(\)\) location\.replace\(location\.pathname \+ '\?mode=online'\);/.test(lobby));

console.log('\n--- Copiar el enlace ---');
check('hay botón, junto al código de sala', /id="btn-copiar-sala"/.test(lobby) && /copiarEnlaceSala\(\)/.test(lobby));
check('el enlace lleva modo y sala', /'\?mode=online&sala=' \+ encodeURIComponent\(code\)/.test(lobby));
check('sin HTTPS hay camino alternativo', /window\.isSecureContext/.test(lobby) && /function copiarAPelo/.test(lobby) && /execCommand\('copy'\)/.test(lobby));
check('...y si tampoco, se enseña el enlace para copiarlo a mano', /prompt\('Copia el enlace a mano:'/.test(lobby));
check('el aviso se puede anclar a cualquier botón', /function avisillo\(texto, ancla\)/.test(lobby));

console.log('\n--- Cerrar salas (permiso arreglado de paso) ---');
check('adminCloseRoom comprueba la sesión, no lo que diga el cliente',
    /adminCloseRoom'[\s\S]{0,400}if \(!esAdminDelSocket\(socket\)\) return;/.test(srv));

console.log(`\nSUITE enlace_sala: ${fallos ? fallos + ' FALLOS de ' : comprobaciones + '/'}${comprobaciones} comprobaciones` + (fallos ? '' : ' — EL ENLACE CUMPLE'));
if (fallos) process.exit(1);
