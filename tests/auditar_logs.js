// tests/auditar_logs.js — logs que nombran una carta SIN decir de quién es.
//
// Norma del proyecto: todo log visible por ambos jugadores va en 3ª persona y con el dueño —
// `<Nombre>[ [copyId]] de <JX (Nick)>`, que es lo que construyen `getCardNameWithOwner()` en el
// cliente y `DSL._nombre()` / `{objetivo}` en el motor de cartas. Nace de que Toto encontró
// "La buena razón se ha desvanecido, y no volverá." sin decir de QUIÉN era la buena razón
// (14-ago-2026), y de que ese no es un caso aislado: se cuela cada vez que alguien escribe un
// log a mano con `card.name` o `{carta}` a secas.
//
// Qué mira, y por qué así:
//   · En el DSL, un `log` que use `{carta}` u `{objetivo}` está bien: los rellena DSL._fill con
//     el nombre completo. Lo sospechoso es `{carta}` SIN `{jugador}` en un log que habla de algo
//     que le pasa a esa carta — ahí el jugador se pierde. Se avisa solo cuando el log NO nombra
//     al jugador de ninguna forma.
//   · En código imperativo, `${card.name}` / `${target.name}` a secas: el nombre pelado, sin
//     dueño ni copyId. `getCardNameWithOwner(...)` y `nCarta(...)` son los correctos.
//
// Informativo: NO devuelve código de error. Hay logs que legítimamente no necesitan dueño (los
// de sistema sobre el propio turno, un aviso al jugador que solo él ve), y distinguirlos pide
// criterio humano. Lo que hace es que la lista exista y mengüe, en vez de irlos encontrando de
// uno en uno jugando.
//
//   node tests/auditar_logs.js            # resumen
//   node tests/auditar_logs.js --detalle  # con la línea entera
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const detalle = process.argv.includes('--detalle');

// Un log que habla del jugador de alguna forma ya está cubierto.
const NOMBRA_JUGADOR = /\{jugador\}|\{objetivo\}|getDisplayName|getCardNameWithOwner|nCarta\(|DSL\._nombre/;
// Logs que no van dirigidos a los dos: avisos de error al que juega, mensajes de flujo.
const EXENTO = /logError|logMsg\([^,]*,\s*'(?:debug)'/;

const hallazgos = [];
const lineas = fs.readFileSync(path.join(RAIZ, 'public/cartas.js'), 'utf8').split('\n');
const cartaDe = (i) => {
    for (let j = i; j >= 0; j--) {
        const m = lineas[j].match(/^\s*(?:id:\s*\d+,\s*)?name:\s*"([^"]+)"/);
        if (m) return m[1];
    }
    return '(motor)';
};

lineas.forEach((l, i) => {
    if (/^\s*\/\//.test(l) || EXENTO.test(l)) return;

    // (a) DSL: un `log:` con {carta} y sin ninguna mención al jugador.
    const mDsl = l.match(/\blog(?:Intro|Despues|No|NoValidas|Cero|Si|)?\s*:\s*["'`]([^"'`]+)["'`]/);
    if (mDsl && /\{carta\}/.test(mDsl[1]) && !NOMBRA_JUGADOR.test(mDsl[1])) {
        hallazgos.push({ carta: cartaDe(i), linea: i + 1, tipo: 'DSL sin {jugador}', texto: mDsl[1] });
        return;
    }
    // (b) Imperativo: nombre pelado interpolado dentro de un logMsg.
    if (/logMsg\(/.test(l) && /\$\{[A-Za-z_][\w.]*\.name\}/.test(l) && !NOMBRA_JUGADOR.test(l)) {
        const m = l.match(/logMsg\(\s*[`'"]([^`'"]*)[`'"]/);
        hallazgos.push({ carta: cartaDe(i), linea: i + 1, tipo: 'nombre pelado', texto: (m ? m[1] : l.trim()).slice(0, 90) });
    }
});

const porTipo = {};
hallazgos.forEach(h => (porTipo[h.tipo] = porTipo[h.tipo] || []).push(h));

console.log('AUDITORÍA DE LOGS SIN DUEÑO\n');
for (const [tipo, lista] of Object.entries(porTipo)) {
    console.log(`## ${tipo} (${lista.length})`);
    lista.forEach(h => console.log(`   · ${h.carta} (línea ${h.linea})`
        + (detalle ? `\n       "${h.texto}"` : `  —  "${h.texto.slice(0, 60)}"`)));
    console.log();
}
console.log(`TOTAL: ${hallazgos.length} logs que nombran algo sin decir de quién es`);
