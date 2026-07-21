// tests/regresion13.js — Plan de equipo (1041) migrado al DSL sobre el punto
// único de intercepción (§11): primera carta cuya lógica de ataque combinado
// pasa de imperativa (vieja) a declarativa (nueva).
//   Nueva maquinaria cubierta: GLOBAL_ANTES_DE_ATAQUE con soloAtacante/unaVez/
//   efectos, ELEGIR con guardaSuma/guardaNombres, y el op FIJAR_STAT con
//   {REF:"vars.x"}.
// Cambio de estado deliberado (documentado en la carta): el candado de
// un-ataque vive ahora en la propia carta de evento (planUsado, exportado)
// en vez de en flags del jugador (que no se exportaban); se declara como
// diferencia esperada en los escenarios donde el interceptor llega a correr.

'use strict';
const { correrSuite } = require('./harness');

const PLAN_USADO = {
    contiene: 'estado.p1.activeEvent.planUsado',
    motivo: 'candado movido a la carta de evento (exportado y sincronizable); la vieja usaba p.planDeEquipoUsed, que no viajaba en exportGameState',
};

const escenarios = [
    {
        nombre: 'Plan de equipo rechazado con menos de 2 aliados',
        p1: { vanguardia: ['Oso con armadura'], mano: ['Plan de equipo'] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [
            { jugar: 'Plan de equipo' },
        ],
    },
    {
        nombre: 'Plan de equipo rechazado si ya se atacó este turno',
        p1: { vanguardia: [{ carta: 'Oso con armadura', furor: 0 }, 'Mini-tigre'], mano: ['Plan de equipo'] },
        p2: { vanguardia: ['Droide antidisturbios'] },
        pasos: [
            { atacar: 'Oso con armadura', objetivo: 'Droide antidisturbios' },
            { jugar: 'Plan de equipo' },
        ],
    },
    {
        nombre: 'Ataque combinado: el ATQ del atacante pasa a ser la suma de los 2 elegidos',
        p1: {
            vanguardia: [
                { carta: 'Mini-tigre', furor: 0 },              // atacante (atk 2)
                { carta: 'Oso con armadura', furor: 0 },        // elegido (atk 2)
                { carta: 'Droide antidisturbios', furor: 0 },   // elegido (atk 5) → suma 7
            ],
            mano: ['Plan de equipo'],
        },
        p2: { vanguardia: [{ carta: 'Robot de seguridad SP', furor: 0 }] }, // def 1: dmg 7-1=6, hp 4 → muere
        pasos: [
            { jugar: 'Plan de equipo' },
            { atacar: 'Mini-tigre', objetivo: 'Robot de seguridad SP' },
            { elegir: ['Oso con armadura', 'Droide antidisturbios'] },
        ],
        logsIntencionados: [
            { de: '¡Oso con armadura y Droide antidisturbios unen fuerzas! El ATQ de Mini-tigre sube a 7.',
              a: '¡Oso con armadura (J1 (Jugador 1)) y Droide antidisturbios (J1 (Jugador 1)) unen fuerzas! El ATQ de Mini-tigre (J1 (Jugador 1)) sube a 7.',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba chosen[n].name y attacker.name a secas; la nueva rellena {duo}/{objetivo} con DSL._nombre' },
        ],
        diferenciasEsperadas: [PLAN_USADO],
    },
    {
        nombre: 'Segundo ataque del turno bloqueado por el candado de Plan de equipo',
        p1: {
            vanguardia: [
                { carta: 'Mini-tigre', furor: 0 },
                { carta: 'Oso con armadura', furor: 0 },
                { carta: 'Droide antidisturbios', furor: 0 },
            ],
            mano: ['Plan de equipo'],
        },
        p2: { vanguardia: [{ carta: 'Robot de seguridad SP', vida: 4, def: 6 }, 'Gallina del infinito'] },
        pasos: [
            { jugar: 'Plan de equipo' },
            { atacar: 'Mini-tigre', objetivo: 'Robot de seguridad SP' },
            { elegir: ['Oso con armadura', 'Droide antidisturbios'] }, // dmg 7-6=1: sobrevive
            // CAMBIO pedido por Toto (21-jul-2026): el veto ahora salta AL CLICAR al
            // atacante (onVetoAttackStart, §11b), no justo antes del golpe. La vieja
            // dejaba llegar a performAttack y AGOTABA al atacante vetado; la nueva
            // le conserva la acción.
            { atacar: 'Droide antidisturbios', objetivo: 'Gallina del infinito' },
        ],
        logsIntencionados: [
            { de: '¡Oso con armadura y Droide antidisturbios unen fuerzas! El ATQ de Mini-tigre sube a 7.',
              a: '¡Oso con armadura (J1 (Jugador 1)) y Droide antidisturbios (J1 (Jugador 1)) unen fuerzas! El ATQ de Mini-tigre (J1 (Jugador 1)) sube a 7.',
              motivo: 'norma del proyecto (logs en 3ª persona con dueño): la vieja usaba chosen[n].name y attacker.name a secas; la nueva rellena {duo}/{objetivo} con DSL._nombre' },
        ],
        diferenciasEsperadas: [
            PLAN_USADO,
            { contiene: 'estado.p1.vanguard.2.exhausted',
              motivo: 'veto temprano pedido por Toto: la vieja bloqueaba en performAttack y AGOTABA al atacante vetado; la nueva veta al clic y le conserva la acción' },
            { contiene: 'estado.p1.vanguard.2.hasAttackedThisTurn',
              motivo: 'ídem: en la nueva el atacante vetado ni siquiera llega a contar como que atacó' },
        ],
    },
    {
        nombre: 'Elección cancelada: el ataque procede sin boost y el candado queda marcado',
        p1: {
            vanguardia: [
                { carta: 'Gallina del infinito', furor: 0 }, // atk 7 propio: daña sin boost
                { carta: 'Oso con armadura', furor: 0 },
            ],
            mano: ['Plan de equipo'],
        },
        p2: { vanguardia: [{ carta: 'Oso con armadura', furor: 0 }] },
        pasos: [
            { jugar: 'Plan de equipo' },
            { atacar: 'Gallina del infinito', objetivo: 'Oso con armadura' },
            { cancelar: true }, // botón Cancelar del modal en ambas bases
        ],
        diferenciasEsperadas: [PLAN_USADO],
    },
];

correrSuite('regresion13', escenarios);
