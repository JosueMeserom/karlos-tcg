// tests/auditar_costes.js — Habilidades que COBRAN ANTES de que el jugador elija.
//
// LA NORMA (Toto, 7-ago-2026, y repetida a gritos el 20-ago-2026): el Furor y el anuncio de una
// Activa no se aplican hasta que algo deja de poder deshacerse. Mientras el jugador sigue
// eligiendo objetivos no ha cambiado nada en el tablero, así que debe poder cancelar y que NO
// ocurra absolutamente nada: ni Furor gastado, ni carta agotada, ni anuncio al rival.
//
// El motor ya lo hace solo. El compilador de ACTIVA (cartas.js) lo DEDUCE:
//
//     const _hayVentanaCancelable = !!_p0 && (_p0.op === 'ELEGIR' || _p0.op === 'BUSCAR')
//                                        && _p0.cancelable !== false;
//     const _diferir = activa.costeDiferido !== undefined ? !!activa.costeDiferido : _hayVentanaCancelable;
//
// O sea que una carta solo puede incumplir la norma de DOS formas, y las dos son explícitas:
//   · poniendo `cancelable: false` en esa primera elección, que apaga la deducción;
//   · poniendo `costeDiferido: false` a mano, que es el override directo.
//
// Y ahí está la trampa que motivó esta auditoría: `cancelable: false` NO parece un interruptor
// del cobro. Parece que habla de la elección. Se copia de una carta hermana sin pensar -es lo que
// pasó con Erazor Djinn, copiada de Raiju- y la Activa se pone a cobrar por adelantado sin que
// nada lo avise. Ninguna suite lo veía: el escenario del harness elige siempre, nunca cancela, y
// al final del camino el Furor acaba igual de gastado.
//
//   node tests/auditar_costes.js            # resumen
//   node tests/auditar_costes.js --detalle  # con el primer efecto de cada una
//
// DEVUELVE ERROR si aparece una carta que cobra por adelantado y no está declarada abajo con su
// motivo. Cobrar antes de tiempo no es una decisión de diseño que se tome sin querer.
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

// La deducción se lee del FUENTE, no se copia aquí: si alguien cambia la heurística del
// compilador y no toca esto, la auditoría estaría midiendo una regla que ya no existe.
const SRC = fs.readFileSync(path.join(RAIZ, 'public/cartas.js'), 'utf8');
if (!/_hayVentanaCancelable\s*=\s*!!_p0 && \(_p0\.op === 'ELEGIR' \|\| _p0\.op === 'BUSCAR'\)\s*&& _p0\.cancelable !== false/.test(SRC)) {
    console.log('LA HEURÍSTICA DEL COMPILADOR HA CAMBIADO: revisar esta auditoría antes de fiarse.');
    process.exit(1);
}

// DECLARADAS: cartas que cobran por adelantado A SABIENDAS, con su motivo. Las cuatro que hay son
// anteriores a la norma y vienen de la base congelada, donde la Activa no se podía cancelar una
// vez confirmada; quitarles el flag les CAMBIA el comportamiento y hace divergir su suite
// viejo-vs-nuevo, así que es decisión de Toto y no un arreglo que se cuele en una tanda.
// Las cuatro que había (Garret, Gólem de tierra, Frikazo y Raiju) se arreglaron el mismo día:
// Toto decidió que manda la norma y no la fidelidad a la base congelada. "Siempre que tengas que
// hacer otra cosa antes de que el tablero ya cambie, entonces es cancelable". Sus suites declaran
// la diferencia de comportamiento.
const DECLARADAS = {
    // Pagar a ciegas ES la carta: "si no hay Mercenarios en el mazo, el pago se pierde igualmente".
    'Pago por adelantado|AL_CONSUMIR': 'el pago a ciegas es la mecánica de la carta, no un descuido: su propio texto dice que el Furor se pierde aunque la búsqueda falle.',
    // §12.bis: abrir el visor del MAZO es en sí mismo el punto de compromiso (mirarlo ya es leerlo).
    'Rezo en grupo|AL_CONSUMIR': 'lo que viene después es un BUSCAR en el MAZO, y abrir ese visor ES el punto de compromiso (§12.bis): no hay ventana que proteger.',
    'Hexagrama|AL_USAR_AYUDA': 'ídem: el BUSCAR posterior es en el mazo.',
    'Garret|AL_JUGAR': 'ídem: su búsqueda de Escudo mágico es en mazo/descartes y va detrás del tributo de colocación, que se paga al colocarla.',
};

// GUARDIÁN DEL FALLO SILENCIOSO (20-ago-2026). `DSL.compile` empieza llamando a `validate`, y si
// una carta no valida NO SE LE INSTALA NI UN HOOK: la carta existe, se puede jugar y no hace
// absolutamente nada. El único aviso es un console.error, que en las suites está anulado. Pasó al
// estrenar `target: { quien: "PAGADOR" }` sin añadirlo a la lista blanca `DSL.QUIEN`: Granada de
// maná se quedó muda y el escenario de su suite fallaba con "todo undefined", sin decir por qué.
// Vale para cualquier carta y cualquier error de validación, así que vive aquí y no en la suite
// de nadie.
const _noCompilan = CARD_DB.filter(c => Array.isArray(c.abilities) && c.abilities.length && !DSL_VAL(c));
function DSL_VAL(c) {
    // OJO: hay que interceptar el console.error DEL SANDBOX, no el de Node. La primera versión
    // pisaba el de Node y no cazaba nada -el validador escribe en el stub de dentro-, o sea que
    // la comprobación pasaba siempre. Verificado a posteriori quitando 'PAGADOR' de DSL.QUIEN:
    // ahora sí sale en rojo.
    const _err = sandbox.console.error; let malo = false;
    sandbox.console.error = () => { malo = true; };
    try { vm.runInContext('DSL', sandbox).validate(c); } catch (e) { malo = true; }
    sandbox.console.error = _err;
    return !malo;
}

