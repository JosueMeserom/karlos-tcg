#!/usr/bin/env python3
"""Convierte el Excel de cartas de Toto en el CSV que lee Claude, recortando las columnas privadas.

POR QUÉ EXISTE
--------------
El Excel (`docs/Cartas KG.xlsx`) es la fuente de la MECÁNICA de las cartas y vive en el PC de
Toto. Hasta hoy, para que yo pudiera leerlo había que exportarlo a CSV a mano Y ADEMÁS borrar a
mano las columnas de la K en adelante, que son notas suyas que no deben salir. Eso es un paso
manual que se olvida y un borrado que se puede hacer mal.

Ahora el flujo es: Toto guarda el .xlsx encima del que hay en `docs/` (por Z:, arrastrando) y se
ejecuta esto. El recorte lo hace la máquina siempre igual.

    python3 tools/excel-a-csv.py                    # docs/Cartas KG.xlsx -> docs/Cartas KG.csv
    python3 tools/excel-a-csv.py otro.xlsx salida.csv

NI EL XLSX NI EL CSV SE COMMITEAN (están en .gitignore): son ideas sin publicar.

SIN DEPENDENCIAS: un .xlsx es un ZIP con XML dentro, y `zipfile` + `ElementTree` vienen con
Python. Nada de instalar librerías en el servidor para leer una hoja de cálculo.
"""
import csv
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
# La K es la 11ª columna (A=1). De ahí en adelante son notas privadas de Toto.
ULTIMA_COLUMNA = 'J'
SEPARADOR = ';'   # el mismo que traía el CSV exportado a mano, para no romper nada que lo lea


def _col(ref):
    """'AB12' -> 'AB' (la letra de la columna)."""
    return re.match(r'[A-Z]+', ref).group(0)


def _indice(letras):
    """'A' -> 0, 'K' -> 10."""
    n = 0
    for c in letras:
        n = n * 26 + (ord(c) - 64)
    return n - 1


def leer_hoja(ruta_xlsx, hoja=1):
    with zipfile.ZipFile(ruta_xlsx) as z:
        # Cadenas compartidas: Excel guarda los textos repetidos en una tabla aparte.
        compartidas = []
        if 'xl/sharedStrings.xml' in z.namelist():
            raiz = ET.fromstring(z.read('xl/sharedStrings.xml'))
            for si in raiz.findall(f'{NS}si'):
                # Un texto puede venir partido en varios <t> (trozos con formatos distintos).
                compartidas.append(''.join(t.text or '' for t in si.iter(f'{NS}t')))
        raiz = ET.fromstring(z.read(f'xl/worksheets/sheet{hoja}.xml'))

    tope = _indice(ULTIMA_COLUMNA)
    filas = []
    for fila in raiz.iter(f'{NS}row'):
        celdas = {}
        for c in fila.findall(f'{NS}c'):
            i = _indice(_col(c.get('r')))
            if i > tope:
                continue                      # columna privada: ni se lee
            tipo = c.get('t')
            if tipo == 's':                   # índice a la tabla de cadenas
                v = c.find(f'{NS}v')
                txt = compartidas[int(v.text)] if v is not None else ''
            elif tipo == 'inlineStr':
                txt = ''.join(t.text or '' for t in c.iter(f'{NS}t'))
            else:                             # número, fecha o fórmula ya calculada
                v = c.find(f'{NS}v')
                txt = v.text if v is not None else ''
            celdas[i] = (txt or '').replace('\r\n', ' ').replace('\n', ' ').strip()
        if not celdas:
            continue
        ancho = max(celdas) + 1
        filas.append([celdas.get(i, '') for i in range(ancho)])
    # Filas totalmente vacías al final: fuera.
    while filas and not any(x for x in filas[-1]):
        filas.pop()
    return filas


def main():
    raiz = Path(__file__).resolve().parent.parent
    entrada = Path(sys.argv[1]) if len(sys.argv) > 1 else raiz / 'docs' / 'Cartas KG.xlsx'
    salida = Path(sys.argv[2]) if len(sys.argv) > 2 else raiz / 'docs' / 'Cartas KG.csv'
    if not entrada.exists():
        print(f'No encuentro {entrada}.\n'
              f'Guarda el Excel ahí (por Z: se arrastra y ya) y vuelve a ejecutarlo.')
        return 1

    filas = leer_hoja(entrada)
    # utf-8-sig: el BOM que Excel espera para abrir el CSV sin destrozar las tildes.
    with open(salida, 'w', encoding='utf-8-sig', newline='') as f:
        csv.writer(f, delimiter=SEPARADOR, quoting=csv.QUOTE_MINIMAL).writerows(filas)

    print(f'{salida.name}: {len(filas)} filas, columnas A-{ULTIMA_COLUMNA} '
          f'(de la {chr(ord(ULTIMA_COLUMNA) + 1)} en adelante no se lee nada).')
    if filas:
        print('Cabecera: ' + SEPARADOR.join(filas[0]))
    return 0


if __name__ == '__main__':
    sys.exit(main())
