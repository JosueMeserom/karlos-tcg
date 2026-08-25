// tests/regresion72.js — Sadame (RAÍCES NINJA + ZOMBIFICAR), que no tenía ninguna suite propia.
//
// Se escribe al migrarla al DSL. Era, con Silhouette, de las cartas con más código a mano del
// fichero: ocho hooks, ninguno comprobado. Los caminos que tiene:
//   · RAÍCES NINJA, sus dos mitades: +1 de Furor cuando el Furor viene de una CARTA (no de la
//     fase) y la expansión de Vida máxima al curarse de más CON UNA AYUDA (hasta 6).
//   · ZOMBIFICAR anexando y ZOMBIFICAR soltando: la Habilidad pregunta cuál de las dos SOLO si
//     ya hay zombis en pie, y soltar admite "hasta todos" (el patrón de AL-FÉNIX).
//   · La regeneración de 2 al zombi al final de su turno.
//
// LA HABILIDAD CAMBIA A PROPÓSITO (Toto, 26-ago-2026), al reescribir su texto. Frente a la base
// congelada, que abría un modal de dos botones SIEMPRE que hubiera anexos y cuyo botón de
// deshacer los soltaba TODOS de golpe:
//   · sin zombis en pie no hay nada que preguntar y va directa a elegir a quién zombificar;
//   · con zombis pregunta, y el modal lleva CANCELAR (norma del coste: hasta que no se toca un
//     anexo no se ha gastado nada);
//   · soltar es una elección "hasta N" sobre el tablero, con reborde verde y botón de parar,
//     igual que AL-FÉNIX: sueltas los que quieras, uno o todos.
// Los escenarios de la segunda activación comparan justo eso, con la vieja parada en su modal.
// De paso desaparece su aviso de confirmación (getAbilityWarning): ya no hay nada que avisar.
'use strict';
const { correrSuite } = require('./harness');

// La base congelada nombra a Sadame a secas en estos logs; la norma del proyecto es que todo log
// visible por ambos lleve el dueño de la carta, y es lo que rellenan {carta}/{objetivo} en el DSL.
const NOMBRE = {
    logsIntencionados: [
        { de: 'Sadame anexa a', a: 'Sadame de J1 (Jugador 1) anexa a',
          motivo: 'la vieja escribía card.name a secas; la norma es getCardNameWithOwner' },
        { de: '¡RAÍCES NINJA otorga +1 Furor extra a Sadame!',
          a: '¡RAÍCES NINJA otorga +1 Furor extra a Sadame de J1 (Jugador 1)!', motivo: 'ídem' },
        { de: 'Sadame expande su Vida máxima a', a: 'Sadame de J1 (Jugador 1) expande su Vida máxima a',
          motivo: 'ídem' },
        { de: 'Sadame deshace todos sus anexos.', a: 'Sadame de J1 (Jugador 1) deshace todos sus anexos.',
          motivo: 'ídem' },
        // Diferencia que NO nace de esta migración: Karlos ya estaba migrado, y el anuncio de
        // pasiva desactivada usa desde entonces la frase genérica del compilador (ver regresion25).
        { de: 'MEGADRENALINA (Karlos de J1 (Jugador 1)) desactivada.',
          a: 'Habilidad pasiva de Karlos de J1 (Jugador 1): MEGADRENALINA desactivada.',
          motivo: 'anuncio estandarizado de PASIVA_CONTINUA, ajeno a Sadame' },
        { de: 'Longaniza da 1 de Furor', a: 'Longaniza [1] de J1 (Jugador 1) da 1 de Furor',
          motivo: 'ídem: Longaniza ya estaba migrada y nombra su carta con dueño' },
        { de: 'Manzanahoria cura 2 de Vida', a: 'Manzanahoria [1] de J1 (Jugador 1) cura 2 de Vida',
          motivo: 'ídem con Manzanahoria' },
    ],
};

// Solo para los escenarios en los que el zombi llega a regenerar: el flotante de esa curación
// nombra ahora a quien la causa. Fuera de NOMBRE a propósito, que si no reescribiría también
// el "+2 VIDA" de una Manzanahoria, que no viene de Sadame.
const REGEN = {
    flotantesIntencionados: [
        { de: '+2 VIDA · ft-green', a: '+2 VIDA (Sadame) · ft-green',
          motivo: 'el flotante automático nombra la carta que causa el cambio desde el 5-ago-2026: un "+2" suelto no decía de dónde salía' },
    ],
};

