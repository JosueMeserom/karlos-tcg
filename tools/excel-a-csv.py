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

    python3 tools/excel-a-csv.py                    # se descarga el Excel y regenera el CSV
    python3 tools/excel-a-csv.py --local            # usa el .xlsx que ya haya en docs/, sin bajar
    python3 tools/excel-a-csv.py otro.xlsx salida.csv

DE DÓNDE SALE EL EXCEL: de Dropbox, con el enlace privado que Toto guardó en
`docs/.cartas-kg.url` (600, git-ignored, NUNCA se commitea ni se pega en ningún sitio). Así él
sigue editándolo donde siempre y aquí se ve la última versión sin que mueva nada. Si el enlace no
está o no hay red, se usa la copia local y se dice.

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


def descargar(url, destino):
    """Baja el Excel de Dropbox. Sin librerías: urllib viene con Python."""
    import urllib.request
    req = urllib.request.Request(url, headers={'User-Agent': 'karlos-tcg/1.0'})
    with urllib.request.urlopen(req, timeout=60) as r, open(destino, 'wb') as f:
        f.write(r.read())
    # Un .xlsx es un ZIP: si Dropbox devuelve una página de error, esto lo caza en el acto en vez
    # de dejar un fichero roto que reviente más tarde con un error incomprensible.
    if not zipfile.is_zipfile(destino):
        destino.unlink(missing_ok=True)
        raise ValueError('lo descargado no es un .xlsx (¿el enlace ha caducado o pide login?)')


def main():
    raiz = Path(__file__).resolve().parent.parent
    argv = [a for a in sys.argv[1:] if a != '--local']
    solo_local = '--local' in sys.argv
    entrada = Path(argv[0]) if len(argv) > 0 else raiz / 'docs' / 'Cartas KG.xlsx'
    salida = Path(argv[1]) if len(argv) > 1 else raiz / 'docs' / 'Cartas KG.csv'

    enlace = raiz / 'docs' / '.cartas-kg.url'
    if not solo_local and len(argv) == 0 and enlace.exists():
        try:
            descargar(enlace.read_text(encoding='utf-8').strip(), entrada)
            print('Excel descargado de Dropbox.')
        except Exception as e:
            print(f'No se ha podido descargar ({e}). Sigo con la copia local, que puede estar vieja.')

    if not entrada.exists():
        print(f'No encuentro {entrada} y no hay de dónde bajarlo.')
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
