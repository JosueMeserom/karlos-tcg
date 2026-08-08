# Rúbrica de textos de carta — Karlos TCG

Cómo se redacta el `text` de una carta. Nació el 5-ago-2026, después de una auditoría automática
de las 148 cartas que contrastó lo que cada texto PROMETE contra lo que la carta HACE (sus
disparadores y hooks reales) y cosechó todas las formas distintas en que hoy se dice lo mismo.

**Para qué sirve**: para que una carta nueva se escriba sola, sin tener que ir a mirar cómo lo
dijo la última, que es exactamente como se llegó a tener 16 redacciones distintas de "Al colocar"
para 18 usos. Cuando escribas una carta nueva, esto es la referencia; cuando algo no esté
contemplado aquí, se decide una vez y se añade.

Las decisiones marcadas **[Toto, 5-ago-2026]** las tomó él expresamente al cerrar la rúbrica; no
se cambian sin preguntarle.

---

## 0. Anatomía de un texto

El orden es fijo, y varias partes las parsea el panel de detalle del cliente (`index.html`), así
que la forma importa: no es solo estilo.

```
[Requisito: X.] [Coste: Y.] [N turnos.] P: NOMBRE PASIVA: <descripción>. A: NOMBRE ACTIVA (NF): <descripción>.
```

| Parte | Cuándo | Quién la lee |
|---|---|---|
| `Requisito: X.` | condición para poder jugarla, sin perder nada | detalle → caja tipo stats |
| `Coste: Y.` | hay que PAGAR/tributar algo al jugarla | detalle → caja tipo stats |
| `N turnos.` | solo Eventos, abre el texto | detalle → caja DURACIÓN |
| `P: NOMBRE:` | Pasiva | detalle → caja azul |
| `A: NOMBRE (NF):` | Activa | detalle → caja roja + cajita verde de coste |

**Coste vs Requisito** — la norma de siempre: *Coste* = pierdes algo al usarla (Furor, tributar un
aliado, descartar); *Requisito* = solo una condición que se cumple o no. Ante la duda: si al
jugarla el tablero queda peor que antes por haberla jugado, es Coste.

Los Eventos tienen además su propio juego de marcadores de sección, que el detalle pinta en cajas
de color: `Antes de colocarla, ` · `Al colocarla, ` · `Mientras esté en juego, ` · `Al expirar, `.
Son la excepción a la regla 2 de más abajo (ahí "Al colocarla" es un marcador de sección del
parser, no prosa).

---

## 1. Toda Habilidad se nombra, siempre

Si la carta declara `passiveName` o `activeName`, el texto **tiene** que nombrarla:

```
P: MEGADRENALINA: Si su Vida es 3 o menos, +2 de Atq.
A: BI-CHOQUE (1F): Ataca a 2 enemigos con Atq-1.
```

El nombre va en MAYÚSCULAS y **debe coincidir carácter a carácter** con `passiveName`/`activeName`
de la plantilla. Es lo que permite al detalle montar la caja con su título, y al resto del juego
firmar los efectos ("+1 Def y +1 Atq **por SABIDURÍA**" en "Afectado por:").

> **Trampa conocida**: el parser separa las secciones buscando `P:` y `A:`. Un nombre acabado en
> "A" seguido de dos puntos (SABIDURÍA:) llegó a colar una frontera falsa por culpa de `\b`, que
> en JavaScript no cuenta las vocales acentuadas como parte de la palabra. Está arreglado con una
> condición Unicode-consciente, pero conviene saberlo si alguna vez se toca ese `split`.

Una carta sin `P:`/`A:` no obtiene cajas: su texto se pinta como prosa suelta. Eso solo vale para
cartas que de verdad no tienen Habilidades (vainilla de solo stats).

---

## 2. Momentos: cuándo ocurre lo que ocurre

Una forma canónica por momento. **El texto tiene que reflejar el momento REAL**: si el efecto se
reaplica mientras la carta está en juego, no vale decir "Al colocar" (fue justo el caso de
Entrenamiento arduo, que decía "Al colocarla, oculta y agota a Zoe" cuando en realidad la mantiene
oculta y agotada TODO el tiempo).

