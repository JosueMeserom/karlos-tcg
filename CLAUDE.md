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

## Tarea en curso: RECONSTRUIR la batería de regresión desde cero
Las 24 suites históricas (r1–r23 + humo) vivían en los transcripts de las sesiones de chat y se perdieron; NO existen en ninguna parte y NO deben "recuperarse de memoria" ni inventarse. Se reescribe la batería completa en `tests/` ANTES de tocar nada del motor:

1. **Harness común** (`tests/harness.js`): carga `public/cartas_antes_de_dsl.js` (VIEJA) y `public/cartas.js` (NUEVA) en contextos aislados, ejecuta el mismo escenario contra ambas y compara salidas (logs, flotantes, estado final de la partida). Se diseña una sola vez y bien; las suites lo importan.
2. **Cobertura por enumeración**: extraer del propio `cartas.js` la lista completa de cartas migradas al DSL (~37). Esa lista ES la cobertura; ninguna carta migrada se queda sin escenarios.
3. **Tandas de 4-6 suites** por sesión, cada una en verde antes de empezar la siguiente.
4. **Diferencias intencionadas** (p. ej. logs pasados a 3ª persona — norma del proyecto: todo log visible por ambos jugadores va en 3ª persona con el nombre del jugador) se normalizan con mapas documentados DENTRO de la suite, con comentario que explique el porqué. Nunca se ignoran en silencio.
5. Cada suite imprime un mensaje de éxito explícito ("… IDÉNTICAS") o el recuento de FALLOS.

Solo con la batería completa en verde se retoma la siguiente tarea de motor: **interceptores de ataque** (§10-11 de `docs/DSL_cartas_diseno.md`; punto único de intercepción en `performAttack` con cola ordenada evento → equipos → pasivas; migrar Plan de equipo primero, luego Feria del cómic y Deuda con la mafia, con suite propia viejo-vs-nuevo). [Nombres corregidos por Toto: antes decía "Feria y Deuda de sangre", cartas que no existen.]

## Metodología (INNEGOCIABLE)
1. Tras CUALQUIER cambio en `cartas.js` o el intérprete: pasada estricta de TODAS las suites (`for f in tests/regresion*.js tests/humo.js; do node "$f"; done`), exigiendo el mensaje de éxito explícito de cada una. No vale "parece que pasa".
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

## Preferencias de Toto
- Español siempre. Honestidad ante todo: si algo no se puede verificar, decirlo en vez de improvisar.
- Toto valida visualmente en el navegador tras los cambios de cliente; darle instrucciones de prueba concretas cuando toque.