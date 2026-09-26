// tests/presencia_sala.js — quién hay en una sala, y que lo diga una sola voz.
//
// EL FALLO QUE LA TRAJO (Toto, 26-sep-2026): "si uno se sale definitivamente de la sala y otro va
// al lobby, sigue viendo la sala como 1/2". Convivían TRES ideas de "estar dentro" -el asiento
// asignado, el socket vivo que lo reclama, y estar recibiendo lo que pasa dentro- y la lista de
// salas publicaba la primera, que es el MUEBLE, mientras que quien la lee entiende la tercera,
// que es la PERSONA. Una sala vacía se anunciaba como ocupada.
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const srv = fs.readFileSync(path.join(RAIZ, 'server.js'), 'utf8');
const lobby = fs.readFileSync(path.join(RAIZ, 'public/lobby.html'), 'utf8');

let comprobaciones = 0, fallos = 0;
const check = (t, ok, extra) => { comprobaciones++; console.log((ok ? '  OK    · ' : '  FALLO · ') + t + (!ok && extra ? '  [' + extra + ']' : '')); if (!ok) fallos++; };

// El helper se prueba de verdad, no por regex: es el punto único de consulta y lo que diga va a
// misa en tres sitios distintos.
const cuerpo = srv.slice(srv.indexOf('function presencia(room)'));
const presencia = new Function('return ' + cuerpo.slice(0, cuerpo.indexOf('\n}') + 2))();
const sala = (p1, p2, specs = 0) => ({ players: { p1, p2 }, spectators: new Array(specs).fill({}) });
const vivo = { connected: true }, fuera = { connected: false }, muerto = { connected: false, exhausted: true };

console.log('--- Una sola voz para "quién hay" ---');
check('sala vacía', JSON.stringify(presencia(sala(null, null))).includes('"presentes":0'));
{
    const r = presencia(sala(vivo, fuera));
    check('uno presente y uno reservado', r.presentes === 1 && r.reservados === 1 && r.sentados === 2,
        JSON.stringify(r));
    check('...y el asiento lo dice por su nombre', r.asientos.p1 === 'presente' && r.asientos.p2 === 'reservado');
}
{
    // EL CASO DE TOTO: los dos asientos ocupados pero NADIE dentro. Antes esto se publicaba como
    // 2/2; ahora se publica como 0 presentes y 2 esperando.
    const r = presencia(sala(fuera, fuera));
    check('dos asientos reservados y NADIE presente', r.presentes === 0 && r.reservados === 2, JSON.stringify(r));
}
{
    const r = presencia(sala(muerto, vivo));
    check('un agotado no cuenta como reservado', r.agotados === 1 && r.reservados === 0 && r.presentes === 1);
}
check('los espectadores también salen', presencia(sala(vivo, null, 3)).espectadores === 3);

console.log('\n--- Y todo el mundo pregunta ahí ---');
check('la lista de salas publica la presencia', /presentes: presencia\(rooms\[code\]\)\.presentes/.test(srv));
check('...sin dejar de decir si CABE alguien', /playersCount: \(rooms\[code\]\.players\.p1 \? 1 : 0\)/.test(srv));
check('un asiento reservado dice hasta cuándo', /\.reservadoHasta = Date\.now\(\) \+ ms;/.test(srv));
check('...y deja de decirlo al volver su dueño', /clearSeatRelease[\s\S]{0,200}reservadoHasta = null;/.test(srv));
check('volver a tu asiento se anuncia', /recupera su asiento/.test(srv));

console.log('\n--- Lo que se ve ---');
check('la lista enseña gente, no muebles', /r\.presentes !== undefined \? r\.presentes : r\.playersCount/.test(lobby));
check('...y marca los asientos que esperan', /reservado\$\{r\.reservados > 1 \? 's' : ''\}/.test(lobby));
check('dentro de la sala, el asiento reservado manda sobre "eligiendo mazo"',
    /if \(!pl\.connected\) \{ const s = fStatus\(pl\); statusEl\.innerText = s\.txt;/.test(lobby));
check('la cuenta atrás avanza de verdad', /_tickReserva = setInterval/.test(lobby));
check('...tocando solo el texto, sin repintar el panel de pruebas',
    /_tickReserva = setInterval\([\s\S]{0,700}room-' \+ st \+ '-status/.test(lobby)
    && !/_tickReserva = setInterval\(\(\) => \{ if \(_tpLastRoom\) updateRoomUI/.test(lobby));

console.log(`\nSUITE presencia_sala: ${fallos ? fallos + ' FALLOS de ' : comprobaciones + '/'}${comprobaciones} comprobaciones` + (fallos ? '' : ' — LA PRESENCIA CUMPLE'));
if (fallos) process.exit(1);