| Momento | Forma canónica | Disparador que le corresponde |
|---|---|---|
| Al entrar en juego | **`Al colocar:`** | `AL_JUGAR` / `onAfterPlayAsync` |
| Mientras siga en juego | **`Mientras esté en juego, `** | `PASIVA_CONTINUA`, `AURA`, `onUpdatePassive` |
| Al recibir un ataque | **`Al recibir un ataque[ normal\| especial], `** | `ANTES_DE_DEFENDER`, `TRAS_DEFENDER` |
| Al atacar | **`Al atacar, `** | `ANTES_DE_ATACAR`, `TRAS_ATACAR` |
| Al morir | **`Al morir, `** | `AL_MORIR` |
| Cuando muere un aliado | **`Cuando muere un aliado, `** | `AL_MORIR_ALIADO` |
| Al final del turno propio | **`Al final de tu turno, `** | `FIN_TURNO` |
| Al inicio del turno propio | **`Al inicio de tu turno, `** | `INICIO_TURNO` |
| Reacción desde la mano | **`Reacción. Puedes usarla antes de <momento>.`** | `REACCION` |

**`Al colocar:` es NEUTRO siempre** [Toto, 5-ago-2026] — nunca "Al colocarlo/la", ni siquiera
cuando el género de la carta lo permitiría. Una sola forma que recordar y ningún riesgo de
equivocar la concordancia al escribir cartas nuevas. (Ojo a la excepción de los Eventos, §0: ahí
`Al colocarla, ` es un marcador de sección que el parser busca literalmente.)

Si un efecto es **opcional**, se dice con "puedes": *"Al colocar: **puedes** buscar una Ayuda en tu
mazo"*. Si es forzoso, verbo directo. Nunca dejar la opcionalidad al contexto — un jugador no
puede adivinar si un efecto le va a preguntar o le va a ocurrir.

---

## 3. Coste en Furor: reparto por función

[Toto, 5-ago-2026] Dos formas, cada una con su sitio, y la tercera desaparece:

- **`(NF)`** — SOLO en la cabecera de una Activa, pegado al nombre: `A: BI-CHOQUE (1F): …`.
  Es lo que el detalle recorta y pinta en la cajita verde del coste.
- **`N de Furor`** — en TODO lo demás: cajas de `Coste:`, prosa, condiciones.
  `Coste: 4 de Furor de Sadame, Aniceto o Hawke.` · `Sus ataques normales cuestan 1 de Furor.`
- **`N Furor`** a secas — **prohibido**. Era la tercera forma, sin criterio, y se elimina.

Si una Activa tiene coste, la plantilla **debe** declarar `activeCost` además de escribirlo en el
texto. Hay lógica genérica del motor que lee ese campo; una carta que solo lo diga en la prosa y
lo cobre a mano por su cuenta funciona hoy pero es invisible para cualquier cosa que se añada
mañana.

---

## 4. Nada de abreviaturas

[Toto, 5-ago-2026] Siempre la forma larga, sin excepciones por espacio:

| Prohibido | Canónico |
|---|---|
| `2T`, `1T` | `2 turnos`, `1 turno` |
| `Van.`, `VAN` | `vanguardia` |
| `Ret.`, `RET` | `retaguardia` |
| `DoT` | `Daño por tiempo` |
| `HP` | `Vida` |

El ahorro real de abreviar son dos o tres palabras por carta; el coste es que el texto se vuelve
jerga para quien no se sabe el juego de memoria. Si una carta no cabe, el problema es que dice
demasiado, no que lo diga con todas las letras.

---

## 5. Nombres de características, zonas y estados

Se escriben como en la cara de la carta, y el orden cuando van juntas es **Vida → Def → Atq**
(igual que en el detalle y en "Afectado por:").

| Concepto | Canónico | Formas a eliminar |
|---|---|---|
| Ataque | `Atq` | `ATQ`, `Ataque` |
| Defensa | `Def` | `DEF`, `Defensa` |
| Vida | `Vida` | `vida`, `VIDA`, `HP` |
| Furor | `Furor` | — |
| Zonas | `vanguardia`, `retaguardia` (minúscula) | `Vanguardia`, `Van.` |

Los **estados alterados** se nombran con el sustantivo, en mayúscula inicial, cuando se habla del
estado; con el verbo en minúscula cuando se aplica:

`Confusión` / `confunde` · `Ceguera` / `ciega` · `Sueño` / `duerme` · `Daño por tiempo` ·
`Oculto`/`Oculta` (concuerda con la carta) · `Silenciado`/`Silenciada`.

**Bandos**: `aliado` / `enemigo` para las CARTAS; `rival` solo para el JUGADOR contrario. Hoy se
mezclan ("un rival" queriendo decir una carta enemiga), y son cosas distintas: un efecto que toca
"al rival" toca a la persona (su mano, su mazo, su Retribución), no a sus criaturas.

