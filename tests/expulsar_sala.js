// tests/expulsar_sala.js — expulsar de la sala: quién puede, a quién, y qué pasa después.
//
// Lo importante aquí NO es la interfaz sino el permiso, y es el primer sitio del proyecto donde
// el servidor comprueba por su cuenta si alguien es administrador en vez de creerse lo que diga
// el cliente. Hasta ahora `adminCloseRoom` se fiaba del navegador; para echar gente eso no vale,
// así que la sesión de Express se comparte con socket.io y el permiso se mira ahí.
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const srv = fs.readFileSync(path.join(RAIZ, 'server.js'), 'utf8');
const lobby = fs.readFileSync(path.join(RAIZ, 'public/lobby.html'), 'utf8');

let comprobaciones = 0, fallos = 0;
function check(t, ok, extra) {
    comprobaciones++;
    if (ok) console.log('  OK    · ' + t);
    else { fallos++; console.log('  FALLO · ' + t + (extra ? '  [' + extra + ']' : '')); }
}

console.log('--- El servidor sabe quién eres ---');
check('la sesión se comparte con socket.io', /io\.engine\.use\(/.test(srv) && /sessionMiddleware/.test(srv));
check('...envuelta, para que un fallo no tumbe las conexiones',
    /io\.engine\.use\(\(req, res, next\) => \{[\s\S]{0,220}catch/.test(srv));
check('...y hay un solo sitio que responda "¿es admin?"', /function esAdminDelSocket/.test(srv));

console.log('\n--- El permiso ---');
check('existe el evento kickFromRoom', /socket\.on\('kickFromRoom'/.test(srv));
check('lo puede el líder de la sala o un admin',
    /kickFromRoom'[\s\S]{0,900}esAdminDelSocket\(socket\)[\s\S]{0,300}!admin && \(!senderSeat \|\| senderSeat !== room\.leader\)\) return;/.test(srv));
check('nadie se expulsa a sí mismo', /if \(quien === senderSeat\) return;/.test(srv));
check('al expulsado se le dice por qué', /te ha expulsado de la sala/.test(srv));
check('...y la sala se entera por su chat', /ha sido \$\{admin[\s\S]{0,120}expulsado por el anfitrión/.test(srv));
check('si echas al líder, el liderazgo pasa al otro asiento',
    /if \(room\.leader === quien\)[\s\S]{0,200}room\.leader = otro;/.test(srv));
check('el expulsado sale de la sala de socket.io', /sockFuera\.leave\(/.test(srv));
check('y la lista de salas se refresca', /kickFromRoom'[\s\S]{0,2000}broadcastRoomList\(\);/.test(srv));

console.log('\n--- La interfaz ---');
check('el botón sale al anfitrión o a un admin',
    /const puedoExpulsar = \(localStorage\.getItem\('karlos_is_admin'\) === '1'\) \|\| \(myRole && room\.leader === myRole\)/.test(lobby));
check('...y nunca sobre uno mismo', /if \(!puedoExpulsar \|\| quien === myRole\) return '';/.test(lobby));
check('el hueco está reservado SIEMPRE, haya botón o no',
    /\.kick-slot \{ flex: none; width: 18px/.test(lobby) && /<span class="kick-slot">/.test(lobby));
check('...también en los dos asientos de jugador',
    /id="room-p1-kick"/.test(lobby) && /id="room-p2-kick"/.test(lobby));
check('solo se ve al pasar por encima de su fila', /\.fila-kick:hover \.kick-btn/.test(lobby));
// Centrado óptico, no geométrico: en las filas de jugador el nombre es de 1rem y deja hueco de
// descendentes, así que el botón centrado en la caja se ve por encima de las letras.
check('en las filas de jugador se baja un par de píxeles',
    /\.fila-kick--jugador \.kick-btn \{ top: 2px; \}/.test(lobby)
    && (lobby.match(/fila-kick fila-kick--jugador/g) || []).length === 2);
check('y pregunta antes de echar a nadie', /confirm\(`¿Expulsar a \$\{nombre\} de la sala\?`\)/.test(lobby));

console.log(`\nSUITE expulsar_sala: ${fallos ? fallos + ' FALLOS de ' : comprobaciones + '/'}${comprobaciones} comprobaciones` +
    (fallos ? '' : ' — LA EXPULSIÓN CUMPLE'));
if (fallos) process.exit(1);
