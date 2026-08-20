# Karlos TCG — Contexto del proyecto para Claude Code

## Qué es
Juego de cartas coleccionables online de Toto (nick Ultra_K), ambientado en su universo de ficción propio. Stack: Node.js + Socket.IO, cliente web, motor de cartas con DSL declarativo propio. Corre con pm2 en un mini-PC servidor Debian headless; Toto trabaja desde Windows con VS Code + Remote-SSH (el /home del servidor está también montado como Z: para explorar archivos, pero NUNCA se trabaja ni se ejecuta nada desde Z:). Idioma de trabajo: español.

Visión a largo plazo — esto es un juego completo, no solo un motor: quedan muchas más cartas por añadir (varias ya ideadas fuera del código y otras por idear), modos de juego contra la IA, división unranked/ranked, sobres virtuales con animaciones que se abren con puntos ganados jugando (contra la CPU o en ranked). El DSL se irá ampliando con arquetipos nuevos de habilidades para que las cartas futuras se definan de forma declarativa en lugar de con código ad hoc.

## Entorno de ejecución
- El proyecto VIVE en el servidor Debian. Node, pm2, git y las suites se ejecutan ALLÍ.
- Antes de asumir nada del entorno, comprobar dónde se ejecuta la sesión (uname, pwd) y que node esté disponible.
- pm2 sirve la instancia viva del juego. No reiniciarla salvo que Toto lo pida.
- OJO: pm2 sirve EL ÁRBOL DE TRABAJO (este directorio), no una rama git. Cualquier edición en disco sale al aire al recargar el navegador, aunque estés en una rama sin mergear; las ramas solo aíslan el historial. Toto betastea en la instancia viva (main): al terminar trabajo en rama, merge a main en cuanto la batería esté en verde para que git refleje lo servido. Cambios en server.js sí requieren reinicio de pm2 (pedirlo a Toto).

## Estructura real (raíz del proyecto)
- `server.js` — servidor (lobby, salas, chat persistente).
- `database.sqlite`, `sessions.sqlite` — datos vivos. NO TOCAR, NO COMMITEAR.
- `package.json`, `package-lock.json`, `node_modules/`.
- `antiguos/` — backups. NO TOCAR. Incluye `raíz - antes de migrar a Claude Code/`: foto del proyecto tomada justo antes de esta migración.
- `public/` — cliente y motor:
  - `cartas.js` — motor + cartas ACTUAL (con intérprete DSL). El archivo vivo principal.
  - `cartas_antes_de_dsl.js` — base canónica de regresión. NO SE EDITA NUNCA (ver abajo).
  - `index.html` — cliente completo (¡es CRLF! conservar finales de línea al editar).
  - `global.css`, `lobby.html`, `landing.html`, `editor.html` (editor visual de cartas), `deckbuilder.html`, `ai.js`, `guardian.js`, `reglas.js`.
- `docs/DSL_cartas_diseno.md` — documento de diseño del DSL. §10 (capa de reglas con overrides en cascada) y §11 (descriptor de ataque + interceptores por prioridad) son la referencia de la tarea de interceptores.
- `tests/` — batería de regresión (EN RECONSTRUCCIÓN, ver "Tarea en curso").

## Base de regresión — VERIFICADA (20-jul-2026)
`public/cartas_antes_de_dsl.js` (494.857 bytes) coincide exactamente en tamaño con la base canónica usada en todas las sesiones de chat: se da por buena. Matiz documentado y esperado: contiene un esqueleto DSL temprano (`const DSL`, `_runEffectList` ×9, `_match` ×3) — la foto se tomó con el primer andamio del DSL ya presente. No es un error; no "corregirlo".

## Estado: batería de regresión reconstruida + migración al DSL por tandas
La batería histórica (r1–r23 + humo) se perdió con los transcripts de chat y se reconstruyó desde cero (NO se "recupera de memoria" ni se inventa nada). **A 21-jul-2026: 19 suites / 121 escenarios, todo en verde.** Hitos cerrados: interceptores de ataque (tag `v0.2-interceptores`), tanda 1 de migración (cartas simples) y tanda 2 (trigger `REACCION`, §12 del doc de diseño). Cómo está montada la batería y cómo se añaden suites nuevas:

