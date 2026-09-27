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
    // El mismo corte que movil.css: por debajo de 900px el diseño de escritorio ya no cabe.
    const CONSULTA = '(max-width: 900px)';
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
    };

    const aplicar = () => {
        if (!esMovil()) return;
        alListo(() => {
            if (document.querySelector('.deck-panel') && !hechos.has('constructor')) { hechos.add('constructor'); MEJORAS.constructor(); }
        });
    };
    aplicar();
    // Girar una tablet puede convertirla en "móvil" a mitad de visita: entonces se instala.
    if (mq) {
        if (mq.addEventListener) mq.addEventListener('change', aplicar);
        else if (mq.addListener) mq.addListener(aplicar);
    }
})();
