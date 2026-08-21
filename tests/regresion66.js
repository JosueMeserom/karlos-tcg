// tests/regresion66.js — Simon: ÚLTIMA RESISTENCIA, migrada al DSL (21-ago-2026).
//
// Era de las imperativas puras: la cuarteta completa a mano (canActivateAbility +
// onExecuteAbility + onValidateTarget + onTargetsReady) más sus dos hooks de marca temporal, todo
// para "ataca normal y esconde al resto de tu vanguardia hasta tu próximo turno". Lo único que le
// faltaba al DSL era `oculto` en MARCAR_TEMPORAL, que llegó con la tanda de marcas.
//
// Su Activa no estaba cubierta por NINGUNA suite (regresion12 solo prueba su inmunidad a Apagón),
// así que esto es cobertura nueva además de la comparación. Lo que se fija:
//   · el humo cubre al RESTO de la vanguardia y NO a Simon;
//   · dura hasta que vuelve a ser su turno, o sea el turno rival entero;
//   · y no toca la retaguardia, que el texto dice "vanguardia".
'use strict';
const { correrSuite } = require('./harness');

// La vieja escribía sus propios avisos de selección y nombraba a Simon a pelo. Las dos cosas
// cambian a propósito al pasar por el compilador.
const PROMPT_VIEJO = { linea: 'Elige objetivo para la Última Resistencia.',
    motivo: 'la vieja logueaba su prompt con logMsg (entra en el historial); la nueva usa el título del target del ACTIVA, que el picker enseña por logError (privado)' };

const escenarios = [
    {
        nombre: 'Simon: ÚLTIMA RESISTENCIA ataca y esconde al RESTO de su vanguardia',
        p1: { vanguardia: [{ carta: 'Simon', furor: 3 }, 'Karlos', 'Mini-tigre'], retaguardia: ['Hechicero'] },
        p2: { vanguardia: [{ carta: 'Oso con armadura' }] },
        pasos: [ { habilidad: 'Simon' }, { confirmar: true }, { elegir: ['Oso con armadura'] } ],
        logsSoloVieja: [PROMPT_VIEJO],
        logsIntencionados: [
            { de: 'El humo de su arma cubre al resto de la vanguardia.',
              a: 'El humo del arma de Simon de J1 (Jugador 1) cubre al resto de la vanguardia.',
              motivo: 'NORMA DEL PROYECTO: un log visible por los dos nombra la carta, no dice "su" -que en un registro compartido no se sabe de quién es-. La frase se escribe UNA vez para toda la tanda (`logUnaVez`), igual que la vieja' },
        ],
        diferenciasEsperadas: [
            { contiene: 'tempEffects.0.oculto', motivo: 'la marca ahora LLEVA ESCRITO que oculta, en vez de que lo haga un onUpdateTempEffect a mano de la carta' },
            { contiene: 'tempEffects.0.hastaInicioTurnoLanzador', motivo: 'ídem con la caducidad: la declara la marca en vez de un onStartTurnTempEffect' },
        ],
    },
    {
        // Lo que NO debe pasar: esconder a Simon (el texto dice "el RESTO") ni a la retaguardia.
        nombre: 'Simon: el humo no cubre ni a Simon ni a la retaguardia',
        p1: { vanguardia: [{ carta: 'Simon', furor: 3 }, 'Karlos'], retaguardia: ['Hechicero', 'Lolita'] },
        p2: { vanguardia: [{ carta: 'Oso con armadura' }] },
        pasos: [ { habilidad: 'Simon' }, { confirmar: true }, { elegir: ['Oso con armadura'] } ],
        logsSoloVieja: [PROMPT_VIEJO],
        logsIntencionados: [
            { de: 'El humo de su arma cubre al resto de la vanguardia.',
              a: 'El humo del arma de Simon de J1 (Jugador 1) cubre al resto de la vanguardia.',
              motivo: 'NORMA DEL PROYECTO: un log visible por los dos nombra la carta, no dice "su" -que en un registro compartido no se sabe de quién es-. La frase se escribe UNA vez para toda la tanda (`logUnaVez`), igual que la vieja' },
        ],
        diferenciasEsperadas: [
            { contiene: 'tempEffects.0.oculto', motivo: 'la marca lo declara en vez de un hook' },
            { contiene: 'tempEffects.0.hastaInicioTurnoLanzador', motivo: 'ídem con la caducidad' },
        ],
    },
    {
        nombre: 'Simon: ÚLTIMA RESISTENCIA rechazada sin enemigos en vanguardia',
        p1: { vanguardia: [{ carta: 'Simon', furor: 3 }, 'Karlos'] },
        p2: { retaguardia: ['Oso con armadura'] },
        pasos: [ { habilidad: 'Simon' } ],
    },
    {
        nombre: 'Simon: ÚLTIMA RESISTENCIA rechazada sin Furor suficiente',
        p1: { vanguardia: [{ carta: 'Simon', furor: 2 }, 'Karlos'] },
        p2: { vanguardia: ['Oso con armadura'] },
        pasos: [ { habilidad: 'Simon' } ],
        logsSoloVieja: [
            { linea: 'Falta Furor (3).',
              motivo: 'la vieja avisaba con logMsg (entra en el historial); el compilador usa logError, que es privado' },
        ],
    },
];

correrSuite('regresion66', escenarios);