1. **Harness común** (`tests/harness.js`): carga `public/cartas_antes_de_dsl.js` (VIEJA) y `public/cartas.js` (NUEVA) en contextos aislados, ejecuta el mismo escenario contra ambas y compara salidas (logs, flotantes, estado final de la partida). Se diseña una sola vez y bien; las suites lo importan.
2. **Cobertura por enumeración**: extraer del propio `cartas.js` la lista completa de cartas migradas al DSL (~37). Esa lista ES la cobertura; ninguna carta migrada se queda sin escenarios.
3. **Tandas de 4-6 suites** por sesión, cada una en verde antes de empezar la siguiente.
4. **Diferencias intencionadas** (p. ej. logs pasados a 3ª persona — norma del proyecto: todo log visible por ambos jugadores va en 3ª persona con el nombre del jugador) se normalizan con mapas documentados DENTRO de la suite, con comentario que explique el porqué. Nunca se ignoran en silencio.
5. Cada suite imprime un mensaje de éxito explícito ("… IDÉNTICAS") o el recuento de FALLOS.

**Migración al DSL, en curso por tandas** (ver la memoria `estado-migracion-dsl` para el detalle vivo): cada tanda = migrar cartas en `public/cartas.js` + suite viejo-vs-nuevo nueva + pasada estricta + commit + push. Tandas hechas: interceptores (Plan de equipo, Feria del cómic, Deuda con la mafia), tanda 1 (simples), tanda 2 (REACCION). Candidatas siguientes: `AL_MORIR` (onDeath/onAllyDeath), clones/tokens (más arquitectura), y las irreducibles de §6 que se quedan como código. El recuento de hooks de una carta NO es buen proxy de complejidad.

## Metodología (INNEGOCIABLE)
0. **Copiar una carta hermana NO exime de repasar sus normas.** El origen de casi todos los fallos repetidos de esta fase es replicar un patrón y heredar de paso un flag que apaga una norma. Al reusar una carta como plantilla, leer QUÉ hace cada campo que se copia; las auditorías (`auditar_costes`, `auditar_presenta`, `auditar_llegadas`…) están para cazar justo eso, así que pasarlas TODAS es lo que cierra el agujero, no la buena memoria.
1. Tras CUALQUIER cambio en `cartas.js` o el intérprete: pasada estricta de TODAS las suites (`for f in tests/regresion*.js tests/humo.js; do node "$f"; done`, más las de aserción: `nuevas*`, `modales_pilas`, `badge_furor_forzado`, `picker_mano`, `capas_cliente`, `costes_presenta` y **`online`**), exigiendo el mensaje de éxito explícito de cada una. No vale "parece que pasa".
2. `node --check` tras editar cualquier `.js`.
3. `index.html` es CRLF: conservar los finales de línea al editar.
4. Nunca inventar archivos ni rutas no confirmados por el árbol de directorios o por Toto.
5. Razonamiento coste-beneficio honesto, no recomendaciones genéricas de "buenas prácticas"; si algo no compensa para este proyecto, decirlo.
6. Al cerrar cada tarea, resumir qué se cambió y por qué (qué se sustituyó por qué cosa).

## Git
- Conventional commits: `test:`, `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`; asunto imperativo, ≤72 caracteres; cuerpo solo si el diff lo merece.
- PROHIBIDO commitear con la pasada estricta en rojo.
- Fase batería: commit automático por cada suite nueva en verde — `test(rN): <cartas cubiertas> — pasada completa en verde`.
- Fase juego (posterior): rama por feature (`feat/sobres-virtuales`, `feat/ranked`…), merge a main solo con la batería en verde; arreglos pequeños directos a main sin liturgia. Tag en cada hito (`v0.x-nombre`).
- La coautoría de Claude en los commits se mantiene (decisión de Toto).
- No commitear jamás: `node_modules/`, `*.sqlite`, `antiguos/` (están en `.gitignore`; respetarlo).
- **Asesoría periódica de commits**: al cerrar cada tanda de suites o cada hito de feature, aconsejar proactivamente y en breve a Toto sobre la estrategia git para lo que viene (cuándo abrir rama, cuándo taggear, si conviene squash…). Lo ha pedido explícitamente: no esperar a que pregunte.

