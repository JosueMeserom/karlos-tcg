# Karlos TCG — Análisis del motor de cartas y borrador de DSL declarativo

Documento de diseño para decidir, con datos, la migración a efectos declarativos y el editor de cartas.

---

## 1. Resumen ejecutivo

Analicé las **142 cartas** de `cartas.js` (**348 funciones-hook** repartidas en **~53 tipos de hook distintos**, aunque los 10 primeros concentran la mayoría) y cómo `index.html` las ejecuta.

**Conclusión medida:** la dificultad de declarar una carta depende directamente de cuánto se enriquezca el DSL. El espectro real es:

| Alcance del DSL | Cartas declarables |
|---|---|
| Mínimo (operaciones + 1 objetivo + condición simple) | ~16 % |
| **Rico (multi-objetivo, filtros, ELECCIÓN, BÚSQUEDA y todos los timings como disparadores)** | **~83 %** |
| Irreducible (queda como código a medida) | **~17 % (24 cartas)** |

La complejidad **no está repartida**: se concentra en unos pocos patrones recurrentes (objetivos/flujo, 295 llamadas; búsqueda de cartas, 75; modificar stats, 133). Si esos patrones se vuelven **primitivas** del DSL, el grueso de la colección se declara. El ~17 % restante (evoluciones/tokens, menús de acción propios, reacciones desde la mano, mecánicas especiales como Atomización) se queda como código, y no pasa nada: es la puerta de escape prevista.

**Veredicto:** el editor tal como lo imaginaste es viable **si** migramos a un motor híbrido (declarativo + escape de código) de forma **incremental**. No hace falta reescribir el motor de golpe.

---

## 2. Familias de operaciones (el "qué hace") — base de las primitivas

Contadas sobre los cuerpos de los hooks reales:

| Familia | Llamadas | Métodos `game.*` | Primitiva DSL propuesta |
|---|---|---|---|
| Modificar stats | 133 | `modifyStat` | `MODIFICAR_STAT` |
| Objetivos / flujo | 295 | `abilityContext`, `inputState`, `selectedCard` | (esquema de **objetivo**, no una primitiva suelta) |
| Búsqueda / selección de cartas | 75 | `openVisualSearchModal`, `openHandViewer` | `BUSCAR` |
| Estado / contadores | 50 | `applyStatus`, `modifyCounters`, `resetCard` | `APLICAR_ESTADO`, `MODIFICAR_CONTADORES` |
| Muerte / destruir | 43 | `checkDeath`, `destroyEvent` | `DESTRUIR` |
| Daño | 36 | `dealDamage`, `performAttack` | `DAÑO`, `ATACAR` |
| Elección del jugador | 27 | `openChoiceModal` | `ELECCIÓN` |
| Azar | 23 | `triggerCoinFlips` | `MONEDA` |
| Robar / mazo | 21 | `drawCard`, `shuffle` | `ROBAR`, `BARAJAR` |

Cosméticas y automáticas (el intérprete las genera solo, no se declaran): `logMsg`, `logError`, `render`, `getCardNameWithOwner`, `getDisplayName`, `showFloatingText`, `updatePassives`, `checkDeath` tras daño, `sleep`.

---

## 3. Familias de disparadores (el "cuándo") — los triggers del DSL

Agrupando los ~53 hooks por momento del turno. Los 10 primeros cubren la gran mayoría; el resto es cola de timings raros (muchos usados por 1-2 cartas).

- **Al jugar la carta:** `canPlayCard` (48) → `onBeforePlayAsync` (28) → `onPlay` (43) → `onAfterPlayAsync` (13)
- **Pasiva continua:** `onUpdatePassive` (29)  *(se recalcula cada render)*
- **Habilidad activa:** `canActivateAbility` (59) → `onExecuteAbility` (59) → `onValidateTarget` (39) → `onTargetsReady` (50) → `hasMoreValidTargets` (6)
- **Combate:** `onBeforeAttack` (6), `onAfterAttack` (6), `onBeforeTakeDamage` (4), `onBeforeDefend` (4), `onAfterDefend` (3), `canAttackNormally` (3)
- **Turno:** `onStartTurn` (7), `onEndTurn` (11), y variantes temporales (`onStartTurnTempEffect` 11, `onEndTurnTempEffect` 3, `onUpdateTempEffect` 6)
- **Eventos/Ayudas persistentes:** `onExpire` (18), `onExecuteAyuda` (11), `onEquipUpdate` (9)
- **Reactivos:** `onDoTTick` (3, veneno), `onBeforeGainFuror`/`onGlobalBeforeGainFuror` (9), `onDestroy`/`onDeath`/`onAllyDeath` (6)
- **Cola larga (1-2 cartas c/u):** `onInterceptAttack`, `onLethalDamageIntercept`, `onGlobalBeforeStatChange`, `onBeforeAffectedByEnemyEffect`, `onHandReaction*`, etc. → normalmente **escape de código**.

