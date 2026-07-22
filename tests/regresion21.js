// tests/regresion21.js — Tanda de clones/tokens: Clon de Unmei y Clon de NoName.
//
// Los dos clones (fichas creadas por la Activa MULTIPLICACIÓN DE CUERPO de Unmei/
// NoName, que sigue siendo imperativa) tienen un onUpdatePassive idéntico: capan su
// Furor a 0, copian en vivo el ATQ/DEF de su "padre" (parentId) y se desvanecen —
// muerte súbita sin retribución— si el padre ya no está en el campo. Migrado al
// trigger ESPEJO nuevo (de/copiar/furorCero/muerteSiSinPadre), reutilizable por
// cualquier ficha-clon futura.
//
// El harness gana un ref `padre` (enlaza el clon a la carta homónima por parentId)
// para poder montar el estado sin depender de la creación imperativa.

'use strict';
const { correrSuite } = require('./harness');

const escenarios = [
    {
        nombre: 'Clon de Unmei: copia ATQ/DEF del padre y tiene el Furor capado a 0',
        p1: { vanguardia: [
            { carta: 'Unmei' },
            { carta: 'Clon de Unmei', padre: 'Unmei', furor: 3 }, // furor 3 -> el ESPEJO lo capa a 0
        ] },
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [],
        logsIntencionados: [],
    },
    {
        nombre: 'Clon de NoName: se desvanece si el padre ya no está en el campo',
        p1: { vanguardia: [ { carta: 'Clon de NoName', padre: 'NoName' } ],
              descartes: ['NoName'] }, // el padre está en el descarte -> muerte súbita del clon
        p2: { vanguardia: ['Mini-tigre'] },
        pasos: [],
        logsIntencionados: [],
    },
];

correrSuite('regresion21', escenarios);