---

## 6. Tipografía

- **Guion corto (`-`), nunca largo (`—`)**, en todo lo que el jugador pueda ver. El largo se queda
  solo en los comentarios del código.
- Cada frase acaba en punto. Las secciones `P:`/`A:` también.
- Los nombres de otras cartas van entre comillas simples: `busca 'Meca EBA' en tu mazo`.

---

## 7. Longitud: se mide POR CAJA, no por carta

El panel de detalle son 260px a 12px de fuente: **unos 37 caracteres por línea**. Lo que satura
la vista no es el total de la carta, sino una caja de habilidad larga. Una carta con Requisito +
Coste + Pasiva + Activa necesita legítimamente más total que una vainilla, y medir el total
castigaba a las bien escritas mientras dejaba pasar cartas con UNA caja enorme.

**Objetivo: 185 caracteres por caja (5 líneas).** Es un objetivo, no un veto: el verificador lo
lista como informativo, no como problema. Una carta compleja de verdad puede pasarse; una que se
pasa por perífrasis, no.

### Qué se recorta (y qué no)

Lo que se va, por orden de rentabilidad:

1. **Reglas generales del juego repetidas en cada carta.** "Baraja el mazo" después de buscar
   pasa siempre; "(no pueden usar Habilidades)" es la definición de Silenciado. Eso pertenece a
   las reglas, no a la carta.
2. **Enumeraciones que no informan.** Águila decía "elige un tipo de carta (Personaje, Esbirro,
   Ayuda o Evento)" — la lista completa de tipos que existen. 100 caracteres a cambio de nada.
3. **Lo que la interfaz ya enseña.** Los contadores tienen su propia insignia en la carta, así
   que no hay que narrar que suben y bajan; "(usando el botón)" sobra.
4. **Aclaraciones defensivas entre paréntesis** que no cambian la regla: "(si respeta reglas)",
   "(si puede)".
5. **Perífrasis.** "Cada vez que Águila es atacado por un ataque normal, echa una moneda; si es
   cara, evita dicho ataque y sus efectos" -> "Al recibir un ataque normal, moneda: con cara lo
   evita con todos sus efectos".

Lo que **NUNCA** se recorta: los calificadores son el contrato de la carta. `normal`/`especial`,
`aliado`/`enemigo`, `vanguardia`/`retaguardia`, `puedes`/`debes`, los topes y los máximos. Ante la
duda entre una caja larga y un matiz perdido, gana la caja larga.

### Reubicar en vez de recortar

A menudo la caja no sobra: está en el sitio equivocado. Una condición de colocación metida dentro
de la Pasiva es un `Requisito:` con su propia caja (así se sacó de Arthas la exclusión de Karolina
y de Poder Legado la condición del portador). Ojo: la caja de `Requisito:`/`Coste:` la parsea una
expresión que corta en el PRIMER punto, así que solo cabe UNA frase.

### Las que se quedan largas a propósito

Tras la pasada del 5-ago-2026 quedan seis cajas por encima del objetivo, y las seis lo están
porque la carta dice mucho de verdad: **Neo** (416: la definición de "cebo" son 175 caracteres de
contrato puro), **Arthas** (272: es una carta dual, con dos modos que explicar), **Súper
Evolución** (240: describe la ida y la vuelta), **Diego Antonio** (221: tres reglas sin relación
en una sola Pasiva), **Milkor MGL** (214: moneda con dos ramas) y **Unmei** (196). Bajarlas más
exige o sacrificar contrato o partir la caja, que hoy el parser no sabe hacer.

---

## 8. Cómo verificar

`node tests/auditar_textos.js` contrasta a máquina texto vs comportamiento y señala: nombres de
Habilidad que no coinciden con la plantilla, costes que el texto declara y la carta no (o al
revés), duraciones de Evento desalineadas, momentos prometidos sin disparador que los respalde,
banderas de plantilla que el texto calla, vocabulario fuera de rúbrica, guion largo y cajas por
encima del objetivo. **No arregla nada: señala.** Con `--todo` incluye las informativas.

Lo que el verificador **no** puede ver: si la descripción de un efecto es correcta EN SU CONTENIDO
(que "cura 2" cure 2 y no 3). Eso sigue siendo lectura humana; aquí se comprueba la ESTRUCTURA,
que es donde estaban los fallos.

Las suites de regresión NO comparan el `text` de las cartas (solo logs, flotantes y estado), así
que un cambio de redacción no las rompe — pero sí puede romper el PARSEO del detalle, que es
cliente puro. Ahí la verificación es visual.

