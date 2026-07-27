// tests/regresion25.js — Tanda de contadores/acumuladores: Xidachane, Karolina y
// Fanático migrados al DSL. Sus Activas (que incrementan los contadores propios)
// SIGUEN IMPERATIVAS a propósito: solo la PASIVA continua (reaplicar el bonus
// acumulado, o recomputarlo desde el tablero) pasa a PASIVA_CONTINUA.
//
// Gladiador y Kazuo NO se migran en esta tanda (documentado, no es un "TODO"
// vago): comparten un patrón de "anexo aliado, +stat mientras dure la unión"
// que es una mini-arquitectura propia (vínculo válido/roto, limpieza del array
// `attachments`, flecha del detalle) — mezclar eso dentro de PASIVA_CONTINUA
// habría sido forzarlo; mejor un trigger dedicado en una tanda futura.
//
// Piezas nuevas del intérprete en esta tanda:
//   · `{REF:"...", factor:N}` en DSL._value: multiplica el valor referenciado
//     (Xidachane: Atq/Def suben 2 por cada contador). Si el REF no resuelve
//     (undefined), se propaga tal cual — NO se convierte en 0 aquí, porque
//     FIJAR_STAT depende de recibir undefined para saber que debe omitirse sin
//     abortar la cadena (Plan de equipo con la elección cancelada: bug real
//     encontrado por la pasada estricta al probar esto — el `|| 0` inicial se
//     había puesto en DSL._value en vez de en _passiveDeltas, y rompía esa
//     detección para CUALQUIER carta con un FIJAR_STAT sobre {REF:"vars..."}).
//     El `|| 0` de seguridad para pasivas vive LOCAL en _passiveDeltas.
//   · Op nuevo TECHO_STAT: simétrico de SUELO_STAT pero como techo, con un
//     valor FIJO (no la base de plantilla) — "Def máxima 6" de Karolina.
//     Mismo tratamiento que SUELO_STAT: CLAMP FINAL en updatePassives, después
//     de equipos/eventos/temporales, no dentro de la propia pasiva.
//   · PASIVA_CONTINUA admite el stat "hp" (Vida Máx.) en MODIFICAR_STAT. A
//     diferencia de atk/def, maxHp NO se resetea cada pasada — así que el
//     valor calculado es el TOTAL vigente, no un delta a sumar; el compilador
//     compara con lo aportado en la pasada anterior y aplica solo la
//     diferencia (mismo criterio que usaban a mano Fanático/Xidachane/
//     Gladiador), con el mismo suelo de seguridad a 1 de Vida. Se anuncia
//     junto a Def/Atq en el orden Vida -> Def -> Atq. Bug real encontrado y
//     corregido: el bloque de aplicación estaba condicionado a `if (d.hp)`,
//     así que cuando el bono volvía a 0 (d.hp=0, falsy) el diff negativo
//     nunca se aplicaba y la Vida Máx. se quedaba hinchada para siempre.
//   · El registro de "Afectado por:" (index.html) suma por stat DENTRO de un
//     mismo grupo en vez de concatenar strings sueltas — bug real encontrado
//     con Karolina: el bono (+5 DEF) y el techo (-2 DEF) de la MISMA pasiva
//     salían como dos líneas ("+5 DEF y -2 DEF, fuente: ...") en vez de netear
//     a "+3 DEF, fuente: ...".
//   · harness.js gana excepciones de diff inerte para el bookkeeping nuevo:
//     _dslPasHpN, _sueloAvisado, y la dirección vieja=número->nueva=ausente de
//     xidachaneBoosts/karolinaDefBoosts/fanaticoBoost (la vieja los
//     inicializaba a mano dentro de su onUpdatePassive imperativo; la pasiva
//     DSL solo los LEE, nunca los escribe — ambos lados los tratan como 0 si
//     faltan, así que la diferencia es inerte).
//
// Nota importante sobre el guion de los escenarios ESTÁTICOS (pasos: []): el
// harness limpia logs y flotantes tras construirEstado (el estado arranca
// "limpio" para la comparación), así que el aviso de una pasiva que se activa
// SOLO durante el montaje inicial nunca es comparable — ni falta ni sobra
// nada que declarar. La tanda incluye un escenario CON pasos (matar al aliado
// Monstruo de Fanático) precisamente para poder comparar el aviso de verdad.

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'Xidachane: reaplica +2 Atq/Def por cada contador acumulado',
        p1: { vanguardia: [{ carta: 'Xidachane', campos: { xidachaneBoosts: 2 } }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [],
        logsIntencionados: [],
    },
    {
        nombre: 'Xidachane: sin contadores, stats en su base',
        p1: { vanguardia: ['Xidachane'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [],
        logsIntencionados: [],
    },
    {
        nombre: 'Karolina: reaplica sus bufos de Def y respeta el techo de 6',
        p1: { vanguardia: [{ carta: 'Karolina', campos: { karolinaDefBoosts: 5 } }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [],
        logsIntencionados: [],
    },
    {
        nombre: 'Karolina: sin bufos, Def en su base (no llega al techo)',
        p1: { vanguardia: ['Karolina'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [],
        logsIntencionados: [],
    },
    {
        nombre: 'Fanático: sube Vida Máx./Def/Atq por cada aliado Ser mágico-Monstruo (tope 3)',
        p1: { vanguardia: ['Fanático', 'Raiju', { carta: 'Raiju', furor: 0 }] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [],
        logsIntencionados: [],
    },
    {
        // Transición real (no solo estado estático): mata al único aliado Monstruo y
        // comprueba que el bono desaparece del todo, VIDA MÁX. incluida (a diferencia de
        // Atq/Def, que se resetean solos cada pasada, maxHp es persistente — ver el bug
        // real documentado arriba: se quedaba hinchada al desactivarse antes del arreglo).
        nombre: 'Fanático: al morir su único aliado Monstruo, el bono desaparece (Vida Máx. incluida)',
        turnoDe: 'p2',
        p1: { vanguardia: ['Fanático', 'Raiju'] },
        p2: { vanguardia: ['Garret'] },
        pasos: [
            { atacar: 'Garret', objetivo: 'Raiju' }, // dmg = 9-4 = 5 -> Raiju (hp2) muere
        ],
        logsIntencionados: [
            { de: '[ability] ¡ADORACIÓN PERVERSA! Fanático siente el poder de los monstruos (-1 a todo).',
              a: '[system] ADORACIÓN PERVERSA (Fanático [1] (J1 (Jugador 1))) desactivada.',
              motivo: 'anuncio estandarizado al formato genérico de PASIVA_CONTINUA: al llegar a 0 usa la frase fija "desactivada" (tipo system), la vieja seguía usando su "(-1 a todo)" de siempre (tipo ability) también para el caso de desactivación total' },
        ],
        flotantesSoloVieja: [
            { linea: '-1 A TODO · ft-red-stat', motivo: 'la vieja emitía un flotante también al desactivarse del todo; el genérico, en la rama "desactivada", no emite ningún flotante (mismo criterio que Karlos/Zoe)' },
        ],
    },
];

correrSuite('regresion25', escenarios);
