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
//   · En el DSL ya NO hay nada que mirar: desde el 14-ago-2026 `{carta}` resuelve al nombre
//     COMPLETO con dueño (DSL._nombre), igual que `{objetivo}`. Era el arreglo de fondo y se
//     hizo en una línea; lo caro fueron las 16 suites que hubo que documentar.
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

    // Imperativo: nombre pelado interpolado dentro de un logMsg. Es lo único que queda por
    // revisar, porque el DSL ya lo resuelve solo.
    if (/logMsg\(/.test(l) && /\$\{[A-Za-z_][\w.]*\.name\}/.test(l) && !NOMBRA_JUGADOR.test(l)) {
        const m = l.match(/logMsg\(\s*[`'"]([^`'"]*)[`'"]/);
        hallazgos.push({ carta: cartaDe(i), linea: i + 1, tipo: 'nombre pelado', texto: (m ? m[1] : l.trim()).slice(0, 90) });
    }
});

// TERCERA REGLA (23-ago-2026): una INSTRUCCIÓN para quien está eligiendo no va por el historial
// compartido. El rival veía en su log "MOTOCICLETA: Elige al OTRO aliado...", "Objetivo 1 fijado.
// Elige al siguiente objetivo." y demás: mensajes de interfaz dirigidos a una sola persona, que
// además le cuentan lo que está pasando antes de que pase. El canal privado es `logError`
// (logMsg con el flag de privado), que no entra en logHistory.
// Se mira en LOS DOS ficheros: el aviso genérico de la selección de objetivos vive en el motor.
{
    const IMPERATIVO = /["'`]\s*(?:¡)?(?:[A-ZÁÉÍÓÚÑ][^"'`]{0,40}?:\s*)?(?:Elige|Selecciona|Escoge|Pulsa|Haz clic|Vuelve a elegir)\b/;
    for (const rel of ['public/cartas.js', 'public/index.html']) {
        const lns = fs.readFileSync(path.join(RAIZ, rel), 'utf8').split('\n');
        lns.forEach((l, i) => {
            if (/^\s*\/\//.test(l) || /logError/.test(l)) return;
            if (!/logMsg\(/.test(l) || !IMPERATIVO.test(l)) return;
            const m = l.match(/logMsg\(\s*[`'"]([^`'"]*)[`'"]/);
            hallazgos.push({ carta: rel === 'public/cartas.js' ? cartaDe(i) : '(motor)', linea: i + 1,
                tipo: 'instrucción al que elige, en el log compartido', texto: (m ? m[1] : l.trim()).slice(0, 90) });
        });
    }
}

// SEGUNDA REGLA (22-ago-2026): el `log` de una ACTIVA no puede llevar el nombre de su propia
// carta A PELO. Se rellena con {carta}, que es QUIEN ESTÁ USANDO la Habilidad, y esa no siempre es
// la dueña: NoName copia Activas ajenas con RÉPLICA, así que un "¡Nethuns arrastra...!" escrito a
// mano acababa diciendo que arrastra Nethuns cuando quien lo hace es NoName. Con {carta} sale
// exactamente el mismo texto en el caso normal, así que no hay nada que perder.
// Solo el log de NIVEL DE HABILIDAD: los de cada efecto rellenan {carta} con el nombre COMPLETO
// (con dueño), que es otra cosa y no se puede sustituir a ciegas.
{
    const src = lineas.join('\n');
    const bloques = [...src.matchAll(/\n\s*(?:id:\s*\d+,\s*)?name:\s*"([^"]+)"/g)];
    bloques.forEach((m, k) => {
        const ini = m.index, fin = k + 1 < bloques.length ? bloques[k + 1].index : src.length;
        const bloque = src.slice(ini, fin);
        if (!/trigger:\s*["']ACTIVA["']/.test(bloque)) return;
        const nombre = m[1];
        // `log:` a nivel de habilidad = el que NO lleva {objetivo} (ese solo existe en los de efecto).
        for (const lm of bloque.matchAll(/\n\s*log:\s*"([^"]*)"/g)) {
            const txt = lm.group === undefined ? lm[1] : lm[1];
            if (/\{objetivo\}/.test(txt)) continue;
            if (!txt.includes(nombre.split(' ')[0]) || txt.includes('{carta}')) continue;
            const linea = src.slice(0, ini + lm.index).split('\n').length;
            hallazgos.push({ carta: nombre, linea, tipo: 'nombre propio a pelo en el log de una ACTIVA', texto: txt.slice(0, 90) });
        }
    });
}

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
// DEJA DE SER INFORMATIVA (27-ago-2026, al montar el CI). La norma del nombre con dueño está
// cerrada desde hace tiempo y hoy se cumple en las 176 cartas: lo que quedaba de "censo" ya no
// existe, así que un hallazgo nuevo es una regresión y tiene que poner la pasada en rojo. Mismo
// camino que hizo auditar_flechas.
if (hallazgos.length) {
    console.log('\nUn log que nombra una carta dice DE QUIÉN es: usa getCardNameWithOwner()');
    console.log('(o {carta}/{objetivo} en el DSL, que ya lo hacen).');
    process.exit(1);
}
