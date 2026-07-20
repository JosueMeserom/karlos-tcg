// archivo: guardian.js
document.addEventListener("DOMContentLoaded", () => {
    const activeRoom = localStorage.getItem('karlos_partida_en_curso');
    const username = localStorage.getItem('karlos_username') || 'Jugador';
    const role = localStorage.getItem('karlos_online_role'); 
    const p1Name = localStorage.getItem('karlos_p1_name') || 'Jugador 1';
    const p2Name = localStorage.getItem('karlos_p2_name') || 'Jugador 2';
    const rivalName = role === 'p1' ? p2Name : (role === 'p2' ? p1Name : `${p1Name} vs ${p2Name}`);

    if (activeRoom) {
        const isSpectator = role === 'spectator';
        
        const titleText = isSpectator ? 'Espectando Partida' : 'Partida en Curso';
        const descText = isSpectator 
            ? `Estás espectando la partida entre <strong>${p1Name}</strong> y <strong>${p2Name}</strong> (Sala: <strong>${activeRoom}</strong>). ¿Qué deseas hacer?`
            : `Tienes una partida activa contra <strong>${rivalName}</strong> (Sala: <strong>${activeRoom}</strong>). ¿Qué deseas hacer?`;
        const abandonText = isSpectator ? 'DEJAR DE ESPECTAR' : 'ABANDONAR (Derrota)';

        const guardianOverlay = document.createElement('div');
        guardianOverlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); z-index:99999; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; font-family:sans-serif;';
        
        guardianOverlay.innerHTML = `
            <h1 id="guardian-title" style="color:#fbbf24; font-size:2.5rem; text-transform:uppercase;">${titleText}</h1>
            <p id="guardian-desc" style="color:white; font-size:1.2rem; max-width:80%; margin-bottom:30px;">${descText}</p>
            <div style="display:flex; gap:15px;">
                <button id="btn-reconnect" style="background:#10b981; color:white; font-weight:bold; padding:15px 30px; font-size:1.2rem; border:none; border-radius:8px; cursor:pointer;">RECONECTAR</button>
                <button id="btn-abandon" style="background:#ef4444; color:white; font-weight:bold; padding:15px 30px; font-size:1.2rem; border:none; border-radius:8px; cursor:pointer;">${abandonText}</button>
            </div>
        `;
        document.body.appendChild(guardianOverlay);

        let socket = null;

        // --- CONEXIÓN EN VIVO (Con seguro anti-crashes) ---
        // Comprueba si la librería existe antes de intentar usarla
        if (typeof io !== 'undefined') {
            socket = io();
            socket.emit('checkRoomActive', { roomCode: activeRoom, username: username, role: role });

            socket.on('roomError', (msg) => {
                document.getElementById('guardian-title').innerText = "PARTIDA FINALIZADA";
                document.getElementById('guardian-title').style.color = "#ef4444";
                document.getElementById('guardian-desc').innerHTML = msg + "<br><br>Ya no puedes reconectar.";
                document.getElementById('btn-reconnect').style.display = 'none';
                document.getElementById('btn-abandon').innerText = 'VOLVER AL MENÚ';
                localStorage.removeItem('karlos_partida_en_curso');
            });
        } else {
            console.warn("Guardián: Socket.io no detectado. El chequeo en vivo está desactivado, pero puedes abandonar manualmente.");
        }

        // --- ASIGNACIÓN DE BOTONES SEGURA ---
        document.getElementById('btn-reconnect').onclick = () => {
            window.location.href = 'index.html'; 
        };

        document.getElementById('btn-abandon').onclick = () => {
            if (document.getElementById('btn-abandon').innerText === 'VOLVER AL MENÚ') {
                guardianOverlay.remove();
                return;
            }

            const confirmMsg = isSpectator 
                ? "¿Seguro que quieres dejar de espectar esta partida?" 
                : "¿Seguro que quieres abandonar? Tu rival ganará automáticamente.";
                
            // Los espectadores no necesitan confirmación (es engorroso); los jugadores sí.
            if (isSpectator || confirm(confirmMsg)) {
                if (socket) {
                    socket.emit('abandonGame', { roomCode: activeRoom, username: username, role: role });
                }
                localStorage.removeItem('karlos_partida_en_curso');
                guardianOverlay.remove();
            }
        };
    }
});