---

## 4. Borrador del DSL

Idea: cada carta declarativa es **datos**. Un solo hook genérico en el motor (el **intérprete**) lee estos datos y reproduce lo que hoy hace el código. Estructura:

```json
{
  "id": 200,
  "name": "Ejemplo",
  "type": "Personaje",
  "subtype": "Ser vivo",
  "tags": ["Mercenario"],
  "hp": 6, "def": 5, "atk": 4,
  "rarity": "A",
  "flags": { "taunt": false, "stealth": false },
  "text": "…",
  "abilities": [ /* lista de bloques disparador → efectos */ ],
  "custom": null   /* puerta de escape: si != null, se usa código en vez del intérprete */
}
```

### 4.1 Bloque de habilidad = disparador + condición + efectos

```json
{
  "trigger": "PASIVA_CONTINUA",
  "if":   { "campo": "self.hp", "op": "<=", "valor": 3 },
  "then": [ { "op": "MODIFICAR_STAT", "target": "SELF", "stat": "atk", "delta": 2 } ],
  "else": []
}
```

### 4.2 Disparadores (`trigger`)
`AL_JUGAR`, `PASIVA_CONTINUA`, `ACTIVA` (habilidad manual), `AL_ATACAR`, `TRAS_ATACAR`, `AL_RECIBIR_DAÑO`, `AL_DEFENDER`, `INICIO_TURNO`, `FIN_TURNO`, `AL_CADUCAR`, `AL_MORIR`, `TICK_VENENO`, `AL_GANAR_FUROR`. (Mapean 1:1 a los hooks del §3.)

### 4.3 Objetivo (`target`)
```json
{ "quien": "ENEMIGO", "modo": "ELEGIDO", "cantidad": 2,
  "filtros": [ { "campo": "stealth", "op": "==", "valor": false } ] }
```
- `quien`: `SELF | ALIADO | ENEMIGO | TODOS`
- `modo`: `ELEGIDO | ALEATORIO | TODOS | AUTO` (self)
- `cantidad`: n.º de objetivos (multi-objetivo → resuelve `abilityContext`)
- `filtros`: lista de condiciones sobre el objetivo (tag, hp, stealth, taunt…)

### 4.4 Efectos (`op`) — las primitivas
`DAÑO` (valor/fórmula), `ATACAR` (ataque normal contra objetivo), `MODIFICAR_STAT` (stat, delta, ¿temporal?), `APLICAR_ESTADO` (estado, duración), `MODIFICAR_CONTADORES`, `CURAR`, `DESTRUIR`, `ROBAR` (n), `BARAJAR`, `MONEDA` (→ ramas según resultado), `ELECCIÓN` (opciones → cada una con sus efectos), `BUSCAR` (zona, filtro, acción), `SECUENCIA` (lista ordenada), `RESETEAR`.

Los valores admiten **fórmulas** simples: `"self.atk - 1"`, `3`, `"objetivo.hp"`.

### 4.5 Condiciones y ramas (tu "diagrama de flujo")
Cualquier efecto puede envolverse en `{ "if": {...}, "then": [...], "else": [...] }`, y anidarse. `ELECCIÓN` y `MONEDA` producen ramas por opción/resultado. Con eso cubres los if/else que pedías.

---

## 5. Ejemplos reales convertidos

