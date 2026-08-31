// archivo: server.js
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const { Server } = require('socket.io'); 

const app = express();
const server = http.createServer(app);
const io = new Server(server); 
const PORT = process.env.PORT || 4000; 

// --- MIDDLEWARES ---
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), { index: false, setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') })); // no-cache: el navegador revalida siempre (adiós JS rancio al editar en caliente)

// El secreto de sesión NO va en el código (el repo es público): se lee de SESSION_SECRET, y si no
// existe se genera un fichero .session-secret (ignorado por git) la primera vez. Así sobrevive a los
// reinicios de pm2 sin tener que enredar con variables de entorno.
const FICHERO_SECRETO = path.join(__dirname, '.session-secret');
if (!process.env.SESSION_SECRET && !fs.existsSync(FICHERO_SECRETO)) {
    fs.writeFileSync(FICHERO_SECRETO, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
}
const SESSION_SECRET = process.env.SESSION_SECRET || fs.readFileSync(FICHERO_SECRETO, 'utf8').trim();

// --- SESIONES PERSISTENTES ---
app.use(session({
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: __dirname }), // <--- Cambiado a __dirname
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: 'auto',      // sola se pone en true si la conexion es HTTPS; en HTTP local sigue funcionando
        sameSite: 'lax',     // el navegador no manda esta cookie en peticiones que nazcan en OTRA web (anti-CSRF)
        maxAge: 30 * 24 * 60 * 60 * 1000 // <--- Recuerda el login durante 30 días
    } 
}));

// --- BASE DE DATOS (SQLite) ---
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error('Error al abrir la base de datos:', err.message);
    else console.log('Conectado a la base de datos SQLite.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        is_admin INTEGER DEFAULT 0
    )`);

    // Parche seguro: intentamos añadir la columna por si la DB ya existía de antes
    db.run(`ALTER TABLE users ADD COLUMN theme TEXT DEFAULT 'dark'`, (err) => {
        // Ignoramos el error si la columna ya existe
    });
    db.run(`ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`, (err) => {
        // Ignoramos el error silenciosamente si la columna ya existe
    });

    db.run(`CREATE TABLE IF NOT EXISTS decks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        deck_name TEXT NOT NULL,
        cards JSON NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
});

const bcrypt = require('bcryptjs');

// Freno de fuerza bruta para las rutas de credenciales: 10 intentos por IP cada cuarto de hora.
// Techo asumido: vive en memoria, o sea que es por proceso y se olvida al reiniciar pm2. Para un
// servidor de una sola instancia sobra; si algun dia hay varias, esto se muda a la base de datos.
const intentosAuth = new Map(); // ip -> { n, hasta }
function frenoAuth(req, res, next) {
    const ahora = Date.now();
    const e = intentosAuth.get(req.ip);
    if (!e || ahora > e.hasta) intentosAuth.set(req.ip, { n: 1, hasta: ahora + 15 * 60 * 1000 });
    else if (++e.n > 10) return res.status(429).json({ error: 'demasiados intentos, prueba dentro de unos minutos' });
    if (intentosAuth.size > 500) for (const [ip, v] of intentosAuth) if (ahora > v.hasta) intentosAuth.delete(ip);
    next();
}

// --- RUTAS DE AUTENTICACIÓN ---
app.post('/api/register', frenoAuth, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'faltan datos' });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, hashedPassword], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'el usuario ya existe' });
                return res.status(500).json({ error: 'error al registrar' });
            }
            res.json({ success: true });
        });
    } catch (e) {
        res.status(500).json({ error: 'error de servidor' });
    }
});

app.post('/api/login', frenoAuth, (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (err || !user) return res.status(400).json({ error: 'usuario no encontrado' });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'contraseña incorrecta' });

        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.isAdmin = user.is_admin; // <--- GUARDAMOS SI ES ADMIN
        res.json({ success: true, username: user.username, isAdmin: user.is_admin });
    });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/session', (req, res) => {
    if (req.session.userId) res.json({ loggedIn: true, username: req.session.username, isAdmin: req.session.isAdmin });
    else res.json({ loggedIn: false });
});

// --- PREFERENCIAS DE USUARIO (tema claro/oscuro, etc.) ---
app.get('/api/prefs', (req, res) => {
    if (!req.session.userId) return res.json({ loggedIn: false });
    db.get(`SELECT theme FROM users WHERE id = ?`, [req.session.userId], (err, row) => {
        if (err || !row) return res.json({ loggedIn: false });
        res.json({ loggedIn: true, theme: row.theme || 'dark' });
    });
});
app.post('/api/prefs', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'no autorizado' });
    const theme = req.body.theme === 'light' ? 'light' : 'dark';
    db.run(`UPDATE users SET theme = ? WHERE id = ?`, [theme, req.session.userId], (err) => {
        if (err) return res.status(500).json({ error: 'error al guardar' });
        res.json({ success: true, theme });
    });
});

// --- RUTAS DEL CONSTRUCTOR DE MAZOS ---
app.get('/api/decks', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'no autorizado' });
    db.all(`SELECT id, deck_name, cards FROM decks WHERE user_id = ?`, [req.session.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'error al cargar mazos' });
        const decks = rows.map(r => ({ id: r.id, name: r.deck_name, cards: JSON.parse(r.cards) }));
        res.json({ success: true, decks });
    });
});

app.post('/api/decks', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'no autorizado' });
    const { id, name, cards } = req.body;
    
    if (!name || !cards || cards.length < 40) return res.status(400).json({ error: 'El mazo debe tener un mínimo de 40 cartas y un nombre.' });

    if (id) {
        db.run(`UPDATE decks SET deck_name = ?, cards = ? WHERE id = ? AND user_id = ?`, 
            [name, JSON.stringify(cards), id, req.session.userId], 
            function(err) {
                if (err) return res.status(500).json({ error: 'Error al actualizar el mazo.' });
                res.json({ success: true, deckId: id });
            }
        );
    } else {
        db.run(`INSERT INTO decks (user_id, deck_name, cards) VALUES (?, ?, ?)`, 
            [req.session.userId, name, JSON.stringify(cards)], 
            function(err) {
                if (err) return res.status(500).json({ error: 'Error al guardar el mazo.' });
                res.json({ success: true, deckId: this.lastID });
            }
        );
    }
});

app.delete('/api/decks/:id', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'no autorizado' });
    db.run(`DELETE FROM decks WHERE id = ? AND user_id = ?`, [req.params.id, req.session.userId], function(err) {
        if (err) return res.status(500).json({ error: 'Error al borrar.' });
        res.json({ success: true });
    });
});

