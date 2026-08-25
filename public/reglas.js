// archivo: reglas.js

const TEXTO_REGLAS = `
<style>
    #rules-body, #rules-body * { user-select: text !important; }
    .rule-section { margin-bottom: 30px; }
    .rule-title { color: #38bdf8; border-bottom: 1px solid #38bdf8; padding-bottom: 5px; text-transform: uppercase; font-weight: 900; letter-spacing: 1px;}
    .rule-text { color: #cbd5e1; text-align: justify; margin-bottom: 15px; }
    
    /* Nuevos Colores de Stats */
    .kw-per { color: #fcd34d; font-weight: bold; } 
    .kw-esb { color: #94a3b8; font-weight: bold; } 
    .kw-eve { color: #c084fc; font-weight: bold; } 
    .kw-ayu { color: #f9a8d4; font-weight: bold; } 
    .kw-hp { color: #60a5fa; font-weight: bold; } /* Vida - Azul */
    .kw-atk { color: #ef4444; font-weight: bold; } /* Ataque - Rojo */
    .kw-def { color: #facc15; font-weight: bold; } /* Defensa - Amarillo */
    .kw-fur { color: #4ade80; font-weight: bold; } /* Furor - Verde */
    .kw-van { color: #fff; font-weight: bold; text-decoration: underline; text-decoration-color: #38bdf8;} 
    .kw-ret { color: #fff; font-weight: bold; text-decoration: underline; text-decoration-color: #64748b;} 
    
    .widget-box { background: rgba(0,0,0,0.4); border-radius: 8px; padding: 15px; display: flex; justify-content: center; gap: 15px; margin: 20px 0; border: 1px dashed #475569; flex-wrap: wrap;}
    
    .tutorial-card { pointer-events: none; transform: scale(1.1); margin: 10px; position: relative;}
    
    .list-steps { background: rgba(15, 23, 42, 0.6); padding: 15px 30px; border-left: 4px solid #fbbf24; border-radius: 0 8px 8px 0; }
    .list-steps li { margin-bottom: 8px; color: #e2e8f0; }

    /* Estilo para recrear las Píldoras en el tutorial */
    .tut-badge { position: relative; left: -14px; margin-bottom: 2px; width: auto; min-width: 22px; height: 22px; padding: 0 4px; border-radius: 11px; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.5); }
    .tut-badge span { font-size: 0.8rem; line-height: 1; color: white; font-weight: bold; }
</style>

<div class="rule-section">
    <h3 class="rule-title">1. Construcción del mazo y conceptos básicos</h3>
    <p class="rule-text">Cada jugador ha de llevar un mínimo de 40 cartas en su mazo. Hay cuatro tipos de cartas: <span class="kw-per">Personajes</span>, <span class="kw-esb">Esbirros</span>, <span class="kw-eve">Eventos</span> y <span class="kw-ayu">Ayudas</span>. No puedes llevar dos cartas de Personajes iguales (con el mismo número ID), y tampoco puedes tener más de 8 cartas de Personajes en total, pero sí hasta cuatro copias de cada una de las demás. Mientras sigas esas directrices, puedes confeccionar tu mazo como quieras.</p>
    
    <div class="widget-box">
        <div class="card type-Personaje tutorial-card">
            <div class="card-header"><span>Personaje</span></div><div class="card-image">👤</div><div class="card-body">Límite 1 por ID. Máx 8 en mazo.</div>
        </div>
        <div class="card type-Esbirro tutorial-card">
            <div class="card-header"><span>Esbirro</span></div><div class="card-image">👾</div><div class="card-body">Máx 4 copias.</div>
        </div>
        <div class="card type-Evento tutorial-card">
            <div class="card-header"><span>Evento</span></div><div class="card-image">⚡</div><div class="card-body">Máx 4 copias.</div>
        </div>
        <div class="card type-Ayuda tutorial-card">
            <div class="card-header"><span>Ayuda</span></div><div class="card-image">💊</div><div class="card-body">Máx 4 copias.</div>
        </div>
    </div>

    <p class="rule-text">Cuando se habla de "rival" siempre es refiriéndose al jugador con el que te enfrentas; un "aliado" es una carta de <span class="kw-per">Personaje</span> o de <span class="kw-esb">Esbirro</span> colocada en tu campo; y un "enemigo" es lo mismo pero perteneciente al rival.</p>
</div>

<div class="rule-section">
    <h3 class="rule-title">2. Preparación de la partida</h3>
    <p class="rule-text">Al inicio de cada partida, cada jugador ha de elegir 3 cartas de su mazo y apartarlas (para que no formen parte de las retribuciones). Tras esto, se debe barajar el mazo y poner las 6 primeras cartas boca abajo en la zona de retribución.</p>
    <p class="rule-text">Entonces, las cartas puestas aparte se devuelven al mazo, se vuelve a barajar, y se roban 6 cartas que conforman tu primera mano. Si en ella no tuvieras cartas de Personaje o de Esbirro sin coste o condiciones de colocación, devuelve tu mano al mazo, baraja otra vez y roba otras 6, hasta que dispongas de una carta válida. Finalmente, se echa una moneda al aire para decidir quién empieza.</p>
</div>

<div class="rule-section">
    <h3 class="rule-title">3. El campo y los contadores</h3>
    <p class="rule-text">Para jugar se necesita un campo de batalla dividido en dos mitades iguales y simétricas, una para cada jugador. En cada mitad hay un hueco para el mazo, otro para los descartes, otro para la <span class="kw-van">Vanguardia</span>, otro para la <span class="kw-ret">Retaguardia</span>, otro para el Evento y un último para las retribuciones.</p>
    
    <p class="rule-text">En esta versión digital, todos los contadores se gestionan de forma automática. Los aliados tendrán representados en su carta los valores de <span class="kw-hp">Vida</span>, <span class="kw-def">Defensa</span>, <span class="kw-atk">Ataque</span>, <span class="kw-fur">Furor</span> y los turnos restantes de estados alterados mediante iconos (píldoras), del 1 al 9.</p>
</div>

<div class="rule-section">
    <h3 class="rule-title">4. Vanguardia y retaguardia</h3>
    <p class="rule-text"><span class="kw-van">Vanguardia</span>: Puedes colocar Personajes o Esbirros en este lugar del campo, uno por cada turno. En total sólo pueden haber un máximo de 4 cartas en la Vanguardia, y además, sólo puedes poner 2 Personajes como máximo (pero los Esbirros que quieras, mientras tengas hueco). Al inicio de cada turno tuyo, cada Personaje y Esbirro de tu vanguardia gana 1 de <span class="kw-fur">Furor</span>. Los aliados que tengas en esta zona pueden ser objetivo de tu rival.</p>
    
    <div class="widget-box" style="flex-direction: column; align-items: center;">
        <div style="color: #94a3b8; font-size: 0.8rem; margin-bottom:-10px;">Ejemplo de vanguardia legal (Límite: 2 Personajes, 4 cartas total)</div>
        <div style="display:flex; gap:10px; background: rgba(0,0,0,0.5); padding: 10px; border-radius: 8px; border: 1px solid #475569;">
            <div class="card type-Personaje tutorial-card" style="margin:0;"><div class="card-header"><span>Karlos</span></div><div class="card-image">👤</div><div class="card-body"></div></div>
            <div class="card type-Personaje tutorial-card" style="margin:0;"><div class="card-header"><span>Zoe</span></div><div class="card-image">👤</div><div class="card-body"></div></div>
            <div class="card type-Esbirro tutorial-card" style="margin:0;"><div class="card-header"><span>Guardia</span></div><div class="card-image">👾</div><div class="card-body"></div></div>
            <div class="card type-Esbirro tutorial-card" style="margin:0;"><div class="card-header"><span>Tigre</span></div><div class="card-image">👾</div><div class="card-body"></div></div>
        </div>
    </div>

    <p class="rule-text"><span class="kw-ret">Retaguardia</span>: Cuando tienes ya 4 cartas en la vanguardia, puedes seguir colocando Personajes o Esbirros en esta otra zona, sin límite (pero también sólo uno por turno). <b>Nótese que si no tienes la vanguardia llena, NO puedes colocar a nadie en la retaguardia.</b> Los que estén aquí no ganan Furor en cada turno y, por regla general, tampoco pueden ser objetivos de Eventos, Ayudas, Ataques o Habilidades (salvo excepciones). Puedes intercambiar un aliado de la vanguardia por otro de la retaguardia consumiendo 3 de Furor; se le eliminarían los estados alterados y anexos que tuviera.</p>
    
    <p class="rule-text">Si quisieras colocar un Personaje, pero tuvieras [1 Personaje y 3 Esbirros] o bien [4 Esbirros] en la Vanguardia, puedes elegir uno de los Esbirros para moverlo a la retaguardia sin coste y colocar al Personaje en su lugar. Siempre vas a poder colocar un Personaje en la Vanguardia si hay menos de 2, INCLUSO si está llena.</p>
</div>

<div class="rule-section">
    <h3 class="rule-title">5. Retribución, acciones y combate</h3>
    <p class="rule-text">Si un aliado llega a 0 de <span class="kw-hp">Vida</span>, va a tu pila de descarte y coges una carta de retribución. Si no tienes aliados colocados (ni en Vanguardia ni en Retaguardia), el rival puede realizar <b>un único ataque directo por turno</b> para que cojas una retribución directamente. Pierdes si coges todas.</p>
    
    <p class="rule-text"><b>Acciones:</b> Cada aliado de la vanguardia puede realizar un ataque, usar su habilidad activa si tuviera, retirarse usando 3 de Furor, o pasar; puedes hacer una acción por aliado en tu turno.</p>
    
    <p class="rule-text"><b>Combate:</b> Al atacar, se elige a una carta enemiga y se calcula: <b>[<span class="kw-atk">Atq</span> del atacante - <span class="kw-def">Def</span> del defensor]</b>. El resultado se resta de la Vida del defensor. Si el cálculo da 0 o menos, el resultado dará 1 si el atacante es un Personaje, y 0,5 si es un Esbirro (salvo excepciones).</p>
    
    <p class="rule-text"><b>Ataques especiales:</b> Algunas habilidades realizan un "ataque especial". El cálculo es casi igual, pero el mínimo de daño resultante es siempre 1 (incluso para Esbirros) si golpea, y a menudo ignoran ciertos modificadores negativos o habilidades evasivas.</p>
</div>

<div class="rule-section">
    <h3 class="rule-title">6. Estados alterados y oculto</h3>
    <p class="rule-text">Algunos efectos pueden causar estados alterados, con contadores que bajan en 1 al terminar el turno del jugador dueño. Si un aliado ya sufre un estado y es afectado por otro distinto, se elimina el viejo y se aplica el nuevo; si es el mismo, no ocurre nada.</p>
    
    <div class="widget-box">
        <div class="card type-Personaje tutorial-card" style="margin-left:25px; height: 180px;">
            <div class="card-header"><span>Afectado</span></div><div class="card-image">👤</div>
            
            <div style="position: absolute; top: -6px; left: 0; display: flex; flex-direction: column;">
                <div class="tut-badge" style="background:#f97316;"><span style="margin-left:-6px; margin-right:1px;">🔥</span><span>2</span></div>
                <div class="tut-badge" style="background:#d946ef;"><span style="margin-left:-6px; margin-right:1px;">🌀</span><span>1</span></div>
                <div class="tut-badge" style="background:#4b5563;"><span style="margin-left:-6px; margin-right:1px;">🌫️</span><span>2</span></div>
                <div class="tut-badge" style="background:#0ea5e9;"><span style="margin-left:-6px; margin-right:1px;">💤</span><span>1</span></div>
                <div class="tut-badge" style="background:#6b7280;"><span style="margin-left:-6px; margin-right:1px;">🤐</span><span>1</span></div>
            </div>
            
            <div class="tut-badge" style="position: absolute; bottom: -12px; left: -14px; background:#1e1b4b; border-color:#6366f1; width:22px; height:22px;"><span style="margin:0;">👁️</span></div>
        </div>

        <div style="flex:1; display:flex; flex-direction:column; justify-content:center; color:#cbd5e1; font-size:0.9rem;">
            <div>🔥 <b>Daño por tiempo:</b> Pierde 1 de Vida al inicio del turno.</div>
            <div>🌀 <b>Confusión:</b> Lanza moneda al atacar normal. Cara = Ataca. Cruz = Se hace 2 de Daño a sí mismo.</div>
            <div>🌫️ <b>Ceguera:</b> Lanza moneda al atacar normal. Cara = Ataca. Cruz = Falla el ataque.</div>
            <div>💤 <b>Sueño:</b> Lanza moneda al atacar o usar Habilidad. Cara = Actúa normalmente y elimina el estado. Cruz = No ocurre nada.</div>
            <div>🤐 <b>Silenciado:</b> No puede usar sus Habilidades activas.</div>
            <div style="margin-top: 10px; border-top: 1px dashed #475569; padding-top: 5px;">👁️ <b>Oculto:</b> No puede ser objetivo DIRECTO de ataques normales; un ataque que alcance a toda una fila sin elegir objetivo sí le llega, y quien tenga sus ataques normales convertidos en especiales también puede señalarlo.
            <br>· <b>El daño lo revela</b> cuando el Oculto viene de un efecto con duración. Los Ocultos permanentes (los que da una Pasiva o una Habilidad mientras la carta siga en juego) NO se revelan al recibir daño: su fuente los repone.
            <br>· <b>Escondite frágil:</b> si al final de tu Fase de efectos iniciales no tienes NADA a lo que atacar -ni una carta suya alcanzable ni el ataque directo-, echas una moneda por cada carta Oculta del rival: con cara, se le quita ese Oculto durante este turno. No cuentan las cartas Ocultas que además estén agotadas: esas no te están encerrando. Esconderse detrás de nada no es una estrategia.</div>
        </div>
    </div>
</div>

<div class="rule-section">
    <h3 class="rule-title">7. Resumen de flujo de partida</h3>
    <p class="rule-text" style="color:#fbbf24; font-weight:bold; text-transform:uppercase;">Preparación inicial</p>
    <ul class="list-steps">
        <li><b>1.</b> Elegir 3 cartas y apartarlas, barajar el mazo, poner 6 retribuciones, devolver las 3 cartas apartadas y volver a barajar el mazo.</li>
        <li><b>2.</b> Robar 6 cartas (Mulligan: si no tienes Personaje o Esbirro jugable por su coste/condición, devuelve la mano, baraja y roba 6 hasta que sea válida).</li>
        <li><b>3.</b> Moneda para ver quién juega primero.</li>
        <li><b>4.</b> El primer jugador coloca un Personaje o Esbirro, pero <b>no puede atacar ni usar habilidad activa</b> su primer turno. (Sí puede jugar Eventos/Ayudas).</li>
        <li><b>5.</b> Se pasa al turno del otro jugador, que roba carta y coloca un Personaje o Esbirro, y a partir de ahí la partida como tal empieza (este jugador ya puede atacar).</li>
    </ul>

    <p class="rule-text" style="color:#fbbf24; font-weight:bold; margin-top:20px; text-transform:uppercase;">Fases del turno</p>
    <ul class="list-steps">
        <li><b>1. Fase de robo:</b> Robar una carta (si mazo vacío, barajar descartes y robar).</li>
        <li><b>2. Fase de efectos iniciales:</b> En este orden: Evento, Vanguardia (izda a dcha), Retaguardia (izda a dcha), Daños por tiempo.</li>
        <li><b>3. Fase de evento:</b> Restar 1 turno al Evento activo (ejecuta efecto si expira).</li>
        <li><b>4. Fase de furor:</b> Sumar 1 de Furor (máx 4) a Vanguardia.</li>
        <li><b>5. Fase principal:</b> (En cualquier orden)
            <ul style="margin-top: 5px; margin-left: 20px; margin-bottom: 5px; list-style-type: disc;">
                <li>Colocar 1 aliado (Personaje o Esbirro).</li>
                <li>Jugar 1 Evento.</li>
                <li>Jugar las Ayudas que quieras/puedas.</li>
                <li>Gastar 1 acción por aliado (Atacar, usar habilidad activa, o retirarse).</li>
            </ul>
            <i style="color: #fbbf24;">Si la vanguardia queda con huecos y hay retaguardia, hay que mover cartas adelante obligatoriamente.</i>
        </li>
        <li><b>6. Fase de efectos finales:</b> En este orden: Evento, Vanguardia (izda a dcha), Retaguardia (izda a dcha), contadores de otros estados alterados (Confusión, Ceguera). Dar turno al rival.</li>
    </ul>
</div>
`;