### 5.1 Karlos (pasiva MEGADRENALINA + activa BI-CHOQUE) — hoy son 5 hooks
```json
{
  "id": 1, "name": "Karlos", "type": "Personaje", "subtype": "Ser vivo",
  "tags": ["Mercenario","Usuario de VP"], "hp": 6, "def": 6, "atk": 5, "rarity": "A",
  "passiveName": "MEGADRENALINA", "activeName": "BI-CHOQUE",
  "abilities": [
    { "trigger": "PASIVA_CONTINUA",
      "if": { "campo": "self.hp", "op": "<=", "valor": 3 },
      "then": [ { "op": "MODIFICAR_STAT", "target": "SELF", "stat": "atk", "delta": 2 } ] },

    { "trigger": "ACTIVA", "coste": { "furor": 1 },
      "target": { "quien": "ENEMIGO", "modo": "ELEGIDO", "cantidad": 2,
                  "filtros": [ { "campo": "stealth", "op": "==", "valor": false } ] },
      "requisitos": [ { "campo": "enemigos_con_provocar", "op": "==", "valor": 0 },
                      { "campo": "objetivos_validos", "op": ">=", "valor": 2 } ],
      "then": [ { "op": "ATACAR", "target": "OBJETIVOS", "atk": "self.atk - 1" } ] }
  ]
}
```
Esto reproduce: +2 Atq si Vida≤3 (pasiva), y el ataque a 2 enemigos con Atq-1 bloqueado si hay Provocar o <2 objetivos válidos (activa). El intérprete genera solos los `logMsg`, el `showFloatingText`, el manejo de `abilityContext`/`inputState` y el `canActivateAbility`.

### 5.2 Un patrón simple (Ayuda "roba y cura")
```json
{ "type": "Ayuda", "subtype": "Técnica",
  "abilities": [ { "trigger": "AL_JUGAR", "then": [
      { "op": "ROBAR", "cantidad": 1 },
      { "op": "CURAR", "target": { "quien": "ALIADO", "modo": "ELEGIDO", "cantidad": 1 }, "valor": 2 }
  ] } ] }
```

### 5.3 Una irreducible (queda como código)
```json
{ "id": 27, "name": "Atomización", "type": "Ayuda", "custom": "atomizacion_v1" }
```
`custom` apunta a una función registrada a mano en `index.html`. El intérprete ve `custom != null` y delega. Igual para evoluciones, tokens (Clon de Unmei, Megalimo…), menús propios (`getCustomActions`) y reacciones desde la mano.

---

## 6. Las 24 cartas irreducibles (la puerta de escape)

Motivos (con solape): búsqueda/visor con lógica propia, hooks raros de 1-2 cartas, reacciones desde la mano (7), evoluciones/tokens (6), mecánicas especiales tipo swap/atomizar/crear token (5), menús de acción propios `getCustomActions` (4).

Ejemplos: Águila, Mill, Escudo mágico, Atomización, Lupa, Erasmo, Xanadu, Unmei y su Clon, Némesis, Meca EBA, Arthas, Clon de NoName, Megalimo, Limo crecido…

Estas se quedan con código y conviven sin problema con las declarativas.

---

## 7. Plan de migración incremental (sin big-bang)

1. **Motor híbrido:** añadir el intérprete + un hook genérico que, si la carta tiene `abilities` (declarativa), las ejecute; y si tiene `custom` o es de código, use el camino actual. Las 142 cartas de hoy siguen funcionando **intactas**.
2. **Cartas nuevas ya declarativas** desde el editor. Valor inmediato, riesgo cero sobre lo viejo.
3. **Migrar por oleadas**, de lo más fácil a lo más raro, verificando **cada carta en partida online** (importante por el determinismo: ambos clientes simulan igual). Empezar por Esbirros/Personajes con solo `MODIFICAR_STAT`/`DAÑO`.
4. **Determinismo online:** el intérprete debe ser puro y determinista; las primitivas con azar (`MONEDA`) o elección (`ELECCIÓN`, `BUSCAR`) usan los mismos canales sincronizados que hoy.
5. Aceptar el ~17 % irreducible como código permanente.

### Primitivas por orden de implementación (por frecuencia de uso)
1. `MODIFICAR_STAT` (133) · esquema de **objetivo** (295) → desbloquea lo más común.
2. `APLICAR_ESTADO`/`CONTADORES` (50) · `DESTRUIR` (43) · `DAÑO`/`ATACAR` (36).
3. `ELECCIÓN` (27) · `MONEDA` (23) · `ROBAR`/`BARAJAR` (21).
4. `BUSCAR` (75, pero el más complejo por el modal) → al final; hasta entonces, esas cartas van por escape de código.

---

## 8. Riesgos