// --- SISTEMA MULTIJUGADOR EN TIEMPO REAL (SOCKET.IO) ---
const rooms = {}; 

// Acciones que solo puede emitir legítimamente el jugador activo

// Acciones EXCLUSIVAS del jugador activo (anti-trampas). Las RESPUESTAS a prompts
// (CHOICE_SELECTED, VISUAL_SEARCH_CONFIRM, OPPONENT_DISCARD, monedas, etc.) NO van aquí:
// el jugador NO activo las emite legítimamente al reaccionar, descartar por un efecto, etc.
const PLAYER_ACTIONS = new Set([
    'PLAY_CARD', 'SELECT_CARD', 'ACTIVATE_ABILITY', 'CONFIRM_ACTION', 'CANCEL_ACTION',
    'END_TURN', 'DIRECT_ATTACK', 'FINISH_EARLY_TARGETS', 'TYPE_SELECTION',
    'DISMISS_TURN_OVERLAY'
]);

// Acciones que se aplican EN ORDEN vía la cola del cliente (las que pasan por processActionQueue).
// Dejamos fuera las que hoy se ejecutan de inmediato (monedas, CHOICE, VISUAL_SEARCH): esas las trataremos en 0c.
const ORDERED_ACTIONS = new Set([
    'PLAY_CARD', 'SELECT_CARD', 'ACTIVATE_ABILITY', 'CONFIRM_ACTION', 'CANCEL_ACTION',
    'END_TURN', 'DIRECT_ATTACK', 'FINISH_EARLY_TARGETS', 'TYPE_SELECTION',
    'DISMISS_TURN_OVERLAY', 'OPPONENT_DISCARD', 'CLOSE_VIEWER', 'DEBUG_RETRIBUTION', 'DEBUG_COIN_MODE'
]);

// Cierre diferido de salas terminadas: damos margen para "Volver a la sala" antes de cerrar.
const closeTimers = {};
function clearCloseTimer(roomCode) {
    if (closeTimers[roomCode]) { clearTimeout(closeTimers[roomCode]); delete closeTimers[roomCode]; }
}
function closeFinishedRoom(roomCode) {
    clearCloseTimer(roomCode);
    if (!rooms[roomCode]) return;
    io.to(roomCode).emit('finishedRoomClosed', { msg: 'La sala se ha cerrado: la partida terminó y ya no queda nadie dentro.' });
    delete rooms[roomCode];
    broadcastRoomList();
}

// ===== PASO A1: gracia de reconexión por asiento + resolución de partida =====
const graceTimers = {}; // clave: `${roomCode}:${seat}` -> Timeout
// Memoria breve para avisar al jugador que perdió por gracia si vuelve tras cerrarse la sala.
const finishedLosers = {}; // roomCode -> { at, seats: { p1: msg, p2: msg } }
function recordGraceLoss(roomCode, seat, name) {
    const now = Date.now();
    for (const rc in finishedLosers) { if (now - finishedLosers[rc].at > 900000) delete finishedLosers[rc]; } // purga >15 min
    finishedLosers[roomCode] = finishedLosers[roomCode] || { at: now, seats: {} };
    finishedLosers[roomCode].at = now;
    finishedLosers[roomCode].seats[seat] = 'Has perdido tu partida pendiente porque no te has reconectado durante el tiempo de gracia.';
}
function clearGraceTimer(roomCode, seat) {
    const k = `${roomCode}:${seat}`;
    if (graceTimers[k]) { clearTimeout(graceTimers[k]); delete graceTimers[k]; }
}
function roomMsg(roomCode, payload) {
    const room = rooms[roomCode];
    if (room) { room.chat = room.chat || []; room.chat.push(payload); if (room.chat.length > 100) room.chat.shift(); }
    io.to(roomCode).emit('roomChat', payload);
}

function startGrace(roomCode, seat) {
    const room = rooms[roomCode];
    if (!room) return;
    const pl = room.players[seat];
    if (!pl || pl.exhausted) return;
    pl.connected = false;
    pl.inIndexHtml = false;
    pl.graceUntil = Date.now() + (room.graceMs || 60000);
    clearGraceTimer(roomCode, seat);
    graceTimers[`${roomCode}:${seat}`] = setTimeout(() => onGraceExpired(roomCode, seat), room.graceMs || 60000);
    io.to(roomCode).emit('playerDisconnected', { seat, name: pl.name, graceUntil: pl.graceUntil, graceMs: (room.graceMs || 60000) });
    io.to(roomCode).emit('roomUpdate', room);
    evaluateResolution(roomCode);
}
function onGraceExpired(roomCode, seat) {
    clearGraceTimer(roomCode, seat);
    const room = rooms[roomCode];
    if (!room) return;
    const pl = room.players[seat];
    if (!pl || pl.connected) return; // volvió a tiempo
    pl.exhausted = true;
    pl.graceUntil = null;
    recordGraceLoss(roomCode, seat, pl.name);
    io.to(roomCode).emit('seatExhausted', { seat, name: pl.name });
    io.to(roomCode).emit('roomUpdate', room);
    evaluateResolution(roomCode);
}
function evaluateResolution(roomCode) {
    const room = rooms[roomCode];
    if (!room || room.status !== 'playing') return;
    const p1 = room.players.p1, p2 = room.players.p2;
    if (!p1 || !p2) return;
    if (p1.exhausted && p2.exhausted) { finishGame(roomCode, null, 'tablas'); return; }
    if (p1.exhausted && p2.connected) { finishGame(roomCode, 'p2', 'rival-no-volvio'); return; }
    if (p2.exhausted && p1.connected) { finishGame(roomCode, 'p1', 'rival-no-volvio'); return; }
    // Un agotado + el otro aún en gracia (desconectado): EN SUSPENSO hasta que alguien (re)conecte o expire.
}
function finishGame(roomCode, winnerSeat, reason) {
    const room = rooms[roomCode];
    if (!room || room.status === 'finished') return;
    clearGraceTimer(roomCode, 'p1');
    clearGraceTimer(roomCode, 'p2');
    // (rework) la sala no se queda en 'finished': vuelve a espera
    // REWORK: sin estado de revancha. La sala vuelve a ESPERA con los asientos conservados;
    // si el socket de un asiento ya no está conectado (abandonó), su asiento queda libre.
    room.status = 'waiting';
    room.rematch = undefined;
    ['p1', 'p2'].forEach(st => {
        const pl = room.players[st];
        if (!pl) return;
        if (pl.connected === false) { // el server ya mantiene este flag entre páginas
            room.players[st] = null;
            roomMsg(roomCode, { username: 'Sistema', msg: `🪑 El asiento de ${pl.name} queda libre.` });
        } else { pl.ready = false; pl.deck = null; }
    });
    if (winnerSeat) {
        const w = room.players[winnerSeat];
        room.winner = { role: winnerSeat, name: w ? w.name : '' };
        io.to(roomCode).emit('gameFinished', {
            winnerRole: winnerSeat,
            winnerName: w ? w.name : '',
            p1Name: room.players.p1 ? room.players.p1.name : null,
            p2Name: room.players.p2 ? room.players.p2.name : null,
            reason: reason || null
        });
    } else {
        room.winner = { role: null, name: null, draw: true };
        io.to(roomCode).emit('gameDraw', {
            p1Name: room.players.p1 ? room.players.p1.name : null,
            p2Name: room.players.p2 ? room.players.p2.name : null,
            reason: reason || null
        });
    }
    // Los asientos ya desconectados/agotados al terminar no deben mantener la sala viva para siempre:
    // se programan para liberarse si nadie vuelve. Un asiento conectado (viendo el resultado) no se toca.
    for (const s of ['p1', 'p2']) {
        const pl = room.players[s];
        if (pl && !pl.connected) scheduleSeatRelease(roomCode, s, 45000);
    }
    io.to(roomCode).emit('roomUpdate', room);
    broadcastRoomList();
}

