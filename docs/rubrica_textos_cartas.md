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
P: MEGADRENALINA: Si su VIDA es 3 o menos, +2 de ATQ.
A: BI-CHOQUE (1F): Ataca a 2 enemigos con ATQ-1.
```

El nombre va en MAYÚSCULAS y **debe coincidir carácter a carácter** con `passiveName`/`activeName`
de la plantilla. Es lo que permite al detalle montar la caja con su título, y al resto del juego
firmar los efectos ("+1 DEF y +1 ATQ **por SABIDURÍA**" en "Afectado por:").

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

Se escriben como en la cara de la carta, y el orden cuando van juntas es **VIDA → DEF → ATQ**
(igual que en el detalle y en "Afectado por:").

| Concepto | Canónico | Formas a eliminar |
|---|---|---|
| Ataque | `ATQ` | `Atq`, `atq`, `Ataque` |
| Defensa | `DEF` | `Def`, `def`, `Defensa` |
| Vida | `VIDA` | `Vida`, `vida`, `HP` |
| Furor | `Furor` | — |
| Zonas | `vanguardia`, `retaguardia` (minúscula) | `Vanguardia`, `Van.` |

**Las tres características van en MAYÚSCULAS** (Toto, 23-ago-2026; hasta ese día la norma era la
contraria). Se escriben **como en la cara de la carta** —VIDA · DEF · ATQ— y como ya las escribe
el motor en el detalle y en los flotantes (`+2 ATQ`, `VIDA MÁX.`): antes el texto de una carta
hablaba un idioma distinto del de su propio detalle. `Furor` no entra, porque no está en la cara
de la carta; y los **logs tampoco**: ahí las características son prosa («cura 2 de VIDA a X»
gritaría a mitad de frase), así que se quedan en minúscula inicial.

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
restablece la VIDA (Sadame: "Restablece VIDA al inicio") o si hay condición de colocación. Ya
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

### 12.bis Cancelar una búsqueda (Toto, 7-ago-2026)

Depende de **qué pila sea**, y la diferencia es la visibilidad:

- **MAZO — elegir es OBLIGATORIO** una vez abierto el visor. Abrirlo ya te ha enseñado una pila
  oculta y obliga a barajar, así que el momento de arrepentirse es **antes**, en la pregunta de
  "¿buscar?". Poder mirar y salirse sería leerse el mazo gratis. La pista de cierre no se
  muestra en ese caso, porque no hay salida que ofrecer.
- **DESCARTES — cancelable siempre.** Esa pila es pública: cualquiera puede consultarla en
  cualquier momento sin coste ni barajado, así que abrirla no compromete a nada ni revela nada
  que no estuviera ya a la vista. La pista dice *"(Haz clic en el fondo oscuro para cancelar)"*.

Y por lo mismo, **al rival no se le anuncia nada** ("Esperando a que X busque…") mientras la
búsqueda siga siendo cancelable y no haya cambiado el tablero: ese cartel ya cuenta que has
jugado algo. Mismo criterio que `_carteleraEspera`.

Si alguna búsqueda de MAZO llegara a ser cancelable por otra vía (un modal multi-zona, p. ej.),
**baraja igual** al cancelar, por la misma razón.


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

---

## 14. ORDEN DE LA CADENA AL JUGAR UNA CARTA (Toto, 8-ago-2026)

Esta sección existe porque el orden se ha derivado mal **varias veces seguidas**, cada vez de una
forma distinta. No se deduce: se consulta. **Leerla antes de tocar cualquier cosa que mueva una
carta de zona o que dispare una animación.**

### La regla, en una frase

> Nada visible ni irreversible ocurre hasta el **punto de compromiso**. Y en ese punto ocurre
> TODO junto: sale del sitio donde estaba, se presenta, y solo entonces empieza el efecto.

### Dónde está el punto de compromiso

| Carta | Punto de compromiso |
|---|---|
| Sin elecciones previas (Jarabe amargo) | Al clicarla: ya es irreversible |
| Ayuda dirigida (Longaniza) | Al confirmar el **objetivo** |
| Con elección en el campo/mano (Dobla la ropa, Pago por adelantado) | Al completar **esa elección** |
| Con varias elecciones encadenadas (Atomización) | Al completar **la última** que aún se pudiera cancelar |
| Búsqueda en **MAZO** (Hexagrama) | Al **abrir el visor** — te enseña una pila oculta y obliga a barajar |
| Búsqueda en **DESCARTES** (Líquido mortal) | Al **elegir la carta** — la pila es pública, abrirla no compromete |

### Qué pasa exactamente en ese punto, y en este orden

1. **El log** de la jugada (lo primero de todo, antes de ninguna animación).
2. **La carta sale de la mano** y entra en su zona destino — descartes, ranura de Evento o fila.
   El contador de la pila y el hueco de la fila se actualizan **ya**, no al final de la cadena.
3. **La presentación**: viaja al centro, se voltea si para quien mira estaba de dorso, posa, y
   **aterriza** en el sitio que le acaba de tocar. Si va a una fila, las que ya estaban se
   apartan deslizándose (FLIP).
   **Los contadores de pila se mueven CON la carta**: suben cuando entra y bajan cuando sale, en
   el instante del aterrizaje o de la salida — nunca al final de la cadena.
4. **Recién entonces** empieza el efecto: coste, animaciones, modales encadenados.

### Lo que NO debe pasar

- Que la carta salga de la mano **antes** del punto de compromiso. Si estás eligiendo y aún
  puedes cancelar, la carta **sigue en tu mano** y el rival no ve nada.
- Que un modal se abra **encima** de la presentación. La cadena espera a que termine.
- Que la pila destino se pueble **al final** de la cadena en vez de al aterrizar.

### Ida y vuelta

Una carta que "vuelve" (Atomización al rematar) hace el viaje **completo otra vez**, en sentido
inverso: sale del descarte, se presenta en el centro y aterriza en la mano. Es un evento que los
dos jugadores deben ver, no una línea de log. Y el log va en 3ª persona con dueño, como todo:
*"vuelve a la mano de J1 (Ultra_K)"*, nunca *"vuelve a tu mano"*.

## 14.bis. LOS COSTES Y LOS REQUISITOS SE ENSEÑAN CON LA CARTA (Toto, 8-ago-2026)

Una carta no se presenta sola: se presenta **con lo que ha costado**. Antes el "-1 FUR" salía
cuando le tocaba a su efecto dentro de la cadena, que con una búsqueda de por medio podía ser
cinco pasos después de haber visto la carta. Ahora el cobro se **aparca hasta el escaparate**: el
flotante sale a la vez que la carta se enseña, con las flechas ya puestas señalando a quién le ha
tocado pagar.

**En el DSL** basta con marcar el efecto:

- `esCoste: true` — quien lo paga queda anotado, y **el efecto se aparca** hasta que la carta
  llega al escaparate. Si lo que se paga es **Furor** (`MODIFICAR_STAT` sobre `furor`), se marca
  solo como **tributo** y la etiqueta lleva la cantidad real de cada carta ("Tributa 2 FUR"),
  resuelta con el mismo cálculo que hará el cobro — Flash de maná le cobra menos a Eris, y la
  flecha se dibuja antes de cobrar. Va en su sitio natural de la lista (justo detrás de la elección del
  pagador), no colado detrás de la búsqueda: ese apaño servía para no cobrar mientras aún se
  podía cancelar, pero a cambio retrasaba el flotante hasta el final de todo.
- `esRequisito: true` — solo anota. Un requisito no se pierde, se comprueba.
- `requisitoVisible` — en la **plantilla** (o en la habilidad `JUGAR`): a qué carta del campo
  apunta la flecha lima que hace legal la jugada. Es una lista de specs de pool iguales a las de
  cualquier `target`, con `uno: true` para señalar solo la primera cuando basta una:
  `requisitoVisible: [ { quien: "ALIADO", filtros: [ { campo: "name", op: "==", valor: "Zoe" } ], uno: true } ]`.
  `zona: "evento"` apunta al Evento activo. Solo se marca lo que existe y se puede señalar: un
  requisito de **recuento** ("tu vanguardia llena", "3 aliados") o **negativo** ("Karolina no
  está") no lleva flecha a propósito, porque no hay carta concreta y señalar a un aliado
  cualquiera mentiría.

En una carta imperativa se anota a mano con `DSL._marcarCoste(game, carta, 'coste'|'requisito')`.

**Cómo se ve**, según dónde esté el coste en ese momento — lo decide el cliente mirando si la
carta tiene elemento en el tablero, no lo declara la carta:

- **Viene de la mano** (la Manzanahoria de Wolfgang): viaja al escaparate **al lado** de la carta
  usada, y el **bloque de las dos** queda centrado en el campo. Al llegar, brota del propio coste
  una flecha "Coste" que corre al centro del bloque apuntándolo. Los acompañantes se van a su
  pila a la vez y durante el mismo tiempo que la carta principal.
- **Está en el campo** (los dos pagadores de Rezo en grupo, Aniceto por Wolfgang): se queda donde
  está y le **crece** una flecha hacia el escaparate mientras la carta viaja; cuando la carta se
  posa, la flecha ya está entera con su punta y su etiqueta sobre la mitad de su longitud.

En los dos casos las flechas se desvanecen en cuanto arranca el viaje al destino, nunca antes, y
van **por encima** del escaparate (z-index 3950): sobre todo lo demás, pero bajo los modales.
Y **toda** carta que sale de la mano al escaparate -la usada y sus costes- deja su hueco y el
resto de la mano **se acomoda deslizándose**, con la misma técnica FLIP que una fila (si no, se
ve duplicada: el estado ya la sacó pero nadie la ha repintado). La separación del bloque se
ajusta con `PRESENTA_GAP`. El coste que acompaña sale de su hueco — la zona a la
que pertenece la decide el motor (`zona`), nunca la presencia de la carta en el DOM: una carta ya
descartada sigue dibujada en la mano hasta el siguiente render.
Tres colores para tres cosas distintas: **coste ámbar** (pierdes la carta), **tributo rojo**
(pierdes Furor y la carta se queda) y **requisito lima** (no pierdes nada). El rojo del tributo es
el del Furor (`.ft-red-stat`, el mismo del "-1 FUR") y no un verde a propósito: aquí el verde es la
*ganancia* de Furor, así que pintar de verde una pérdida diría lo contrario de lo que pasa.

`node tests/auditar_flechas.js` enumera qué cartas enseñan su coste y cuáles no. Marcar una carta
es una decisión de diseño, así que la auditoría es informativa; lo que sí falla es un marcaje
**incoherente** (p. ej. un `esRequisito` sobre algo que gasta Furor).

**El volteo dice la verdad sobre lo que se ve.** Una carta se voltea **solo si para quien mira
estaba tapada**: eso incluye a los costes que acompañan (salen de la misma mano, mismo criterio) y
al robo normal, que sale del mazo de dorso y se voltea al llegar a la mano de quien va a verla. Y
**no se voltea lo que ya se estaba viendo**: con `handExposedTo` puesto (SEGUIMIENTO de Erasmo) la
mano rival se ve boca arriba, así que "revelarla" sería mentir sobre lo que ya había a la vista.

**El zoom del escaparate es zoom REAL** (`zoom`, no `transform: scale()`): un transform escala el
bitmap ya rasterizado y agrandar difumina. El clon se monta con `zoom` y el transform va de
`1/ZOOM` a `1`, así que en la pose -que es cuando se lee la carta- está a escala 1 y sale nítida.
Al tocar posiciones ahí, **todo lo que se le asigne al clon va dividido por el zoom** (`_pz`).

**La marca tiene que existir ANTES de que la presentación se encole**, que es cuando se consume.
Marcar no basta: en una Ayuda dirigida el compromiso es confirmar el objetivo, así que la carta se
presenta *antes* de correr sus efectos y un `esCoste` de esa lista llega con el escaparate ya
cerrado — no dibuja nada y encima se lo come la siguiente presentación de la cadena. Por eso:

- `DSL._marcarCostesDeclarados` anota, justo antes de disparar, los costes que la Ayuda le cobra
  **a su propio objetivo** (los `esCoste` sin `target`).
- Cuando el pagador se elige **antes** del compromiso pero se cobra después (Necronomicón: cobra
  al final para que cancelar el visor de descartes no cueste nada), la marca se adelanta con
  `esTributo: N` en el ELEGIR y **el cobro no se toca**. Las marcas viven hasta la siguiente
  jugada, así que sobreviven a la búsqueda.
- Si tras confirmar el objetivo **queda una elección cancelable** (Té helado pregunta a quién
  curas y luego quién paga), la presentación se queda **armada** y la dispara esa elección, igual
  que en una Ayuda no dirigida. §14 pide la ÚLTIMA elección cancelable, no la primera, y esto lo
  cumple: se deduce de la forma de la lista de efectos, no se declara por carta.

**Dos cosas que no se pueden romper al tocar esto:**

1. Un coste **no puede perderse**. La cola de presentaciones se traga las excepciones con un
   `.catch`, así que un fallo dibujando una flecha se llevaba por delante un cobro entero -y el
   aterrizaje de la carta- sin dejar rastro. El dibujo va blindado y el drenaje de cobros tiene
   red de seguridad en `_comprometer`: lo cobre el escaparate o lo cobre él, se cobra una vez.
2. Si la carta pregunta **cómo** se paga (Wolfgang: Aniceto o Manzanahoria), esa pregunta es una
   **ventana cancelable**: lleva CANCELAR -y se cancela también clicando FUERA de la caja, como
   cualquier otra ventana cancelable- y no puede cambiar nada hasta que se responde. Un modal
   así necesita además su descriptor `pendingInteraction` de tipo `choice`, o al reconectar se
   pierde y la jugada se queda colgada esperando un `CHOICE_SELECTED` que ya nadie manda.
3. **`modifyStat` ya pinta su propio flotante** al cambiar un stat. Declarar además un `floating`
   con el mismo texto ("-1 FUR") lo saca **dos veces**. Un `floating` propio solo se pone si dice
   algo DISTINTO ("CAÑÓN DE POSITRONES", "-1 FUR (Aura)").


## 14.ter. LO QUE SE HACE "ANTES DE COLOCARLA" OCURRE EN EL ESCAPARATE (Toto, 13-ago-2026)

Si una carta hace algo antes de colocarse **como parte de su propio efecto** -Giro de guion
destruye los dos Eventos, Némesis aniquila su vanguardia-, eso pasa **con la carta enseñada y
quieta en el centro**, y solo cuando termina viaja a su sitio. Antes se veía al revés: la carta
llegaba a su ranura, se desvanecía, *entonces* ocurría el efecto, y *después* aparecía colocada.

Mecánicamente la presentación se **retiene**: quien va a correr esos efectos marca
`_retenerEscaparate` antes de que nada la dispare, y `_dispararPresentacion` pasa a resolver **al
llegar al centro** en vez de al final -si esperase al final, la animación esperaría a la cadena y
la cadena a la animación-. El viaje al destino sigue vivo detrás y lo suelta
`_soltarYEsperarEscaparate()`.

**La retención SIEMPRE se suelta.** Abre una promesa: si una rama de salida se la deja puesta -una
jugada cancelada, un escenario cargado a media cadena- la partida se cuelga sin ruido. Por eso la
suelta también el `finally` del hook y el cierre de emergencia (`cerrarTodoYCancelar`), y por eso
la suite lo comprueba explícitamente en vez de fiarse del resultado.

**Una flecha no siempre apunta a una carta.** Dos casos que estrenaron pieza (14-ago-2026):

- **A un HUECO**: `requisitoZona` en la plantilla. *Una buena razón* es legal porque el rival **no
  tiene Evento**, así que la flecha sale de su ranura vacía. Lo que cumple el requisito es la
  ausencia, y la ausencia tiene sitio en el tablero.
- **TARDE, a propósito**: Neo **se presenta al revelarse**, no al jugarse. Marcar el cebo antes no
  servía de nada -el intercambio lo manda a la mano al instante, así que cuando iba a dibujarse
  ya no había a quién apuntar-. Presentándose, el orden se ordena solo: Neo sale de la mano al
  escaparate (el rival la ve por primera vez ahí, así que la sorpresa se conserva), el cebo -que
  sigue en el campo- le manda su flecha "Cebo", y **solo entonces** se hace el intercambio dentro
  del escaparate. Etiqueta propia pero el lima del requisito: es una condición que se cumple, no
  algo que se pierda.

**`pausaEnEscaparate`** es la marca que lo pide, en la habilidad `ANTES_DE_JUGAR`. Solo la llevan
las dos cartas cuyo coste **destruye cartas del campo**, que es lo que tiene animación que merezca
verse: **Némesis** (su vanguardia) y **Giro de guion** (los Eventos). Un coste de Furor no la
necesita -no hay nada que esperar- y un efecto "al colocarla" tampoco: eso no es un coste.

Con la pausa puesta, **la ZONA de destino se decide DESPUÉS de pagar**. Némesis vacía su propia
vanguardia, así que deja de estar llena: decidirlo antes la mandaba a retaguardia. Por eso
`zonaSel` admite una función, que se resuelve al salir del escaparate.

Y una trampa de la batería que costó un turno entero: al documentar el reordenamiento de logs que
esto provoca, **hay que FUNDIR las reglas con las que el escenario ya tenga**. Un segundo
`logsSoloVieja` en el mismo literal no se suma: sustituye al primero, y las reglas que había se
pierden en silencio. Es el mismo error que ya se cometió con los flotantes de Granada de maná.

Esto NO afecta a lo cancelable: una elección previa que aún permita retirar la jugada sigue
ocurriendo antes, sin carta enseñada, porque `_comprometer` ya traza esa línea sola (la
presentación queda ARMADA, no disparada, mientras haya una ventana cancelable delante). No hay
nada que declarar por carta.

## 14.quater. ATERRIZAR Y EVOLUCIONAR (Toto, 13-ago-2026)

**Nada aparece de golpe.** Una carta que llega a un destino con "versión colocada" se **funde**
con ella: el clon viaja entero y visible, encogiéndose hasta el tamaño exacto del hueco, y al
llegar se cruza con la carta real (uno se va mientras el otro entra). Lo declara `fundirEn` con el
selector del contenedor. Lo usan el **Evento** (la tira de su ranura) y la **pila de descartes
cuando estaba vacía** — con la pila ya poblada no hay nada que estrenar y el desvanecido de
siempre es lo correcto.

**Una evolución se presenta y se deshace sobre la carta que evoluciona.** `disolverHacia` hace que
el clon, tras la pose, viaje hacia la carta base desintegrándose -desenfoque y encogimiento
crecientes- mientras la base corre su propia animación de evolución. El intercambio de estado va
**después**, cuando las dos animaciones han terminado; el helper `game.evolucionarDesdeMano(carta,
baseId, cambio)` lo monta entero.

Y la regla que hace que esto funcione: **la llamada va ANTES del intercambio**. Si la base ya se
ha sustituido en su fila, no queda nada en el tablero hacia lo que disolverse. La suite lo
comprueba mirando que la carta base siga en mesa en el instante de presentar, no el estado final.

**La MANO es una fila más.** Una carta que llega a la mano **entra en ella al aterrizar**
-mientras el resto de la mano se aparta deslizándose-, no al final de la cadena. Vale para TODAS
las llegadas, no solo las que se presentan: las búsquedas en pila (`aMano`), la **retribución**
(`animateRetributionToHand`), las cuatro cartas que usan `animateStackToHand` (Escudo mágico ×2,
La Bestia, Igniz) y el op `VOLVER_A_MANO`. El patrón es siempre el mismo: **foto de la mano →
colocar en el estado → deslizar → volar al hueco real**, y quien anima recibe la colocación como
callback para hacerla a mitad del vuelo.
Estaba solo para vanguardia y retaguardia, y a la mano la carta se desvanecía sobre la zona sin
aparecer hasta que todo terminaba (Toto lo vio con la búsqueda de Goodman al morir).

**Sacar una carta CONOCIDA de una pila es PÚBLICO**: pasa por el escaparate y la ven los dos
jugadores, y solo después viaja a la mano. Vale para el `aMano` del op `BUSCAR` y para las cuatro
cartas imperativas que aún usan `animateStackToHand` (Escudo mágico ×2, La Bestia, Igniz), que
delega en la presentación. La única llegada que NO se presenta es la **retribución**: no es una
búsqueda, es tuya y nadie más tiene por qué verla — esa usa `volarALaMano`, el vuelo simple. El otro camino legítimo es el `aMano` del op `BUSCAR`, que va por la
presentación. **Cualquier otra forma de meter una carta en la mano es sospechosa**, y
`node tests/auditar_llegadas.js` las enumera: hoy 15 correctas, 5 exentas (reparto, robo,
utilidades de debug) y **0 por revisar**. Esa auditoría nació de arreglarlas de una en una según
Toto las encontraba en el navegador, que es justo lo que evita.

**Y el volteo cuenta la verdad en los DOS tramos.** Del mazo la carta sale de dorso y se voltea al
escaparate: ahí la ven los dos jugadores. Del escaparate a la mano, **se vuelve a voltear solo si
esa mano no es visible para quien mira** (`ocultarAlLlegar`), y acaba de dorso como la pinta la
mano. Si la mano sí se ve -la tuya, o una expuesta por SEGUIMIENTO- no se voltea: sería tapar algo
que se está viendo.

**La foto del FLIP es UNA para las cuatro filas**, no una por fila. Una carta que **cambia de
fila** -la retaguardia que sube a cubrir un hueco- no aparece en el "antes" de su fila nueva, así
que con fotos separadas el FLIP la daba por recién llegada y se colocaba de golpe. Con la foto
compartida tiene de dónde venir y se desliza, aunque venga de otro contenedor.

**El FLIP no toca lo que cambia de TAMAÑO.** Compara esquinas, así que una carta que crece o
encoge -el zoom de selección al clicarla o al cancelar- saldría desviada: aparecía arriba a la
izquierda y saltaba a su sitio en unos frames. Un cambio de tamaño no es una recolocación.

**Las flechas de coste/requisito se van al ACABAR LA POSE**, siempre con el mismo tiempo, retenga
o no la carta después. Si esperasen al viaje al destino, una carta que se queda pagando costes en
el centro las arrastraría durante toda esa animación.


## 15. LAS ETIQUETAS SE NOMBRAN DICIENDO QUE LO SON (Toto, 13-ago-2026)

Las comillas simples se usaban para **dos cosas** -nombres de carta y etiquetas- y hay **52
etiquetas distintas**, así que `'Mercenario'` o `'Estudioso'` se leían como si fueran cartas. La
gramática es **`con etiqueta 'X'`**:

> *Busca en tu mazo una carta **con etiqueta 'Mercenario'**, añádela a tu mano y baraja.*
> *Requiere un aliado **con etiqueta 'Estudioso'** en el campo.*

La negación es `sin etiqueta 'X'` (*"Equípala a un aliado sin etiqueta 'Animal salvaje'"*), y con
varias **se encadena con `ni` / `o`**, sin repetir el prefijo: *"sin etiqueta 'Animal salvaje' ni
'Cosa', ni sea Karolina"*, *"con etiqueta 'Usuario de magia' o 'Monstruo'"*. El nexo ya arrastra
la negación y repetir queda pesado (Toto, 13-ago-2026).

Los **subtipos** no llevan el prefijo: *'Ser vivo'*, *'No-muerto'*, *'Máquina'* se leen ya como lo
que son, y no se confunden con nombres de carta.

`tests/auditar_textos.js` lo comprueba, y **no leyendo la prosa**: contrasta cada texto
entrecomillado contra la lista REAL de etiquetas y la de nombres de carta, sacadas de `CARD_DB`.
Si coincide con una etiqueta y no con un nombre, exige el prefijo. Ese es el método correcto para
esta familia de comprobaciones, y la lección de haber buscado *"Energía Adán"* como nombre de
carta -no existe- cuando era una etiqueta de Igniz y Yuriy.


## 16. VARIAS MUERTES A LA VEZ NO RECOLOCAN HASTA EL FINAL (Toto, 14-ago-2026)

Cuando un hueco se abre en vanguardia, alguien de retaguardia sube a cubrirlo. Pero **si varias
cartas mueren en el mismo instante lógico, los huecos no se recalculan hasta que hayan muerto
todas** — aunque el motor por dentro las mate una a una.

Sin esta regla la retaguardia iba subiendo *entre* muerte y muerte: con Némesis, que aniquila su
propia vanguardia como coste, los de atrás se metían en los huecos que ella venía a ocupar y se
veía un baile en vez de *"caen las cuatro, entra Némesis, y entonces sube el resto"*.

**No es una excepción de Némesis**: vale para cualquier efecto que destruya en grupo (un Cañón que
mate a dos, una Granada que mate a tres). Lo echa el propio DSL en el bucle de objetivos, así que
ninguna carta tiene que declarar nada; y `game.sinRecolocarHasta(fn)` lo abre a mano cuando hace
falta abarcar más -en Némesis, toda la presentación, para que su aterrizaje también entre dentro-.

Dos detalles que costaron un rojo cada uno:
- Los huecos se cuentan **por jugador**. Con un contador global, el primero al que se le recoloca
  se come los del otro (lo destapó TORMENTA PERFECTA, que golpea a los dos bandos a la vez).
- Sube **uno por hueco**, no uno por tanda: si caen cuatro, suben cuatro (los que haya y quepan).


## §17. `resumenFase`: qué anuncia el rectángulo de fase

El rectángulo de la columna derecha dice, en reposo, la regla base de la fase actual y qué efectos
concretos la alteran ahora mismo. Esas entradas **no se deducen del código**: un efecto de fase es
un hook, y para saber qué hace habría que ejecutarlo. Cada habilidad declara la suya.

```js
{ trigger: "FIN_TURNO", resumenFase: "Pierde 1 de Furor; si baja a 0 así, se destruye",
  porHabilidad: "CONSUMO DESMESURADO", efectos: [ ... ] }
