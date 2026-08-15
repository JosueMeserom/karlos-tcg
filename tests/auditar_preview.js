// tests/auditar_preview.js — líneas de detalle escritas A MANO que ya las escribe el motor.
//
// El detalle tiene DOS caminos para contar que algo afecta a una carta, y no son alternativos:
//
//   1. AUTOMÁTICO. `updatePassives` fotografía los stats de toda la mesa antes y después de
//      aplicar las pasivas, y anota cada diferencia en `_statMods` con su fuente. De ahí salen
//      las líneas "-2 ATQ, fuente: evento Publicidad mental de J2 (Ultra_K)" y sus flechas, con
//      la gramática de §13 y sin que la carta tenga que decir nada.
//   2. A MANO. Una ability `PREVIEW_GLOBAL` con `lineas: [{ texto: "..." }]`, para lo que el
//      automático NO puede ver: "Silenciado", "No gana Furor al inicio del turno", "Puede
//      retirarse sin coste". Nada de eso mueve un stat, así que la foto no lo detecta.
//
// El fallo es usar el 2 para algo que ya cuenta el 1: entonces salen DOS entradas de lo mismo
// (una con la gramática buena y otra con la redacción libre de la carta) y DOS flechas al mismo
// sitio. Le pasaba a Publicidad mental y a Exhibicionismo, que declaraban "-2 de Atq por la
// publicidad" teniendo ya un `AURA` con `stats: { atk: -2 }` que lo pinta solo (Toto, 15-ago-2026:
// "sigue saliendo el manual en lugar del automático, y mira que hice hincapié en esto").
//
// QUÉ COMPRUEBA: que ninguna línea de PREVIEW_GLOBAL hable de un stat (Vida / Def / Atq) que una
// ability de la MISMA carta ya mueve con `stats:`. Es la parte mecánica y por tanto la fiable.
//
// QUÉ NO PUEDE COMPROBAR, y conviene saberlo: si una línea escrita a mano dice algo que el motor
// cuenta por otra vía que no sean stats (un estado, un contador), esto no lo ve. Para eso sigue
// haciendo falta abrir el detalle en el navegador. Lo que sí garantiza es que el caso que se ha
// colado dos veces no se cuele una tercera.
//
//   node tests/auditar_preview.js            # resumen
//   node tests/auditar_preview.js --detalle  # con la línea y la ability que la duplica
//
// A DIFERENCIA de auditar_flechas / auditar_fases, esta SÍ devuelve código de error: duplicar una
// línea no es una decisión de diseño que Toto pueda tomar, es un defecto. Si sale en rojo, se
// borra la línea escrita a mano (el automático ya la cubre, y mejor redactada).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const detalle = process.argv.includes('--detalle');

const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    document: {
        getElementById: () => ({ style: {}, classList: { add() {}, remove() {} } }),
        createElement: () => ({ style: {}, classList: { add() {} }, appendChild() {} }),
        createElementNS: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
        querySelector: () => null, querySelectorAll: () => [],
    },
    localStorage: { getItem: () => null, setItem() {} },
    setTimeout() {}, clearTimeout() {}, alert() {},
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'public/reglas.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'public/cartas.js'), 'utf8'), sandbox);
const CARD_DB = vm.runInContext('CARD_DB', sandbox);

// Cómo nombra una carta cada stat. Se buscan las ABREVIATURAS exactas -Atq, Def, Vida-, no las
// palabras de las que salen: "ataque" es la ACCIÓN y "defender" el verbo, y ninguno de los dos
// implica que se toque un stat ("Roba 1 de Furor al golpear con un ataque normal" no modifica el
// Atq de nadie). Con `\bataque\b` dentro salían tres falsos positivos de golpe.
// `hp` y `maxHp` comparten palabra a propósito: en el detalle las dos salen como "Vida".
const PALABRA = { atk: /\bAtq\b/, def: /\bDef\b/, hp: /\bVida\b/, maxHp: /\bVida\b/ };

