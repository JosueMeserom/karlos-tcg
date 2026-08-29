# 🎴 Karlos TCG

[![Tests](https://github.com/JosueMeserom/karlos-tcg/actions/workflows/tests.yml/badge.svg)](https://github.com/JosueMeserom/karlos-tcg/actions/workflows/tests.yml)

Juego de cartas coleccionables **online y en tiempo real**, ambientado en un universo de ficción propio.

La idea sale de mezclar lo que más me gustaba de **Yu-Gi-Oh!** (los duelos, las cartas con personalidad, las combinaciones que no veías venir) con la estructura de energía y turnos del **TCG de Pokémon**. Dos personas abren una sala, cada una con su mazo, y juegan desde el navegador; no hay nada que instalar.

---

## 🎮 Cómo se juega (en treinta segundos)

- Cada jugador tiene **dos filas**: **vanguardia** (la que pelea) y **retaguardia** (la que espera). En vanguardia caben cuatro cartas, y como mucho dos Personajes.
- No hay puntos de vida: hay una pila de **Retribución**. Cada vez que pierdes una carta coges una de esa pila a la mano, y cuando la pila se acaba, **pierdes**. Así que ir por detrás no es solamente malo: también te va armando.
- Las cartas acumulan **Furor** (la energía) turno a turno, y lo gastan en sus **Habilidades**.
- Se ataca de dos maneras: **normal** (tu ATQ contra su DEF) y **especial** (que atraviesa defensas y llega donde el normal no llega).
- Y luego está lo que hace divertido un TCG: los **estados** (Sueño, Ceguera, Confusión, Daño por tiempo...), los **Eventos** (que cambian las reglas mientras duran), los equipos, las cartas que se anexan a otras, las que reaccionan desde tu mano cuando te atacan, y las que se **esconden** o se quedan **en Estasis**, fuera del alcance de todo.

Las reglas completas están dentro del propio juego, en su panel de reglas.

---

## 🧩 Las cartas son datos, no código

Las 176 cartas no están programadas una a una: hay un **lenguaje declarativo propio** (un DSL, con **42 disparadores** y **48 operaciones**) y un compilador que traduce esa declaración a los enganches que el motor entiende. Una carta se lee prácticamente como su texto:

```js
{
    name: "Cáscara violenta", hp: 2, def: 2, atk: 3, type: "Esbirro",
    text: "P: PESTILENCIA: Al morir, todas las demás cartas del campo pierden 1 de VIDA.",
    abilities: [
        { trigger: "AL_MORIR", nombre: "PESTILENCIA", trasMorir: true,
          efectos: [
            { op: "MODIFICAR_STAT", target: { quien: "TODOS" }, stat: "currentHp",
              delta: -1, comprobarMuerte: true,
              animacion: "DANO_VERDADERO", animacionSinLanzador: true } ] }
    ],
}
```

**169 de las 176** se declaran así. Las que siguen con código escrito a mano son las que de verdad no comparten patrón con ninguna otra (y cada una lleva apuntado **por qué** se queda como está).

La ventaja no es escribir menos, es que **cada decisión se toma en un solo sitio**: cuando cambió la norma de en qué momento se cobra el coste de una Habilidad, no hubo que repasar ochenta cartas; se tocó el compilador, y las ochenta se enteraron a la vez.

---

## 🛡️ La red de seguridad: dos motores jugando la misma partida

El motor original era código imperativo, y pasarlo a un DSL es justo el tipo de refactorización que rompe cosas en silencio. Así que la batería de pruebas **no compara contra valores escritos a mano**: guarda congelada la versión anterior del motor, ejecuta **el mismo escenario contra las dos versiones** y compara **todo** lo observable, o sea el registro de la partida, los carteles flotantes y el estado final de las dos mesas campo por campo.

Si algo cambia, salta. Y cuando el cambio es **a propósito**, la prueba obliga a declararlo por escrito (con su motivo) dentro del propio escenario:

```js
logsIntencionados: [
    { de: 'Sadame anexa a', a: 'Sadame de J1 (Jugador 1) anexa a',
      motivo: 'norma del proyecto: una carta nombrada en el log lleva su dueño' },
],
```

Lo que hace es:

- Verificar que esa diferencia concreta aparece, y con esa forma exacta.
- Fallar igualmente **si no aparece** (una diferencia declarada que ya no ocurre también es un aviso: significa que algo cambió por debajo).
- Dejar el motivo escrito ahí mismo, para el día en que ya no me acuerde.

Nada se ignora en silencio. Ahora mismo son **417 escenarios comparados**, más un centenar largo de comprobaciones directas.

---

## 📏 Normas que comprueba la máquina, no mi memoria

Un proyecto de una sola persona se llena de normas que solamente viven en la cabeza del que las puso (y funcionan perfectamente hasta el día en que se te olvida una). Aquí, cada norma que se me ha escapado más de una vez tiene su **auditoría**: un programa que recorre las 176 cartas y falla si alguien se la salta.

| Auditoría | Qué vigila |
|---|---|
| `auditar_textos` | que el texto de cada carta siga la rúbrica de redacción |
| `auditar_costes` | que ninguna Habilidad cobre su coste antes de que el jugador pueda arrepentirse |
| `auditar_flechas` | que toda carta con coste o requisito enseñe de dónde sale lo que paga |
| `auditar_marcas` | que un efecto que decidirá un turno futuro **se vea**, y que su explicación llegue |
| `auditar_logs` | que un mensaje que nombra una carta diga de quién es |
| ...y cinco más | fases, presentaciones, duplicados en el panel de detalle... |

Las excepciones existen, claro, pero hay que **declararlas con su motivo**: no basta con incumplir.

⚠️ **Nota**: cada auditoría nació de un fallo real, no de una buena intención. El orden es siempre el mismo: se me escapa algo, lo cazo a mano, y entonces escribo el programa que lo habría cazado por mí.

---

## 🌐 Multijugador que aguanta una recarga

La parte de red es la que más quebraderos de cabeza me ha dado, y también con la que más he aprendido. El servidor reparte cada acción **numerada** a los dos clientes, y encima de eso hay tres piezas:

- **Detección de huecos**: si a un cliente le falta una acción (llegó la 7 y la 6 no está), pide un volcado autoritativo del estado, en lugar de seguir jugando sobre un tablero que ya no es el bueno.
- **Candado de cola**: mientras espera ese volcado, las acciones que van llegando **se retienen**; cuando llega el estado, se tira lo que ya venía incluido dentro y se aplica en orden lo posterior.
- **Reanudar-perfecto**: si recargas la página en mitad de una elección (eligiendo objetivo, buscando en el mazo, en un modal...), el otro cliente te reconstruye esa interacción exacta donde la dejaste, en vez de dejar la partida colgada.

Y hay una prueba que levanta **dos clientes en dos contextos aislados** y los hace hablar entre ellos, para cazar justo lo único que un cliente por su cuenta no puede ver: que los dos tableros acaben distintos.

---

## ⚙️ Cómo está hecho, y por qué así

```
navegador ──socket.io──►  server.js  ──►  SQLite (usuarios, sesiones, salas)
   │                      (reparte y numera acciones)
   ├── index.html      el cliente entero: tablero, animaciones y MOTOR DE REGLAS
   ├── cartas.js       el DSL, su compilador y las 176 cartas
   └── reglas.js       el panel de reglas que ve el jugador
```

**El servidor no arbitra, ordena.** Las reglas viven en el cliente, y `server.js` hace de *relay-of-record*: recibe cada acción, la **numera por jugador** y se la reparte a los dos (al que la envió también, para que ambos ejecuten exactamente la misma secuencia y lleguen al mismo estado).

Es una decisión consciente y tiene su precio: **un cliente modificado podría hacer trampas**, así que esto es para jugar con gente que conoces, no para competitivo con dinero de por medio. A cambio, la lógica está en un solo sitio (no duplicada entre cliente y servidor, que es de donde salen las divergencias más difíciles de encontrar) y el servidor queda pequeño y aburrido, que es como tiene que ser.

**Sin frameworks y sin paso de compilación.** El cliente es HTML, CSS y JavaScript a pelo: nada de React, ni bundler, ni transpilador. Lo que edito es exactamente lo que se sirve (recargo el navegador y ya está), y eso me da control total sobre las animaciones, que en este juego son parte de las reglas: cada tipo de efecto tiene su propio lenguaje visual (el ataque normal embiste, el especial canaliza, el daño verdadero atraviesa, un anexo ata con un lazo...). El precio también es real y lo asumo: todo el DOM y todas las transiciones se escriben a mano.

**SQLite** para cuentas y sesiones: un fichero, y cero servidores de base de datos que mantener. **pm2** sirviendo la instancia viva en un mini-PC Debian mío, sin nube y sin factura a fin de mes; trabajo contra él por SSH.

**Las pruebas cargan el motor en un intérprete aislado.** Cada suite mete `cartas.js` e `index.html` dentro de un contexto `vm` de Node, con un DOM de mentira, así que se puede probar el motor (y hasta la capa de dibujo) sin navegador y sin instalar absolutamente nada. Por eso la batería entera tarda **25 segundos** y corre igual en mi máquina que en un runner limpio de GitHub.

**La documentación es parte del repositorio, no un extra.** Hay una rúbrica de redacción de cartas, un documento de diseño del DSL, y un TODO donde cada cosa que se queda sin hacer lleva escrito el motivo. Es lo que hace que una decisión tomada hace dos meses siga teniendo sentido hoy (y lo que permite que las auditorías puedan comprobarla por su cuenta).

---

## 🚀 Correrlo

```bash
git clone git@github.com:JosueMeserom/karlos-tcg.git
cd karlos-tcg
npm install     # solamente para el servidor
node server.js  # y abrir http://localhost:3000
```

Las pruebas **no necesitan instalar nada**, porque usan únicamente módulos que ya vienen con Node:

```bash
npm test              # las 116 suites, unos 25 segundos
npm test -- oculto    # solamente las que interesen mientras trabajas
```

Se ejecutan solas en **GitHub Actions** en cada push y cada pull request (con Node 20, el mismo que el del servidor).

---

## 📌 Estado

En desarrollo activo: **176 cartas**, motor declarativo y batería en verde.

Lo que viene: más cartas, modos contra la IA, partidas clasificatorias, y sobres virtuales que se abren con lo que vayas ganando al jugar.

**Stack**: Node.js · Express · Socket.IO · SQLite · JavaScript sin frameworks en el cliente (HTML/CSS/JS a pelo, animaciones incluidas).
