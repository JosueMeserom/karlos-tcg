// tests/movil_sin_fugas.js — la versión móvil NO puede tocar el escritorio.
//
// La garantía que pidió Toto (28-sep-2026): "sin cambiar ni alterar nada de lo que ya haya". Se
// cumple por CONSTRUCCIÓN: todo lo de móvil vive en public/movil.css y ahí cada regla está dentro
// de una media query, así que en una pantalla de escritorio ninguna llega a aplicarse.
//
// Esto vigila que siga siendo así. Una sola regla suelta en ese fichero se aplicaría en todas las
// pantallas y rompería la garantía sin que nadie lo notara, porque en móvil "funcionaría". Además
// comprueba que las media queries son de las que NO pueden activarse en un escritorio normal.
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(RAIZ, 'public/movil.css'), 'utf8');

let comprobaciones = 0, fallos = 0;
const check = (t, ok, extra) => { comprobaciones++; console.log((ok ? '  OK    · ' : '  FALLO · ') + t + (!ok && extra ? '  [' + extra + ']' : '')); if (!ok) fallos++; };

// Recorre los bloques de NIVEL SUPERIOR contando llaves, sin comentarios ni cadenas.
const limpio = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
const bloques = [];
let prof = 0, inicio = 0;
for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (c === '{') { if (prof === 0) bloques.push({ prelude: limpio.slice(inicio, i).trim(), pos: i }); prof++; }
    else if (c === '}') { prof--; if (prof === 0) inicio = i + 1; }
}
check('las llaves cuadran', prof === 0, 'profundidad final ' + prof);
check('hay reglas que vigilar', bloques.length > 0);

const sueltas = bloques.filter(b => !/^@media\b/i.test(b.prelude));
check('NINGUNA regla fuera de una media query', sueltas.length === 0,
    sueltas.map(b => '"' + b.prelude.slice(0, 50) + '"').join(', '));

// Cada media query tiene que ser de las que un escritorio NO cumple. Se aceptan cortes por ancho
// máximo (<= 1100px), por alto máximo, u orientación/puntero táctil combinados con alguno de ellos.
const ESCRITORIO = { ancho: 1280, alto: 720 };   // el escritorio más pequeño que se da por normal
const peligrosas = [];
for (const b of bloques) {
    const q = b.prelude.replace(/^@media\s*/i, '');
    const anchos = [...q.matchAll(/max-width:\s*(\d+)px/g)].map(m => +m[1]);
    const altos = [...q.matchAll(/max-height:\s*(\d+)px/g)].map(m => +m[1]);
    const acota = anchos.some(a => a < ESCRITORIO.ancho) || altos.some(a => a < ESCRITORIO.alto);
    if (!acota) peligrosas.push(q);
}
check('ninguna media query se activa en un escritorio de 1280x720', peligrosas.length === 0, peligrosas.join(' | '));

// Y el fichero se carga en las cuatro páginas, el último, para que a igual especificidad gane.
for (const f of ['landing.html', 'lobby.html', 'deckbuilder.html', 'index.html']) {
    const html = fs.readFileSync(path.join(RAIZ, 'public', f), 'utf8');
    const i = html.indexOf('href="movil.css"'), fin = html.indexOf('</head>');
    check(`${f} lo carga, al final del <head>`, i > 0 && i < fin && html.slice(i, fin).indexOf('<link') === -1 && html.slice(i, fin).indexOf('<style') === -1);
}

console.log(`\nSUITE movil_sin_fugas: ${fallos ? fallos + ' FALLOS de ' : comprobaciones + '/'}${comprobaciones} comprobaciones` + (fallos ? '' : ' — EL ESCRITORIO NO SE TOCA'));
if (fallos) process.exit(1);