// EXENTAS: líneas que nombran un stat SIN modificarlo. La regla de arriba es deliberadamente
// ancha -cualquier mención a Vida/Def/Atq- porque `_statMods` no se alimenta solo de los `stats:`
// declarados: `updatePassives` fotografía currentAtk/currentDef de toda la mesa, así que una
// pasiva que los mueva con código a mano también genera su línea automática. Estrechar la regla a
// `stats:` dejaría fuera justo esos casos. El precio es que hay que declarar los que hablan de un
// stat sin tocarlo, con su motivo. Se revisa uno a uno al añadirlo, que es el punto.
const EXENTAS = {
    'Plan de equipo|Puede aportar su Atq al único ataque combinado':
        'describe una REGLA, no un cambio de stat: dice a quién se le permite sumar su Atq, no que el suyo haya cambiado.',
    'Plan de equipo|Plan de equipo: solo 1 ataque este turno':
        'la suma la hace un FIJAR_STAT, que escribe currentAtk directamente (cartas.js:8205) sin pasar por registrarStatMod. Comprobado en el código, no supuesto: no hay entrada en _statMods, luego no hay línea automática que duplicar.',
};
const exenta = (carta, txt) => Object.keys(EXENTAS)
    .some(k => k.startsWith(carta + '|') && txt.startsWith(k.slice(carta.length + 1)));

const dups = [];
const exentas = [];
let lineasTotales = 0;

for (const c of CARD_DB) {
    const abilities = Array.isArray(c.abilities) ? c.abilities : [];
    // Stats que la carta declara mover: sirven para explicar el fallo, no para detectarlo.
    const declarados = new Map();
    for (const ab of abilities) {
        if (!ab.stats || typeof ab.stats !== 'object') continue;
        for (const k of Object.keys(ab.stats)) declarados.set(k, ab.stats[k]);
    }

    for (const ab of abilities) {
        if (ab.trigger !== 'PREVIEW_GLOBAL' || !Array.isArray(ab.lineas)) continue;
        for (const l of ab.lineas) {
            const txt = String(l.texto || '');
            if (!txt) continue;
            lineasTotales++;
            const stat = Object.keys(PALABRA).find(k => PALABRA[k].test(txt));
            if (!stat) continue;
            const fila = {
                carta: c.name, stat, texto: txt,
                delta: declarados.has(stat) ? declarados.get(stat) : null,
                quien: l.quien || l.campoSelfId || 'TODOS',
            };
            (exenta(c.name, txt) ? exentas : dups).push(fila);
        }
    }
}

console.log('AUDITORÍA DE LÍNEAS DE DETALLE DUPLICADAS\n');
console.log(`Revisadas ${lineasTotales} líneas de PREVIEW_GLOBAL de todo el CARD_DB.\n`);

console.log(`## Exentas (${exentas.length})`);
console.log('   Nombran un stat sin modificarlo: no hay línea automática que duplicar.');
exentas.forEach(d => console.log(`   · ${d.carta}: "${d.texto}"`
    + (detalle ? `\n       ${EXENTAS[Object.keys(EXENTAS).find(k => k.startsWith(d.carta + '|'))]}` : '')));

if (!dups.length) {
    console.log('\n## DUPLICADAS (0)');
    console.log('   Ninguna línea escrita a mano repite lo que el motor ya cuenta solo.\n');
    console.log('TOTAL: 0 duplicadas — EL DETALLE NO SE REPITE');
} else {
    console.log(`\n## DUPLICADAS (${dups.length}) — hay que borrarlas`);
    console.log('   Estas líneas las escribe ya el automático desde `_statMods`, con la gramática');
    console.log('   de §13 y su flecha. Escribirlas a mano saca la entrada -y la flecha- dos veces.');
    console.log('   Si de verdad NO mueve ese stat, va a EXENTAS con su motivo escrito.');
    dups.forEach(d => console.log(`   · ${d.carta}: "${d.texto}"`
        + (detalle ? `\n       habla de ${d.stat.toUpperCase()} (destino: ${d.quien})`
            + (d.delta !== null ? `, y la carta declara \`stats: { ${d.stat}: ${d.delta} }\`` : '') : '')));
    console.log(`\nTOTAL: ${dups.length} duplicadas — EL DETALLE SE REPITE`);
    process.exit(1);
}