// ===== PASO A2: ciclo de vida de asientos (liberar, traspaso de liderazgo, cierre con ambos vacíos) =====
const seatReleaseTimers = {}; // clave: `${roomCode}:${seat}` -> Timeout (margen para la transición cartel->sala)
function clearSeatRelease(roomCode, seat) {
    const k = `${roomCode}:${seat}`;
    if (seatReleaseTimers[k]) { clearTimeout(seatReleaseTimers[k]); delete seatReleaseTimers[k]; }
}
function scheduleSeatRelease(roomCode, seat, ms) {
    clearSeatRelease(roomCode, seat);
    seatReleaseTimers[`${roomCode}:${seat}`] = setTimeout(() => {
        const room = rooms[roomCode];
        if (room && room.players[seat] && !room.players[seat].connected) freeSeat(roomCode, seat);
    }, ms);
}
function freeSeat(roomCode, seat) {
    const room = rooms[roomCode];
    if (!room) return;
    const leaving = room.players[seat];
    clearGraceTimer(roomCode, seat);
    clearSeatRelease(roomCode, seat);
    // Traspaso de liderazgo si se va el líder y queda el otro jugador.
    if (leaving && room.leader === seat) {
        const other = seat === 'p1' ? 'p2' : 'p1';
        if (room.players[other]) {
            room.leader = other;
            roomMsg(roomCode, { username: 'Sistema', msg: `👑 ${room.players[other].name} es ahora el anfitrión.` });
        }
    }
    room.players[seat] = null;
    // Si el OTRO asiento es de un jugador AGOTADO y ausente (perdió por gracia y se fue), es un asiento "muerto":
    // no tiene sentido mantener la sala viva solo por él, así que también lo liberamos y la sala se cerrará.
    const deadOther = seat === 'p1' ? 'p2' : 'p1';
    if (room.players[deadOther] && room.players[deadOther].exhausted && !room.players[deadOther].connected) {
        clearGraceTimer(roomCode, deadOther);
        clearSeatRelease(roomCode, deadOther);
        room.players[deadOther] = null;
    }
    if (!room.players.p1 && !room.players.p2) {
        // Ambos asientos vacíos -> la sala se cierra.
        clearCloseTimer(roomCode);
        const wasFinished = room.status === 'finished';
        const closeMsg = wasFinished ? 'La sala se cerró: la partida terminó y ya no queda nadie en los asientos.'
                                     : 'La sala se cerró: los jugadores abandonaron los asientos.';
        const specIds = (room.spectators || []).map(s => s.id);
        io.to(roomCode).emit('finishedRoomClosed', { msg: closeMsg });
        specIds.forEach(id => io.to(id).emit('finishedRoomClosed', { msg: closeMsg })); // por si algún espectador no seguía en la sala socket
        delete rooms[roomCode];
    } else {
        if (room.status === 'waiting') {
            if (room.players.p1) room.players.p1.ready = false;
            if (room.players.p2) room.players.p2.ready = false;
        }
        io.to(roomCode).emit('roomUpdate', room);
    }
    broadcastRoomList();
}

// ===== PASO C: REVANCHA — reaprovechar una sala terminada para una partida nueva (sin recrearla) =====

function broadcastRoomList() {
    const availableRooms = Object.keys(rooms).map(code => ({
        code: code,
        host: rooms[code].host,
        status: rooms[code].status, 
        playersCount: (rooms[code].players.p1 ? 1 : 0) + (rooms[code].players.p2 ? 1 : 0),
        spectatorsCount: rooms[code].spectators.length
    }));
    io.emit('roomListUpdate', availableRooms);
}

