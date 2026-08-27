# Pendientes — Karlos TCG

Lo que queda por hacer, con su porqué. Se actualiza al cerrar cada cosa: lo que Toto no rebate
después de hacerlo se da por bueno y se quita de aquí.

> Última revisión: 27-ago-2026 · 176 cartas en CARD_DB · 117 suites en verde

---

## 1. El grueso: las cartas del Excel

**CROSSOVER HOLLOW KNIGHT (serie HK), tanda 1 hecha el 26-ago-2026** (`tests/hollow_knight.js`):
Cáscara violenta, Gran cáscara centinela, The Knight y **Hollow Knight**, que estrena la Estasis.
**Tanda 2 (26-ago-2026)**: **Devoto acechador** (venganza obligada al inicio de su turno, con
`bonoAtq` en ORDENAR_ATAQUE) y **Grimm** (se traga TODO el Furor de un aliado y llega mermado para
siempre si la ofrenda no llegaba a 4).

**Tanda 3 (26-ago-2026)**: **Hornet**, con las dos piezas que le faltaban al DSL — el op
`CONTAR_OBJETIVO` (cuántas veces le he hecho ESTO a ESTA carta, con `enLaVez: N` para que solo
cuente la enésima, y su filtro hermano `noContadoEn` para no repetir objetivo) y el trigger
`ANTES_DE_RECIBIR_DAÑO` con el op `REDUCIR_DAÑO`, que es el equivalente a "+N de DEF durante ese
ataque" **respetando el suelo del juego** (un golpe nunca deja de quitar algo; `sinSuelo` para
quien de verdad quiera anularlo).

**Tanda 4 (26/27-ago-2026)**: **Mapa de Cornifer**, el primer Evento CON coste de colocación, con
tres piezas nuevas — `soloPrimeras: N` en BUSCAR (la búsqueda solo ve la cima del mazo, apoyada en
el `soloVisibles` del visor que ya existía), `siExito` en BUSCAR, y `MARCAR_JUGADOR` dentro de una
PASIVA_CONTINUA con `jugador: "RIVAL"` y `valor: "DUENO"` (la mano del rival, siempre visible).
Además, el motor aprendió que un EVENTO también está "en mesa" para sus pasivas continuas (se
salía por el guard de vanguardia/retaguardia y no corrían nunca) y que el robo de la fase se puede
saltar (`_saltarRobo`) cuando algo ya se ha llevado una carta en su lugar.

**Tanda 5 (27-ago-2026): CROSSOVER CERRADO.** **Aguijón onírico** entra con tres piezas más —
`atacante` en el op ATACAR (el golpe lo da OTRO: la Ayuda se la das a un aliado y pega él),
`siMuere` como hermano de `siExito`, y `excluirPagador` en ELEGIR ("otro aliado DIFERENTE"). Más
el campo computado `paralizado` (lleva una marca que le hace saltarse el turno), que es lo que
permite filtrar "un enemigo que no pueda actuar".

**Las 9 cartas de la serie HK están hechas** (`tests/hollow_knight.js`, 63 comprobaciones).

**Ajuste de equilibrio en Hollow Knight** (26-ago-2026): se le añadió **Coste: 2 de Furor**, que
en el Excel no tiene. Sus stats (5/5/7 = 17) están al nivel de Xanadu, Valafar o Zoe calcinante, y
las cuatro que hay por encima (Diego Antonio, Némesis, Garret, Kami) pagan todas un peaje serio
por entrar. Era la única de ese escalón que entraba gratis, y encima protegida por su propia
Estasis mientras esperaba. Los stats se dejan como están.

**153 filas de `docs/Cartas KG.csv` sin implementar.** Es lo único grande que le queda al juego.

Criterio que funcionó: mirar qué **etiquetas están huérfanas** y llenar esos huecos primero, en vez
de seguir el orden del CSV. Hoy sigue sin ninguna carta la etiqueta **'Dios'** en masculino (solo
existe 'Diosa').

---

## 2. Migración al DSL: CERRADA — quedan 2 irreducibles + 3 híbridas

**La fase de migración por tandas termina el 26-ago-2026.** Ya no queda ninguna carta "pendiente
de migrar": lo que sigue escrito a mano está ahí porque se ha leído a fondo y se ha decidido que
no compensa, con su motivo y su suite. Lo de abajo es la lista de esas decisiones, no una cola de
trabajo. En total, 128 hooks escritos a mano en el fichero (122 sin contar los `get*` de
interfaz, que es como se contaban antes).

