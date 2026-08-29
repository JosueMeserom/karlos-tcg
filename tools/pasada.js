#!/usr/bin/env node
// tools/pasada.js — LA PASADA ESTRICTA, en un solo comando.
//
// POR QUÉ EXISTE (27-ago-2026). Hasta hoy la batería se lanzaba con un bucle de shell escrito a
// mano cada vez, y el criterio de "verde" era buscar con grep el mensaje de éxito de cada suite.
// Eso vale para mirar por encima, pero no para automatizar: un `grep` que no encuentra su texto
// no distingue "ha fallado" de "he cambiado el mensaje". Aquí el criterio es el CÓDIGO DE SALIDA,
// que es el que entienden igual una terminal, un `npm test` y GitHub Actions.
//
// Qué hace: ejecuta cada fichero de `tests/` en su propio proceso, resume en una línea por suite,
// y ENSEÑA ENTERA la salida de las que fallen (que es lo que se necesita para arreglarlas). Sale
// con 1 si alguna falla.
//
//   node tools/pasada.js            # todo
//   node tools/pasada.js oculto     # solo las suites cuyo nombre contenga "oculto"
//   npm test                        # lo mismo que lo primero
//
// NO NECESITA NADA INSTALADO: las suites solo usan `fs`, `path` y `vm` de Node. Nada de red, ni
// base de datos, ni servidor — por eso esto corre igual en un portátil que en un runner limpio.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const DIR = path.join(RAIZ, 'tests');

// `harness.js` es la librería que usan las demás, no una suite.
const LIBRERIAS = new Set(['harness.js']);
// INFORMATIVAS: censos que no fallan nunca porque no hay nada que "romper" en ellos — son listas
// de trabajo pendiente, no reglas. Se ejecutan igual (si reventaran, sería un fallo de verdad y
// se ve), pero su recuento NO tumba la pasada. Cuando una de estas pasa a ser norma, se saca de
// aquí y se le pone su `process.exit(1)`: es justo lo que se hizo con auditar_flechas.
const INFORMATIVAS = new Set(['familias_textos.js', 'auditar_imperativas.js']);

const filtro = process.argv.slice(2).filter(a => !a.startsWith('-'));
const suites = fs.readdirSync(DIR)
    .filter(f => f.endsWith('.js') && !LIBRERIAS.has(f))
    .filter(f => !filtro.length || filtro.some(q => f.includes(q)))
    .sort((a, b) => a.localeCompare(b, 'es'));

if (!suites.length) {
    console.error(`No hay ninguna suite que case con: ${filtro.join(', ')}`);
    process.exit(1);
}

const t0 = Date.now();
const fallidas = [];
const informativas = [];
let ok = 0;

for (const f of suites) {
    const r = spawnSync(process.execPath, [path.join(DIR, f)], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const salida = ((r.stdout || '') + (r.stderr || '')).trimEnd();
    // El resumen de cada suite es su última línea con texto: así el listado dice QUÉ comprobó,
    // no solo que pasó.
    const resumen = salida.split('\n').filter(l => l.trim()).pop() || '(sin salida)';
    const esInformativa = INFORMATIVAS.has(f);
    const malo = r.status !== 0;

    if (esInformativa) {
        informativas.push({ f, resumen });
        console.log(`  ··    ${f.padEnd(28)} ${resumen}`);
    } else if (malo) {
        fallidas.push({ f, salida });
        console.log(`  FALLO ${f.padEnd(28)} ${resumen}`);
    } else {
        ok++;
        console.log(`  OK    ${f.padEnd(28)} ${resumen}`);
    }
}

const segundos = ((Date.now() - t0) / 1000).toFixed(1);
console.log('');
if (fallidas.length) {
    console.log('═'.repeat(70));
    for (const { f, salida } of fallidas) {
        console.log(`\n### ${f}\n`);
        console.log(salida);
    }
    console.log('═'.repeat(70));
}
console.log(`PASADA: ${ok} suites en verde · ${fallidas.length} EN ROJO · ${informativas.length} informativas · ${segundos}s`);
if (fallidas.length) {
    console.log('En rojo: ' + fallidas.map(x => x.f).join(', '));
    process.exit(1);
}