## Modelos y tokens (plan Pro, uso compartido con claude.ai)
- Fable 5 para diseñar el harness, casos delicados y depuración difícil; cambiar a Sonnet (`/model`) para el trabajo mecánico de replicar el patrón suite tras suite.
- Trabajar por tandas que terminen en punto commiteado, para poder parar sin perder nada si se agota la ventana de uso.

## Vocabulario de Toto
- **"Detalle"**: el rectángulo azul que aparece en la zona izquierda del cliente al hacer hover sobre una carta, con Efectos actuales, "Afectado por:", duración, habilidades, etc.

## Normas de UX del cliente (INNEGOCIABLES)
- **Elegir una carta que ya está EN EL CAMPO** (vanguardia/retaguardia, propia o rival) para un efecto de Habilidad/Ayuda/Evento: SIEMPRE reborde verde en el propio tablero (como atacar, o como Manzanahoria/Longaniza), NUNCA el modal genérico de búsqueda visual. El modal queda solo para mano, mazo (el mazo además usa el visor de mazo completo, no el modal simple) o descartes. En el DSL: `ELEGIR` con `de: "ALIADOS"|"ENEMIGOS"|"TODOS"` usa `pickBoardTargets` por defecto; `forzarModal: true` debe justificarse caso a caso, auditar cada vez que se use en una carta nueva.
- **Sintaxis de «Afectado por:» / «Efectos actuales:»** (detalle) — gramática ÚNICA, ver §13 del doc de diseño para el detalle completo:
  `<afección> [(N turnos restantes)] [por HABILIDAD], fuente: [evento ]<Nombre>[ [copyId]] de <JX (Nick)>[, en su pila de descartes]` · o `fuente: esta carta`.
  Los turnos se omiten si no procede (auras/permanentes); el `por HABILIDAD` **solo** si lo causa una Pasiva/Activa (se omite en Eventos y Ayudas). `Efectos actuales:` es la vista inversa: idéntica pero con `objetivo:`. Orden de stats **VIDA → DEF → ATQ** (como en la cara de la carta). Construir SIEMPRE con los helpers `refCarta()` y `lineaEfecto()` de `index.html`; nunca concatenar el nombre a mano. Los **anexos** usan esta misma gramática (`Anexo:` / `Anexado a:` en el hueco de la afección): ver §13.3.bis.
- **Nombrar una carta en el log**: SIEMPRE `getCardNameWithOwner()` → `<Nombre>[ [copyId]] de <JX (Nick)>` (mismo formato que `refCarta`, sin paréntesis anidados). Nunca `card.name` a secas, y **nunca envolver ese nombre entre paréntesis** — ya los lleva dentro. Al añadir una línea de log, comprobar que no queda `(... (...))`.
- **Buscar en una PILA (mazo o descartes) usa SIEMPRE su visor completo**, nunca el modal genérico de selección. `openDeckSearchViewer(pid, elegibles, titulo, aviso, maxCount, zona)` con `zona: 'deck'|'discard'` — o, en el DSL, un `BUSCAR` con `en: "MAZO"` / `"DESCARTES"`, que ya lo elige solo. Se ve la pila ENTERA y solo las elegibles llevan reborde verde; sin elegibles, el visor se abre igual con el aviso y se cierra clicando el fondo. `openVisualSearchModal` solo lista las válidas y esconde el resto: queda para la **mano** y para búsquedas **multi-zona** (`en: ["MANO","MAZO"]`), donde no hay una sola pila que enseñar.
- **Cancelar una búsqueda depende de la pila** (§12.bis de la rúbrica): el **MAZO** obliga a elegir una vez abierto el visor (arrepentirse es ANTES, en la pregunta; mirarlo y salirse sería leerlo gratis), los **DESCARTES** se cancelan siempre (pila pública). Y al rival no se le enseña el cartel de espera mientras la búsqueda siga siendo cancelable.
- **Elegir de una MANO usa su picker**, no el modal genérico: se oscurece todo menos esa mano y se clica la carta (`pickBoardTargets(..., { mano: true })`). Reborde verde SOLO si no vale toda la mano; sin elegibles no se abre nada (aviso por log); la mano del RIVAL se elige a ciegas viendo los dorsos. Campo y mano nunca en el mismo selector: se pregunta por zona primero.
- **Guion corto (`-`), nunca guion largo (`—`)**, en TODO lo que el jugador pueda ver: logs, detalle, modales, títulos, textos de carta. El guion largo se queda solo en los comentarios del código.

