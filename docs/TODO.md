# Pendientes — Karlos TCG

Lo que queda por hacer, con su porqué. Se actualiza al cerrar cada cosa: lo que Toto no rebate
después de hacerlo se da por bueno y se quita de aquí.

> Última revisión: 22-ago-2026 · 167 cartas en CARD_DB · 106 suites en verde

---

## 1. El grueso: las cartas del Excel

**157 filas de `docs/Cartas KG.csv` sin implementar.** Es lo único grande que le queda al juego.

Criterio que funcionó: mirar qué **etiquetas están huérfanas** y llenar esos huecos primero, en vez
de seguir el orden del CSV. Hoy sigue sin ninguna carta la etiqueta **'Dios'** en masculino (solo
existe 'Diosa').

---

## 2. Migración al DSL: 5 imperativas puras + 3 híbridas

Quedan (entre paréntesis, sus hooks a mano). En total, 155 hooks escritos a mano en el fichero.

| Carta | Qué le falta al DSL |
|---|---|
| **NoName** (9) | **corrección del 22-ago-2026**: esos 9 hooks NO son el clon, son **RÉPLICA**, que copia la Activa de un enemigo delegando `canActivateAbility`/`onExecuteAbility`/`onValidateTarget`/`onTargetsReady`/… al template ajeno. Candidata a irreducible: es *meta* sobre la interfaz de hooks, y funciona igual con cartas ya migradas (regresion68 lo fija) |
| **Erasmo** (5), **Silhouette** (7), **Sadame** (7), **Arthas** (8) | sin leer a fondo todavía: cada una pide su propio análisis |
| **Xanadu** (4, ya híbrida) | REPULSIÓN ABSOLUTA ya es declarativa; **ESTORNUDO DEVASTADOR** se queda por lo mismo que MOTOCICLETA: el enemigo que entra depende del que sale (límite de 2 Personajes sobre la vanguardia que QUEDARÍA) |
| **Mill** (4, ya híbrida) | su Pasiva ya es declarativa; **MOTOCICLETA** se queda: su tercer objetivo solo es válido según los dos anteriores (el límite de 2 Personajes se calcula sobre el campo que QUEDARÍA), y eso no es un filtro por campo sino una cuenta condicional |

Aparte, **Tengu orgulloso** (ya mixta) necesita "contar caras de moneda" para migrar su Activa.

---

## 3. Piezas del DSL pendientes

- **Descuento de tributo de Fusión de planos** (aplazado de antes).
- **Candado de la cola de reconexión** (aplazado de antes).
- **Estasis**: estado nuevo, en la categoría 'ocultacion' junto al Oculto (no pueden convivir). Se
  hará cuando llegue una carta que lo pida.

---

## 4. El editor de cartas (`public/editor.html`)

**Aparcado a propósito, pero es deuda real y medida**: el editor solo cubre el tercio más antiguo
del lenguaje.

- **23 de los 37 triggers** no existen ahí: `REACCION`, `AL_MORIR`, `AL_EQUIPAR`, los
  interceptores, `COSTE_COLOCACION`, `PERIODICO`, `INTERCEPTOR_LETAL`…
- **36 de las 45 ops** tampoco: `ELEGIR`, `EQUIPAR`, `MARCAR_TEMPORAL`, `DESCARTAR`, `COLOCARSE`, `CREAR_CLON`, `INTERCAMBIAR_POSICION`, `LOG`…

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

- **DERRENGAR y CASTIGO son "HASTA 3"**, no 3 exactos: con el cupo fijo quedaban muertas salvo con la vanguardia rival medio llena, y así son más jugosas. Con el botón de parar y cierre automático al no quedar objetivos, como AL-FÉNIX.
- **'Tecnología' es un SUBTIPO**, no una etiqueta. Estaba bien así.
- **La gramática del requisito depende del TIPO**: un Evento escribe `Requiere X.` y una carta
  normal `Requisito: X.`, y no son intercambiables — la equivocada se queda como prosa suelta, sin
  caja. COSTE y REQUISITO **sí conviven** en la misma carta, los dos al principio del texto.
  Lo vigila `auditar_textos` desde el 21-ago-2026.
- **`ANTES` es antes de lo que la FASE hace**, no antes de su cartel. Para lo que va nada más
  empezar el turno está la fase `INICIO DEL TURNO`.
- **Los interceptores NO entran en `PERIODICO`**: interceptar el cálculo del Furor es más fino que
  "correr en la fase de Furor".
- **Si una carta hace algo que solo aplicará en un momento concreto, se marca visiblemente** desde
  ya (marca con chapa), y el aviso se retira cuando el efecto llega.