- **Regresiones** al migrar cartas viejas → mitigado migrando de una en una y probando online.
- **Complejidad concentrada** en el intérprete (antes repartida en 348 funciones). Más legible y editable, pero no "menos lógica".
- **`BUSCAR`** es la primitiva cara (modal de selección con filtros y acción posterior). Diseñarla bien es media batalla.
- **DSL como lenguaje:** hay que resistir la tentación de meter tanto en el DSL que acabe siendo otro lenguaje. Para eso está el escape de código.

---

## 9. Siguiente paso propuesto

Con esto validado, el orden natural sería:
1. Implementar el **intérprete híbrido** + esquema de **objetivo** + `MODIFICAR_STAT` (la base), y migrar 2-3 cartas simples como prueba de concepto verificada online.
2. Ir añadiendo primitivas por el orden del §7.
3. En paralelo, montar el **editor** encima del DSL (formulario de estructura + bloques disparador→efectos + exportación a `cartas.js`), que ahora sí es directo porque el editor solo produce estos datos.

---

## 10. Capa de reglas: números del juego con overrides (implementado en oleada 2)

Principio: **el intérprete y las cartas nunca comparan contra literales** (el `4` del Furor); consultan helpers de `KARLOS_RULES`, con resolución en cascada:

1. Override de **instancia** (`card.furorMax = 6` puesto en partida por un efecto)
2. Override de **plantilla** (`furorMax: 6` declarado en la carta en `cartas.js`)
3. **Valor por defecto** global (`furorMaxDefault: 4`)

En el DSL se referencia con valores `{ REF: "objetivo.furorMax" }` (Longaniza ya migrada así). El mismo patrón servirá para cualquier otro número de reglas (tamaños de zona, límites de mano, etc.).

**Pendiente motor:** si algún día existe una carta con `furorMax > 4`, auditar los sitios de `index.html` que asuman el 4 (p. ej. el clamp del panel de debug) y cambiarlos a `KARLOS_RULES.getFurorMax(carta)`.

## 11. Diseño: ataques normales vs especiales, y excepciones a excepciones

Mismo principio que §10 aplicado a comportamientos: **nada de flags sueltos, consultas por capas**.

**a) Descriptor de ataque.** Todo ataque viaja con un descriptor: `{ tipo: 'normal'|'especial', origen: 'ataque-normal'|'activa'|'efecto', atacante, flags }`. Quien inicia el ataque no fija el tipo a mano: se calcula con `getAttackDescriptor(atacante, contexto)`, que parte del tipo base (normal, o especial si lo pide la Activa como FOSFORESCENCIA) y deja que lo modifiquen las capas: equipos, Evento activo, pasivas propias/ajenas (vía un hook de consulta, p. ej. `onModifyAttackDescriptor`). Así, "Karlos con un arma que hace especiales sus ataques" convierte también los del Bi-Choque sin tocar la carta.

**b) Las interacciones son consultas, no comprobaciones directas.** `Provocar afecta a este ataque?`, `puede contrarrestarse esta acción?` se responden con una cadena de interceptores: regla base → modificadores activos → overrides por carta → overrides de overrides. Cada interceptor declara **prioridad** numérica; la resolución es por prioridad (no por orden de llegada), lo que hace deterministas las excepciones-de-excepciones:

- Base: Provocar restringe los ataques *normales*.
- Ataque *especial* → la consulta de Provocar devuelve "no aplica".
- SAPIENCIA MÁGICA (Aniceto): interceptor "mis ataques/Activa no pueden ser contrarrestados" (prioridad media). Ojo: no vuelve especiales sus ataques; responde a la consulta de *contrarresto*.
- Pasiva de Diego Antonio: interceptor de prioridad superior que anula el de Aniceto para su caso concreto.

**c) Consecuencia para el DSL.** La primitiva `ATACAR` llevará `tipoAtaque` (por defecto `'normal'`) y los **requisitos se expresan contra las consultas**, no contra el estado crudo. El requisito real del Bi-Choque no es "no hay enemigos con Provocar", sino "existen ≥2 objetivos legales *para este descriptor de ataque*": con ataques normales, Provocar restringe la legalidad; si algo los vuelve especiales, la misma consulta devuelve más objetivos y la habilidad se habilita sola. La legalidad de objetivos se centraliza en un helper (`getLegalAttackTargets(descriptor)`) que usan por igual el motor, el DSL y (futuro) la IA.