---

## 9. Familias: cartas que hacen lo mismo se redactan igual

La consistencia que las secciones anteriores NO alcanzan: dos frases pueden cumplir todas las
reglas por separado y aun así no parecerse en nada. El ejemplo que lo destapó (Toto, 5-ago-2026)
son **Águila y Xanadu**, cuyas Pasivas hacen casi lo mismo -evitar un ataque normal- y lo decían
con verbos distintos, estructura distinta y hasta con y sin artículo.

Comparar las 148 cartas entre sí son 10.878 parejas: inviable. **Pero no hace falta, porque el
DSL ya es el índice semántico**: dos cartas que hacen lo mismo tienen la misma firma de
disparadores y ops (y las imperativas, la misma firma de hooks). Agrupar por firma es mecánico y
gratis; solo hay que leer los textos DENTRO de cada grupo, que es donde la comparación significa
algo. De 10.878 parejas se baja a unas decenas, ya clasificadas por tema.

```
node tests/familias_textos.js          # familias con 2+ cartas
node tests/familias_textos.js --todas  # incluye las de una sola carta
```

A 5-ago-2026: **178 familias, 40 con dos o más cartas.** Esas 40 son el trabajo pendiente de
consistencia, y se pueden ir cerrando de una en una sin releer nada más.

**La regla**: antes de redactar una carta nueva, mira su familia. Si ya hay cartas que hacen eso,
copia su estructura y cambia solo lo que de verdad sea distinto. Si al hacerlo ves que la
redacción existente es peor que la tuya, arregla las dos — pero que acaben iguales.

Ejemplo ya cerrado, la familia `hook:onBeforeDefend`:

```
Águila: Al recibir un ataque normal, moneda: con cara lo evita con todos sus efectos.
Xanadu: Al recibir un ataque normal, puede pagar 1 de Furor para evitarlo con todos sus efectos.
```

Misma apertura, mismo verbo (evitar, no "esquivar"), misma coletilla. Lo único que cambia es lo
único que de verdad difiere: cómo se paga.

### 9.bis Familia «evolución» (Toto, 7-ago-2026)

Es el mismo caso que Águila/Xanadu, dentro de la familia de las que sustituyen a otra carta:
tres formas distintas de decir exactamente lo mismo.

```
Sadame (retornada):  Sustituye a Sadame.
Limo crecido:        Puedes sustituir cualquier 'Limo artificial'... Las bonificaciones se transfieren.
Megalimo:            Sólo colocable sustituyendo un 'Limo crecido'. Hereda stats.
```

"Las bonificaciones se transfieren" y "hereda stats" son la misma frase escrita de dos maneras,
y Sadame directamente se la calla. Forma canónica:

> **Sustituye a `<carta>` en su lugar, conservando sus bonos.**

Lo que SÍ distingue a unas de otras se escribe aparte, porque es distinto de verdad: si además
restablece la Vida (Sadame: "Restablece Vida al inicio") o si hay condición de colocación. Ya
aplicada en *Entrenamiento arduo*; las tres de arriba quedan pendientes de unificar.

---

## 10. Gramática del Evento (el parser del detalle la exige)

Un Evento **no se escribe como una Ayuda**. El detalle lo trocea con marcadores literales, y lo
que no encaje se pinta como párrafo plano, sin caja ni color. La forma es:

```
<N> turnos. [Requiere <condición>.] [Antes de colocarla, …] [Al colocarla, …]
[Mientras esté en juego, …] [Al expirar, …]
```

Cuatro reglas que se saltan solas si uno copia el texto del Excel en vez de aplicar esto:

1. **`Requiere X.`, nunca `Requisito: X.`** — la caja REQUISITO de un Evento solo reconoce la
   primera forma; `Requisito:` es de las Ayudas y además solo funciona al PRINCIPIO del texto,
   posición que en un Evento ya ocupa la duración. Ejemplos correctos ya en el juego: *Giro de
   guion* ("Requiere que tengas un Evento activo."), *Época de estudio*, *Plan de equipo*.
2. **Los marcadores llevan coma y van en mayúscula inicial**: `Mientras esté en juego, …`. Con
   dos puntos o en minúscula (`…de tu vanguardia: mientras esté en juego, …`) el parser no los
   ve y toda la sección cae en la caja anterior.
3. **Todo lo que hace el Evento cuelga de un marcador.** Una frase suelta se queda sin caja.
4. **Un Evento NO anuncia su propia destrucción al expirar.** Es lo primero que pasa siempre.
   `Al expirar, se descarta y robas 3 cartas.` → `Al expirar, robas 3 cartas.`

