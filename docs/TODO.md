# Pendientes — Karlos TCG

Lo que queda por hacer, con su porqué. Se actualiza al cerrar cada cosa: lo que Toto no rebate
después de hacerlo se da por bueno y se quita de aquí.

> Última revisión: 21-ago-2026 · 167 cartas en CARD_DB · 100 suites en verde

---

## 1. El grueso: las cartas del Excel

**157 filas de `docs/Cartas KG.csv` sin implementar.** Es lo único grande que le queda al juego.

Criterio que funcionó: mirar qué **etiquetas están huérfanas** y llenar esos huecos primero, en vez
de seguir el orden del CSV. Hoy sigue sin ninguna carta la etiqueta **'Dios'** en masculino (solo
existe 'Diosa').

---

## 2. Migración al DSL: 11 imperativas puras

Quedan (entre paréntesis, sus hooks a mano). En total, 168 hooks escritos a mano en el fichero.

| Carta | Qué le falta al DSL |
|---|---|
| **Guardaespaldas** (1), **Uniojo** (1) | reacciones a la muerte de un aliado, una desde el campo y otra desde la mano. Misma familia; el trigger `REACCION` ya existe |
| **Unmei** (2), **NoName** (9) | `CREAR_CLON` — una pieza, dos cartas |
| **K.I.N.O.** (2) | `INTERCAMBIAR_POSICION` y "al entrar en esta zona" |
| **Erasmo** (5), **Silhouette** (7), **Sadame** (7), **Mill** (7), **Xanadu** (6), **Arthas** (8) | sin leer a fondo todavía: cada una pide su propio análisis |

Aparte, **Tengu orgulloso** (ya mixta) necesita "contar caras de moneda" para migrar su Activa.

---

## 3. Piezas del DSL pendientes

- **`PERIODICO` absorbe a `INICIO_TURNO` y `FIN_TURNO`** (11 abilities). Son la misma idea con la
  fase escondida en el nombre. OJO: hay que mover el despacho al punto EXACTO donde hoy se les
  llama, o cambia el orden respecto a los Daños por tiempo y los contadores.
  **Norma del orden, que debe cumplirse siempre**: Evento → vanguardia → retaguardia → Daños por
  tiempo, y dentro de cada fila de izquierda a derecha (que es el orden del array).
- **Costes y requisitos con "o bien"**: varios grupos alternativos en una carta, mezclando coste y
  requisito. Desbloquea **Karlos (KL)** y todas las del Excel que traigan "o bien". La mitad ya
  existe: el detalle YA pinta esas híbridas en caja apilada.
- **Descuento de tributo de Fusión de planos** (aplazado de antes).
- **Candado de la cola de reconexión** (aplazado de antes).
- **Estasis**: estado nuevo, en la categoría 'ocultacion' junto al Oculto (no pueden convivir). Se
  hará cuando llegue una carta que lo pida.

---

## 4. El editor de cartas (`public/editor.html`)

**Aparcado a propósito, pero es deuda real y medida**: el editor solo cubre el tercio más antiguo
del lenguaje.

- **21 de los 35 triggers** no existen ahí: `REACCION`, `AL_MORIR`, `AL_EQUIPAR`, los
  interceptores, `COSTE_COLOCACION`, `PERIODICO`…
- **31 de las 40 ops** tampoco: `ELEGIR`, `EQUIPAR`, `MARCAR_TEMPORAL`, `DESCARTAR`…

Cuando se retome, además de ponerlo al día, Toto quiere:
- un **"detalle" que se renderice igual que en partida**, con los datos que estés metiendo;
- **descripciones autorredactadas** a partir de lo que hace el DSL, editables a mano encima.

Norma a partir de ahora: cada pieza nueva del DSL entra también en el editor.

---

## 5. Limitaciones conocidas de la batería

- **`tests/online.js` no ve bloqueos de la cola de acciones**: no modela que sea FIFO y bloqueante,
  así que un softlock de ese tipo pasa verde. Está escrito en su cabecera.
- El harness **anula `render()`**, así que nada visual (chapas, flechas, animaciones) se comprueba
  ahí: para eso está `tests/capas_cliente.js`, que fija la ESTRUCTURA, y los ojos de Toto.

---

## 6. Decisiones cerradas (para no volver a preguntarlas)

- **DERRENGAR y CASTIGO piden 3 enemigos EXACTOS**, no "hasta 3". Hace las cartas más jugosas.
- **'Tecnología' es un SUBTIPO**, no una etiqueta. Estaba bien así.
- **`ANTES` es antes de lo que la FASE hace**, no antes de su cartel. Para lo que va nada más
  empezar el turno está la fase `INICIO DEL TURNO`.
- **Los interceptores NO entran en `PERIODICO`**: interceptar el cálculo del Furor es más fino que
  "correr en la fase de Furor".
- **Si una carta hace algo que solo aplicará en un momento concreto, se marca visiblemente** desde
  ya (marca con chapa), y el aviso se retira cuando el efecto llega.
- **MARAVILLA (Serafín) es Requisito, no autodestrucción**: si ya tienes uno, la carta ni se juega
  y avisa. La Pasiva se queda solo para lo que el requisito no ve (dos por resurrección o clon),
  destruyendo los más antiguos hasta que quede uno.