io.on('connection', (socket) => {
    socket.on('checkRoomActive', (payload) => {
        const roomCode = (typeof payload === 'string') ? payload : (payload && payload.roomCode);
        const role = (payload && typeof payload === 'object') ? payload.role : null;
        if (!rooms[roomCode]) {
            const rec = finishedLosers[roomCode];
            const specific = (rec && role && rec.seats[role]) ? rec.seats[role] : null;
            socket.emit('roomError', specific || 'La sala ha caducado o ha sido destruida.');
        } else {
            socket.join(roomCode); // Se suscribe a la sala para escuchar si explota mientras espera
        }
    });

    console.log('🟢 Usuario conectado:', socket.id);
    broadcastRoomList();

    socket.on('globalChat', (data) => io.emit('globalChat', data));

    socket.on('adminCloseRoom', (roomCode) => {
        if (rooms[roomCode]) {
            io.to(roomCode).emit('roomError', 'Un administrador ha cerrado esta sala de forma forzosa.');
            delete rooms[roomCode];
            broadcastRoomList();
        }
    });

    socket.on('createRoom', (data) => {
        const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
        rooms[roomCode] = {
            host: data.username || 'Invitado',
            leader: 'p1',
            graceMs: 60000,
            testConfig: { fastStart: false, startingPlayer: 'random', forcedHands: { p1: [], p2: [] } },
            allowSpectators: data.allowSpectators !== undefined ? data.allowSpectators : true, 
            omniscient: data.omniscient !== undefined ? data.omniscient : true, 
            players: { p1: { id: socket.id, name: data.username || 'Jugador 1', ready: false, deck: null, connected: true, setupComplete: false, inIndexHtml: false, exhausted: false, graceUntil: null }, p2: null },
            spectators: [],
            status: 'waiting',
            seqByRole: { p1: 0, p2: 0 }
        };
        socket.join(roomCode);
        socket.emit('roomJoined', { roomCode, role: 'p1', roomData: rooms[roomCode] });
        broadcastRoomList();
    });

    socket.on('joinRoom', (data) => {
        const roomCode = data.code.toUpperCase();
        const room = rooms[roomCode];
        if (!room) return socket.emit('roomError', 'La sala no existe.');
        const username = data.username || 'Invitado';

        // Re-enganche: si ya tenías asiento en esta sala (p. ej. volviendo del cartel de fin), lo recuperas
        for (const st of ['p1', 'p2']) {
            const pl = room.players[st];
            if (pl && pl.name === username) {
                pl.id = socket.id; pl.connected = true; pl.inIndexHtml = false;
                socket.join(roomCode);
                socket.emit('roomJoined', { roomCode: roomCode, role: st, roomData: room });
                socket.emit('roomChatHistory', room.chat || []);
                io.to(roomCode).emit('roomUpdate', room);
                broadcastRoomList();
                return;
            }
        }

        if (data.asSpectator || (room.players.p1 && room.players.p2)) {
            if (!room.allowSpectators) return socket.emit('roomError', 'Esta partida no admite espectadores.');
            
            // En salas terminadas, el espectador se redirige a index.html y se da de alta en rejoinGame;
            // NO lo añadimos aquí para evitar el alta-baja-alta (pestañeo).
            if (room.status !== 'finished') {
                room.spectators.push({ id: socket.id, name: username, inIndexHtml: false });
            }
            socket.join(roomCode);
            socket.emit('roomJoined', { roomCode, role: 'spectator', roomData: room });
            io.to(roomCode).emit('roomUpdate', room);
            roomMsg(roomCode, { username: 'Sistema', msg: `👁️ ${username} se unió como espectador.` });
        socket.emit('roomChatHistory', (room.chat || []));
            broadcastRoomList();
            return;
        }

        // Asiento LIBRE, no siempre p2: si el anfitrión ocupa p2, el que entra va a p1 (antes se sobrescribía p2)
        const seatLibre = !room.players.p1 ? 'p1' : 'p2';
        room.players[seatLibre] = { id: socket.id, name: username, ready: false, deck: null, connected: true, setupComplete: false, inIndexHtml: false, exhausted: false, graceUntil: null };
        room.status = 'waiting';
        socket.join(roomCode);
        socket.emit('roomJoined', { roomCode, role: seatLibre, roomData: room });
        io.to(roomCode).emit('roomUpdate', room);
        roomMsg(roomCode, { username: 'Sistema', msg: `⚔️ ${username} se unió al duelo como Jugador ${seatLibre === 'p1' ? 1 : 2}.` });
        socket.emit('roomChatHistory', (room.chat || []));
        broadcastRoomList();
    });

    socket.on('roomChat', (data) => roomMsg(data.roomCode, { username: data.username, msg: data.msg }));
    socket.on('getRoomChat', (data) => { const r = rooms[data.roomCode]; socket.emit('roomChatHistory', (r && r.chat) || []); });

    // El líder (anfitrión) ajusta la config de pruebas; se guarda en la sala y se reparte a todos.
    socket.on('setTestConfig', (data) => {
        const room = rooms[data.roomCode];
        if (!room) return;
        // El panel editable solo lo muestran los admins (flag de cliente), así que aceptamos
        // setTestConfig de cualquier participante de la sala (permite varios admins editando en vivo).
        const inRoom = (room.players.p1 && room.players.p1.id === socket.id) ||
                       (room.players.p2 && room.players.p2.id === socket.id) ||
                       room.spectators.some(s => s.id === socket.id);
        if (!inRoom) return;
        const c = data.config || {};
        const sane = {
            fastStart: !!c.fastStart,
            startingPlayer: (c.startingPlayer === 'p1' || c.startingPlayer === 'p2') ? c.startingPlayer : 'random',
            forcedHands: {
                p1: Array.isArray(c.forcedHands && c.forcedHands.p1) ? c.forcedHands.p1.slice(0, 6).map(Number).filter(n => !isNaN(n)) : [],
                p2: Array.isArray(c.forcedHands && c.forcedHands.p2) ? c.forcedHands.p2.slice(0, 6).map(Number).filter(n => !isNaN(n)) : []
            }
        };
        room.testConfig = sane;
        io.to(data.roomCode).emit('roomUpdate', room);
    });

    // --- PASO C: pedir revancha (ambos jugadores deben aceptar) ---

    // Preferencia del LÍDER de la sala (no del admin): tiempo de gracia de reconexión.
    socket.on('setRoomGrace', (data) => {
        const room = rooms[data.roomCode];
        if (!room) return;
        const senderSeat = (room.players.p1 && room.players.p1.id === socket.id) ? 'p1' :
                           (room.players.p2 && room.players.p2.id === socket.id) ? 'p2' : null;
        if (!senderSeat || senderSeat !== room.leader) return; // solo el líder de la sala
        let s = parseInt(data.seconds); if (isNaN(s)) s = 60; s = Math.max(10, Math.min(600, s));
        room.graceMs = s * 1000;
        io.to(data.roomCode).emit('roomUpdate', room);
    });

    socket.on('playerReady', (data) => {
        const room = rooms[data.roomCode];
        if (!room) return;

        let player = (room.players.p1 && room.players.p1.id === socket.id) ? room.players.p1 : 
                     ((room.players.p2 && room.players.p2.id === socket.id) ? room.players.p2 : null);

        if (player) {
            player.deck = data.deck; 
            player.ready = data.isReady; 
            io.to(data.roomCode).emit('roomUpdate', room);

            if (room.players.p1 && room.players.p1.ready && room.players.p2 && room.players.p2.ready) {
                room.status = 'playing'; 
                
                // Creamos una memoria temporal para que el servidor coordine la preparación
                room.setup = { aside: { p1: null, p2: null }, orders: { p1: null, p2: null } };
                
                // Enviamos los mazos Y LOS NOMBRES a ambos jugadores
                io.to(data.roomCode).emit('gameStart', { 
                    p1Deck: room.players.p1.deck, 
                    p2Deck: room.players.p2.deck,
                    p1Name: room.players.p1.name,
                    p2Name: room.players.p2.name,
                    omniscient: room.omniscient,
                    testConfig: room.testConfig
                });
                broadcastRoomList();
            }
        }
    });

    // --- FUNCIONES DE SINCRONIZACIÓN DE PREPARACIÓN ---
    socket.on('setAsideCards', (data) => {
        const room = rooms[data.roomCode];
        if (!room || !room.setup) return;
        room.setup.aside[data.role] = data.instanceIds;
        // Si ambos han enviado sus cartas apartadas, avisamos a la sala
        if (room.setup.aside.p1 && room.setup.aside.p2) {
            io.to(data.roomCode).emit('bothCardsAside', room.setup.aside);
        }
    });

    // Reinicio de partida "desde el principio" (debugger). La preparación online es a
    // DOS BANDAS: bothCardsAside/bothDecksShuffled solo se emiten cuando han llegado los
    // datos de AMBOS jugadores. Si solo relanzase su setup el cliente que pulsa el botón,
    // se quedaría esperando para siempre (y además `setup.aside` conserva las apartadas de
    // la ronda anterior, así que el primer setAsideCards dispararía un bothCardsAside
    // prematuro mezclando datos viejos y nuevos -> mazos divergentes). Por eso el reinicio
    // pasa por aquí: se limpia el registro de preparación y se ordena a los DOS clientes
    // (y espectadores) rearrancar el setup desde el mismo estado.
    socket.on('restartSetup', (data) => {
        const room = rooms[data.roomCode];
        if (!room || !room.setup) return;
        room.setup.aside = { p1: null, p2: null };
        room.setup.orders = { p1: null, p2: null };
        io.to(data.roomCode).emit('restartSetup', { estado: data.estado, ignorarInicioRapido: !!data.ignorarInicioRapido });
    });

    socket.on('deckShuffled', (data) => {
        const room = rooms[data.roomCode];
        if (!room || !room.setup) return;
        room.setup.orders[data.role] = data.order || []; 
        // Si ambos han barajado, transmitimos el nuevo orden exacto de las cartas
        if (room.setup.orders.p1 && room.setup.orders.p2) {
            io.to(data.roomCode).emit('bothDecksShuffled', room.setup.orders);
            // Reseteamos por si hay que barajar otra vez (Mulligans)
            room.setup.orders = { p1: null, p2: null }; 
        }
    });

    socket.on('syncCoinFlip', (data) => {
        // El J1 lanza la moneda, el servidor avisa al J2 del resultado
        socket.to(data.roomCode).emit('coinFlipResult', data.result);
    });

    socket.on('setupComplete', (data) => {
        const room = rooms[data.roomCode];
        if (room && room.players[data.role]) {
            room.players[data.role].setupComplete = true;
        }
    });

    // --- FIN DE PARTIDA: el cliente avisa de que hay ganador ---
    socket.on('gameFinished', (data) => {
        const room = rooms[data.roomCode];
        if (!room) return;
        if (room.status !== 'finished') {
            // (rework) la sala no se queda en 'finished': vuelve a espera
            // REWORK: sin estado de revancha. La sala vuelve a ESPERA con los asientos conservados;
            // si el socket de un asiento ya no está conectado (abandonó), su asiento queda libre.
            room.status = 'waiting';
            room.rematch = undefined;
            ['p1', 'p2'].forEach(st => {
                const pl = room.players[st];
                if (!pl) return;
                if (pl.connected === false) { // el server ya mantiene este flag entre páginas
                    room.players[st] = null;
                    roomMsg(data.roomCode, { username: 'Sistema', msg: `🪑 El asiento de ${pl.name} queda libre.` });
                } else { pl.ready = false; pl.deck = null; }
            });
            room.winner = { role: data.winnerRole, name: data.winnerName };
            broadcastRoomList();
        }
        // Reenviamos a TODA la sala (jugadores y espectadores) para que muestren el cartel.
        io.to(data.roomCode).emit('gameFinished', {
            winnerRole: room.winner.role,
            winnerName: room.winner.name,
            p1Name: room.players.p1 ? room.players.p1.name : null,
            p2Name: room.players.p2 ? room.players.p2.name : null
        });
        io.to(data.roomCode).emit('roomUpdate', room);
    });

    // --- VOLVER A LA SALA: un jugador vuelve a su sala terminada desde el cartel (queda "en la sala", 🟡) ---
    socket.on('returnToFinishedRoom', (data) => {
        const room = rooms[data.roomCode];
        // (rework) la sala vuelve a 'waiting' al terminar: volver a ella es válido tanto en waiting como en finished
        if (!room || room.status === 'playing') { socket.emit('finishedRoomClosed', { msg: 'Esa sala ya no existe.' }); return; }
        clearCloseTimer(data.roomCode);
        socket.join(data.roomCode);
        let role = null;
        if (room.players.p1 && room.players.p1.name === data.username) role = 'p1';
        else if (room.players.p2 && room.players.p2.name === data.username) role = 'p2';
        if (role) {
            clearSeatRelease(data.roomCode, role);
            room.players[role].id = socket.id;
            room.players[role].connected = true;
            room.players[role].inIndexHtml = false; // está en la sala (lobby), no en el cartel
        } else {
            const sp = room.spectators.find(s => s.name === data.username);
            if (sp) sp.id = socket.id; else room.spectators.push({ id: socket.id, name: data.username });
            role = 'spectator';
        }
        socket.emit('returnedToFinishedRoom', { role: role, roomCode: data.roomCode, roomData: room });
        io.to(data.roomCode).emit('roomUpdate', room);
        broadcastRoomList();
    });

    // --- ABANDONAR LA SALA: salida explícita desde el cartel (la partida ya acabó: no hace ganar a nadie) ---
    socket.on('leaveFinishedRoom', (data) => {
        const room = rooms[data.roomCode];
        if (!room) return;
        socket.leave(data.roomCode);
        let seat = null;
        if (room.players.p1 && (room.players.p1.id === socket.id || room.players.p1.name === data.username)) seat = 'p1';
        else if (room.players.p2 && (room.players.p2.id === socket.id || room.players.p2.name === data.username)) seat = 'p2';
        if (seat) {
            roomMsg(data.roomCode, { username: 'Sistema', msg: `🚪 ${room.players[seat].name} ha dejado su asiento.` });
            freeSeat(data.roomCode, seat); // libera el asiento; la sala se cierra solo si ambos quedan vacíos
        } else {
            const sIdx = room.spectators.findIndex(s => s.id === socket.id || s.name === data.username);
            if (sIdx !== -1) room.spectators.splice(sIdx, 1);
            io.to(data.roomCode).emit('roomUpdate', room);
            broadcastRoomList();
        }
    });

    // --- PASO B: ocupar un asiento libre (un espectador se sienta sin reentrar a la sala) ---
    socket.on('occupySeat', (data) => {
        const room = rooms[data.roomCode];
        if (!room) return;
        if (room.status === 'playing') { socket.emit('roomError', 'No puedes ocupar un asiento durante la partida.'); return; }
        const seat = (data.seat === 'p1' || data.seat === 'p2') ? data.seat : null;
        if (!seat || room.players[seat]) { socket.emit('roomError', 'Ese asiento ya no está libre.'); return; }
        clearSeatRelease(data.roomCode, seat);
        // Caso A: el que pide YA está sentado -> CAMBIO de asiento (libera el anterior, el liderazgo le sigue).
        let fromSeat = null;
        if (room.players.p1 && room.players.p1.id === socket.id) fromSeat = 'p1';
        else if (room.players.p2 && room.players.p2.id === socket.id) fromSeat = 'p2';
        if (fromSeat) {
            const player = room.players[fromSeat];
            player.ready = false;
            room.players[seat] = player;
            room.players[fromSeat] = null;
            clearSeatRelease(data.roomCode, fromSeat);
            if (room.leader === fromSeat) room.leader = seat;
            socket.emit('seatOccupied', { role: seat, roomCode: data.roomCode, roomData: room });
            roomMsg(data.roomCode, { username: 'Sistema', msg: `🔁 ${player.name} se cambió al asiento de ${seat === 'p1' ? 'Jugador 1' : 'Jugador 2'}.` });
            io.to(data.roomCode).emit('roomUpdate', room);
            broadcastRoomList();
            return;
        }
        // Caso B: espectador -> asiento
        const spIdx = room.spectators.findIndex(s => s.id === socket.id || s.name === data.username);
        const name = data.username || (spIdx !== -1 ? room.spectators[spIdx].name : 'Jugador');
        if (spIdx !== -1) room.spectators.splice(spIdx, 1);
        room.players[seat] = { id: socket.id, name: name, ready: false, deck: null, connected: true, setupComplete: false, inIndexHtml: false, exhausted: false, graceUntil: null };
        if (!room.players[room.leader]) room.leader = seat; // por si el asiento del líder había quedado vacío
        socket.emit('seatOccupied', { role: seat, roomCode: data.roomCode, roomData: room });
        roomMsg(data.roomCode, { username: 'Sistema', msg: `🪑 ${name} ocupó el asiento de ${seat === 'p1' ? 'Jugador 1' : 'Jugador 2'}.` });
        io.to(data.roomCode).emit('roomUpdate', room);
        broadcastRoomList();
    });

    // --- Pasar de jugador a espectador (libera el asiento) ---
    socket.on('becomeSpectator', (data) => {
        const room = rooms[data.roomCode];
        if (!room) return;
        if (room.status === 'playing') { socket.emit('roomError', 'No puedes irte a espectadores durante la partida.'); return; }
        let seat = null;
        if (room.players.p1 && room.players.p1.id === socket.id) seat = 'p1';
        else if (room.players.p2 && room.players.p2.id === socket.id) seat = 'p2';
        if (!seat) return;
        const name = room.players[seat].name;
        if (!room.spectators.some(s => s.id === socket.id)) room.spectators.push({ id: socket.id, name: name, inIndexHtml: false });
        socket.emit('becameSpectator', { roomCode: data.roomCode });
        roomMsg(data.roomCode, { username: 'Sistema', msg: `👁️ ${name} se pasó a espectador.` });
        freeSeat(data.roomCode, seat); // libera el asiento (traspasa liderazgo / cierra si ambos quedan vacíos)
    });

    // --- EL MENSAJERO DE ACCIONES DE PARTIDA ---
    socket.on('gameAction', (data) => {
        const room = rooms[data.roomCode];
        if (!room) return;

        // Guardamos el último estado conocido: tanto en HARD_SYNC (reconexión) como en SAVE_SNAPSHOT (fin de turno)
        if ((data.action === 'HARD_SYNC' || data.action === 'SAVE_SNAPSHOT') && data.state) {
            room.lastKnownState = data.state;
        }
        // SAVE_SNAPSHOT es solo para el servidor, no lo retransmitimos a nadie
        if (data.action === 'SAVE_SNAPSHOT') return;

        // Validamos que las acciones de juego vengan del jugador cuyo turno es
        if (PLAYER_ACTIONS.has(data.action) && room.lastKnownState) {
            const activePlayerId = room.lastKnownState.activePlayerId;
            const activeSocketId = activePlayerId === 'p1' ? room.players.p1?.id : room.players.p2?.id;
            if (activeSocketId && socket.id !== activeSocketId) {
                console.warn(`[SEGURIDAD] Acción '${data.action}' rechazada: socket ${socket.id} no es el jugador activo.`);
                return;
            }
        }

        // --- RELAY-OF-RECORD: etiquetamos las acciones ordenadas con emisor + nº de orden ---
        if (ORDERED_ACTIONS.has(data.action)) {
            const senderRole = (room.players.p1 && room.players.p1.id === socket.id) ? 'p1'
                             : ((room.players.p2 && room.players.p2.id === socket.id) ? 'p2' : null);
            if (senderRole) {
                if (!room.seqByRole) room.seqByRole = { p1: 0, p2: 0 };
                data._from = senderRole;
                data._seq = ++room.seqByRole[senderRole];
            }
        }
        // En un HARD_SYNC adjuntamos el contador actual para que quien lo reciba
        // ponga al día sus marcadores de orden tras importar el estado.
        if (data.action === 'HARD_SYNC') {
            data._seqSnapshot = room.seqByRole || { p1: 0, p2: 0 };
        }

        // Si la acción tiene un destinatario específico (ej. foto directa a un espectador)
        if (data.targetId) {
            io.to(data.targetId).emit('gameAction', data);
        } else if (ORDERED_ACTIONS.has(data.action)) {
            // 0b: las acciones ordenadas van a TODOS, incluido el emisor (vía única de comando)
            io.to(data.roomCode).emit('gameAction', data);
        } else {
            socket.to(data.roomCode).emit('gameAction', data);
        }
    });

    // --- PUENTE DE RECONEXIÓN PARA INDEX.HTML ---
    socket.on('rejoinGame', (data) => {
        const room = rooms[data.roomCode];
        if (room) {
            socket.join(data.roomCode);

            // Sala en ESPERA (p.ej. tras una revancha): no hay tablero. De vuelta al lobby, sin servir un tablero fantasma.
            if (room.status === 'waiting') { socket.emit('backToLobby', { roomCode: data.roomCode, msg: 'La partida ya no está en curso. Vuelves al lobby.' }); return; }

            // Si la sala ya terminó, no hay tablero al que volver: servimos el cartel de fin.
            if (room.status === 'finished') {
                clearCloseTimer(data.roomCode);
                if (data.role === 'p1' && room.players.p1) { room.players.p1.id = socket.id; room.players.p1.connected = true; room.players.p1.inIndexHtml = true; }
                if (data.role === 'p2' && room.players.p2) { room.players.p2.id = socket.id; room.players.p2.connected = true; room.players.p2.inIndexHtml = true; }
                if (data.role === 'spectator') {
                    const sp = room.spectators.find(s => s.name === data.username);
                    if (sp) { sp.id = socket.id; sp.inIndexHtml = true; } else room.spectators.push({ id: socket.id, name: data.username, inIndexHtml: true });
                }
                socket.emit('gameFinished', {
                    winnerRole: room.winner ? room.winner.role : null,
                    winnerName: room.winner ? room.winner.name : null,
                    draw: room.winner ? !!room.winner.draw : false,
                    p1Name: room.players.p1 ? room.players.p1.name : null,
                    p2Name: room.players.p2 ? room.players.p2.name : null
                });
                io.to(data.roomCode).emit('roomUpdate', room);
                broadcastRoomList();
                return;
            }
            
            // Leemos el flag que nos manda el cliente
            let isReconnectingToActiveGame = data.isGameActive || false;

            // Si el asiento ya está AGOTADO (su gracia llegó a 0), es irreversible: no se reincorpora.
            if ((data.role === 'p1' || data.role === 'p2') && room.players[data.role] && room.players[data.role].exhausted) {
                room.players[data.role].id = socket.id; // lo mantenemos en la sala para que reciba el desenlace
                socket.emit('seatLost', { seat: data.role });
                io.to(data.roomCode).emit('roomUpdate', room);
                evaluateResolution(data.roomCode);
                return;
            }

            if (data.role === 'p1' && room.players.p1) {
                const wasInGrace = !!room.players.p1.graceUntil; // solo es "reconexión" si venía de una desconexión real
                clearGraceTimer(data.roomCode, 'p1');
                room.players.p1.id = socket.id;
                room.players.p1.connected = true;
                room.players.p1.inIndexHtml = true;
                room.players.p1.graceUntil = null;
                if (wasInGrace) io.to(data.roomCode).emit('playerReconnected', { seat: 'p1', name: room.players.p1.name });
            }
            if (data.role === 'p2' && room.players.p2) {
                const wasInGrace = !!room.players.p2.graceUntil;
                clearGraceTimer(data.roomCode, 'p2');
                room.players.p2.id = socket.id;
                room.players.p2.connected = true;
                room.players.p2.inIndexHtml = true;
                room.players.p2.graceUntil = null;
                if (wasInGrace) io.to(data.roomCode).emit('playerReconnected', { seat: 'p2', name: room.players.p2.name });
            }
            if (data.role === 'spectator') {
                const spec = room.spectators.find(s => s.name === data.username);
                if (spec) { spec.id = socket.id; spec.inIndexHtml = true; }
                else room.spectators.push({ id: socket.id, name: data.username, inIndexHtml: true });
                // Distinguimos la primera entrada al tablero de una reconexión real.
                if (!room.spectatorsSeen) room.spectatorsSeen = [];
                if (room.spectatorsSeen.includes(data.username)) {
                    roomMsg(data.roomCode, { username: 'Sistema', msg: `👁️ ${data.username} volvió a espectar.` });
                } else {
                    room.spectatorsSeen.push(data.username);
                }
            }
            io.to(data.roomCode).emit('roomUpdate', room);

            // Si el rival estaba AGOTADO, al volver este jugador (conectado) la partida se resuelve a su favor.
            evaluateResolution(data.roomCode);
            if (!rooms[data.roomCode] || rooms[data.roomCode].status === 'finished') return;

            // Le decimos que ya está dentro, y si es reconexión
            socket.emit('gameReady', { roomCode: data.roomCode, isReconnecting: isReconnectingToActiveGame, omniscient: room.omniscient });

            if (isReconnectingToActiveGame) {
                console.log(`[RECONEXIÓN] ${data.username} volvió a ${data.roomCode}. Pidiendo sync al rival...`);
                
                // Pedimos el estado al rival, excluyendo al propio reconectante para evitar que se pida sync a sí mismo
                const reconnectingSocketId = socket.id;
                const syncTarget = (room.players.p1 && room.players.p1.connected && room.players.p1.id !== reconnectingSocketId) ? room.players.p1.id :
                                  ((room.players.p2 && room.players.p2.connected && room.players.p2.id !== reconnectingSocketId) ? room.players.p2.id : null);
                
                if (syncTarget) {
                    io.to(syncTarget).emit('gameAction', { roomCode: data.roomCode, action: 'REQUEST_SYNC', targetId: reconnectingSocketId });
                } else if (room.lastKnownState) {
                    // No hay rival conectado, pero tenemos el último estado guardado en el servidor
                    console.log(`[RECONEXIÓN] Sin rival disponible. Sirviendo último estado conocido a ${data.username}.`);
                    socket.emit('gameAction', { roomCode: data.roomCode, action: 'HARD_SYNC', state: room.lastKnownState, _seqSnapshot: room.seqByRole || { p1: 0, p2: 0 } });
                }
                
                // (La reconexión ya se notificó arriba con 'playerReconnected'.)
            }
        } else {
            const rec = finishedLosers[data.roomCode];
            const specific = (rec && data.role && rec.seats[data.role]) ? rec.seats[data.role] : null;
            socket.emit('backToLobby', { roomCode: data.roomCode, msg: specific || 'La sala ha caducado o ha sido destruida.' });
        }
    });

    // --- ABANDONO VOLUNTARIO (EL BOTÓN DEL GUARDIÁN) ---
    socket.on('abandonGame', (data) => {
        const room = rooms[data.roomCode];
        if (room) {
            // 1. Comprobamos si el que abandona es solo un espectador por su rol
            if (data.role === 'spectator') {
                const specIndex = room.spectators.findIndex(s => s.name === data.username);
                if (specIndex !== -1) room.spectators.splice(specIndex, 1);
                
                io.to(data.roomCode).emit('roomUpdate', room);
                // Manda un aviso discreto al historial sin romper nada
                roomMsg(data.roomCode, { username: 'Sistema', msg: `👋 ${data.username || 'Un espectador'} dejó de espectar.` });
                broadcastRoomList();
                return; // IMPORTANTE: Cortamos la función aquí para NO borrar la sala
            }
            
            // 2. Es un jugador. Resolvemos según el estado del rival.
            const me = (room.players.p1 && (room.players.p1.id === socket.id || room.players.p1.name === data.username)) ? 'p1' :
                       (room.players.p2 && (room.players.p2.id === socket.id || room.players.p2.name === data.username)) ? 'p2' : null;
            if (!me) { broadcastRoomList(); return; }
            const other = me === 'p1' ? 'p2' : 'p1';
            const op = room.players[other];
            if (room.status === 'playing') {
                if (op && op.connected) {
                    // El rival está presente -> RENDICIÓN: gana el rival.
                    finishGame(data.roomCode, other, 'rendicion');
                    if (rooms[data.roomCode]) { roomMsg(data.roomCode, { username: 'Sistema', msg: `🚪 ${data.username} se ha rendido y deja su asiento.` }); freeSeat(data.roomCode, me); }
                } else {
                    // El rival está ausente (en gracia/agotado) -> nadie gana: TABLAS.
                    finishGame(data.roomCode, null, 'abandono-en-espera');
                    if (rooms[data.roomCode]) freeSeat(data.roomCode, me);
                }
            } else {
                // Fuera de partida: abandonar libera el asiento (la sala se cierra solo si ambos quedan vacíos).
                roomMsg(data.roomCode, { username: 'Sistema', msg: `🚪 ${room.players[me].name} ha dejado su asiento.` });
                freeSeat(data.roomCode, me);
            }
        }
    });

    // DESCONEXIONES
    socket.on('disconnect', () => {
        for (const roomCode in rooms) {
            const room = rooms[roomCode];

            // --- SALA TERMINADA O EN ESPERA: presencia con gracia de 45s (cubre la transición cartel -> "Volver a la sala") ---
            if (room.status === 'finished' || room.status === 'waiting') {
                let touched = false;
                const sIdx = room.spectators.findIndex(s => s.id === socket.id);
                if (sIdx !== -1) { room.spectators.splice(sIdx, 1); touched = true; }
                if (room.players.p1 && room.players.p1.id === socket.id) { room.players.p1.connected = false; room.players.p1.inIndexHtml = false; scheduleSeatRelease(roomCode, 'p1', 45000); touched = true; }
                if (room.players.p2 && room.players.p2.id === socket.id) { room.players.p2.connected = false; room.players.p2.inIndexHtml = false; scheduleSeatRelease(roomCode, 'p2', 45000); touched = true; }
                if (touched) {
                    // El asiento se libera tras 45s (margen para la transición cartel -> "Volver a la sala");
                    // la sala se cierra sola cuando ambos asientos queden vacíos (freeSeat).
                    io.to(roomCode).emit('roomUpdate', room);
                    broadcastRoomList();
                    break;
                }
                continue;
            }

            // 1. Si era Espectador
            const specIndex = room.spectators.findIndex(s => s.id === socket.id);
            if (specIndex !== -1) {
                const spec = room.spectators[specIndex];
                const wasWatching = spec.inIndexHtml; // si es false, es la transición lobby->tablero: no avisamos
                room.spectators.splice(specIndex, 1);
                io.to(roomCode).emit('roomUpdate', room);
                if (wasWatching) roomMsg(roomCode, { username: 'Sistema', msg: `👋 ${spec.name} dejó de espectar.` });
                broadcastRoomList();
                continue;
            }

            // 2. Si era el Jugador 2 (Rival)
            if (room.players.p2 && room.players.p2.id === socket.id) {
                if (room.status === 'playing') {
                    // Si ya ha entrado al tablero pero NO ha terminado el setup, cancelamos la partida
                    if (room.players.p2.inIndexHtml && (!room.players.p1.setupComplete || !room.players.p2.setupComplete)) {
                        io.to(roomCode).emit('roomError', 'El rival se ha desconectado durante la preparación inicial. Partida cancelada.');
                        clearGraceTimer(roomCode, 'p1'); clearGraceTimer(roomCode, 'p2');
                        delete rooms[roomCode];
                        broadcastRoomList();
                    } else if (room.players.p2.inIndexHtml) {
                        // Corte en mitad del juego real -> arranca la GRACIA de ese asiento
                        startGrace(roomCode, 'p2');
                    } else {
                        // Transición lobby -> index (no es un corte real)
                        room.players.p2.connected = false;
                    }
                } else {
                    roomMsg(roomCode, { username: 'Sistema', msg: `🚪 ${room.players.p2.name} ha dejado su asiento.` });
                    freeSeat(roomCode, 'p2');
                }
                break;
            } 
            
            // 3. Si era el Jugador 1 (Anfitrión)
            else if (room.players.p1 && room.players.p1.id === socket.id) {
                if (room.status === 'playing') {
                    // Si ya ha entrado al tablero pero NO ha terminado el setup, cancelamos la partida
                    const p2Incomplete = room.players.p2 && !room.players.p2.setupComplete;
                    if (room.players.p1.inIndexHtml && (!room.players.p1.setupComplete || p2Incomplete)) {
                        io.to(roomCode).emit('roomError', 'El anfitrión se ha desconectado durante la preparación inicial. Partida cancelada.');
                        clearGraceTimer(roomCode, 'p1'); clearGraceTimer(roomCode, 'p2');
                        delete rooms[roomCode];
                        broadcastRoomList();
                    } else if (room.players.p1.inIndexHtml) {
                        // Corte en mitad del juego real -> arranca la GRACIA de ese asiento
                        startGrace(roomCode, 'p1');
                    } else {
                        // Transición lobby -> index (no es un corte real)
                        room.players.p1.connected = false;
                    }
                } else {
                    roomMsg(roomCode, { username: 'Sistema', msg: `🚪 ${room.players.p1.name} ha dejado su asiento.` });
                    freeSeat(roomCode, 'p1');
                }
                break;
            }
        }
    });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')));

server.listen(PORT, () => {
    console.log(`=== KARLOS TCG SERVIDOR INICIADO ===`);
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
});