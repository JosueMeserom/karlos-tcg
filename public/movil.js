// =====================================================================================
//  movil.js — lo que la versión móvil necesita y que CSS solo no puede hacer
// =====================================================================================
//
//  LA REGLA, la misma que movil.css: en escritorio esto NO hace nada. Ni añade elementos, ni
//  engancha eventos, ni toca una sola función de la página. Todo empieza preguntando si la
//  pantalla es de móvil o tablet y, si no lo es, se va. Si la pantalla cambia (girar una tablet),
//  se vuelve a preguntar entonces, no antes.
//
//  Y NO SE REESCRIBE NADA DE LO QUE YA HAY: lo que haga falta saber de la página se OBSERVA (un
//  MutationObserver sobre el contador del mazo, por ejemplo) en vez de engancharse a sus
//  funciones. Así, lo que funciona en escritorio sigue siendo exactamente el mismo código.
// =====================================================================================
(function () {
    'use strict';
    // La misma consulta que el bloque de la partida de movil.css: por debajo de 900px el diseño de
    // escritorio ya no cabe, y en una tablet táctil apaisada tampoco (y sin ratón no hay hover).
    // Las pestañas del constructor se instalan igual, pero solo las enseña el CSS de <= 900px.
    const CONSULTA = '(max-width: 900px), (pointer: coarse) and (max-width: 1279px)';
    const mq = window.matchMedia ? window.matchMedia(CONSULTA) : null;
    const esMovil = () => !!(mq && mq.matches);

    const hechos = new Set();   // cada mejora se instala UNA vez, aunque la pantalla cambie
    const alListo = (fn) => (document.readyState === 'loading') ? document.addEventListener('DOMContentLoaded', fn) : fn();

    const MEJORAS = {
        // ── CONSTRUCTOR DE MAZOS: pestañas Catálogo / Mi mazo ──────────────────────────────
        // En un móvil no caben dos paneles lado a lado: la lista del mazo quedaba ENTERA fuera
        // de la pantalla. Con pestañas, se ve una cosa cada vez y el total va siempre a la vista.
        constructor() {
            const catalogo = document.querySelector('.catalog-panel');
            const mazo = document.querySelector('.deck-panel');
            const main = document.querySelector('.main-container');
            if (!catalogo || !mazo || !main) return;

            const barra = document.createElement('div');
            barra.id = 'movil-pestanas';
            // Oculta por defecto en línea: solo movil.css (dentro de su media query) la enseña.
            // Si alguien agranda la ventana hasta escritorio, vuelve a estar oculta sola.
            barra.style.display = 'none';
            barra.innerHTML =
                '<button type="button" data-pestana="catalogo" class="activa">Catálogo</button>' +
                '<button type="button" data-pestana="mazo">Mi mazo · <span id="movil-total">0</span><span class="movil-de">/40</span></button>';
            main.parentNode.insertBefore(barra, main);

            const poner = (cual) => {
                document.body.classList.toggle('movil-pestana-mazo', cual === 'mazo');
                barra.querySelectorAll('button').forEach(b => b.classList.toggle('activa', b.dataset.pestana === cual));
                window.scrollTo(0, 0);
            };
            barra.addEventListener('click', (ev) => {
                const b = ev.target.closest('button[data-pestana]');
                if (b) poner(b.dataset.pestana);
            });

            // El total se OBSERVA, no se calcula: es el mismo número que pinta la página, así que no
            // puede discrepar nunca de lo que diría en escritorio.
            const total = document.getElementById('deck-total');
            const aqui = document.getElementById('movil-total');
            const copiar = () => {
                if (!total || !aqui) return;
                aqui.textContent = total.textContent;
                aqui.parentElement.classList.toggle('completo', parseInt(total.textContent, 10) >= 40);
            };
            copiar();
            if (total && window.MutationObserver) new MutationObserver(copiar).observe(total, { childList: true, characterData: true, subtree: true });

            // Un toque en el catálogo añade una copia, pero en una pestaña que no enseña el mazo eso
            // no se ve. Se le da un latido a la pestaña para que se note que ha entrado.
            const pestanaMazo = barra.querySelector('[data-pestana="mazo"]');
            let ultimo = total ? total.textContent : '';
            if (total && window.MutationObserver) new MutationObserver(() => {
                if (total.textContent !== ultimo && pestanaMazo) {
                    pestanaMazo.classList.remove('latido'); void pestanaMazo.offsetWidth; pestanaMazo.classList.add('latido');
                }
                ultimo = total.textContent;
            }).observe(total, { childList: true, characterData: true, subtree: true });
        },

        // ── LA PARTIDA ─────────────────────────────────────────────────────────────────────
        // Tres cosas que en escritorio hace el ratón y en táctil no existen.
        partida() {
            const g = () => window.game;

            // 1) MANTENER PULSADA UNA CARTA = VER SU DETALLE. En escritorio el detalle se abre al
            //    pasar el ratón; en táctil no hay "pasar por encima", y un toque normal ya tiene su
            //    trabajo (seleccionar, atacar, jugar). Mantener pulsado es el gesto estándar de los
            //    juegos de cartas en el móvil, y el toque corto sigue haciendo lo de siempre.
            //    Para abrirlo NO se llama a nada nuevo: cada carta ya engancha su detalle en su
            //    `onmouseenter`, así que se le manda ese mismo evento y el juego lo rellena igual
            //    que en escritorio, con sus flechas de "Afectado por" incluidas.
            const velo = document.createElement('div');
            velo.id = 'movil-velo';
            velo.style.display = 'none';          // solo lo enseña el propio gesto
            document.body.appendChild(velo);
            let abierto = false, temporizador = null, x0 = 0, y0 = 0, tragarHasta = 0;
            const cerrar = () => {
                if (!abierto) return;
                abierto = false;
                document.body.classList.remove('movil-detalle');
                velo.style.display = 'none';
                try { g() && g().cerrarDetalle ? g().cerrarDetalle() : g().stopPreview(); } catch (e) { /* sin partida */ }
            };
            const abrir = (carta) => {
                abierto = true;
                carta.dispatchEvent(new MouseEvent('mouseenter'));
                document.body.classList.add('movil-detalle');
                velo.style.display = 'block';
                if (navigator.vibrate) navigator.vibrate(12);
            };
            document.addEventListener('touchstart', (ev) => {
                if (abierto || !ev.touches || ev.touches.length !== 1) return;
                const carta = ev.target.closest && ev.target.closest('.card');
                if (!carta || carta.classList.contains('card-back')) return;
                x0 = ev.touches[0].clientX; y0 = ev.touches[0].clientY;
                clearTimeout(temporizador);
                temporizador = setTimeout(() => { temporizador = null; abrir(carta); }, 450);
            }, { passive: true });
            document.addEventListener('touchmove', (ev) => {
                if (!temporizador || !ev.touches) return;
                const t = ev.touches[0];
                // Si el dedo se mueve, es un deslizamiento (la mano se desplaza así), no una pulsación.
                if (Math.hypot(t.clientX - x0, t.clientY - y0) > 10) { clearTimeout(temporizador); temporizador = null; }
            }, { passive: true });
            document.addEventListener('touchend', () => {
                if (temporizador) { clearTimeout(temporizador); temporizador = null; }
                // El clic que algunos navegadores disparan al soltar tras mantener pulsado NO puede
                // llegar a la carta (la seleccionaría). Solo se traga el de los próximos 400 ms, y
                // así no se come el toque siguiente, que es el que cierra el detalle.
                else if (abierto) tragarHasta = Date.now() + 400;
            }, { passive: true });
            document.addEventListener('click', (ev) => {
                if (Date.now() < tragarHasta) { tragarHasta = 0; ev.preventDefault(); ev.stopPropagation(); }
            }, true);
            // Mientras está abierto, el `mouseleave` que emula el navegador al levantar el dedo lo
            // cerraría enseguida: se para antes de llegar a la carta.
            document.addEventListener('mouseleave', (ev) => { if (abierto) ev.stopPropagation(); }, true);
            // El menú contextual del navegador (el de "copiar imagen") sale también al mantener.
            document.addEventListener('contextmenu', (ev) => {
                if (ev.target.closest && ev.target.closest('.card')) ev.preventDefault();
            }, true);
            // Tocar fuera cierra, y ESE toque no hace nada más: si no, al cerrar el detalle
            // atacarías sin querer a lo que hubiera debajo.
            velo.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); cerrar(); });

            // 2) EL HISTORIAL, plegado en un botón junto a REGLAS. Abierto tapa media pantalla:
            //    se abre para leerlo y se cierra para jugar.
            const reglas = document.getElementById('rules-btn-main');
            if (reglas) {
                const b = document.createElement('button');
                b.id = 'movil-btn-historial';
                b.className = 'game-btn';
                b.type = 'button';
                b.textContent = 'HISTORIAL';
                b.style.display = 'none';
                reglas.insertAdjacentElement('afterend', b);
                b.addEventListener('click', () => {
                    const on = document.body.classList.toggle('movil-historial');
                    b.classList.toggle('activo', on);
                    if (on) { const c = document.getElementById('log-content'); if (c) c.scrollTop = c.scrollHeight; }
                });
            }

            // 3) LA FASE ACTUAL en la franja del turno. En escritorio la cuenta el panel de la
            //    derecha (el detalle en reposo), que en móvil se oculta porque tapaba el tablero.
            //    Se OBSERVA su texto, así que siempre dice lo mismo que diría ese panel.
            //    NO se mete ningún elemento dentro de #ui-layer: el juego REESCRIBE su contenido al
            //    repintar (en el HTML mide 120px y en ejecución lo regenera a 160), y lo que hubiera
            //    dentro desaparecía en el primer repintado. Se deja como ATRIBUTO del propio
            //    contenedor -eso sí sobrevive a que rehaga su interior- y lo pinta movil.css con un
            //    ::before.
            const ui = document.getElementById('ui-layer');
            const fase = document.getElementById('cpr-fase');
            if (ui && fase) {
                const copiar = () => { ui.setAttribute('data-movil-fase', (fase.textContent || '').trim()); };
                copiar();
                if (window.MutationObserver) new MutationObserver(copiar).observe(fase, { childList: true, characterData: true, subtree: true });
            }
        },
    };

    const aplicar = () => {
        if (!esMovil()) return;
        alListo(() => {
            if (document.querySelector('.deck-panel') && !hechos.has('constructor')) { hechos.add('constructor'); MEJORAS.constructor(); }
            if (document.getElementById('game-board') && !hechos.has('partida')) { hechos.add('partida'); MEJORAS.partida(); }
        });
    };
    aplicar();
    // Girar una tablet puede convertirla en "móvil" a mitad de visita: entonces se instala.
    if (mq) {
        if (mq.addEventListener) mq.addEventListener('change', aplicar);
        else if (mq.addListener) mq.addListener(aplicar);
    }
})();