// `esZombi` (la marca que le cierra las Ayudas de curación al anexado) no existe en la base
// congelada: se añadió a la Sadame viva después de tomarse la foto. Solo aparece si al terminar
// el escenario queda algún zombi puesto.
const ZOMBI = {
    diferenciasEsperadas: [
        { contiene: '.esZombi', motivo: 'campo posterior a la base congelada; marca al zombi para que no pueda recibir Ayudas de curación' },
    ],
};

const escenarios = [
    {
        // Un solo aliado apto y ningún anexo: no hay nada que preguntar, va directo a anexar.
        nombre: 'ZOMBIFICAR anexa a un aliado Ser vivo',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [ { carta: 'Sadame', furor: 2 }, { carta: 'Karlos', vida: 3 } ] },
        p2: { vanguardia: ['Mini-tigre'] },
        ...NOMBRE, ...ZOMBI,
        pasos: [
            { habilidad: 'Sadame' }, { confirmar: true },
            { elegir: ['Karlos'] },
        ],
    },
    {
        // Y al final de SU turno, el zombi regenera 2 (Karlos entra a 3 de 6).
        nombre: 'El zombi regenera 2 al final del turno de Sadame',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [ { carta: 'Sadame', furor: 2 }, { carta: 'Karlos', vida: 3 } ] },
        p2: { vanguardia: ['Mini-tigre'] },
        ...NOMBRE, ...ZOMBI, ...REGEN,
        pasos: [
            { habilidad: 'Sadame' }, { confirmar: true },
            { elegir: ['Karlos'] },
            { finTurno: true },
        ],
    },
    {
        // Cancelar la elección no cuesta Furor ni la acción: todavía no ha cambiado nada.
        nombre: 'ZOMBIFICAR: cancelar la elección no cuesta nada',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [ { carta: 'Sadame', furor: 2 }, 'Karlos' ] },
        p2: { vanguardia: ['Mini-tigre'] },
        // La vieja no abre una elección del DSL, sino su propia selección de objetivos: el paso
        // es solo para la nueva. El estado final es el mismo en las dos: nadie ha pagado nada.
        diferenciasEsperadas: [
            { contiene: 'pendingAbilityTarget', motivo: 'la vieja deja su selección abierta; la nueva la ha cancelado' },
        ],
        pasos: [
            { habilidad: 'Sadame' }, { confirmar: true },
            { soloEn: 'nueva', cancelar: true },
        ],
    },
    {
        // EL TOGGLE: señalar al zombi lo suelta. La vieja, en su lugar, abre su modal de ramas
        // (o deshace directamente si no queda nadie más), así que a partir de la segunda
        // activación los caminos se separan y solo corre la nueva.
        nombre: 'ZOMBIFICAR sobre el propio zombi deshace su anexo',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [ { carta: 'Sadame', furor: 2 }, { carta: 'Karlos', vida: 3 } ] },
        p2: { vanguardia: ['Mini-tigre'] },
        ...NOMBRE, ...REGEN,
        logsSoloNueva: [
            { linea: 'deshace el anexo de Karlos', motivo: 'regla nueva de Toto (25-ago-2026): se suelta al zombi que señalas; la vieja se queda en su modal de dos botones' },
        ],
        flotantesSoloNueva: [
            { linea: 'ZOMBIFICAR · ft-ability', ocurrencia: 3,
              motivo: 'la segunda activación (la que suelta) solo ocurre en la nueva; los dos primeros carteles -anexo y regeneración- salen en las dos' },
            { linea: '-1 FUR', ocurrencia: 2, motivo: 'ídem: el Furor de esa segunda activación' },
        ],
        diferenciasEsperadas: [
            { contiene: 'p1.vanguard.0.furor', motivo: 'la vieja no llega a resolver la segunda activación: se queda con el modal abierto' },
            { contiene: 'p1.vanguard.0.exhausted', motivo: 'ídem' },
            { contiene: 'p1.vanguard.0.attachments', motivo: 'la nueva ha soltado a Karlos' },
            { contiene: 'p1.vanguard.1.attachedTo', motivo: 'ídem, por el otro lado del vínculo' },
            { contiene: 'p1.vanguard.1.reverseArrow', motivo: 'ídem con la flecha' },
        ],
        pasos: [
            { habilidad: 'Sadame' }, { confirmar: true },
            { elegir: ['Karlos'] },
            { finTurno: true }, { finTurno: true },
            { soloEn: 'nueva', habilidad: 'Sadame' },
            { soloEn: 'nueva', confirmar: true },
            { soloEn: 'nueva', elegir: ['Karlos'] },     // el mismo: lo suelta
        ],
    },
    {
        // Y con otro aliado sano al lado, señalarlo a ÉL lo zombifica también: dos zombis a la
        // vez. La vieja pregunta primero con su modal, así que la segunda activación es de la nueva.
        nombre: 'ZOMBIFICAR: un segundo zombi a la vez',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [ { carta: 'Sadame', furor: 3 }, { carta: 'Karlos', vida: 3 }, { carta: 'Kyle', vida: 2 } ] },
        p2: { vanguardia: ['Mini-tigre'] },
        ...NOMBRE, ...ZOMBI, ...REGEN,
        logsSoloNueva: [
            { linea: 'anexa a Kyle', motivo: 'la vieja se para en su modal de dos botones antes de dejar elegir' },
        ],
        flotantesSoloNueva: [
            { linea: 'ZOMBIFICAR · ft-ability', ocurrencia: 3, motivo: 'la segunda activación solo ocurre en la nueva' },
            { linea: '-1 FUR', ocurrencia: 2, motivo: 'ídem: su Furor' },
        ],
        diferenciasEsperadas: [
            { contiene: 'p1.vanguard.0.furor', motivo: 'la vieja no resuelve la segunda activación' },
            { contiene: 'p1.vanguard.0.exhausted', motivo: 'ídem' },
            { contiene: 'p1.vanguard.0.attachments', motivo: 'la nueva acaba con dos zombis' },
            { contiene: 'p1.vanguard.2.attachedTo', motivo: 'ídem, por el lado de Kyle' },
            { contiene: 'p1.vanguard.2.reverseArrow', motivo: 'ídem con su flecha' },
            { contiene: 'p1.vanguard.1.esZombi', motivo: 'el primer zombi (ZOMBI declara el genérico, aquí hacen falta los dos)' },
            { contiene: 'p1.vanguard.2.esZombi', motivo: 'y el segundo' },
        ],
        pasos: [
            { habilidad: 'Sadame' }, { confirmar: true },
            { elegir: ['Karlos'] },
            { finTurno: true }, { finTurno: true },
            { soloEn: 'nueva', habilidad: 'Sadame' },
            { soloEn: 'nueva', confirmar: true },
            { soloEn: 'nueva', opcion: 'ZOMBIFICAR A UN ALIADO' },
            { soloEn: 'nueva', elegir: ['Kyle'] },
        ],
    },
    {
        // La otra mitad de RAÍCES NINJA: curarse de MÁS con una Ayuda le sube la Vida máxima
        // (hasta 6). Herida a 1 de 2, Manzanahoria cura 2: le sobra una, y ahí es donde crece.
        // (A Vida llena no vale: Manzanahoria solo cura aliados heridos, en las dos bases.)
        nombre: 'RAÍCES NINJA: la Ayuda que cura de más le expande la Vida máxima',
        flotantesSoloNueva: [
            { linea: 'RAÍCES NINJA · ft-ability', motivo: 'el SOBRECURACION genérico anuncia la Pasiva con su cartel, además del "+N VIDA MÁX."; la vieja solo pintaba el número' },
        ],
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [ { carta: 'Sadame', vida: 1 } ], mano: ['Manzanahoria'] },
        p2: { vanguardia: ['Mini-tigre'] },
        ...NOMBRE,
        pasos: [
            { jugar: 'Manzanahoria' },
            { elegir: ['Sadame'] },
        ],
    },
    {
        // RAÍCES NINJA: el Furor que viene de una CARTA (aquí Bebida energética) trae +1.
        nombre: 'RAÍCES NINJA: +1 de Furor extra de las cartas',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [ { carta: 'Sadame', furor: 0 } ], mano: ['Longaniza'] },
        p2: { vanguardia: ['Mini-tigre'] },
        ...NOMBRE,
        pasos: [
            { jugar: 'Longaniza' },
            { elegir: ['Sadame'] },
        ],
    },
    {
        // SOLTAR VARIOS. Aquí las dos bases van EN PARALELO, cada una por su camino: la vieja
        // con sus botones ('ANEXAR NUEVO ALIADO' / 'DESHACER TODOS LOS ANEXOS') y la nueva con
        // los suyos, eligiendo a los zombis en el tablero. Acaban en el mismo sitio -los dos
        // zombis puestos y luego los dos sueltos-, así que lo que compara el escenario es
        // justamente eso: mismo resultado, distinto camino.
        nombre: 'ZOMBIFICAR suelta a varios zombis de una vez',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        // Dos Esbirros pelados como zombis (Mini-tigre, sin Pasiva ni texto) y con 1 de Vida:
        // así las dos regeneraciones curan lo mismo en las dos bases y el diff no se llena de
        // ruido ajeno a Sadame.
        p1: { vanguardia: [ { carta: 'Sadame', furor: 4 }, { carta: 'Mini-tigre', vida: 1 }, { carta: 'Oso con armadura', vida: 1 } ] },
        p2: { vanguardia: ['Robot de seguridad SP'] },
        ...NOMBRE, ...REGEN,
        logsSoloVieja: [
            { linea: 'deshace todos sus anexos', motivo: 'la vieja los soltaba TODOS de un botón; la nueva suelta los que elijas, uno por uno' },
        ],
        flotantesSoloNueva: [
            // El último cartel de la Habilidad: la nueva anuncia ZOMBIFICAR también al soltar,
            // la vieja solo lo sacaba al anexar. Los cuatro anteriores (dos anexos y dos
            // regeneraciones) salen en las dos bases.
            { linea: 'ZOMBIFICAR · ft-ability', ocurrencia: 5,
              motivo: 'el compilador de ACTIVA anuncia la Habilidad también en la rama de soltar' },
        ],
        logsSoloNueva: [
            { linea: 'deshace el anexo de Mini-tigre', motivo: 'ídem: un log por zombi soltado' },
            { linea: 'deshace el anexo de Oso con armadura', motivo: 'ídem' },
        ],
        pasos: [
            { habilidad: 'Sadame' }, { confirmar: true },
            { elegir: ['Mini-tigre'] },
            { finTurno: true }, { finTurno: true },
            { habilidad: 'Sadame' }, { confirmar: true },
            { soloEn: 'vieja', opcion: 'ANEXAR NUEVO ALIADO' },
            { soloEn: 'nueva', opcion: 'ZOMBIFICAR A UN ALIADO' },
            { elegir: ['Oso con armadura'] },
            { finTurno: true }, { finTurno: true },
            { habilidad: 'Sadame' }, { confirmar: true },
            // Ya no queda ningún 'Ser vivo' libre: NINGUNA de las dos pregunta ya -la vieja
            // porque se va derecha a deshacerlos todos, la nueva porque solo le queda una rama-.
            // La nueva sí pide a quién suelta; y al señalarlos a los dos
            // elegir a quién suelta, y al señalarlos a los dos (el cupo) arranca sola.
            { soloEn: 'nueva', elegir: ['Mini-tigre', 'Oso con armadura'] },
        ],
    },
    {
        // CANCELAR EL MODAL no cuesta nada: no se ha tocado ningún anexo todavía.
        nombre: 'ZOMBIFICAR: cancelar el modal no cuesta Furor ni la acción',
        turno: 2, turnoDe: 'p1', empieza: 'p2',
        p1: { vanguardia: [ { carta: 'Sadame', furor: 3 }, { carta: 'Karlos', vida: 3 }, { carta: 'Kyle', vida: 2 } ] },
        p2: { vanguardia: ['Mini-tigre'] },
        ...NOMBRE, ...ZOMBI, ...REGEN,
        // Las dos abren su modal en la segunda activación; la vieja no tiene botón de cancelar,
        // así que ahí se queda -por eso su paso es distinto- y el estado final es el mismo:
        // nadie ha pagado nada.
        diferenciasEsperadas: [
            { contiene: 'pendingAbilityTarget', motivo: 'la vieja se queda con su selección de objetivos abierta; la nueva ha cancelado del todo' },
            { contiene: 'p1.vanguard.1.esZombi', motivo: 'campo posterior a la base congelada (ver ZOMBI arriba); el zombi del primer uso sigue puesto' },
        ],
        pasos: [
            { habilidad: 'Sadame' }, { confirmar: true },
            { elegir: ['Karlos'] },
            { finTurno: true }, { finTurno: true },
            { habilidad: 'Sadame' }, { confirmar: true },
            // La vieja no tiene botón de cancelar: lo más parecido es entrar en 'anexar' y no
            // llegar a elegir a nadie. Acaba igual -sin cobrar y sin gastar la acción-, con su
            // selección de objetivos abierta.
            { soloEn: 'vieja', opcion: 'ANEXAR NUEVO ALIADO' },
            { soloEn: 'nueva', opcion: 'CANCELAR' },
        ],
    },
];

correrSuite('regresion72', escenarios);