```

**Qué entra.** Solo los seis triggers de fase: `INICIO_TURNO` y `GLOBAL_INICIO_TURNO` (efectos
iniciales), `GLOBAL_MODIFICAR_FUROR` (furor), `AL_CADUCAR` (evento), `FIN_TURNO` (efectos finales)
y `PUEDE_ATACAR` (principal).

**Qué NO entra, y es la regla que hace útil el panel:** *dice lo que cambia las REGLAS de la fase,
no lo que cambia los NÚMEROS de una carta*. `PASIVA_CONTINUA` y `AURA` se quedan fuera aunque se
apliquen cada turno: ya tienen su sitio en los badges y en el «Afectado por» de cada carta, y
repetirlos aquí sería la duplicación que este rectángulo existe para evitar.

**Redacción.** Es una afección de la gramática de §13, así que se construye con `lineaEfecto()` y
sale como `<resumen>[ por HABILIDAD], fuente: <refCarta>`. En 3ª persona, sin sujeto (lo pone la
fuente): «Roba 2 cartas», no «El jugador roba 2 cartas». `porHabilidad` **solo** si lo causa una
Pasiva o una Activa: en un Evento o una Ayuda se omite, igual que en §13.

**Un `AL_CADUCAR` solo se anuncia el turno en que a ese Evento se le acaba el tiempo.** Anunciarlo
antes sería mentir tres turnos seguidos.

**Qué no se declara.** La limpieza al expirar (el Evento deja de aplicar lo que aplicaba: §11 ya
dice que un Evento no anuncia su propia destrucción) y la contabilidad interna que el jugador no
ve. Esos casos van al `NO_PROCEDE` de `tests/auditar_fases.js` con su motivo escrito, para que la
lista de pendientes sea trabajo real.

`node tests/auditar_fases.js` tiene que salir en 0 POR ANOTAR.


## §18. Nunca escribas a mano una línea de detalle que el motor ya escribe

El detalle cuenta lo que afecta a una carta por dos caminos, y **no son alternativos**:

1. **Automático.** `updatePassives` fotografía los stats de toda la mesa antes y después de
   aplicar las pasivas y anota cada diferencia en `_statMods` con su fuente. De ahí salen las
   líneas con la gramática de §13 y sus flechas, sin que la carta declare nada.
2. **A mano**, con `PREVIEW_GLOBAL` + `lineas: [{ texto }]`. Es para lo que el automático **no
   puede ver**: «Silenciado», «No gana Furor al inicio del turno», «Puede retirarse sin coste».
   Nada de eso mueve un stat, así que la foto no lo detecta.

**Usar el 2 para algo que ya cuenta el 1 saca la entrada dos veces, y la flecha también.** Le pasó
a Publicidad mental y a Exhibicionismo: declaraban «-2 de ATQ por la publicidad» teniendo ya un
`AURA` con `stats: { atk: -2 }` que lo pinta solo, y encima con peor redacción (la de la carta se
salta la gramática de §13).

Regla práctica: **si la línea nombra VIDA, DEF o ATQ, casi siempre sobra.** El Furor es la
excepción — `_statMods` solo fotografía `currentAtk`, `currentDef`, `stealth` e `isSilenced`, así
que lo que toque el Furor sí hay que escribirlo a mano.

`node tests/auditar_preview.js` lo comprueba, y **devuelve error** (a diferencia de las auditorías
informativas): duplicar una línea no es una decisión de diseño, es un defecto. Si una línea nombra
un stat sin modificarlo de verdad, va a su `EXENTAS` con el motivo **verificado en el código**, no
supuesto.


## §19. Toda cadena cancelable termina comprometiendo

§14 dice que nada es visible hasta el punto de compromiso. El cliente lo cumple **armando** la
presentación (`_presentacionArmada`) en vez de dispararla al clicar, y la dispara `DSL._comprometer`
en cuanto ocurre algo irreversible: un efecto que no sea `ELEGIR`/`BUSCAR`, un `esCoste` aparcado,
o un `BUSCAR` en el mazo al abrir el visor.

**La trampa**: una cadena que es `ELEGIR`/`BUSCAR` **de principio a fin** no tiene ninguno de esos.
El `ELEGIR` se salta `_comprometer` a propósito — mientras eliges aún puedes arrepentirte — y si la
lista se acaba ahí, no queda nadie que lo llame: la carta se coloca sin pasar por el escaparate.
Pasaba con Publicidad mental y Exhibicionismo (su `ELEGIR` solo apunta a quién, y el efecto real es
un `AURA` continua, que no es un efecto de la lista) y con Líquido mortal y Cápsula de
bio-regeneración (un `BUSCAR` en los descartes y nada más).

**La garantía es estructural**: los tres compiladores de cadena de jugada — `ANTES_DE_JUGAR`,
`AL_CONSUMIR` y `AL_EQUIPAR` — llaman a `DSL._comprometer` al terminar, pase lo que pase. Es
idempotente (lo primero que hace `_dispararPresentacion` es vaciar `_presentacionArmada`), así que
no dispara dos veces si un efecto anterior ya lo hizo.

Al añadir un trigger nuevo a `_hayVentana` en `index.html`, **hay que añadir el `_comprometer` al
final de su compilador**. `node tests/auditar_presenta.js` compara las dos listas leyéndolas del
fuente y **devuelve error** si se desincronizan.

### Elegir a quién afecta la carta es un Requisito, no un «Al colocarla»

Si el `ELEGIR` solo **señala** a quién afectará la carta y ese aliado no pierde nada, es un
**Requisito** (§ Coste vs Requisito): lleva `esRequisito: true`, y entonces el elegido sale con su
flecha lima **«Req. cumplido»** en la presentación. Eso les dice a los dos jugadores *cuál* de los
aliados va a quedar afectado, que antes solo se sabía abriendo el detalle. El texto se redacta
`Requiere elegir un aliado de tu vanguardia.`, no `Al colocarla, elige…`.

---

## §20. «Durante el turno del rival» empieza y acaba CON ese turno (Toto, 23-ago-2026)

Un texto que dice **«durante el turno del rival»**, **«durante tu próximo turno»** o cualquier
variante que nombre **un turno entero** empieza a valer **nada más empezar ese turno** y deja de
valer **nada más terminar**, en el mismo instante en el que sale el cartel de turno a pantalla
completa. No se retrasa a la fase de Efectos Iniciales ni se adelanta a la de Efectos Finales:
esas dos son **fases concretas**, y un texto solo cae ahí si dice explícitamente «al inicio del
turno» o «al final del turno».

**Cómo se declara.** No con `INICIO_TURNO`/`FIN_TURNO`, que se compilan a la fase de Efectos
Iniciales/Finales — que es donde el motor los llamaba históricamente, no una decisión de diseño:

```js
{ trigger: "PERIODICO", fase: "INICIO DEL TURNO", momento: "NORMAL", deQuien: "PROPIO", … }
```

`INICIO DEL TURNO` es la subfase que existe justamente para esto (ver TODO, decisiones cerradas:
«`ANTES` es antes de lo que la FASE hace, no antes de su cartel»).

**Y el relevo se hace de una vez.** Si una carta cambia una marca por un estado —el aviso «voy a
camuflarme» que se convierte en el Oculto de verdad— las dos cosas van **en la misma ability**, en
esa misma fase: así el jugador ve la chapa cambiar en un solo instante y no una fase antes que la
otra. Lo hacen CAMUFLAJE ÓPTICO (Mill) y ÚLTIMA RESISTENCIA (Simon), y `tests/mill.js` lo fija
espiando el cartel de fase: **para cuando se anuncia el ROBO, el relevo ya está hecho**.

**Redacción.** Desde el turno en el que se pone la marca, el turno del rival es el **próximo**:
se escribe «durante el **próximo** turno del rival» en las dos cartas, no «durante el turno del
rival» en una y con «próximo» en la otra.

---

## §21. «A N» es N EXACTOS; «a hasta N» se adapta (Toto, 23-ago-2026)

Una Habilidad que golpea o afecta a varios objetivos se escribe de **una de estas dos formas, y
no hay tercera**. La forma elegida no es un matiz de redacción: **es la regla**.

| Texto | Qué significa | Cómo se declara |
|---|---|---|
| `a 3 enemigos` | **Tres exactos.** Si no hay tres objetivos válidos, la Habilidad **no arranca** y lo dice al pulsarla | `target: { cantidad: 3 }` + un `requisito` de `>= 3` |
| `a hasta 3 enemigos` | **De uno a tres.** El cupo se ajusta a los que haya y se puede parar antes con el botón | `hastaCantidad: true` + `permitirParar: true` + un `requisito` de `>= 1` |

**El cupo fijo es una herramienta de equilibrio, no una limitación técnica.** CASTIGO (Serafín)
pide tres exactos a propósito: la familia de los ángeles ya gana sola, y exigir la vanguardia
rival medio llena es justo lo que la frena. AL-FÉNIX (Zoe calcinante) sí es «hasta», porque ahí
lo que limita es el **reparto entre filas** (hasta 3 delante y hasta 1 detrás), no la potencia.

**Reglas de escritura:**
- La fórmula es **«hasta N»**, siempre. Nada de «un máximo de N», «hasta un total de N» ni
  «N o menos»: una sola forma para que no haya que interpretar.
- Con cupo fijo, **el número va a secas** (`a 2 enemigos`), sin «hasta» ni «máximo» en ninguna
  parte de esa frase.
- Si los objetivos tienen que ser **distintos**, se dice: `a 2 enemigos distintos`.
- El mensaje de rechazo dice **cuántos hacen falta**, no solo que no se puede
  («CASTIGO necesita 3 enemigos en la vanguardia del rival»).

**Lo comprueba la máquina.** `node tests/auditar_textos.js` compara el texto con la declaración y
falla si se contradicen: una Habilidad con `hastaCantidad` cuyo texto no dice «hasta N», o una de
cupo fijo cuyo texto sí lo dice. Es la clase de desajuste que nadie nota leyendo, porque las dos
frases suenan bien.

---

## §22. Mirar una pila también usa SU visor (Toto, 23-ago-2026)

La norma de §12.bis («buscar en una pila usa su visor completo») vale igual cuando **solo se
mira**, y cuando la pila **es del rival**. No hay excepción de «solo lectura»: mirar un mazo es
mirar un mazo, se coja carta o no.

El visor tiene las dos piezas que antes empujaban al modal genérico:

- **`opts.soloVisibles: [ids]`** — las demás cartas de la pila se pintan **de dorso**. Así se
  enseña la pila entera (su tamaño es información legítima) sin desvelar lo que no toca.
- **`opts.mirador`** — quién mira, cuando no es el dueño de la pila. Sin esto, en online el que
  mira se lleva el cartel de «esperando» y no ve nada.

Lo estrenó SEGUIMIENTO (Erasmo), que enseñaba la cima del mazo rival con el modal genérico:
`tests/auditar_imperativas.js` no lo cazaba porque su exención de «solo lectura» tapaba también
las pilas. Ya no.

---

## §23. El Oculto, entero (Toto, 23-ago-2026)

Las tres reglas del Oculto, juntas, porque estaban repartidas y ninguna carta las cuenta enteras:

1. **No puede ser objetivo DIRECTO de un ataque normal.** Un ataque que alcance a toda una fila
   sin elegir objetivo sí le llega, y quien tenga sus ataques normales convertidos en especiales
   (Infusión de maná) también puede señalarlo. Lo decide `motivoNoAtacable`, un solo sitio.
2. **El daño lo revela… solo si el Oculto viene de un efecto con duración.** Los permanentes
   (Pasiva de Edrielle, Activa de Súcubo, Zoe entrenando) NO se revelan: su fuente los repone en
   la siguiente pasada de pasivas, así que anunciarlo sería mentira.
3. **Escondite frágil**: al final de tu turno, si tu rival no tiene NADA a lo que atacar —ni una
   carta tuya alcanzable ni el ataque directo—, cada carta Oculta tuya echa una moneda; con cruz
   queda expuesta durante todo el turno del rival.

**La 3 es una regla del JUEGO, no de ninguna carta**, y por eso no se escribe en el texto de
Edrielle ni de ninguna otra: vive en el panel de reglas. Su condición se pregunta con el mismo
predicado que decide un ataque normal, así que cualquier carta futura que no se pueda atacar deja
de servir de tapadera sin tocar nada.

**Qué NO alcanza, y por qué está bien**: los Ocultos que llegan al empezar el turno del rival (el
camuflaje de Mill) no están puestos cuando se mira el candado. No hace falta: el candado lo montan
los permanentes, que pegan cada turno sin dejar de ser intocables; quien se camufla **por no
atacar** no está desgastando a nadie.
