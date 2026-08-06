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

## 7. Longitud

**Fuera del alcance de la rúbrica por ahora** [Toto, 5-ago-2026]. Hay 22 cartas por encima de 240
caracteres (Neo 666, Arthas 451, Águila 375) y acortarlas es reescribirlas de verdad: decidir qué
matiz de regla se sacrifica. Eso merece su propia pasada con criterio de diseño, no ir de propina
en una tanda de terminología.

Consecuencia asumida: aplicar §4 (nada de abreviaturas) hace que unas pocas cartas **crezcan**.
Es el precio de la claridad y está aceptado.

---

## 8. Cómo verificar

`node <scratchpad>/auditar.js cartas.json` contrasta a máquina texto vs comportamiento y señala:
nombres de Habilidad que no coinciden con la plantilla, costes que el texto declara y la carta no
(o al revés), duraciones de Evento desalineadas, momentos prometidos sin disparador que los
respalde, guion largo y textos sobre el límite. **No arregla nada: señala.** Conviene pasarlo
después de añadir cartas nuevas.

Las suites de regresión NO comparan el `text` de las cartas (solo logs, flotantes y estado), así
que un cambio de redacción no las rompe — pero sí puede romper el PARSEO del detalle, que es
cliente puro. Ahí la verificación es visual.