| Carta | Qué le falta al DSL |
|---|---|
| **NoName** (9) | **IRREDUCIBLE, decidido el 26-ago-2026.** RÉPLICA no *hace* nada: DELEGA. Cada uno de sus hooks mira si hay `mimicId` y, si lo hay, llama al hook del mismo nombre de la plantilla ajena. Es *meta* sobre la interfaz de hooks, no una habilidad — y por eso mismo funciona igual con cartas ya migradas al DSL (sus hooks los genera el compilador y se llaman igual). Un trigger declarativo para esto sería un `DELEGA_EN_OTRA_CARTA`, o sea el propio mecanismo con otro nombre. Cubierta por `tests/regresion68.js` (4 escenarios) y `tests/replica.js` (el anuncio y el `mimicId` en el punto de compromiso) |
| **Arthas** (7, ya híbrida) | **IRREDUCIBLE, leída a fondo el 25-ago-2026.** Ya son declarativos el veto de Karolina al colocarla y el +3 de ATQ del arma. Lo demás es la maquinaria de carta DUAL, que no comparte con NADIE: el modal de "¿cómo la juegas?" (que además cambia el tipo de carta a mitad de jugada), `onDualLimitFallback`, su botón morado propio (`getCustomActions`, como el de Erasmo), un `onExecuteAyuda` que puede sacarla de la MANO o del CAMPO, la autodestrucción si Karolina llega después, y la vuelta al campo al caer su portador eligiendo fila por cupo. Cubierta por `tests/regresion73.js` (7 escenarios), escrita ANTES de tocarla |
| **Erasmo** (2, ya híbrida) | DOMINIO ya es declarativa; **SEGUIMIENTO** se queda: una línea que expone la mano rival en cada pasada de pasivas y un BOTÓN propio para mirar el mazo (haría falta un trigger de acción personalizada para una sola carta) |
| **Xanadu** (4, ya híbrida) | REPULSIÓN ABSOLUTA ya es declarativa; **ESTORNUDO DEVASTADOR** se queda por lo mismo que MOTOCICLETA: el enemigo que entra depende del que sale (límite de 2 Personajes sobre la vanguardia que QUEDARÍA) |
| **Mill** (4, ya híbrida) | su Pasiva ya es declarativa; **MOTOCICLETA** se queda: su tercer objetivo solo es válido según los dos anteriores (el límite de 2 Personajes se calcula sobre el campo que QUEDARÍA), y eso no es un filtro por campo sino una cuenta condicional |

**Sadame, cerrada el 25-ago-2026** (suite `tests/regresion72.js`), sin un solo hook a mano: sus
ocho salieron con `soloDe` en SOBRECURACION, el trigger **FUROR_PROPIO** (que de paso se llevó los
hooks de Furor de **Garret** y **Meca EBA**) y `alterna` en el op **ANEXAR** — señalar a un zombi
tuyo deshace su anexo, que es lo que dice el texto que Toto reescribió ese mismo día.

Su Activa **cambió de mecánica dos veces en un día**, con las dos reescrituras del texto de Toto.
Como quedó (26-ago-2026): sin zombis en pie va directa a elegir a quién zombificar; con zombis
pregunta (op **OPCIONES**, ramas declarativas con `si` por rama y botón de CANCELAR), y soltar es
una elección "hasta N" en el tablero con botón de parar, igual que AL-FÉNIX. **Spencer, Wolfgang,
Meca EBA, Arthas y Limo crecido** siguen abriendo su `openChoiceModal` a mano: son los siguientes
usuarios naturales de OPCIONES.

**Silhouette, cerrada el 25-ago-2026** (suite `tests/regresion71.js`): sus siete hooks salieron con
cuatro piezas nuevas, todas genéricas - `eventoEnJuego` como requisito de colocación (lo compartían
las tres cartas de 'Una buena razón', así que Xanadu y Diego Antonio soltaron el suyo de paso),
los campos `atkBase`/`defBase`, `guardaSuma` en lista y `FIJAR_STAT` dentro de una
`PASIVA_CONTINUA` (fijar un stat en cada pasada en vez de sumarle un delta).

**Tengu orgulloso, cerrada el 26-ago-2026** (suite `tests/regresion74.js`), la última de la lista:
lo que le faltaba al DSL era saber **contar caras**. Una `MONEDA` con `cantidad` mayor que 1 deja
el recuento en una var (`guardaCaras`) y sus ramas pasan a leerse "salió al menos una" /
"ninguna"; el `cantidad` de un `ELEGIR` puede venir de esa var, y el op `LOG` rellena con ellas.
Con eso, DOMINANCIA ILUSORIA es declarativa entera.

---

## 3. Piezas del DSL pendientes — LAS TRES, HECHAS (26-ago-2026)