## 11. Descartar vs destruir

- **Descartar**: ir de la **MANO** a la pila de descartes. Solo eso.
- **Destruir**: irse desde **cualquier otro sitio** — campo, Evento en juego, equipo anexado —
  aunque acabe en la misma pila.

En el Excel hay Eventos que dicen "al expirar la duración, descarta esta carta". Es un residuo de
antes de fijar esta norma: se traduce a "destruir" (y por la regla 4 de arriba, en un Evento
directamente no se escribe).

## 12. Buscar en una pila: SIEMPRE su visor

No es una norma de texto sino de comportamiento, pero se audita junto a las demás porque se
rompe igual de fácil. Si una carta busca en el **mazo** o en los **descartes**, se usa el visor
de pila completo (`openDeckSearchViewer`, o en el DSL un `BUSCAR` con `en: "MAZO"` / `"DESCARTES"`,
que ya lo elige solo): se ve la pila entera y solo las elegibles llevan reborde verde; sin
elegibles, el visor se abre igual con el aviso y se cierra clicando el fondo.

**Nunca** el modal genérico de selección (`openVisualSearchModal`) para una pila: solo lista las
válidas y esconde el resto, que es información que el jugador tiene derecho a ver.

**Multi-zona: NUNCA en un solo modal.** Una búsqueda que abarca varias zonas (`en: ["MAZO",
"DESCARTES"]`, `["MANO", "MAZO"]`…) se resuelve SIEMPRE con `confirmarPorZona`: primero se
elige zona, y luego se abre el visor de esa zona. Mezclarlas en un modal común tiene dos
defectos graves, los dos verificados en partida:

1. **Spoilea el mazo.** Las coincidencias del mazo aparecen sin que el jugador haya decidido
   mirarlo, así que aprende qué copias le quedan dentro sin pagar por saberlo.
2. **Obliga a barajar.** Si la carta escogida salió de los descartes, el mazo ni se ha tocado,
   pero el flujo común lo baraja igual.

**Qué zonas se ofrecen** en esa primera pregunta:

- **MAZO: siempre**, tenga coincidencias o no. Ocultar el botón le diría al jugador que ahí no
  queda nada, que es justo lo que no puede saber — y a mitad de partida uno no se acuerda de lo
  que le queda dentro. Si acepta y no hay nada, el visor se abre igual, sin ninguna carta en
  verde y con el aviso *"No hay cartas elegibles en este mazo"*, y se cierra clicando el fondo.
- **DESCARTES (y cualquier pila visible): solo si tiene coincidencias.** El jugador ya ve esa
  pila entera, así que esconder un botón que no puede dar nada no le oculta nada y le ahorra un
  clic muerto.

Cartas que siguen este patrón: *Karlitos* (PRÁCTICA CONSTANTE), *Berry* (INTERFAZ). Y por la
misma norma, *Caza del tesoro*, *Llamada del deber* y *Deuda con la mafia* llevan
`preguntarSiempre: true`: preguntan aunque el mazo no tenga nada, porque saltarse la pregunta
también delataba.

Y elegir una carta **ya en el campo** es siempre reborde verde en el tablero, nunca un modal
(ver la norma de targeting en CLAUDE.md).

## 13. Elegir de una MANO

Desde el 7-ago-2026 la mano tiene su propio picker, hermano del de tablero: se **oscurece todo
menos esa mano** y se elige clicando la carta. Nada de sacar las cartas a un modal aparte.

- **Reborde verde solo si discrimina.** Si toda la mano es elegible no se pinta ninguno: no
  distinguiría nada y solo mete ruido.
- **Sin cartas elegibles, no se abre nada** y se avisa por el log.
- **Mano del RIVAL: a ciegas.** Se ven los DORSOS, sin reborde (valen todas). Es el caso de
  *Zoe (SISAR)*, que antes abría un modal que **dibujaba la mano rival entera** — su texto
  promete descartarle una carta, no leérsela.
- **Campo y mano NUNCA en un mismo selector.** Si una carta puede tirar de las dos (*Meca EBA*),
  se pregunta primero por zona y cada una usa su picker. Con opciones en una sola zona se va
  directo, sin preguntar de más.

Implementado reutilizando `pickBoardTargets` con `{ mano: true }`, no con una función nueva: así
el chooser, el cancelado, la cola de red y el reanudar-perfecto se heredan ya resueltos.