const malas = [], declaradas = [], bien = [];

for (const c of CARD_DB) {
    for (const a of (Array.isArray(c.abilities) ? c.abilities : [])) {
        if (a.trigger === 'ACTIVA') {
            const coste = (a.coste && typeof a.coste.furor === 'number') ? a.coste.furor
                        : (typeof c.activeCost === 'number' ? c.activeCost : 0);
            if (!coste) continue;                       // sin coste no hay nada que cobrar antes
            const p0 = (a.efectos || [])[0];
            if (!p0) continue;
            const esEleccion = p0.op === 'ELEGIR' || p0.op === 'BUSCAR';
            if (!esEleccion) { bien.push({ carta: c.name, hab: a.nombre, por: `su primer efecto (${p0.op}) ya es irreversible: se cobra al instante, como debe` }); continue; }

            const clave = `${c.name}|${a.nombre}`;
            const porFlag = p0.cancelable === false;
            const porOverride = a.costeDiferido === false;
            if (!porFlag && !porOverride) { bien.push({ carta: c.name, hab: a.nombre, por: 'abre una elección cancelable: el cobro espera' }); continue; }

            const fila = { carta: c.name, hab: a.nombre, coste, p0: p0.op,
                           causa: porFlag ? '`cancelable: false` en su primera elección' : '`costeDiferido: false`',
                           motivo: DECLARADAS[clave] || null };
            (fila.motivo ? declaradas : malas).push(fila);
            continue;
        }

        // AYUDAS Y EVENTOS (20-ago-2026). La primera versión de esta auditoría solo miraba las
        // Activas, y el MISMO fallo estaba vivo en PEM -una Ayuda- sin que nadie lo viera: pagabas
        // al elegir pagador y solo DESPUÉS te preguntaba a quién paralizar, con la elección
        // marcada `cancelable: false` para rematar. Aquí la forma es otra: no hay un `coste:` de
        // ability, hay un efecto con `esCoste` y la pregunta es si DESPUÉS de él queda alguna
        // elección — porque entonces has pagado por algo que aún no has decidido.
        const lista = a.efectos || [];
        let iCoste = -1;
        lista.forEach((e, i) => {
            const propio = e.esCoste || (e.efectos || []).some(x => x.esCoste);
            if (propio && iCoste === -1) iCoste = i;
        });
        if (iCoste === -1) continue;
        const despues = lista.slice(iCoste + 1).filter(e => e.op === 'ELEGIR' || e.op === 'BUSCAR');
        if (!despues.length) { bien.push({ carta: c.name, hab: a.trigger, por: 'su coste es lo último que queda por decidir' }); continue; }
        const clave = `${c.name}|${a.trigger}`;
        const fila = { carta: c.name, hab: a.trigger, coste: 'esCoste', p0: despues[0].op,
                       causa: `paga y DESPUÉS abre un ${despues[0].op}` + (despues[0].cancelable === false ? ' que ni siquiera se puede cancelar' : ''),
                       motivo: DECLARADAS[clave] || null };
        (fila.motivo ? declaradas : malas).push(fila);
    }
}

console.log('AUDITORÍA DE COSTES COBRADOS ANTES DE TIEMPO\n');
if (_noCompilan.length) {
    console.log(`## CARTAS QUE NO COMPILAN (${_noCompilan.length}) — mudas, sin un solo hook`);
    _noCompilan.forEach(c => console.log(`   · ${c.name}`));
    console.log('\nHay cartas que el DSL rechaza. No hacen NADA en la partida.');
    process.exit(1);
}
console.log(`Revisadas ${CARD_DB.length} cartas. Solo entran las Activas CON coste en Furor.\n`);

console.log(`## Cumplen la norma (${bien.length})`);
console.log('   O esperan a la primera elección, o no tienen ventana que esperar.');
if (detalle) bien.forEach(f => console.log(`   · ${f.carta} [${f.hab}] — ${f.por}`));
else console.log('   (--detalle para verlas una a una)');

console.log(`\n## Cobran por adelantado A SABIENDAS (${declaradas.length})`);
console.log('   Declaradas aquí arriba con su motivo. No son un despiste, son una deuda conocida.');
declaradas.forEach(f => console.log(`   · ${f.carta} [${f.hab}], ${f.coste} de Furor — ${f.causa}`
    + (detalle ? `\n       ${f.motivo}` : '')));

if (!malas.length) {
    console.log('\n## SIN DECLARAR (0)');
    console.log('   Ninguna Habilidad cobra el Furor antes de que el jugador pueda arrepentirse.\n');
    console.log('TOTAL: 0 cartas cobran por adelantado sin declararlo');
} else {
    console.log(`\n## SIN DECLARAR (${malas.length}) — INCUMPLEN LA NORMA DEL COSTE`);
    console.log('   Cobran el Furor al confirmar la Habilidad, antes de elegir objetivo, y el');
    console.log('   jugador ya no puede arrepentirse gratis. Casi siempre es un `cancelable:');
    console.log('   false` copiado de otra carta sin querer: quitarlo suele ser todo el arreglo.');
    malas.forEach(f => console.log(`   · ${f.carta} [${f.hab}], ${f.coste} de Furor — ${f.causa}`));
    console.log(`\nTOTAL: ${malas.length} cartas cobran antes de tiempo`);
    process.exit(1);
}