function inicializarReglas() {
    if (document.getElementById('rules-modal')) return;

    const modalHTML = `
        <div id="rules-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15, 23, 42, 0.85); backdrop-filter: blur(5px); display:none; justify-content:center; align-items:center; z-index:9999; opacity: 0; transition: opacity 0.2s ease-in-out;">
            <div id="rules-content-box" style="background:#1e293b; border:2px solid #38bdf8; border-radius:10px; width:80%; max-width:800px; height:85vh; display:flex; flex-direction:column; box-shadow:0 15px 40px rgba(0,0,0,0.6); transform: scale(0.95); transition: transform 0.2s ease-in-out; overflow:hidden;">
                
                <div style="background:#0f172a; padding:15px; display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #38bdf8;">
                    <h2 style="margin:0; color:#38bdf8; font-size:1.2rem; letter-spacing:1px; text-transform:uppercase;">Manual de entrenamiento</h2>
                    <button onclick="cerrarReglas()" style="background:#ef4444; color:white; border:none; padding:8px 15px; border-radius:5px; font-weight:bold; cursor:pointer; transition:0.2s;">Cerrar</button>
                </div>
                
                <div id="rules-body" style="flex:1; padding:25px; overflow-y:auto; font-size:0.95rem; line-height:1.6; color:#e2e8f0;">
                    ${TEXTO_REGLAS}
                </div>
                
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    const modal = document.getElementById('rules-modal');
    modal.addEventListener('click', (e) => { if (e.target === modal) cerrarReglas(); });
}

function mostrarReglas() {
    const modal = document.getElementById('rules-modal');
    const contenido = document.getElementById('rules-content-box');
    if (!modal) return;
    
    modal.style.display = 'flex';
    requestAnimationFrame(() => {
        modal.style.opacity = '1';
        contenido.style.transform = 'scale(1)';
    });
}

function cerrarReglas() {
    const modal = document.getElementById('rules-modal');
    const contenido = document.getElementById('rules-content-box');
    if (!modal) return;

    modal.style.opacity = '0';
    contenido.style.transform = 'scale(0.95)';
    setTimeout(() => {
        modal.style.display = 'none';
    }, 200);
}