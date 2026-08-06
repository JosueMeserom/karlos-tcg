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