## Orden de la cadena al jugar una carta (CONSULTAR, no deducir)
`docs/rubrica_textos_cartas.md` §14. Se ha derivado mal varias veces seguidas: **nada visible ni irreversible hasta el punto de compromiso, y en ese punto ocurre todo junto** (log → sale de la mano y entra en su zona → presentación que aterriza → recién entonces el efecto). El punto de compromiso depende de la carta: al clicarla si no hay elecciones, al confirmar objetivo, al completar la última elección cancelable, al ABRIR el visor si es el mazo, al ELEGIR si son los descartes. Mientras se pueda cancelar, la carta **sigue en la mano** y el rival no ve nada.

## Al añadir o tocar una carta (leer ANTES de escribir el `text`)
El Excel de Toto (`docs/Cartas KG.csv`, **ignorado por git a propósito: son sus ideas sin publicar, no se versiona ni se sube a ninguna parte**) es la fuente de la MECÁNICA, nunca de la REDACCIÓN. Copiar su texto tal cual es el error más repetido de esta fase; el CSV arrastra formulaciones viejas de antes de fijar la rúbrica.
1. Escribir el `text` aplicando `docs/rubrica_textos_cartas.md`, no copiándolo del CSV.
2. **Los Eventos tienen su propia gramática** (§10 de la rúbrica): `N turnos.` + `Requiere X.` (nunca `Requisito:`) + marcadores literales con coma y mayúscula inicial (`Mientras esté en juego, …`). Un marcador mal escrito no da error: el detalle lo pinta como párrafo plano y no se nota hasta verlo en el navegador.
3. Un Evento **no anuncia su propia destrucción al expirar**. Y "descartar" es solo desde la MANO; desde el campo es "destruir" (§11).
4. `node tests/auditar_textos.js` tiene que salir en 0 problemas. Comprueba en máquina todo lo anterior — si añades una regla nueva, mira que de verdad falle al romperla antes de fiarte.
5. Si la carta busca en una pila o elige algo del campo, repasar las dos normas de UX de arriba: son las que más se saltan al replicar patrones.
6. **NO COPIAR `cancelable: false` de una carta hermana.** Es el interruptor que apaga la norma del coste: el compilador de `ACTIVA` deduce si hay ventana para arrepentirse mirando si el primer efecto es una elección cancelable, y ese flag le dice que no la hay, así que **cobra el Furor al confirmar la Habilidad, antes de elegir objetivo**. Ha pasado tres veces (Igniz, Alabanza, Erazor Djinn copiada de Raiju). `node tests/auditar_costes.js` tiene que salir en 0 sin declarar.
7. **Id EXPLÍCITO siempre** (siguiente libre de la serie 2000). Los ids se autogeneran recorriendo `CARD_DB` en orden desde 1000: una carta sin id metida en medio del array le corre el id a todas las de detrás y pone en rojo media batería de golpe, porque la base congelada no la tiene.

## Preferencias de Toto
- Español siempre. Honestidad ante todo: si algo no se puede verificar, decirlo en vez de improvisar.
- Toto valida visualmente en el navegador tras los cambios de cliente; darle instrucciones de prueba concretas cuando toque.