**Descuento de tributo — HECHO el 26-ago-2026** (`tests/tributo_descuento.js`, 9 comprobaciones).
El tributo de colocación era un número CERRADO en el compilador -horneado en el filtro del
requisito y en el delta del cobro-, así que nadie podía rebajarlo desde fuera; por eso 'Fusión de
planos' llevaba su regla sin implementar desde que se escribió. Ahora es un punto de consulta
(`DSL._costeTributo`) y el descuento se declara como una regla más:
`{ trigger: "GLOBAL_TRIBUTO", reglas: [ { si: { filtros: [...] }, accion: { mitad: true } } ] }`,
con `accion: { sumar: N }` de hermana. Vale para cualquier Evento futuro que quiera abaratar o
encarecer tributos, y el texto de la carta por fin dice lo que hace.

**Candado de la cola — HECHO el 26-ago-2026** (`tests/candado_cola.js`, 13 comprobaciones).
Mientras un cliente espera un volcado autoritativo (reconexión, o un hueco de orden) las acciones
ORDENADAS ya no se aplican sobre un tablero que todavía no es el bueno: se **retienen** aparte y,
al importar el volcado -que trae el `_seqSnapshot` del servidor-, se descarta lo que el volcado ya
incluye y se aplica en orden lo que pasó después. El candado se pone también al RECONECTAR, que es
el caso de verdad. Antes esto era una ventana de ~60 ms en la que se confiaba.

**Estasis — HECHA el 26-ago-2026** (`tests/estasis.js`, 14 comprobaciones). Un solo predicado en
el motor, `_enEstasis(card)`, consultado desde los seis sitios que la hacen valer: el targeting de
ataques (va DELANTE del Provocando y del Oculto), el daño, los cambios de stat (no le bajan nada y
no gana Furor), los estados nuevos (salvo la propia Estasis), el agotamiento (se reimpone en cada
pasada) y el ataque directo (no cuenta como defensora). En el DSL los pools la excluyen por
defecto, igual que a los Avatares, y se aplica con
`{ op: "APLICAR_ESTADO", estado: "estasis", duracion: N }`. Chapa propia 🧊 con su cuenta.

---

## 3.bis. Pasada de redacción a TODAS las cartas (pedido por Toto, 26-ago-2026)

Las descripciones no son consistentes entre sí. La rúbrica existe y `auditar_textos.js` la
comprueba, pero **solo caza lo que sabe mirar**: quedan cartas con la misma mecánica redactada de
formas distintas, y eso no lo ve ninguna auditoría. Hace falta una pasada carta por carta.

El plan que tiene sentido, y el orden importa: **primero la auto-redacción desde el DSL** (§4, el
editor la quiere igual), que genera la frase a partir de lo que la carta HACE. Sirve para dos
cosas a la vez — de plantilla para reescribir las viejas, y de **comparador**: si la frase generada
y el `text` escrito no dicen lo mismo, o el texto está mal o la carta hace otra cosa. Eso último ya
pasó con Sadame el 26-ago-2026, y se descubrió de casualidad. Ahora es viable: 160 cartas de 167
son declarativas.

---

## 4. El editor de cartas (`public/editor.html`)

**Aparcado a propósito, pero es deuda real y medida**: el editor solo cubre el tercio más antiguo
del lenguaje.

- **23 de los 37 triggers** no existen ahí: `REACCION`, `AL_MORIR`, `AL_EQUIPAR`, los
  interceptores, `COSTE_COLOCACION`, `PERIODICO`, `INTERCEPTOR_LETAL`…
- **38 de las 47 ops** tampoco: `ELEGIR`, `EQUIPAR`, `MARCAR_TEMPORAL`, `DESCARTAR`, `COLOCARSE`, `CREAR_CLON`, `INTERCAMBIAR_POSICION`, `LOG`, `ORDENAR_ATAQUE`…

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

- **«A N» es N EXACTOS; «a hasta N» se adapta** (23-ago-2026, rúbrica §21). La forma de escribirlo
  ES la regla, y el cupo fijo es una herramienta de EQUILIBRIO: **CASTIGO (Serafín) vuelve a pedir
  3 exactos** -se probó como "hasta 3" el 21-ago y deja la carta demasiado fuerte-, mientras que
  **AL-FÉNIX (Zoe calcinante) se queda con "hasta"**, porque ahí lo que limita es el reparto entre
  filas. `DERRENGAR` (Nethuns) sigue como "hasta 3": no es un Arcángel y no se tocó. Lo vigila
  `auditar_textos` comparando el texto con la declaración.
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
