// tests/regresion39.js — Agah migrado al DSL (30-jul-2026): "sus ataques normales
// cuestan 1 Furor" (Pasiva) + DEVASTACIÓN AGAH.
//
// La Pasiva se parte en dos triggers ya existentes: PUEDE_ATACAR (gatea el clic-
// y-atacar de siempre, igual que Muro parlante) + GLOBAL_ANTES_DE_ATAQUE con
// soloAtacante:"SELF" (descubierto el 30-jul-2026 al revisar esta carta: ese
// trigger NO es solo para Eventos — collectAttackInterceptors, §11 en index.html,
// recorre TODAS las cartas del tablero, no solo el Evento activo) + el nuevo flag
// soloAtaqueDirecto, que replica el `if (!game.abilityContext)` de la vieja: la
// Activa ya cuesta 2 Furor por su cuenta y no debe pagar además este coste por
// ataque.
//
// DEVASTACIÓN AGAH es "2 ataques normales al mismo enemigo": target cantidad 1 +
// dos ops ATACAR seguidos contra el mismo objetivo (performAttack se auto-protege
// si el atacante o el objetivo mueren/desaparecen entre medias, así que no hace
// falta ningún bucle a mano).
//
// Bug real de MOTOR encontrado y corregido, no replicado (ver el comentario junto
// al op ATACAR en cartas.js): performAttack pone SIEMPRE game.abilityContext a
// null al terminar, asumiendo que es el único golpe de la acción en curso. Con 2
// ATACAR seguidos (o, en la vieja, 2 performAttack a mano), el 2º golpe ya ve el
// contexto a null — y como la propia Pasiva de Agah mira ese contexto para saber
// si cobrar el Furor por ataque, el 2º golpe de DEVASTACIÓN AGAH se trataba como
// un ataque SUELTO: bloqueado en seco si el Furor ya estaba a 0 tras pagar el
// coste de la Activa (2F, exactamente lo que cuesta la propia Activa — el caso
// más común), o cobrado de más si sobraba Furor. El fix (restaurar
// game.abilityContext tras cada performAttack, en el op ATACAR) es del INTÉRPRETE
// y beneficia a cualquier futura carta con el mismo patrón "N ataques en una
// Activa", no solo a Agah.
//
// Se queda imperativa: inmunidad a daño especial (onBeforeTakeDamage, sin trigger DSL).

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'Agah: ataque normal simple cuesta 1 Furor de su propia Pasiva',
        p1: { vanguardia: [ { carta: 'Agah', furor: 2 } ] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { atacar: 'Agah', objetivo: 'Mini-tigre' } ],
    },
    {
        nombre: 'Agah no puede atacar normal sin Furor (PUEDE_ATACAR)',
        p1: { vanguardia: [ { carta: 'Agah', furor: 0 } ] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [ { atacar: 'Agah', objetivo: 'Mini-tigre' } ],
    },
    {
        // Furor exacto al coste de la Activa (2): el caso donde el bug de la vieja se
        // manifiesta como BLOQUEO total del 2º golpe (Furor a 0 tras pagar la Activa,
        // el 2º golpe se trata como suelto y game.furor<1 lo rechaza en seco).
        nombre: 'DEVASTACIÓN AGAH: 2 ataques normales al mismo enemigo, sin coste extra por golpe',
        p1: { vanguardia: [ { carta: 'Agah', furor: 2 } ] },
        p2: { vanguardia: [ { carta: 'Mini-tigre', vida: 10 } ] },
        pasos: [
            { habilidad: 'Agah' },
            { confirmar: true },
            { elegir: ['Mini-tigre'] },
        ],
        logsSoloVieja: [
            { linea: '¡DEVASTACIÓN AGAH! Golpe', motivo: 'anuncio narrativo por golpe de la vieja ("Golpe 1...", "Golpe 2..."); la nueva se apoya en el floater del nombre de la Activa, mismo criterio que Aniceto/Guardia' },
        ],
        diferenciasEsperadas: [
            { contiene: 'estado.p2.vanguard.0.currentHp',
              motivo: 'bug real de motor (ver comentario arriba y junto a ATACAR en cartas.js): la vieja bloquea en seco el 2º golpe porque su propia Pasiva ve game.abilityContext ya a null (performAttack lo resetea) y trata el golpe como suelto, con Furor a 0 tras pagar la Activa. La nueva restaura el contexto entre golpes y sí conecta los dos.' },
            { contiene: 'recibe 4 daño', motivo: 'consecuencia del mismo bug: log del 2º golpe, que en la vieja nunca llega a producirse' },
            { contiene: '-4 VIDA', motivo: 'consecuencia del mismo bug: floater de daño del 2º golpe, ausente en la vieja' },
        ],
    },
    {
        // Furor SOBRANTE tras pagar la Activa: aquí el bug de la vieja se manifiesta
        // al REVÉS — no bloquea, pero "filtra" 1 Furor de más en el 2º golpe (al
        // tratarlo como ataque suelto, que sí tiene Furor de sobra para pagarlo).
        nombre: 'DEVASTACIÓN AGAH: con Furor de sobra, no se filtra un coste extra en el 2º golpe',
        p1: { vanguardia: [ { carta: 'Agah', furor: 5 } ] },
        p2: { vanguardia: [ { carta: 'Mini-tigre', vida: 10 } ] },
        pasos: [
            { habilidad: 'Agah' },
            { confirmar: true },
            { elegir: ['Mini-tigre'] },
        ],
        logsSoloVieja: [
            { linea: '¡DEVASTACIÓN AGAH! Golpe', motivo: 'ver escenario anterior' },
        ],
        flotantesSoloVieja: [
            { linea: '-1 FUR', motivo: 'bug real de motor: la vieja cobra 2 (Activa) + 1 (Pasiva "suelta" del 2º golpe, al ver game.abilityContext ya a null) = 3 Furor en total, con su propio floater; la nueva cobra los 2 de la Activa y nada más, que es lo que dice el texto de la carta ("DEVASTACIÓN AGAH (2F)")' },
        ],
        diferenciasEsperadas: [
            { contiene: 'estado.p1.vanguard.0.furor',
              motivo: 'consecuencia del mismo bug: la vieja termina con 2 Furor (5-2-1), la nueva con 3 (5-2), fiel al coste que dice el texto de la carta' },
        ],
    },
    {
        nombre: 'DEVASTACIÓN AGAH rechazada: solo hay un enemigo Oculto en vanguardia',
        p1: { vanguardia: [ { carta: 'Agah', furor: 2 } ] },
        p2: { vanguardia: [ { carta: 'Mini-tigre', campos: { stealth: true } } ] },
        pasos: [ { habilidad: 'Agah' } ],
    },
];

correrSuite('regresion39', escenarios);