- **El anuncio de una RÉPLICA espera al punto de compromiso de la habilidad COPIADA**
  (22-ago-2026). Copiar es dos decisiones seguidas y el anuncio no puede salir entre medias: se
  arma y lo dispara `DSL._comprometer`, igual que el cobro y la presentación. Con una copiada
  **imperativa** no hay forma de saber dónde está ese punto, así que ahí se anuncia al escanear,
  como siempre — resto que cada tanda de migración va reduciendo.
- **El `log` de una ACTIVA nunca lleva el nombre de su carta a pelo**: se rellena con `{carta}`,
  que es QUIEN la está usando, y con RÉPLICA esa no siempre es la dueña. Lo vigila
  `auditar_logs` desde el 22-ago-2026.
- **Quién lleva la cuenta de la última zona es el MOTOR, no la carta** (22-ago-2026): el trigger
  `AL_CAMBIAR_DE_ZONA` compara y actualiza `lastLocation` él solo, y la carta solo declara qué
  pasa en cada fila. Y un `INTERCAMBIAR_POSICION` refresca las Pasivas al momento: cambiar de
  fila es cambiar de condiciones.
- **«Durante el turno del rival» empieza y acaba CON ese turno** (23-ago-2026): nada más empezar y
  nada más terminar, no en las fases de Efectos Iniciales/Finales. Se declara con un `PERIODICO`
  en la fase `INICIO DEL TURNO`, no con `INICIO_TURNO` (que cae en Efectos Iniciales). Rúbrica §20.
- **El Oculto se pone como ESTADO, nunca tocando `stealth`** (23-ago-2026): `stealth` es la vista
  rápida que el motor DERIVA del estado en cada pasada de pasivas. Ponerlo a mano deja la carta
  oculta sin chapa, sin cuenta y sin líneas en el detalle; y quitarlo a mano no revela nada,
  porque la pasada siguiente lo vuelve a encender desde el estado (era el caso de "el daño lo
  revela", roto para Simon y Mill hasta hoy).
- **Una ficha se resuelve por NOMBRE, no por id** (22-ago-2026): `CREAR_CLON` busca
  `"Clon de " + quien usa la Habilidad`. Es lo que hace que NoName, al REPLICAR la Activa de
  Unmei, saque su propio clon sin que el op sepa nada de NoName (la vieja lo resolvía con un
  `card.name === "NoName" ? 901 : 900` escondido dentro de Unmei).
- **El hueco de un muerto no se cierra mientras su muerte siga teniendo consecuencias**
  (22-ago-2026). La recolocación (subir de retaguardia) espera a que se resuelvan las reacciones a
  esa muerte; si no, quien reacciona para ocupar el hueco se lo encuentra tapado. No es un
  parámetro por carta: es la regla, hermana del candado de recolocación de las muertes en grupo.
  Y **"en su lugar" es el hueco EXACTO**: quien ocupa el sitio de otro entra en su misma posición
  del array, que es la que se ve en la mesa.
- **Morir en el lugar de otro es un TRIGGER, no un efecto** (21-ago-2026, Guardaespaldas):
  `INTERCEPTOR_LETAL` hace él mismo la muerte por sustitución, porque eso ES lo que el trigger
  significa; la carta solo pone el texto. Su hermana desde la mano es `REACCION` con
  `sobre: 'MUERTE_ALIADO'`, que estrena el op `COLOCARSE` (entrar desde la mano en el hueco del
  muerto). La zona en la que murió la pasa el MOTOR: para cuando corre la reacción, la carta
  muerta ya está en el descarte y su `location` no sirve de nada.
- **`INICIO_TURNO` y `FIN_TURNO` se compilan a `PERIODICO`** (21-ago-2026). Se mantienen como
  sinónimos: hay cartas escritas con ellos y no hay razón para prohibirlos.
- **El "o bien" de los costes es `alternativas`** en COSTE_COLOCACION: se recorren EN ORDEN y manda
  la primera que se cumpla, así que lo que no cuesta nada va primero y el jugador no tiene que
  elegir entre gratis y pagando.
- **El orden de una fase es el de las reglas**: Evento → vanguardia → retaguardia → Daños por
  tiempo, y dentro de cada fila de izquierda a derecha (que es el orden del array, y el mismo en
  que se ven en la mesa).
- **MARAVILLA (Serafín) es Requisito, no autodestrucción**: si ya tienes uno, la carta ni se juega
  y avisa. La Pasiva se queda solo para lo que el requisito no ve (dos por resurrección o clon),
  destruyendo los más antiguos hasta que quede uno.
