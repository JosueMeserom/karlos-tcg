// archivo: cartas.js

const CARD_DB = [
    { 
        id: 1, name: "Karlos", hp: 6, def: 6, atk: 5, type: "Personaje", subtype: "Ser vivo", tags: ['Mercenario', 'Usuario de VP'], gender: 'M', rarity: "A",
        text: "P: MEGADRENALINA: Si su Vida es 3 o menos, +2 de Atq. A: BI-CHOQUE (1F): Ataca a 2 enemigos con Atq-1.",
        passiveName: "MEGADRENALINA", activeName: "BI-CHOQUE", activeCost: 1, series: 1,
        abilities: [
            { trigger: "PASIVA_CONTINUA", nombre: "MEGADRENALINA",
              if: { campo: "self.hp", op: "<=", valor: 3 },
              then: [ { op: "MODIFICAR_STAT", stat: "atk", delta: 2 } ] }
        ],

       // HOOK 2: Validar si puede usar su habilidad activa
        canActivateAbility: function(card, game) {
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            const enemyP = game.players[enemyId];
            
            // --- Si hay alguien con Provocar, se bloquea el multi-ataque ---
            const hasTaunt = enemyP.vanguard.some(c => getCardTemplate(c.id).isTaunt);
            if (hasTaunt) {
                game.logError("No puedes usar Bi-Choque porque hay un enemigo Provocando (exige objetivos múltiples).");
                return false;
            }

            // Filtramos a los enemigos ocultos para ver si quedan al menos 2
            const validTargets = enemyP.vanguard.filter(c => !c.stealth);
            if (validTargets.length < 2) {
                game.logError("No hay suficientes enemigos válidos en vanguardia para BI-CHOQUE.");
                return false; 
            }
            return true; 
        },

        // HOOK 3: Ejecutar la habilidad (preparar los objetivos)
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            // AÑADIDO: isNormalAttack: true (Para que interactúe bien con escudos o pasivas defensivas)
            game.abilityContext = { targets: [], maxTargets: 2, name: 'BI-CHOQUE', targetType: 'enemy', isNormalAttack: true };
            game.logMsg("Elige al PRIMER enemigo.", 'system');
            game.render();
        },

        // HOOK 4: Validador individual de objetivos
        onValidateTarget: function(card, target, game, isSilent = false) {
            if (target.location !== 'vanguard') {
                if (!isSilent) game.logError("El objetivo debe estar en la vanguardia.");
                return false;
            }
            if (target.stealth) {
                if (!isSilent) game.logError(`¡${target.name} está Oculto y no puede ser objetivo de ataques normales!`);
                return false;
            }
            if (game.abilityContext.targets.some(t => t.instanceId === target.instanceId)) {
                if (!isSilent) game.logError("No puedes atacar al mismo enemigo dos veces.");
                return false;
            }
            return true;
        },

        //HOOK 5:  Le dice al motor si debe esperar a que elijas más cartas, o si debe lanzar el ataque automático
        hasMoreValidTargets: function(card, game) {
            const ctx = game.abilityContext;
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            const enemyP = game.players[enemyId];
            
            // Karlos solo pega en Vanguardia y no ataca a los que están Ocultos
            const unselectedVan = enemyP.vanguard.filter(c => !c.stealth && !ctx.targets.some(t => t.instanceId === c.instanceId)).length;
            
            return unselectedVan > 0;
        },

        // HOOK 6: Ejecutar los golpes cuando los objetivos están seleccionados
        onTargetsReady: async function(card, game) {
            const attacker = card;
            game.modifyStat(attacker, 'furor', -1);
            
            showFloatingText(attacker.instanceId, attacker.activeName, "ft-ability", -40);
            showFloatingText(attacker.instanceId, "-1 ATQ", "ft-red-stat", -20);
            attacker.currentAtk -= 1; // Bajamos el stat real para que se refleje visualmente en la carta
            
            game.inputState = 'EXECUTING';
            game.render();

            await game.sleep(800);

            const targets = game.abilityContext.targets;

            const attackerEl = document.querySelector(`.card[data-id="${attacker.instanceId}"]`);
            if (attackerEl) {
                attackerEl.removeAttribute('style');
                void attackerEl.offsetWidth;
            }

            for (let i = 0; i < targets.length; i++) {
                const target = targets[i];
                const canAttack = await game.checkAttackStatus(attacker, target);
                if (!canAttack) {
                    if (attacker.currentHp <= 0) break; // Si se mató por confusión, paramos la racha
                    continue; // Pasa al siguiente objetivo
                }
                if (attackerEl) {
                    attackerEl.removeAttribute('style');
                    void attackerEl.offsetWidth;
                }

                if (target.currentHp > 0) {
                    let dodged = false;
                    const defTemplate = getCardTemplate(target.id);
                    if (typeof defTemplate.onBeforeDefend === 'function') {
                        dodged = await defTemplate.onBeforeDefend(target, attacker, game, game.abilityContext.name, false);
                    }
                    if (dodged) continue;

                    // Como ya hemos bajado el stat real, no hace falta restar 1 aquí
                    let dmg = attacker.currentAtk - target.currentDef;
                    if (dmg <= 0) dmg = 1;

                    await game.dealDamage(attacker, target, dmg, false);

                    await game.sleep(500);
                    await game.checkDeath(target);
                }
            }

            // Restauramos el stat visual y mecánicamente
            attacker.currentAtk += 1;
            showFloatingText(attacker.instanceId, "+1 ATQ", "ft-green", -20);

            attacker.exhausted = true;
            game.isActionLocked = false; 
            game.cancelAction();
            game.updatePassives();
            game.render();
        },
    },
    {
        id: 2, name: "Zoe", hp: 2, def: 2, atk: 7, type: "Personaje", subtype: "Ser vivo", tags: ['Usuaria de VP'], gender: 'F', rarity: "A",
        text: "P: JUSTICIERA ARDIENTE: El Daño por tiempo la cura en vez de dañarla, y mientras lo sufra gana +2 de Def. A: SISAR (1F): Tu rival descarta una Ayuda de su mano, la que él elija. Moneda - Cara: si hay enemigos, ataca a uno con -3 de Atq y sin su Pasiva.",
        passiveName: "JUSTICIERA ARDIENTE", activeName: "SISAR", activeCost: 1, series: 1,
        abilities: [
            { trigger: "PASIVA_CONTINUA", nombre: "JUSTICIERA ARDIENTE",
              if: { campo: "dotActivo", op: "truthy" },
              then: [ { op: "MODIFICAR_STAT", stat: "def", delta: 2 } ] }
        ],

        // HOOK 2: Transformar Daño por Tiempo (DoT) en Curación
        onDoTTick: function(card, game) {
            game.logMsg(`¡Habilidad pasiva de ${game.getCardNameWithOwner(card)}: ${card.passiveName} tiene lugar! (se cura en lugar de dañarse)`, 'ability');
            showFloatingText(card.instanceId, card.passiveName, "ft-ability", -40);
            const baseHp = getCardTemplate(card.id).hp;
            if (card.currentHp < baseHp) {
                const healAmt = Math.min(1, baseHp - card.currentHp);
                game.modifyStat(card, 'currentHp', healAmt);
            } else {
                game.logMsg(`${game.getCardNameWithOwner(card)} ya tiene la Vida completa.`, 'system');
            }
        },

        // HOOK 3: Moneda ANTES de un ataque normal
        onBeforeAttack: async function(attacker, defender, game) {
            if (game.abilityContext) return true; // No se aplica si está usando una Habilidad Activa (como Sisar)

            game.logMsg(`¡Habilidad pasiva de ${game.getCardNameWithOwner(attacker)}: ${attacker.passiveName} tiene lugar!`, 'ability');
            showFloatingText(attacker.instanceId, attacker.passiveName, "ft-ability", -30);
            
            const results = await game.triggerCoinFlips(1, attacker.owner);
            if (!results) return false; // Ataque cancelado

            if (results[0] === 'heads') {
                game.modifyStat(attacker, 'currentAtk', 1); // Temp Buff
                
                // Pasamos el .instanceId para no crear referencias circulares
                game.applyStatus(attacker, 'dot', 2, attacker.instanceId);
                
                // Comprobamos que haya defensor (no es ataque directo)
                if (defender) {
                    game.applyStatus(defender, 'dot', 2, attacker.instanceId);
                }
                
                game.logMsg(`Moneda: CARA - ¡+1 ATQ y DAÑO POR TIEMPO aplicado!`, 'ability');
            } else {
                game.logMsg(`Moneda: CRUZ - Ataque normal.`, 'neutral');
            }
            return true;
        },

        // SISAR, reescrita (Toto, 7-ago-2026). El texto real del Excel es:
        //   "Tu rival debe declarar si tiene una o más cartas de Ayuda en la mano, en cuyo caso
        //    descarta una que él elija. Echa una moneda. Si sale cara, realiza un ataque normal
        //    sin poder aplicar su Habilidad pasiva y bajando en 3 puntos su Atq durante dicho
        //    ataque."
        // Lo que había no se parecía: elegía el DUEÑO de Zoe (no el rival), sobre CUALQUIER carta
        // (no solo Ayudas) y viendo la mano rival entera en un modal. Además cobraba el Furor y
        // agotaba a Zoe nada más confirmar, así que cerrar el modal te dejaba sin nada.
        // Ahora: elige el RIVAL, solo entre sus Ayudas, en su propia mano (las ve: son suyas), y
        // sin poder declinar -su texto dice "descarta una", no "puede descartar"-. El coste se
        // cobra en el primer punto irreversible, justo antes de la moneda.
        onExecuteAbility: async function(card, game) {
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            const enemyP = game.players[enemyId];
            const cobrar = () => {
                game.modifyStat(card, 'furor', -1);
                showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);
            };

            const ayudas = enemyP.hand.filter(c => c.type === 'Ayuda');
            if (ayudas.length === 0) {
                game.logMsg(`${game.getDisplayName(enemyId)} declara que no tiene Ayudas en la mano.`, 'system');
            } else {
                game.logMsg(`¡${game.getCardNameWithOwner(card)} usa ${card.activeName}! ${game.getDisplayName(enemyId)} debe descartar una Ayuda.`, 'ability');
                // chooserId = enemyId: elige EL RIVAL, de su propia mano. cancelable:false porque
                // el texto le obliga a descartar, no le da la opción.
                const sel = await game.pickBoardTargets(ayudas, 1, `${game.getDisplayName(enemyId)}: elige una Ayuda para descartar`, card, enemyId, false, { mano: true });
                const elegida = sel && sel[0];
                if (elegida) {
                    const idx = enemyP.hand.findIndex(c => c.instanceId === elegida.instanceId);
                    if (idx !== -1) {
                        enemyP.hand.splice(idx, 1);
                        if (typeof game.resetCard === 'function') game.resetCard(elegida);
                        if (!enemyP.discard) enemyP.discard = [];
                        enemyP.discard.push(elegida);
                        elegida.location = 'discard';
                        game.logMsg(`${game.getDisplayName(enemyId)} descarta ${elegida.name}.`, 'ability');
                    }
                }
            }

            cobrar(); // primer punto irreversible: la moneda que viene ya la ven los dos
            game.updatePassives();
            game.render();

            const results = await game.triggerCoinFlips(1, card.owner);
            if (!results) { game.isActionLocked = false; game.cancelAction(); game.render(); return; }

            if (results[0] !== 'heads') {
                game.logMsg("Moneda: CRUZ - SISAR termina aquí.", 'neutral');
                card.exhausted = true;
                game.isActionLocked = false;
                game.cancelAction();
                game.render();
                return;
            }

            // CARA: ataque normal obligatorio. Solo se salta si de verdad no hay a quién atacar
            // (Toto: "solamente debería no atacar si por la razón que sea no puede"); si hay
            // objetivos, la elección NO es cancelable.
            const objetivos = enemyP.vanguard.filter(c => !c.stealth && !(getCardTemplate(c.id) || {}).isAvatar);
            if (objetivos.length === 0) {
                game.logMsg("Moneda: CARA - pero no hay enemigos a los que atacar.", 'system');
                card.exhausted = true;
                game.isActionLocked = false;
                game.cancelAction();
                game.render();
                return;
            }
            game.logMsg("Moneda: CARA - ¡ataque debilitado! Elige objetivo.", 'ability');
            const objSel = await game.pickBoardTargets(objetivos, 1, 'SISAR: elige a quién atacar', card, card.owner, false);
            if (!objSel || !objSel[0]) { // no debería ocurrir (cancelable:false), pero no se deja colgado
                card.exhausted = true; game.isActionLocked = false; game.cancelAction(); game.render(); return;
            }
            game.selectedCard = card;
            game.abilityContext = { targets: [objSel[0]], maxTargets: 1, name: 'SISAR', targetType: 'enemy', isNormalAttack: true };
            game.isActionLocked = true;
            await getCardTemplate(card.id).onTargetsReady(card, game);
        },

        // HOOK 6: Ejecutar el ataque de SISAR (Cuando el objetivo ya está fijado)
        onTargetsReady: async function(card, game) {
            const defender = game.abilityContext.targets[0];
            const attacker = card;
            
            // Bajamos el stat visualmente ANTES de atacar
            showFloatingText(attacker.instanceId, "-3 ATQ", "ft-red-stat", -20);
            attacker.currentAtk -= 3;
            
            game.inputState = 'EXECUTING';
            game.render();
            await game.sleep(500); // Pausa para ver la carta nerfeada antes del golpe

            const canAttack = await game.checkAttackStatus(attacker, defender);
            if (!canAttack) {
                // Si falla por confusión, le devolvemos el stat
                attacker.currentAtk += 3;
                showFloatingText(attacker.instanceId, "+3 ATQ", "ft-green", -20);
                
                attacker.exhausted = true;
                game.isActionLocked = false;
                game.cancelAction();
                game.updatePassives();
                game.render();
                return;
            }

            let dmg = attacker.currentAtk - defender.currentDef;
            if (dmg <= 0) {
                if (attacker.type === 'Esbirro' && defender.type === 'Personaje') dmg = 0.5;
                else dmg = 1;
            }

            let dodged = false;
            const defTemplate = getCardTemplate(defender.id);
            if (typeof defTemplate.onBeforeDefend === 'function') {
                dodged = await defTemplate.onBeforeDefend(defender, attacker, game, game.abilityContext ? game.abilityContext.name : null, false);
            }

            if (dodged) {
                // Si esquivan, también le devolvemos el stat
                attacker.currentAtk += 3;
                showFloatingText(attacker.instanceId, "+3 ATQ", "ft-green", -20);
                
                attacker.exhausted = true;
                game.isActionLocked = false;
                game.cancelAction();
                game.render();
                return; 
            }

            await game.dealDamage(attacker, defender, dmg, false);
            await game.sleep(600);
            
            // Terminó el golpe con éxito, devolvemos stat
            attacker.currentAtk += 3;
            showFloatingText(attacker.instanceId, "+3 ATQ", "ft-green", -20);

            attacker.exhausted = true;
            await game.checkDeath(defender);
            game.isActionLocked = false;
            game.cancelAction();
            game.render();
        },

        // HOOK 7: Validar objetivo para SISAR
        canActivateAbility: function(card, game) {
            if (card.furor < 1) { game.logError("Falta Furor (1)."); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            if (game.players[enemyId].vanguard.length === 0) {
                game.logError("No hay enemigos válidos en la Vanguardia para SISAR."); 
                return false;
            }
            return true;
        },

        // HOOK 8: Validador individual de objetivos
        onValidateTarget: function(card, target, game, isSilent = false) {
            if (target.location !== 'vanguard') {
                if (!isSilent) game.logError("El objetivo debe estar en la vanguardia.");
                return false;
            }
            if (target.stealth) {
                if (!isSilent) game.logError(`¡${target.name} está Oculto y no puede ser objetivo de ataques normales!`);
                return false;
            }
            return true;
        },
    },
    { 
        id: 3, name: "Kyle", hp: 4, def: 4, atk: 3, type: "Personaje", subtype: "Ser vivo", tags: ['Usuario de VP', 'estudioso'], gender: 'M', rarity: "A",
        text: "P: ENTEREZA DEL INGENUO: Mientras tenga 4 o más de Vida, su Def y su Atq aumentan en 2. A: REPARACIÓN MOLECULAR (1F): Cura 2 de Vida a un aliado.", 
        passiveName: "ENTEREZA DEL INGENUO", activeName: "REPARACIÓN MOLECULAR", activeCost: 1, series: 1,

        abilities: [
            // retrasoSiRecienJugada: conserva el "temporizador inteligente" que tenía a mano
            // (espera a que acabe la animación de colocación antes de anunciarse).
            { trigger: "PASIVA_CONTINUA", nombre: "ENTEREZA DEL INGENUO", retrasoSiRecienJugada: 450,
              if: { campo: "self.hp", op: ">=", valor: 4 },
              then: [ { op: "MODIFICAR_STAT", stat: "def", delta: 2 }, { op: "MODIFICAR_STAT", stat: "atk", delta: 2 } ] }
        ],

        canActivateAbility: function(card, game) {
            if (card.furor < 1) { game.logError("Falta Furor (1)."); return false; }
            return true;
        },

        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 1, name: 'REPARACIÓN MOLECULAR', targetType: 'ally' };
            game.logMsg("Selecciona un aliado para Reparación Molecular.", 'system');
            game.render();
        },

        // Solo son objetivo válido los aliados a los que REALMENTE puede curar (Toto,
        // 27-jul-2026): antes valía cualquier aliado, así que se podía gastar el Furor y
        // la acción sobre uno con la Vida llena para que el efecto no hiciera nada.
        // Excepciones respetadas: los Zombificados rechazan la reparación, y quien puede
        // REBASAR su Vida máxima (onBeforeHealed, p. ej. Limo primario) sí es válido
        // aunque esté al máximo — mismo criterio que usa el DSL para CURAR.
        onValidateTarget: function(card, target, game, isSilent) {
            if (target.owner !== card.owner) return false;
            if (target.esZombi) {
                if (!isSilent) game.logError(`${game.getCardNameWithOwner(target)} está Zombificado y rechaza la reparación.`);
                return false;
            }
            const tpl = getCardTemplate(target.id) || {};
            const puedeSobrecurar = typeof tpl.onBeforeHealed === 'function';
            if (target.currentHp >= target.maxHp && !puedeSobrecurar) {
                if (!isSilent) game.logError(`${game.getCardNameWithOwner(target)} ya tiene la Vida completa.`);
                return false;
            }
            return true;
        },

        onTargetsReady: async function(card, game) {
            const target = game.abilityContext.targets[0];
            game.modifyStat(card, 'furor', -1);
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -30); // Animación en Kyle de que usa la habilidad

            if (target.attachedTo) {
                game.logMsg(`${game.getCardNameWithOwner(target)} está Zombificado y rechaza la reparación.`, 'system');
            } else {
                let amount = 2;
                const template = getCardTemplate(target.id);
                if (typeof template.onBeforeHealed === 'function') amount = template.onBeforeHealed(target, amount, card, game);
                
                const missing = target.maxHp - target.currentHp;
                if (missing > 0) {
                    const heal = Math.min(amount, missing);
                    showFloatingText(target.instanceId, "REPARACIÓN MOLECULAR", "ft-ability", -40); // El nombre aparece sobre el aliado
                    game.modifyStat(target, 'currentHp', heal);
                    game.logMsg(`${card.name} repara ${heal} de Vida a ${game.getCardNameWithOwner(target)}.`, 'ability');
                } else {
                    game.logMsg(`${game.getCardNameWithOwner(target)} ya tiene la Vida completa.`, 'system');
                }
            }

            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.updatePassives();
            game.render();
        },
    },
    { 
        id: 4, name: "Eris", hp: 4, def: 3, atk: 5, type: "Personaje", subtype: "Ser vivo", tags: ['Policía', 'Usuaria de magia'], gender: 'F', rarity: "A", 
        text: "P: VIGOR DE INVENCIÓN: Inmune a los Eventos y a las Ayudas enemigos. A: TIRO FINAL (2F): Ataque que ignora la Def del objetivo.", 
        activeName: "TIRO FINAL", activeCost: 2, passiveName: "VIGOR DE INVENCIÓN", series: 1,
        immuneToEnemyEvents: true,
        immuneToEnemyAids: true,

        // ACTIVA migrada (27/28-jul-2026, tanda de volumen #2): estrena `ignorarDefensa` (daño
        // = Atq puro) y `chequearEstado` (comprueba Confusión/Ceguera/Sueño propios antes de
        // golpear, vía checkAttackStatus — el mismo gate que performAttack usa para el ataque
        // normal; Hechicero/Lolita nunca lo comprobaban, Eris sí, de ahí el opt-in). El log pasa
        // a nombrar a Eris a secas (sin dueño): mismo criterio que el resto de auto-referencias
        // de ACTIVA en el DSL (Hawke, etc.) — el jugador ya sabe qué carta activó, por eso el
        // resto del log SÍ nombra con dueño a quien RECIBE el efecto, no a quien lo causa.
        abilities: [
            { trigger: "ACTIVA", nombre: "TIRO FINAL", coste: { furor: 2 },
              requisitos: [ { count: { quien: "ENEMIGO", zona: "vanguardia" }, op: ">=", valor: 1, msg: "No hay enemigos en la Vanguardia para TIRO FINAL." } ],
              target: { quien: "ENEMIGO", cantidad: 1 },
              ataqueNormal: true,
              log: "¡{carta} usa TIRO FINAL! (Ignora Defensa)",
              efectos: [ { op: "ATACAR", especial: true, ignorarDefensa: true, chequearEstado: true } ] }
        ],

        // HOOK 4: Inmunidad a efectos mágicos/eventos/ayudas
        onBeforeAffectedByEnemyEffect: function(card, effectCard, game) {
            game.logMsg(`¡Habilidad pasiva de ${game.getCardNameWithOwner(card)}: ${card.passiveName} tiene lugar! (Es inmune a ${effectCard.name})`, 'ability');
            showFloatingText(card.instanceId, card.passiveName, "ft-ability", -30);
            return false; // False = no le afecta el efecto
        }
    },
    { 
        id: 5, name: "Águila", hp: 5, def: 3, atk: 6, type: "Personaje", subtype: 'Ser vivo', tags: ['Guardia Real', 'Usuario de VP'], gender: 'M', rarity: "A",
        // Texto reescrito (28-jul-2026, betasteo de Toto) con el formato que el parser del
        // detalle necesita: nombre en MAYÚSCULAS al principio de cada Pasiva/Activa y ":" justo
        // tras el coste entre paréntesis. El texto viejo ("Evasión 50%...", "ESPÍA (2F). Elige")
        // no cumplía ninguna de las dos cosas: la Pasiva se mostraba sin nombre y el (2F) de la
        // Activa salía como texto suelto en vez del recuadro verde de coste. Redacción oficial
        // del Excel de Toto, íntegra (antes iba resumida).
        text: "P: PSEUDO-PREVASIÓN: Al recibir un ataque normal, moneda: con cara lo evita con todos sus efectos. A: ESPÍA (2F): Elige un tipo de carta y mira la mano de tu rival: un enemigo pierde tanto Furor como cartas de ese tipo haya en ella.",
        passiveName: "PSEUDO-PREVASIÓN", activeName: "ESPÍA", activeCost: 2, series: 1,

        // PSEUDO-PREVASIÓN migrada (31-jul-2026): estrena el op `ESQUIVAR`, que convierte la
        // esquiva de ANTES_DE_DEFENDER en CONDICIONAL — hasta ahora el trigger solo sabía
        // esquivar siempre (`esquiva:true`), y esta carta necesita que dependa de una moneda.
        // El op se limita a levantar el flag que el compilador lee al final, así que puede
        // colgar de una MONEDA, un `if` o lo que haga falta; además lanza `animateDodge` y su
        // propio log, que es donde la vieja los tenía.
        //
        // `soloAtaqueNormal` y `salvoIncontrarrestable` son los dos gates que la vieja hacía a
        // mano (esquiva solo ataques normales -así lo dice su texto- y Aniceto la atraviesa con
        // SAPIENCIA MÁGICA); ahora son campos del trigger, reutilizables por cualquier otra
        // carta de esquiva futura.
        //
        // ESPÍA se queda imperativa: encadena un modal propio de elección de TIPO de carta
        // (inputState 'SELECT_CARD_TYPE' + onTypeSelected), el visor de la mano rival
        // (onHandViewClosed) y solo entonces una selección de objetivo, contando cartas de ese
        // tipo en la mano del rival. Son tres pantallas encadenadas con estado propio, no un
        // patrón que hoy exista ni que compense construir para una sola carta.
        abilities: [
            { trigger: "ANTES_DE_DEFENDER", nombre: "PSEUDO-PREVASIÓN",
              soloAtaqueNormal: true, salvoIncontrarrestable: true,
              logIncontrarrestable: "{objetivo} ignora las defensas evasivas gracias a su pasiva.",
              log: "¡Habilidad pasiva de {defensor}: PSEUDO-PREVASIÓN tiene lugar! (Esquiva)",
              efectos: [
                { op: "FLOTANTE", target: { quien: "SELF" }, texto: "PSEUDO-PREVASIÓN", estilo: "ft-ability", offset: -30 },
                { op: "MONEDA",
                  cara: [ { op: "ESQUIVAR", log: "¡{defensor} ESQUIVÓ el ataque de {objetivo}!", logTipo: "combat" } ] } ] }
        ],

        // HOOK 2: Coste personalizado (2 Furor en lugar de 1)
        canActivateAbility: function(card, game) {
            if (card.furor < 2) {
                game.logError("Falta Furor (2).");
                return false;
            }
            return true;
        },

        // HOOK 3: Iniciar ESPÍA (Abre el menú de tipos)
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_CARD_TYPE';
            document.getElementById('type-select-modal').style.display = 'flex';
            game.render();
        },

        // HOOK 4: Ha elegido el tipo (Abre el visor de la mano rival)
        onTypeSelected: function(card, type, game) {
            document.getElementById('type-select-modal').style.display = 'none';
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            
            game.abilityContext = { name: 'ESPÍA', selectedType: type, enemyId: enemyId };
            
            game.logMsg(`Has elegido tipo: ${type}. Mirando mano del rival...`, 'system');
            game.openHandViewer(enemyId, card.owner);
        },

        // HOOK 5: Cierra el visor de la mano (Calcula y pide objetivo)
        onHandViewClosed: function(card, game) {
            const enemyP = game.players[game.abilityContext.enemyId];
            const type = game.abilityContext.selectedType;
            const count = enemyP.hand.filter(c => c.type === type).length;
            
            game.abilityContext.count = count;
            game.logMsg(`Hay ${count} cartas de tipo ${type} en la mano rival.`, 'ability');
            
           if (count > 0) {
                game.logMsg("Selecciona un enemigo para quitarle Furor.", 'system');
                game.inputState = 'SELECT_ABILITY_TARGETS'; 
                game.abilityContext.targets = [];
                game.abilityContext.maxTargets = 1;
                game.abilityContext.targetType = 'enemy';
                game.isActionLocked = true; // <--- IMPIDE QUE VEA LA MANO Y LUEGO CANCELE EL GASTO
            } else {
                game.logMsg("Como hay 0 cartas, la habilidad termina aquí.", 'system');
                game.modifyStat(card, 'furor', -2); // Cobramos el furor aunque falle
                card.exhausted = true;
                game.isActionLocked = false;
                game.cancelAction();
            }
            game.render();
        },

        // HOOK 6: Ejecutar la resta de Furor
        onTargetsReady: function(card, game) {
            const target = game.abilityContext.targets[0];
            const amount = game.abilityContext.count;
            
            game.modifyStat(card, 'furor', -2); // Coste de la habilidad
            
            const oldFuror = target.furor;
            game.modifyStat(target, 'furor', -amount); // Quitar furor
            
            showFloatingText(card.instanceId, "ESPÍA", "ft-ability", -30);
            game.logMsg(`${game.getCardNameWithOwner(card)} usa ESPÍA en ${game.getCardNameWithOwner(target)}: Quita ${amount} Furor (${oldFuror} -> ${target.furor}).`, 'ability');
            
            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.render();
        }
    },
    { 
        id: 6, name: "Sadame", hp: 2, def: 4, atk: 5, type: "Personaje", subtype: 'No-muerto', tags: ["Ninja", "Usuaria de magia"], gender: 'F', rarity: "A", 
        text: "P: RAÍCES NINJA: Al curarse de más, su Vida máxima sube hasta un tope de 6. Gana +1 de Furor extra de las cartas. A: ZOMBIFICAR (1F): Anexa un aliado 'Ser vivo'. Regenera 2 de Vida al final del turno y no puede recibir Ayudas de curación. Puede deshacer anexos.", 
        passiveName: "RAÍCES NINJA", activeName: "ZOMBIFICAR", activeCost: 1, series: 1,
        uncopyable: true, // Zombificar usa arrays exclusivos de anexo
        // El vínculo lo crea su ACTIVA, no la Pasiva: sin este campo, el detalle lo atribuiría
        // a RAÍCES NINJA (mismo tipo de error que se corrigió en Karolina/Xidachane).
        annexHabilidad: "ZOMBIFICAR",
        // annexEffectText = lo que la unión provoca EN EL ANEXADO (aquí sí lo hay: el zombi).
        annexEffectText: "Zombificado: regenera 2 de Vida al final del turno y no puede recibir Ayudas de curación",

        onBeforeHealed: function(card, amount, source, game) {
            if (source && source.type === 'Ayuda') {
                if (card.currentHp + amount > card.maxHp) {
                    const newMax = Math.min(6, card.currentHp + amount);
                    if (newMax > card.maxHp) {
                        const diff = newMax - card.maxHp;
                        card.maxHp = newMax;
                        showFloatingText(card.instanceId, `+${diff} VIDA MÁX.`, "ft-green", -20);
                        game.logMsg(`${game.getCardNameWithOwner(card)} expande su Vida máxima a ${newMax} (RAÍCES NINJA)`, 'ability');
                    }
                }
            }
            return amount;
        },

        onBeforeGainFuror: function(card, amount, source, game) {
            if (source !== 'fase_furor') {
                game.logMsg(`¡${card.passiveName} otorga +1 Furor extra a Sadame!`, 'ability');
                return amount + 1;
            }
            return amount;
        },

        canActivateAbility: function(card, game) {
            if (card.furor < 1) { game.logError("Falta Furor (1)."); return false; } 
            
            const p = game.players[card.owner];
            const validTargets = [...p.vanguard, ...p.rearguard].filter(c => c.instanceId !== card.instanceId && c.subtype === 'Ser vivo' && c.attachedTo !== card.instanceId);
            const hasAttachments = card.attachments && card.attachments.length > 0;

            if (validTargets.length === 0 && !hasAttachments) {
                game.logError("No hay aliados 'Ser vivo' en el campo para Zombificar."); 
                return false;
            }
            return true;
        },

        onValidateTarget: function(card, target, game, isSilent = false) {
            if (target.subtype !== "Ser vivo") {
                if (!isSilent) game.logError("¡El objetivo debe ser un Ser vivo!"); 
                return false;
            }
            if (target.attachedTo === card.instanceId) {
                if (!isSilent) game.logError("Ese aliado ya está anexado a Sadame."); 
                return false;
            }
            return true;
        },

        getAbilityWarning: function(card, game) {
            if (!card.attachments) return null;
            const p = game.players[card.owner];
            const validTargets = [...p.vanguard, ...p.rearguard].filter(c => c.instanceId !== card.instanceId && c.subtype === 'Ser vivo' && c.attachedTo !== card.instanceId);
            
            if (validTargets.length === 0 && card.attachments.length > 0) {
                return "Advertencia: no hay más aliados aptos para zombificar, sólo podrás deshacer los anexos si confirmas";
            }
            return null;
        },

        onExecuteAbility: function(card, game) {
            if (!card.attachments) card.attachments = [];
            const p = game.players[card.owner];
            const validTargets = [...p.vanguard, ...p.rearguard].filter(c => c.instanceId !== card.instanceId && c.subtype === 'Ser vivo' && c.attachedTo !== card.instanceId);
            
            const doDesanexar = () => {
                game.modifyStat(card, 'furor', -1);
                game.logMsg(`${game.getCardNameWithOwner(card)} deshace todos sus anexos.`, "ability");
                card.attachments.forEach(allyId => {
                    const ally = game.findCard(allyId);
                    if (ally) {
                        ally.attachedTo = null;
                        delete ally.reverseArrow; // <--- LIMPIEZA: Le quitamos la marca al soltarlo
                        delete ally.esZombi; // deja de ser zombi (vuelve a poder curarse)
                    }
                });
                card.attachments = [];
                card.exhausted = true;
                game.isActionLocked = false;
                game.cancelAction();
                game.render();
            };

            const doAnexar = () => {
                game.logError("Elige un aliado (Ser vivo) para Anexar."); 
                game.selectedCard = card;
                game.inputState = 'SELECT_ABILITY_TARGETS';
                game.abilityContext = { targets: [], maxTargets: 1, name: 'ZOMBIFICAR', targetType: 'ally' };
                game.render();
            };

            if (validTargets.length === 0 && card.attachments.length > 0) {
                doDesanexar();
                return;
            }

            if (card.attachments.length > 0) {
                game.openChoiceModal('ZOMBIFICAR', [
                    { label: 'ANEXAR NUEVO ALIADO', action: doAnexar },
                    { label: 'DESHACER TODOS LOS ANEXOS', action: doDesanexar }
                ]);
            } else {
                doAnexar();
            }
        },

        onTargetsReady: async function(card, game) {
            const target = game.abilityContext.targets[0];
            
            game.modifyStat(card, 'furor', -1);
            target.attachedTo = card.instanceId;
            target.reverseArrow = true; // <--- INYECCIÓN: Solo este zombi invierte su propia flecha
            target.esZombi = true; // marca de zombi de Sadame (rechaza Ayudas de curación); un anexo NO-zombi (p. ej. un clon) no la lleva
            card.attachments.push(target.instanceId);
            
            showFloatingText(card.instanceId, "ZOMBIFICAR", "ft-ability", -30);
            game.logMsg(`${card.name} anexa a ${game.getCardNameWithOwner(target)}.`, "ability");

            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.updatePassives();
            game.render();
        },

        onEndTurn: function(card, game) {
            if (!card.attachments || card.attachments.length === 0) return;
            card.attachments.forEach(allyId => {
                const ally = game.findCard(allyId);
                if (ally && ally.currentHp > 0) {
                    const missing = ally.maxHp - ally.currentHp;
                    if (missing > 0) {
                        const heal = Math.min(2, missing);
                        showFloatingText(ally.instanceId, "ZOMBIFICAR", "ft-ability", -40);
                        game.modifyStat(ally, 'currentHp', heal);
                        game.logMsg(`ZOMBIFICAR: ${game.getCardNameWithOwner(ally)} regenera ${heal} Vida.`, 'ability');
                    }
                }
            });
        }
    },
    { 
        id: 7, name: "Aniceto", hp: 5, def: 5, atk: 6, type: "Personaje", subtype: "Ser vivo", tags: ['Usuario de magia'], gender: 'M', rarity: "A", 
        text: "P: SAPIENCIA MÁGICA: Sus ataques y Habilidades son imparables. A: LUZ VIRTUOSA (3F): Ataque especial. Moneda - Cara: Confusión 2 turnos / Cruz: Ceguera 2 turnos.", 
        passiveName: "SAPIENCIA MÁGICA", activeName: "LUZ VIRTUOSA", activeCost: 3, series: 1,
        uncounterable: true, // ¡La magia que avisa a Águila!

        // ACTIVA migrada (28-jul-2026): mismo patrón que Eris (especial + chequearEstado), con
        // un MONEDA anidado en siExito para el estado (Confusión/Ceguera) según cara/cruz. El
        // log de activación pasa a nombrar a Aniceto a secas, mismo criterio ya aplicado a Eris/
        // Hawke (el jugador ya sabe qué carta activó).
        abilities: [
            { trigger: "ACTIVA", nombre: "LUZ VIRTUOSA", coste: { furor: 3 },
              requisitos: [ { count: { quien: "ENEMIGO", zona: "vanguardia" }, op: ">=", valor: 1, msg: "No hay enemigos en la Vanguardia." } ],
              target: { quien: "ENEMIGO", cantidad: 1 },
              log: "¡{carta} usa LUZ VIRTUOSA!",
              efectos: [
                { op: "ATACAR", especial: true, chequearEstado: true,
                  siExito: [
                    { op: "MONEDA",
                      cara: [ { op: "APLICAR_ESTADO", estado: "confusion", duracion: 2, log: "Moneda: CARA - ¡Luz Virtuosa Confunde a {objetivo}!" } ],
                      cruz: [ { op: "APLICAR_ESTADO", estado: "ceguera", duracion: 2, log: "Moneda: CRUZ - ¡Luz Virtuosa Ciega a {objetivo}!" } ] }
                  ] }
              ] }
        ]
    },
    { 
        id: 8, name: "Spencer", hp: 4, def: 4, atk: 4, type: "Personaje", subtype: "Máquina", tags: ['Con conciencia'], gender: 'M', rarity: "A",
        text: "P: BATERÍA AUTÓNOMA: Al final de tu turno, si su Vida es 3 o menos, se cura 1. Puede usar su Activa aunque haya atacado. A: CAMBIO DE PAJARITA (1F): +3 a una característica (Vida, Def o Atq) y -1 a las otras. Su Vida no baja de 1 por esto. No gasta acción.",
        passiveName: "BATERÍA AUTÓNOMA", activeName: "CAMBIO DE PAJARITA", activeCost: 1, series: 1,
        // combinaStatsPropios: su propia pasiva toca Vida MÁX., Def y Atq a la vez; se combinan
        // en UNA línea en onGetPreviewEffects (única vía que puede incluir VIDA MÁX., que el
        // registro automático de "Afectado por" no rastrea) en vez de dos líneas separadas.
        combinaStatsPropios: true,
        // silencioso: la pasiva dinámica de la pajarita (elegida por el jugador vía la Activa,
        // que ya anuncia el cambio por su cuenta) no tiene su propio log/floating por pasada.
        abilities: [
            { trigger: "PASIVA_CONTINUA", nombre: "PAJARITA", silencioso: true,
              if: { campo: "pajaritaStance", op: "==", valor: "DEFENSA" },
              then: [ { op: "MODIFICAR_STAT", stat: "def", delta: 3 }, { op: "MODIFICAR_STAT", stat: "atk", delta: -1 } ],
              else: [
                { if: { campo: "pajaritaStance", op: "==", valor: "ATAQUE" },
                  then: [ { op: "MODIFICAR_STAT", stat: "def", delta: -1 }, { op: "MODIFICAR_STAT", stat: "atk", delta: 3 } ],
                  else: [
                    { if: { campo: "pajaritaStance", op: "==", valor: "VIDA" },
                      then: [ { op: "MODIFICAR_STAT", stat: "def", delta: -1 }, { op: "MODIFICAR_STAT", stat: "atk", delta: -1 } ] } ] } ] }
        ],
        uncopyable: true, // Requiere el modificador único "PajaritaStance"
        
        abilityWhileExhausted: true,

        // HOOK 1: Curación a final de turno con límite inteligente
        onEndTurn: function(card, game) {
            // 1. Calculamos cuál es su Vida máxima actual según la pajarita
            // La Vida máx. ya es REAL en card.maxHp (la pajarita la mueve por delta)
            // 2. Se cura SOLO si tiene 3 o menos, y NUNCA supera su máximo real
            if (card.currentHp > 0 && card.currentHp <= 3 && card.currentHp < card.maxHp) {
                game.logMsg(`¡${card.passiveName} de ${game.getCardNameWithOwner(card)} se activa! (Cura 1 de Vida)`, 'ability');
                showFloatingText(card.instanceId, "BATERÍA AUTÓNOMA", "ft-ability", -40);
                
                let amount = 1;
                const template = getCardTemplate(card.id);
                if (typeof template.onBeforeHealed === 'function') amount = template.onBeforeHealed(card, amount, card, game);
                
                game.modifyStat(card, 'currentHp', amount);
            }
        },

        canActivateAbility: function(card, game) {
            if (card.furor < 1) { game.logMsg("Falta Furor (1).", 'system'); return false; }
            return true;
        },

        // HOOK 3: Ejecutar el menú de la Pajarita y las animaciones visuales
        onExecuteAbility: function(card, game) {
            const applyStance = (stance) => {
                // Gastamos el furor manualmente para que no salga el texto por defecto de -1 y manche la animación
                card.furor = Math.max(0, card.furor - 1);
                game.logMsg(`${game.getCardNameWithOwner(card)} cambia a pajarita: ${stance}.`, 'ability');

                // --- ANIMACIÓN EN CASCADA ---
                showFloatingText(card.instanceId, "CAMBIO DE PAJARITA", "ft-ability", -45);
                
                if (stance === 'VIDA') {
                    showFloatingText(card.instanceId, "+3 VIDA", "ft-green", -20);
                    showFloatingText(card.instanceId, "-1 DEF", "ft-red-stat", 0);
                    showFloatingText(card.instanceId, "-1 ATQ", "ft-red-stat", 20);
                } else if (stance === 'DEFENSA') {
                    showFloatingText(card.instanceId, "+3 DEF", "ft-green", -20);
                    showFloatingText(card.instanceId, "-1 VIDA", "ft-red-stat", 0);
                    showFloatingText(card.instanceId, "-1 ATQ", "ft-red-stat", 20);
                } else if (stance === 'ATAQUE') {
                    showFloatingText(card.instanceId, "+3 ATQ", "ft-green", -20);
                    showFloatingText(card.instanceId, "-1 VIDA", "ft-red-stat", 0);
                    showFloatingText(card.instanceId, "-1 DEF", "ft-red-stat", 20);
                }

                // Cálculo matemático de Vida
                let oldHpMod = 0;
                if (card.pajaritaStance === 'VIDA') oldHpMod = 3;
                else if (card.pajaritaStance === 'DEFENSA' || card.pajaritaStance === 'ATAQUE') oldHpMod = -1;

                let newHpMod = 0;
                if (stance === 'VIDA') newHpMod = 3;
                else if (stance === 'DEFENSA' || stance === 'ATAQUE') newHpMod = -1;

                let diff = newHpMod - oldHpMod;
                if (diff !== 0) {
                    let targetHp = card.currentHp + diff;
                    if (targetHp < 1) targetHp = 1; 
                    
                    // Modificamos el valor interno directamente para EVITAR el texto por defecto de modifyStat
                    card.currentHp = targetHp;
                    // La Vida MÁXIMA también se mueve por delta: así curarse funciona (y otros buffs de Vida máx. se respetan)
                    card.maxHp = Math.max(1, (card.maxHp || 0) + diff);
                    if (card.currentHp > card.maxHp) card.currentHp = card.maxHp;
                }

                card.pajaritaStance = stance;
                
                game.isActionLocked = false;
                game.cancelAction();
                game.updatePassives(); 
                game.render();
            };

            game.openChoiceModal('CAMBIO DE PAJARITA', [
                { label: 'PAJARITA: VIDA (+3 Vida, -1 Def, -1 Atq)', action: () => applyStance('VIDA') },
                { label: 'PAJARITA: DEFENSA (+3 Def, -1 Vida, -1 Atq)', action: () => applyStance('DEFENSA') },
                { label: 'PAJARITA: ATAQUE (+3 Atq, -1 Vida, -1 Def)', action: () => applyStance('ATAQUE') }
            ]);
        },

        // HOOK 4: Información súper detallada en el panel lateral. Línea COMBINADA (Vida, Def,
        // Atq, en ese orden — el mismo orden de la propia carta; ver combinaStatsPropios más
        // arriba, que evita que el registro automático duplique Def/Atq en una segunda línea.
        onGetPreviewEffects: function(card, game) {
            const deltas = { DEFENSA: { hp: -1, def: 3, atk: -1 }, ATAQUE: { hp: -1, def: -1, atk: 3 }, VIDA: { hp: 3, def: -1, atk: -1 } };
            const d = deltas[card.pajaritaStance];
            if (!d) return [];
            const f = (n) => (n > 0 ? '+' : '') + n;
            const partes = [`${f(d.hp)} VIDA MÁX.`, `${f(d.def)} DEF`, `${f(d.atk)} ATQ`];
            const texto = partes.slice(0, -1).join(', ') + ' y ' + partes[partes.length - 1];
            return [`${texto} por ${card.activeName} (${card.pajaritaStance}), fuente: esta carta`];
        }
    },
    { 
        id: 9, name: "Mill", hp: 4, def: 5, atk: 6, type: "Personaje", subtype: "Ser vivo", tags: ['Traje protector', 'científico', 'Usuario de VP'], gender: 'M', rarity: "A", 
        text: "P: CAMUFLAJE ÓPTICO: Si no ataca, gana Oculto durante el turno rival. El daño lo revela. A: MOTOCICLETA (3F): Cambia a Mill y 1 aliado de vanguardia por 2 de retaguardia.", 
        passiveName: "CAMUFLAJE ÓPTICO", activeName: "MOTOCICLETA", activeCost: 3, series: 1,

        // HOOK 1: Resetear tracker y limpiar su propio sigilo
        onStartTurn: function(card, game) {
            card.hasAttackedThisTurn = false;
            // El sigilo dura durante el turno del rival. Al empezar mi turno, se desvanece.
            if (card.owner === game.activePlayerId && card.stealth) {
                card.stealth = false;
                game.logMsg(`${game.getCardNameWithOwner(card)} apaga su Camuflaje Óptico.`, 'system');
            }
        },

        // HOOK 2: Ganar Sigilo si fue pacífico
        onEndTurn: function(card, game) {
            if (card.owner === game.activePlayerId && card.currentHp > 0) {
                if (!card.hasAttackedThisTurn) {
                    card.stealth = true;
                    game.logMsg(`¡${card.passiveName} de ${game.getCardNameWithOwner(card)} se activa! (Oculto)`, 'ability');
                    showFloatingText(card.instanceId, "OCULTO", "ft-gray", -30);
                }
            }
        },

        // HOOK 3: Validar Coste y número de aliados (Mínimo 2 en Van y 2 en Rear)
        canActivateAbility: function(card, game) {
            if (card.furor < 3) { game.logMsg("Falta Furor (3).", 'system'); return false; }
            const p = game.players[card.owner];
            if (p.vanguard.length < 2) {
                game.logError("Necesitas al menos otro aliado en la vanguardia para intercambiar."); return false;
            }
            if (p.rearguard.length < 2) {
                game.logError("Necesitas al menos 2 aliados en la retaguardia para intercambiar."); return false;
            }

            // Comprobamos por encima si existe ALGUNA combinación legal (para no atascar la partida)
            let currentVP = p.vanguard.filter(c => c.type === 'Personaje').length;
            let validFound = false;
            for(let v of p.vanguard) {
                if (v.instanceId === card.instanceId) continue;
                let baseVP = currentVP - 1 - (v.type === 'Personaje' ? 1 : 0);
                for(let i=0; i<p.rearguard.length; i++) {
                    for(let j=i+1; j<p.rearguard.length; j++) {
                        let futureVP = baseVP + (p.rearguard[i].type === 'Personaje'?1:0) + (p.rearguard[j].type === 'Personaje'?1:0);
                        if (futureVP <= 2) { validFound = true; break; }
                    }
                    if (validFound) break;
                }
                if (validFound) break;
            }
            if (!validFound) {
                game.logError("No hay combinaciones válidas que respeten el límite de 2 Personajes.");
                return false;
            }
            return true;
        },

        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 3, name: 'MOTOCICLETA', targetType: 'ally' };
            game.logMsg("MOTOCICLETA: Elige al OTRO aliado de la vanguardia que se retirará con Mill.", 'system');
            game.render();
        },

        // HOOK 4: Validador de los 3 pasos
        onValidateTarget: function(card, target, game, isSilent = false) {
            const ctx = game.abilityContext;
            const p = game.players[card.owner];

            if (target.instanceId === card.instanceId) {
                if (!isSilent) game.logError("No puedes seleccionar a Mill (ya va incluido en la Motocicleta).");
                return false;
            }

            // PASO 1: El compañero de vanguardia
            if (ctx.targets.length === 0) {
                if (target.location !== 'vanguard') {
                    if (!isSilent) game.logError("Elige un aliado de la vanguardia.");
                    return false;
                }
                return true;
            }
            // PASO 2: El primer aliado de retaguardia
            else if (ctx.targets.length === 1) {
                if (target.location !== 'rearguard') {
                    if (!isSilent) game.logError("Elige el 1er aliado de la retaguardia.");
                    return false;
                }
                return true;
            }
            // PASO 3: El segundo aliado de retaguardia (AQUÍ SE CALCULA EL LÍMITE MATEMÁTICO)
            else if (ctx.targets.length === 2) {
                if (target.location !== 'rearguard') {
                    if (!isSilent) game.logError("Elige el 2do aliado de la retaguardia.");
                    return false;
                }
                if (target.instanceId === ctx.targets[1].instanceId) {
                    if (!isSilent) game.logError("Ya has seleccionado a este aliado.");
                    return false;
                }

                const vanAlly = ctx.targets[0];
                const rearAlly1 = ctx.targets[1];
                const rearAlly2 = target;

                let currentVP = p.vanguard.filter(c => c.type === 'Personaje').length;
                let futureVP = currentVP 
                    - 1 // Restamos a Mill
                    - (vanAlly.type === 'Personaje' ? 1 : 0) // Restamos al compañero
                    + (rearAlly1.type === 'Personaje' ? 1 : 0) // Sumamos al primero
                    + (rearAlly2.type === 'Personaje' ? 1 : 0); // Sumamos al segundo
                
                if (futureVP > 2) {
                    if (!isSilent) game.logError("¡Límite superado! Esta elección dejaría a más de 2 Personajes en Vanguardia.");
                    return false;
                }
                return true;
            }
            return false;
        },

        // HOOK 5: Ejecutar los cambios múltiples (Doble Intercambio)
        onTargetsReady: async function(card, game) {
            game.modifyStat(card, 'furor', -3);
            const p = game.players[card.owner];
            const vanAlly = game.abilityContext.targets[0];
            const r1 = game.abilityContext.targets[1];
            const r2 = game.abilityContext.targets[2];

            showFloatingText(card.instanceId, "MOTOCICLETA", "ft-ability", -30);
            game.logMsg(`${game.getCardNameWithOwner(card)} y ${game.getCardNameWithOwner(vanAlly)} suben a la Motocicleta e intercambian posición con ${game.getCardNameWithOwner(r1)} y ${game.getCardNameWithOwner(r2)}.`, 'ability');
            
            game.inputState = 'EXECUTING';
            game.render();

            // Animamos los dos intercambios a la vez
            await Promise.all([
                game.animateSwap(card.instanceId, r1.instanceId),
                game.animateSwap(vanAlly.instanceId, r2.instanceId)
            ]);

            // Actualizamos los arrays de posición filtrando los que salen
            p.vanguard = p.vanguard.filter(c => c.instanceId !== card.instanceId && c.instanceId !== vanAlly.instanceId);
            p.rearguard = p.rearguard.filter(c => c.instanceId !== r1.instanceId && c.instanceId !== r2.instanceId);

            // Cambiamos sus etiquetas
            card.location = 'rearguard';
            vanAlly.location = 'rearguard';
            r1.location = 'vanguard';
            r2.location = 'vanguard';

            // Los introducimos en su nueva zona
            p.rearguard.push(card, vanAlly);
            p.vanguard.push(r1, r2);

            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.updatePassives();
            game.render();
        },

        onGetPreviewEffects: function(card, game) {
            if (card.stealth) {
                return [`${game.generoTexto(card, 'Oculto', 'Oculta')}: inmune a ataques normales por ${card.passiveName}, fuente: esta carta`];
            }
            return [];
        }
    },
    { 
        id: 10, name: "Hawke", hp: 4, def: 4, atk: 6, type: "Personaje", subtype: "Ser vivo", tags: ['Poder heredado'], gender: 'M', rarity: "A", 
        text: "P: RADIACIÓN: En vanguardia, al final de tu turno puedes aplicar Daño por tiempo (1 turno) a 1 enemigo de vanguardia. A: PUÑO DE NEUTRONES (1F): Ataque normal con +2 de Atq durante el golpe.", 
        passiveName: "RADIACIÓN", activeName: "PUÑO DE NEUTRONES", activeCost: 1, series: 1,

        // HOOK 1: Pasiva interactiva de Final de Turno
        // Selección en tablero (28-jul-2026, betasteo de Toto): usaba el modal genérico para
        // elegir un enemigo YA EN EL CAMPO, violando la norma de targeting en tablero — se
        // detectó al pasar por Hawke en la tanda de volumen y quedó anotado para arreglar aquí
        // mismo, aunque RADIACIÓN se quede imperativa (sigue sin haber trigger DSL de fin de
        // turno interactivo por carta).
        onEndTurn: async function(card, game) {
            if (card.location !== 'vanguard' || card.owner !== game.activePlayerId) return;

            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            // Filtramos para ignorar a los Avatares (como Kami) que son intocables
            const enemyVanguard = game.players[enemyId].vanguard.filter(c => !getCardTemplate(c.id).isAvatar);

            if (enemyVanguard.length === 0) return;

            // Selección en tablero (reborde verde), cancelable
            const chosen = await game.pickBoardTargets(enemyVanguard, 1, 'RADIACIÓN: elige a quién irradiar (clic en el tablero; X para cancelar)', card, card.owner, true);

            if (chosen && chosen.length > 0) {
                const enemy = chosen[0];
                game.logMsg(`¡${card.passiveName} de ${card.name} irradia a ${game.getCardNameWithOwner(enemy)}!`, 'ability');
                game.applyStatus(enemy, 'dot', 1, card);
                await game.sleep(500); 
            } else {
                game.logMsg(`${game.getCardNameWithOwner(card)} decide no irradiar a nadie este turno.`, 'system');
            }
        },

        // ACTIVA migrada (27/28-jul-2026, tanda de volumen #2): mismo patrón que
        // Hiposaurio/CABREO — ataque normal + bono de Atq. RADIACIÓN (pasiva de fin de
        // turno con modal) se queda imperativa: no hay trigger DSL de fin de turno
        // interactivo por carta, y no compensa crear uno para esta sola pasiva.
        abilities: [
            { trigger: "ACTIVA", nombre: "PUÑO DE NEUTRONES", coste: { furor: 1 },
              requisitos: [ { count: { quien: "ENEMIGO", zona: "vanguardia" }, op: ">=", valor: 1 } ],
              target: { quien: "ENEMIGO", cantidad: 1 },
              ataqueNormal: true,
              log: "¡{carta} prepara su PUÑO DE NEUTRONES! (+2 ATQ en este golpe)",
              floatingExtra: [ { texto: "+2 ATQ", estilo: "ft-green", offset: -20 } ],
              efectos: [ { op: "ATACAR", bonoAtq: 2 } ] }
        ]
    },
    { 
        id: 11, name: "Garret", hp: 4, def: 8, atk: 9, type: "Personaje", subtype: "Ser vivo", tags: ['Usuario de magia'], gender: 'M', rarity: "S",
        text: "Coste: 4 de Furor de Sadame, Aniceto o Hawke. P: DESBORDE DE MANÁ: Al colocar: busca Escudo mágico. Gana 2 de Furor por turno. Inmune al daño especial. A: ANDANADA METEÓRICA (3F): Ataque especial a 2 enemigos.",
        passiveName: "DESBORDE DE MANÁ", activeName: "ANDANADA METEÓRICA", activeCost: 3, series: 1,
        // Migrado (30-jul-2026): el tributo NO es DSL.tributoFuror (ese helper elige entre
        // CUALQUIER aliado con Furor suficiente) — aquí el pagador debe ser Sadame, Aniceto o
        // Hawke por nombre, así que va por ANTES_DE_JUGAR + ELEGIR con un filtro `o` de 3
        // nombres, mismo mecanismo que el deudor de Deuda con la mafia (cancelable: si
        // declinas, la carta NO se coloca — `_runEffectList` devuelve ok:false y
        // onBeforePlayAsync propaga false). La vieja delegaba el descuento de Furor y su log
        // ("X entrega su Furor como tributo para Y") a un mecanismo genérico del motor
        // (`card.tributeSourceId`, con -4 hardcodeado); aquí el MODIFICAR_STAT anidado hace
        // lo mismo explícitamente. El orden de preferencia Sadame>Aniceto>Hawke de la vieja
        // era solo para una lista ordenada de modal; ELEGIR usa selección en tablero (norma
        // de targeting), donde el orden no aplica.
        // Búsqueda de Escudo mágico (mazo O descartes, con opción de no buscar nada) se queda
        // imperativa: BUSCAR no soporta elegir entre dos zonas distintas en una sola llamada.
        // Los dos ganchos globales (+1 Furor extra en fase de Furor, inmune a daño especial)
        // tampoco tienen trigger DSL.
        abilities: [
            { trigger: "JUGAR", requisitos: [
                { count: { filtros: [ { o: [ [ { campo: "name", op: "==", valor: "Sadame" } ], [ { campo: "name", op: "==", valor: "Aniceto" } ], [ { campo: "name", op: "==", valor: "Hawke" } ] ] }, { campo: "furor", op: ">=", valor: 4 } ] }, op: ">=", valor: 1,
                  msg: "Necesitas a Sadame, Aniceto o Hawke con al menos 4 de Furor en el campo para colocar a Garret." } ] },
            { trigger: "ANTES_DE_JUGAR",
              efectos: [
                { op: "ELEGIR", de: "ALIADOS",
                  filtros: [ { o: [ [ { campo: "name", op: "==", valor: "Sadame" } ], [ { campo: "name", op: "==", valor: "Aniceto" } ], [ { campo: "name", op: "==", valor: "Hawke" } ] ] }, { campo: "furor", op: ">=", valor: 4 } ],
                  cantidad: 1, titulo: "TRIBUTO PARA GARRET (-4 FUROR)",
                  efectos: [ { op: "MODIFICAR_STAT", stat: "furor", delta: -4, esCoste: true,
                               log: "{objetivo} entrega su Furor como tributo para Garret." } ] } ] },
            { trigger: "AL_JUGAR",
              efectos: [
                { op: "BUSCAR", en: ["MAZO", "DESCARTES"], cantidad: 1, destino: "MANO",
                  filtros: [ { campo: "name", op: "==", valor: "Escudo mágico" } ],
                  titulo: "DESBORDE DE MANÁ: ELIGE UN ESCUDO MÁGICO",
                  confirmarPorZona: true,
                  confirmar: { titulo: "DESBORDE DE MANÁ: BÚSQUEDA", no: "NO BUSCAR NADA",
                               porZona: { MAZO: "BUSCAR EN EL MAZO", DESCARTES: "BUSCAR EN DESCARTES" } },
                  log: "{carta} atrae un Escudo mágico a la mano de {jugador}.",
                  logNoValidas: "No queda ningún Escudo mágico en el mazo ni en los descartes de {jugador}.",
                  logNoEncontrada: "No hay ningún Escudo mágico ahí.",
                  barajarDespues: { log: "Barajando el mazo de {jugador}...", inclusoSinValidas: true } } ] },
            { trigger: "ACTIVA", nombre: "ANDANADA METEÓRICA", coste: { furor: 3 }, sinObjetivo: true,
              requisitos: [
                { count: { quien: "ENEMIGO", zona: "vanguardia", filtros: [ { campo: "stealth", op: "falsy" } ] }, op: ">=", valor: 2,
                  msg: "No hay suficientes enemigos válidos en vanguardia para ANDANADA METEÓRICA." } ],
              efectos: [
                { op: "ELEGIR", de: "ENEMIGOS", zona: "VANGUARDIA", filtros: [ { campo: "stealth", op: "falsy" } ], cantidad: 2, cancelable: false,
                  titulo: "ANDANADA METEÓRICA: elige 2 enemigos distintos",
                  efectos: [ { op: "ATACAR", especial: true } ] } ] }
        ],

        // DESBORDE DE MANÁ migrada al op BUSCAR (13-ago-2026). El modal de tres opciones que
        // tenía escrito a mano -mazo / descartes si hay / nada- es literalmente `confirmarPorZona`,
        // la pieza que ya usan Berry y Karlitos. Al migrar hereda tres cosas que le faltaban:
        //   · el VISOR del mazo, con la pila entera a la vista. Antes cogía el primer Escudo por
        //     id fijo, sin enseñar nada y sin dejarte elegir cuál.
        //   · la PRESENTACIÓN camino de la mano, que es lo que hacía que el rival no llegara a
        //     ver el Escudo que te llevabas (Toto lo pilló probando a Garret).
        //   · el aviso de "no hay ninguno", que ahora lo lleva el propio visor.
        // Sus dos logs por zona ("añade del mazo" / "recupera de los descartes") se funden en el
        // del op: decisión de Toto, que la carta se comporte igual que sus hermanas pesa más que
        // conservar cada mensaje.

        // HOOK 3: Ganar 2 de Furor en vez de 1 SÓLO en la fase de Furor
        onBeforeGainFuror: function(card, amount, source, game) {
            if (source === 'fase_furor') {
                game.logMsg(`¡${card.passiveName} otorga +1 Furor adicional a Garret!`, 'ability');
                return amount + 1;
            }
            return amount;
        },

        // HOOK 5: Inmune al daño Especial
        onBeforeTakeDamage: async function(card, attacker, dmg, isSpecial, game) {
            if (isSpecial) {
                game.logMsg(`${game.getCardNameWithOwner(card)} es inmune al daño especial (Desborde de Maná).`, 'ability');
                return 0; // Reduce el daño a 0
            }
            return dmg;
        },
    },
    { 
        id: 12, name: "Manzanahoria", type: "Ayuda", subtype: "Ingerible", tags: ["Consumible"], rarity: "C", text: "Cura 2 de Vida a un aliado.", cost: 0,
        abilities: [
            { trigger: "JUGAR", requisitos: [ { count: { quien: "ALIADO" }, op: ">=", valor: 1, msg: "No tienes aliados en mesa para usar {carta}." } ] },
            { trigger: "AL_USAR_AYUDA",
              requisitosObjetivo: [ { campo: "esZombi", op: "falsy", msg: "{objetivo} está Zombificado y rechaza la Ayuda." } ],
              efectos: [ { op: "CURAR", valor: 2, floating: "MANZANAHORIA", log: "{carta} cura 2 de Vida a {objetivo} ({antes} -> {despues})." } ] }
        ]
    },
    { 
        id: 13, name: "Longaniza", type: "Ayuda", subtype: "Ingerible", tags: ["Consumible"], rarity: "C", text: "Añade 1 de Furor a un aliado.", cost: 0,
        abilities: [
            { trigger: "JUGAR", requisitos: [ { count: { quien: "ALIADO" }, op: ">=", valor: 1, msg: "No tienes aliados en mesa para usar {carta}." } ] },
            { trigger: "AL_USAR_AYUDA",
              requisitosObjetivo: [ { campo: "furor", op: "<", valor: { REF: "objetivo.furorMax" }, msg: "{objetivo} ya tiene Furor máximo." } ],
              efectos: [ { op: "MODIFICAR_STAT", stat: "furor", delta: 1, log: "{carta} da 1 de Furor a {objetivo} ({antes} -> {despues})." } ] }
        ]
    },
    { 
        id: 14, name: "Incluso En El KG", hp: 2, def: 2, atk: 2, type: "Esbirro", subtype: "Ser vivo", tags: ["Animal salvaje"], gender: 'N', rarity: "C",
        text: "P: INCLUSO EN EL JUEGO DE CARTAS: Al morir, vuelve a tu mano en vez de hacerte perder Retribución.", passiveName: "INCLUSO EN EL JUEGO DE CARTAS", series: 1,
        // Migrada a DSL (trigger AL_MORIR, 21-jul-2026): gestiona su propia muerte
        // devolviéndose a la mano (op VOLVER_A_MANO) y suprimiéndola (gestionada:true,
        // que hace que onDeath devuelva true → el motor no la descarta, solo da Retribución).
        abilities: [{
            trigger: 'AL_MORIR', gestionada: true,
            log: { msg: '¡Habilidad pasiva de {carta}: {pasiva} tiene lugar! (Vuelve a la mano)', tipo: 'ability' },
            floating: { texto: '{pasiva}', estilo: 'ft-ability', offset: 0 },
            efectos: [ { op: 'VOLVER_A_MANO' } ],
        }],
    },
    { id: 15, name: "Mini-tigre", hp: 3, def: 3, atk: 2, type: "Esbirro", subtype: "Ser vivo", tags: ["Animal salvaje"], gender: 'N', rarity: "C", text: "-", series: 1 },
    {
        id: 16, name: "Oso con armadura", hp: 3, def: 5, atk: 2, type: "Esbirro", subtype: "Ser vivo", tags: ['Traje protector', 'Animal salvaje'], rarity: "B",
        cost: 0, series: 1,
        text: ""
    },
    { 
        id: 17, name: "Gólem multielemental", hp: 4, def: 4, atk: 3, type: "Esbirro", subtype: "Ser mágico", tags: ['Invocación', 'Gólem'], rarity: "B", 
        text: "Coste: 1 de Furor. P: CAMBIO DE COLOR: Su Def aumenta en +1 permanente al ser atacado (máx 3).", 
        passiveName: "CAMBIO DE COLOR", cost: 0, series: 1,

        onBeforePlayAsync: async function(card, game, p) {
            const validTributes = [...p.vanguard, ...p.rearguard].filter(c => c.furor >= 1);
            if (validTributes.length === 0) {
                game.logError("Necesitas un aliado con al menos 1 de Furor en el campo.");
                return false;
            }
            
            const chosen = await game.pickBoardTargets(validTributes, 1, 'TRIBUTO PARA EL GÓLEM (-1 FUROR)', card, card.owner, true);
            if (chosen && chosen.length > 0) {
                card.tributeSourceId = chosen[0].instanceId;
                // Flecha de tributo al presentarse (§14.bis): de quién sale el Furor.
                DSL._marcarCoste(game, chosen[0], "tributo", "Tributa 1 FUR");
                card.tributeCost = 1; 
                card.defBoosts = 0; 
                return true;
            }
            return false;
        },
        // CAMBIO DE COLOR migrada (31-jul-2026): TRAS_DEFENDER, no ANTES_DE_DEFENDER, aunque la
        // vieja usaba onBeforeDefend — el texto dice "al ser atacado" (consecuencia del ataque,
        // sin "antes" explícito), la misma regla ya aplicada a Imp mayor/DEMONIO VIL. `stat:"def"`
        // (BASE, no currentDef) para que el +1 sea permanente y no se resetee en cada
        // updatePassives -requirió extender game.modifyStat con un fallback genérico, ver
        // index.html-. `defBoosts` sigue siendo un campo propio de la carta (no el sistema de
        // `counters` con badge visible: la vieja tampoco mostraba un contador en el tablero).
        // `no:true` en la condición evita el problema de "undefined < 3" en la primera activación.
        abilities: [
            { trigger: "TRAS_DEFENDER", nombre: "CAMBIO DE COLOR",
              si: { campo: "defBoosts", op: ">=", valor: 3, no: true },
              log: "¡CAMBIO DE COLOR se activa! (+1 Defensa permanente).",
              efectos: [
                { op: "FLOTANTE", target: { quien: "SELF" }, texto: "CAMBIO DE COLOR", estilo: "ft-ability", offset: -40 },
                { op: "MARCAR", target: { quien: "SELF" }, campo: "defBoosts", delta: 1 },
                { op: "MODIFICAR_STAT", target: { quien: "SELF" }, stat: "def", delta: 1 } ] }
        ],
    },
    { id: 18, name: "Robot de seguridad SP", hp: 4, def: 1, atk: 2, type: "Esbirro", subtype: "Máquina", tags: ["Controlable"], gender: 'N', rarity: "C", text: "-", series: 1 },
    {
        id: 19, name: "Limo artificial", hp: 2, def: 2, atk: 1, type: "Esbirro", subtype: "Ser vivo", tags: ['Creación artificial'], rarity: "C",
        text: "A: ABRAZO PEGAJOSO (1F): Ataque normal. Si tiene éxito, lanza moneda: Cara = Confunde al enemigo 2 turnos.",
        activeName: "ABRAZO PEGAJOSO", activeCost: 1, series: 1,
        // Migrada por completo (28-jul-2026). Estrena `especial: false` en ATACAR: es la MISMA
        // ruta directa (sin performAttack) que ya usaban Hechicero/Eris/Aniceto con
        // especial:true, pero marcando el golpe como NORMAL en dealDamage — hacía falta la ruta
        // directa porque el objetivo era resolver una moneda CONDICIONADA al éxito del golpe
        // (siExito), no un ataque especial de verdad. Nota de fidelidad: la vieja no comprobaba
        // onBeforeDefend con isSpecial (ese parámetro no existía todavía) — con la carta que
        // llame a esta, el comportamiento es idéntico al que ya tenía (siempre pasaba `false`).
        abilities: [
            { trigger: "ACTIVA", nombre: "ABRAZO PEGAJOSO", coste: { furor: 1 },
              requisitos: [ { count: { quien: "ENEMIGO", zona: "vanguardia" }, op: ">=", valor: 1 } ],
              target: { quien: "ENEMIGO", cantidad: 1 },
              efectos: [
                { op: "ATACAR", especial: false,
                  siExito: [
                    { op: "MONEDA",
                      logCruz: { msg: "> Moneda: CRUZ", tipo: "system" },
                      cara: [ { op: "APLICAR_ESTADO", estado: "confusion", duracion: 2, log: "> Moneda: CARA - ¡Confunde a {objetivo}!", logTipo: "system" } ]
                    }
                  ] }
              ] }
        ]
    },
    { 
        id: 20, name: "Guardia", hp: 2, def: 3, atk: 3, type: "Esbirro", subtype: "Ser vivo", tags: ["Traje protector"], gender: 'M', rarity: "C",
        text: "A: FUEGO A DISCRECIÓN (1F). 50% +2 Atq / 50% Fallo.", activeName: "FUEGO A DISCRECIÓN", series: 1, activeCost: 1,
        // Migrada (30-jul-2026): MONEDA envolviendo un ELEGIR+ATACAR, mismo esqueleto que
        // Investigador demente. La vieja tenía el mismo bug latente que Hiposaurio/Hawke
        // ("card.currentAtk += 2; performAttack; card.currentAtk -= 2") — performAttack ya
        // llama a updatePassives() por dentro, así que el -=2 a mano restaba el bono DOS
        // veces. El op ATACAR con bonoAtq usa updatePassives() para el recompute, así que la
        // migración lo arregla de encima, igual que en aquellas dos. Se cae el log
        // "activa FUEGO A DISCRECIÓN" previo a la moneda: redundante con el floater del
        // nombre de la Activa, que ya sale (mismo criterio que Aniceto/Investigador demente).
        abilities: [
            { trigger: "ACTIVA", nombre: "FUEGO A DISCRECIÓN", coste: { furor: 1 }, ataqueNormal: true, sinObjetivo: true,
              requisitos: [
                { count: { quien: "ENEMIGO", zona: "vanguardia", filtros: [ { campo: "stealth", op: "falsy" } ] }, op: ">=", valor: 1, msg: "No hay enemigos válidos (sin Ocultarse) en la Vanguardia enemiga." } ],
              efectos: [
                { op: "MONEDA",
                  logCara: { msg: "Moneda: CARA - ¡Ataque potenciado!", tipo: "ability" },
                  logCruz: { msg: "Moneda: CRUZ - El ataque falla.", tipo: "neutral" },
                  cara: [
                    { op: "ELEGIR", de: "ENEMIGOS", zona: "VANGUARDIA", filtros: [ { campo: "stealth", op: "falsy" } ], cantidad: 1, cancelable: false,
                      titulo: "FUEGO A DISCRECIÓN: elige objetivo",
                      efectos: [ { op: "ATACAR", bonoAtq: 2 } ] } ] } ] }
        ]
    },
    {
        id: 21, name: "K.I.N.O.", hp: 6, def: 7, atk: 6, type: "Personaje", subtype: "Máquina", tags: ['Con conciencia', 'De Mill'], rarity: "C", gender: "N/A",
        text: "P: POCA PACIENCIA: En vanguardia, +2 Contadores (se pierden en retaguardia). Fin de turno tuyo: -1 Contador. A 0, fuerza intercambio o muere.", 
        passiveName: "POCA PACIENCIA", series: 1,

        onUpdatePassive: function(card, game) {
            if (card.lastLocation !== card.location) {
                if (card.location === 'vanguard') {
                    game.modifyCounters(card, 'kino_paciencia', 2, 'Contadores', card, '⚙️', 'POCA PACIENCIA');
                    game.logMsg(`¡${game.getCardNameWithOwner(card)} entra a vanguardia y gana 2 Contadores!`, 'ability');
                } else if (card.location === 'rearguard') {
                    if (card.counters && card.counters['kino_paciencia']) {
                        game.modifyCounters(card, 'kino_paciencia', -card.counters['kino_paciencia'].count);
                    }
                    game.logMsg(`¡${game.getCardNameWithOwner(card)} se retira y pierde sus Contadores!`, 'ability');
                }
                card.lastLocation = card.location;
            }
        },
        onEndTurn: async function(card, game) {
            if (card.location !== 'vanguard' || card.owner !== game.activePlayerId) return;
            if (!card.counters || !card.counters['kino_paciencia']) return; 
            
            game.modifyCounters(card, 'kino_paciencia', -1, 'Contadores', card, '⚙️', 'POCA PACIENCIA');
            const countLeft = card.counters && card.counters['kino_paciencia'] ? card.counters['kino_paciencia'].count : 0;
            game.logMsg(`¡${card.passiveName}! ${game.getCardNameWithOwner(card)} pierde 1 Contador (quedan ${countLeft}).`, 'ability');
            showFloatingText(card.instanceId, "-1 CONTADOR", "ft-red-stat");
            game.render();
            await game.sleep(600);

            if (countLeft === 0) {
                game.logMsg(`¡A ${game.getCardNameWithOwner(card)} se le ha agotado la paciencia!`, 'ability');
                const p = game.players[card.owner];
                const rearguardAllies = p.rearguard;
                
                if (rearguardAllies.length > 0) {
                    // Selección en TABLERO (Toto, 7-ago-2026): elegir una carta ya en el campo
                    // es reborde verde, nunca el modal genérico. cancelable:false porque el
                    // intercambio no es opcional -el contador ya llegó a 0-.
                    const chosen = await game.pickBoardTargets(rearguardAllies, 1, 'POCA PACIENCIA: elige con quién intercambiarte', card, card.owner, false);
                    if (chosen && chosen.length > 0) {
                        const ally = chosen[0];
                        const vIdx = p.vanguard.findIndex(c => c.instanceId === card.instanceId);
                        const rIdx = p.rearguard.findIndex(c => c.instanceId === ally.instanceId);
                        p.vanguard.splice(vIdx, 1, ally);
                        p.rearguard.splice(rIdx, 1, card);
                        card.location = 'rearguard';
                        ally.location = 'vanguard';
                        game.logMsg(`${game.getCardNameWithOwner(card)} fuerza un intercambio con ${game.getCardNameWithOwner(ally)}.`, 'ability');
                        game.render();
                    }
                } else {
                    game.logMsg(`No hay aliados en retaguardia. ¡${game.getCardNameWithOwner(card)} se auto-destruye!`, 'ability');
                    showFloatingText(card.instanceId, "DESTRUIDO", "ft-red-stat");
                    card.currentHp = 0;
                    await game.checkDeath(card, false); 
                }
            }
        }
    },
    { 
        id: 22, name: "Té helado", type: "Ayuda", subtype: "Ingerible", tags: ["Consumible"], rarity: "B", text: "Coste: 1 de Furor. Cura 4 de Vida al aliado que tributó.", cost: 0,
        abilities: [
            { trigger: "JUGAR", requisitos: [
                { count: {}, op: ">=", valor: 1, msg: "No tienes aliados en mesa para usar Té helado." },
                { count: { filtros: [ { campo: "furor", op: ">=", valor: 1 } ] }, op: ">=", valor: 1, msg: "Necesitas un aliado con al menos 1 de Furor para pagar Té helado." } ] },
            // El aliado señalado paga y se cura: la flecha de tributo sale de él.
            { trigger: "AL_USAR_AYUDA",
              // Paga y se cura EL MISMO aliado (Toto, 13-ago-2026). Antes se elegía pagador
              // aparte, así que el pagador y el curado podían ser distintos -y el log los
              // nombraba a los dos, que con el aliado único era la misma carta repetida:
              // "usa 1 Furor de X y cura a X"-. El texto de la carta dice "al aliado que
              // tributó", así que el objetivo de la Ayuda es quien paga: una sola elección.
              requisitosObjetivo: [
                { campo: "esZombi", op: "falsy", msg: "{objetivo} está Zombificado y rechaza la Ayuda." },
                { campo: "furor", op: ">=", valor: 1, msg: "{objetivo} no tiene Furor con el que pagar el Té helado." },
                { campo: "currentHp", op: "<", valorCampo: "maxHp", msg: "{objetivo} ya tiene la Vida completa." } ],
              efectos: [
                { op: "MODIFICAR_STAT", stat: "furor", delta: -1, esCoste: true },
                { op: "CURAR", valor: 4, floating: "TÉ HELADO",
                  log: "{objetivo} tributa 1 de Furor y se refresca con {carta} ({antes} -> {despues})." } ] }
        ],
    },
    {
        id: 23, name: "Tortilla de patatas", type: "Ayuda", subtype: "Ingerible", tags: ["Consumible"], rarity: "B",
        text: "Añade 2 de Furor a un aliado que no haya actuado; al hacerlo, agótalo.", cost: 0, series: 1,
        abilities: [
            { trigger: "JUGAR", requisitos: [ { count: { filtros: [ { campo: "exhausted", op: "falsy" } ] }, op: ">=", valor: 1, msg: "No hay aliados sin agotar." } ] },
            { trigger: "AL_USAR_AYUDA",
              requisitosObjetivo: [ { campo: "exhausted", op: "falsy", msg: "Ese aliado ya ha gastado su acción." } ],
              efectos: [
                { op: "MODIFICAR_STAT", stat: "furor", delta: 2 },
                { op: "MARCAR", campo: "exhausted", valor: true, log: "{carta} añade 2 de Furor a {objetivo} y consume su acción." } ] }
        ]
    },
    {
        id: 24, name: "Goodman", hp: 2, def: 2, atk: 1, type: "Personaje", subtype: "Ser vivo", tags: ["Científico"], gender: 'M', rarity: "B",
        text: "P: INFORMACIÓN VALIOSA: Sólo si tiene al menos 1 de Furor; cuando muere, busca carta en el mazo.",
        passiveName: "INFORMACIÓN VALIOSA", series: 1,
        // Migrada a DSL (trigger AL_MORIR, 21-jul-2026). NO gestionada: busca (si le
        // queda Furor) y luego muere normal. La búsqueda es un BUSCAR en MAZO sin
        // filtros (cualquier carta elegible) con preguntarSiempre. Borde documentado:
        // si aceptas con el mazo VACÍO, la vieja emitía el logIntro+flotante y luego
        // nada; la nueva no emite nada (sinVacioTrasConfirmar corta antes) — arguably
        // más correcto (no dice "busca una carta" sin mazo). No se testea ese borde.
        abilities: [{
            trigger: 'AL_MORIR',
            si: { campo: 'furor', op: '>=', valor: 1 },
            efectos: [
                { op: 'BUSCAR', en: 'MAZO', cantidad: 1,
                  preguntarSiempre: true, sinVacioTrasConfirmar: true,
                  confirmar: { titulo: 'INFORMACIÓN VALIOSA', si: 'BUSCAR CARTA EN EL MAZO', no: 'NO BUSCAR',
                               logNo: '{carta} muere, pero decides no buscar información.' },
                  logIntro: '¡INFORMACIÓN VALIOSA se activa! {carta} busca una carta.',
                  floatingIntro: { texto: 'INFORMACIÓN VALIOSA', estilo: 'ft-ability', offset: -30 },
                  titulo: 'BUSCAR EN EL MAZO',
                  log: '{jugador} añade {objetivo} a su mano desde el mazo.',
                  barajarDespues: { log: 'Barajando el mazo de {jugador}...' } },
            ],
        }],
    },
    {
        id: 25, name: "Agah", hp: 6, def: 7, atk: 7, type: "Personaje", subtype: "Ser vivo", tags: ["Mercenario", "Usuario de magia"], gender: 'M', rarity: "B",
        text: "P: ENERGÍA DEMONÍACA: Sus ataques normales cuestan 1 de Furor. Inmune al daño de ataques especiales. A: DEVASTACIÓN AGAH (2F): 2 ataques normales al mismo enemigo.",
        passiveName: "ENERGÍA DEMONÍACA", activeName: "DEVASTACIÓN AGAH", activeCost: 2, series: 1,

        // Migrada (30-jul-2026). "Sus ataques normales cuestan 1 Furor" se parte en dos triggers
        // ya existentes: PUEDE_ATACAR (canAttackNormally, gatea el clic-y-atacar de siempre,
        // igual que Muro parlante) + GLOBAL_ANTES_DE_ATAQUE con soloAtacante:"SELF" (descubierto
        // el 30-jul-2026: ese trigger NO es solo para Eventos, collectAttackInterceptors —§11,
        // index.html— recorre TODAS las cartas del tablero). soloAtaqueDirecto replica el
        // `if (!game.abilityContext)` de la vieja: la Activa ya cuesta 2 Furor por su cuenta, no
        // debe pagar ADEMÁS este coste por ataque. Como PUEDE_ATACAR ya garantiza furor>=1 antes
        // de que este hook se dispare, el efecto solo necesita restar, no comprobar de nuevo.
        abilities: [
            { trigger: "PUEDE_ATACAR", resumenFase: "Sus ataques normales cuestan 1 de Furor", porHabilidad: "ENERGÍA DEMONÍACA", si: { campo: "furor", op: ">=", valor: 1 } },
            { trigger: "GLOBAL_ANTES_DE_ATAQUE", soloAtacante: "SELF", soloAtaqueDirecto: true,
              efectos: [ { op: "MODIFICAR_STAT", stat: "furor", delta: -1 } ] },
            { trigger: "ACTIVA", nombre: "DEVASTACIÓN AGAH", coste: { furor: 2 }, ataqueNormal: true,
              target: { quien: "ENEMIGO", cantidad: 1 },
              requisitos: [
                { count: { quien: "ENEMIGO", zona: "vanguardia", filtros: [ { campo: "stealth", op: "falsy" } ] }, op: ">=", valor: 1,
                  msg: "No hay enemigos válidos (sin Ocultarse) en la vanguardia para aplicar el ataque." } ],
              efectos: [ { op: "ATACAR" }, { op: "ATACAR" } ] }
        ],
        onBeforeTakeDamage: async function(card, attacker, dmg, isSpecial, game) {
            if (isSpecial) {
                showFloatingText(card.instanceId, "INMUNE AL DAÑO", "ft-ability", -30);
                return 0;
            }
            return dmg;
        },
    },
    {
        id: 26, name: "Escudo mágico", type: "Ayuda", subtype: "Técnica", tags: ["Consumible"], rarity: "C",
        text: "Reacción. Puedes usarla antes de recibir un ataque normal o especial. Gasta 1 de Furor del aliado atacado (que debe tener al menos 1) para evitar el daño, pero no los otros efectos.", cost: 0, series: 1,
        // Migrada a DSL (trigger REACCION sobre DAÑO, 21-jul-2026).
        abilities: [{
            trigger: 'REACCION', sobre: 'DAÑO',
            si: { defensorEsPropio: true, defensor: { campo: 'furor', op: '>=', valor: 1 } },
            prompt: '¿Usar Escudo mágico para proteger al aliado atacado (-1 FUROR)?',
            log: { msg: '¡{reactor} usa {carta} para proteger a {defensor}!', tipo: 'ability' },
            efectos: [
                { op: 'MODIFICAR_STAT', quien: 'DEFENSOR', stat: 'furor', delta: -1 },
                { op: 'FLOTANTE', quien: 'DEFENSOR', texto: 'ESCUDO', estilo: 'ft-ability', offset: -30 },
                { op: 'FIJAR_DAÑO', valor: 0 },
            ],
        }],
        avisoNoJugable: "El Escudo mágico es una carta de reacción. Déjala en tu mano.",
    },
    { 
        id: 27, name: "Atomización", type: "Ayuda", subtype: "Técnica", tags: ["Consumible"], rarity: "B", text: "Elige un aliado no agotado. Gasta su acción para quitar 2 de Vida a un enemigo (ignora Def). Si lo mata, vuelve a la mano.", cost: 0,
        // Migrada (31-jul-2026). Se creía irreducible por sus dos inputState propios del motor
        // (SELECT_ATOM_ALLY / SELECT_ATOM_ENEMY); leyéndola de cerca resultó ser el patrón de
        // Granada de maná -pagador + objetivo- más un "si lo mata". Los dos estados a medida
        // desaparecen: dos ELEGIR anidados hacen lo mismo con pickBoardTargets (los estados
        // siguen en index.html porque el motor los define, pero esta carta ya no los usa).
        // Piezas nuevas del intérprete: `siMuere` en MODIFICAR_STAT y el op `NO_CONSUMIR`.
        // El aliado se marca agotado DESPUÉS del disparo, como la vieja (que lo hacía en
        // onExecuteAyuda, ya con el enemigo elegido).
        abilities: [
            { trigger: "JUGAR", requisitos: [
                { count: { filtros: [
                    { campo: "exhausted", op: "falsy" },
                    { o: [ [ { campo: "type", op: "==", valor: "Personaje" } ], [ { campo: "type", op: "==", valor: "Esbirro" } ] ] } ] },
                  op: ">=", valor: 1, msg: "No tienes aliados activos para gastar su acción." },
                { count: { de: "ENEMIGOS", filtros: [ { campo: "immuneToEnemyAids", op: "falsy" } ] },
                  op: ">=", valor: 1, msg: "No hay enemigos válidos para Atomización." } ] },
            { trigger: "AL_CONSUMIR",
              efectos: [
                { op: "ELEGIR", de: "ALIADOS",
                  filtros: [
                    { campo: "exhausted", op: "falsy" },
                    { o: [ [ { campo: "type", op: "==", valor: "Personaje" } ], [ { campo: "type", op: "==", valor: "Esbirro" } ] ] } ],
                  cantidad: 1, guardaEn: "atomizador",
                  titulo: "Elige un aliado activo para gastar su acción",
                  efectos: [
                    // Elección del enemigo: SÍ cancelable (Toto, 31-jul-2026, betasteo). Nada
                    // irreversible ha pasado todavía en este punto -el aliado NO se marca
                    // agotado hasta el MARCAR de más abajo, que corre DESPUÉS de esta elección-,
                    // así que no hay compromiso real que proteger. La vieja exigía un segundo
                    // clic sin vuelta atrás aquí ("porque te has comprometido"), pero era una
                    // limitación del motor anterior (sus dos inputState a medida no ofrecían
                    // cancelación en ese paso), no una regla del juego — corregida al migrar.
                    { op: "ELEGIR", de: "ENEMIGOS",
                      filtros: [ { campo: "immuneToEnemyAids", op: "falsy" } ],
                      cantidad: 1,
                      titulo: "Elige al enemigo a atomizar",
                      logAntes: "{atomizador} usa Atomización contra {elegidos}.", logAntesTipo: "combat",
                      efectos: [
                        { op: "MODIFICAR_STAT", stat: "currentHp", delta: -2, comprobarMuerte: true,
                          animacion: "DANO_VERDADERO",
                          floating: { texto: "DAÑO VERDADERO", estilo: "ft-purple", offset: -30 },
                          siMuere: [ { op: "NO_CONSUMIR", log: "¡Enemigo destruido! Atomización vuelve a la mano de {jugador}." } ] } ] },
                    { op: "MARCAR", campo: "exhausted", valor: true } ] } ] }
        ],
    },
    {
        id: 28, name: "Líquido mortal", type: "Ayuda", subtype: "Ingerible", tags: ["Consumible"], rarity: "B",
        text: "Efecto: Elige de tu pila de descarte un 'Ser vivo' que no requiera coste ni condiciones extra para colocarse y devuélvelo a tu mano.", cost: 0, series: 1,
        
        abilities: [
            { trigger: "JUGAR", requisitos: [ { count: { zona: "DESCARTES", filtros: [ { campo: "subtype", op: "==", valor: "Ser vivo" } ], plantillaSin: ["onBeforePlayAsync"] }, op: ">=", valor: 1, msg: "No tienes 'Seres vivos' válidos en tu pila de descartes." } ] },
            { trigger: "AL_CONSUMIR",
              efectos: [
                { op: "BUSCAR", en: "DESCARTES", cantidad: 1, destino: "MANO",
                  filtros: [ { campo: "subtype", op: "==", valor: "Ser vivo" } ], plantillaSin: ["onBeforePlayAsync"],
                  abortaSiCancelas: true, titulo: "RECUPERAR SER VIVO",
                  log: "{carta} recupera a {objetivo} de los descartes." } ] }
        ],
    },
    {
        id: 29, name: "Lupa", type: "Ayuda", subtype: "Tecnología", tags: ["Consumible"], rarity: "A",
        text: "Efecto: Echa un vistazo a la mano de tu rival.", cost: 0, series: 1,
        
        abilities: [
            { trigger: "JUGAR", requisitos: [ { manoRival: true, op: ">", valor: 0, msg: "El rival no tiene cartas en la mano." } ] },
            { trigger: "AL_CONSUMIR", log: "{carta} revela la mano enemiga.", logTipo: "ability",
              efectos: [ { op: "VER_MANO", deQuien: "RIVAL" } ] }
        ]
    },
    { 
        id: 30, name: "Infundir desesperación", type: "Evento", rarity: "A", text: "3 turnos. Mientras esté en juego, los enemigos no ganan Furor al inicio del turno. Al expirar, da 3 de Furor a los enemigos de vanguardia.", cost: 1, duration: 3,
        abilities: [
            { trigger: "PREVIEW_GLOBAL", lineas: [ { quien: "ENEMIGO", soloTipos: ["Personaje", "Esbirro"], texto: "No gana Furor al inicio del turno" } ] },
            { trigger: "AL_CADUCAR", resumenFase: "Al expirar, Zoe (calcinante) ocupará el lugar de Zoe", log: "Efecto de expiración de Infundir desesperación: Enemigos en vanguardia ganan 3 de Furor.",
              efectos: [ { op: "MODIFICAR_STAT", stat: "furor", delta: 3, target: { quien: "ENEMIGO", zona: "vanguardia", modo: "TODOS" } } ] }
        ]
    },
    {
        name: "Entrenamiento arduo", type: "Evento", rarity: "A", cost: 0, duration: 3, series: 1,
        // Requisito visible: a quién señala la flecha lima al presentarse (§14.bis).
        requisitoVisible: [ { quien: "ALIADO", filtros: [ { campo: "name", op: "==", valor: "Zoe" } ], uno: true } ],
        // Reestructurado (Toto, 5-ago-2026): "oculta y agota" no es algo que pase SOLO al
        // colocarla, es una condición que dura TODO el tiempo que el Evento está en juego (así lo
        // hace onUpdatePassive, más abajo: se reaplica en cada pasada) — el "Al colocarla:" viejo
        // sugería un efecto puntual y era engañoso. El "Al expirar" también se detalla más: qué se
        // cura exactamente y que los bonos de Vida/Atq/Def acumulados sobreviven a la evolución.
        // La curación de Zoe se cayó del texto Y del código (Toto, 7-ago-2026): Zoe se DESTRUYE
        // acto seguido, así que curarle la Vida y limpiarle los estados no lo ve nadie ni cambia
        // nada -resetCard ya la lava al mandarla al descarte-. Prometer una curación que no se
        // puede observar es texto muerto. Lo que sí importa, y ahora se dice, es que la
        // sustitución conserva los bonos acumulados durante el entrenamiento.
        text: "3 turnos. Requiere a Zoe en el campo. Mientras esté en juego, oculta y agota a Zoe; si Zoe muere, esta carta se destruye. Al expirar, busca a Zoe (calcinante) en tu mano o mazo, destruye a Zoe y ocupa su lugar, conservando sus bonos.",
        abilities: [
            { trigger: "PREVIEW_GLOBAL", lineas: [ { quien: "ALIADO", filtros: [ { campo: "name", op: "==", valor: "Zoe" } ], texto: "{genero?Oculto y agotado|Oculta y agotada} por el entrenamiento; si muere, el Evento se destruye" } ] }
        ], 
        canPlayCard: function(card, game, p) {
            const hasZoe = [...p.vanguard, ...p.rearguard].some(c => c.name === 'Zoe');
            if (!hasZoe) { game.logError("Necesitas a Zoe en tu campo."); return false; }
            return true;
        },
        onUpdatePassive: function(card, game, p) {
            const zoe = [...p.vanguard, ...p.rearguard].find(c => c.name === 'Zoe');
            if (zoe) { zoe.stealth = true; zoe.exhausted = true; }
        },
        onAllyDeath: async function(card, deadCard, game) {
            if (deadCard.name === 'Zoe') {
                game.logMsg("Zoe ha caído en combate. Entrenamiento arduo fracasa.", 'system');
                await game.destroyEvent(card.owner); // Usa el nuevo sistema global
            }
        },
        onExpire: async function(card, game, playerId) {
            const p = game.players[playerId];
            const zoe = [...p.vanguard, ...p.rearguard].find(c => c.name === 'Zoe');
            if (zoe) {
                game.logMsg("¡Entrenamiento arduo completado!", 'ability');
                // Ya NO se cura a Zoe (Toto, 7-ago-2026). Estaba `zoe.currentHp = zoe.maxHp`, pero
                // Zoe se destruye unas líneas más abajo y resetCard la lava entera antes de tocar
                // los descartes: la curación era inobservable. Lo que la calcinante hereda son los
                // BONOS (diffs de stats + marcas temporales), no el estado de Vida de Zoe; ella
                // entra a su Vida máxima por ser una carta que acaba de colocarse.
                // De dónde sale la calcinante. Con una en la mano SIEMPRE se pregunta -mano o
                // mazo, en ese orden-, porque el jugador no tiene por qué recordar si le queda
                // otra en el mazo; el aviso se lo dice sin destripar la respuesta. NO es
                // cancelable: el Evento ya ha expirado, esto es su efecto. Si eliges mazo y no
                // hay, el efecto se acaba sin evolucionar, que es el riesgo que asumes
                // (Toto, 13-ago-2026).
                const enMano = p.hand.find(c => c.name === 'Zoe (calcinante)');
                let calcinante = null;
                let fromZone = 'hand';
                let buscarEnMazo = !enMano;
                if (enMano) {
                    buscarEnMazo = await new Promise(resolve => {
                        game.openChoiceModal(
                            'EVOLUCIÓN DE ZOE\n\nAtención: tienes una Zoe (calcinante) en la mano. Si buscas en el mazo y no hay ninguna, el efecto se acabará sin que Zoe evolucione.',
                            [ { label: 'USAR LA DE TU MANO', action: () => resolve(false) },
                              { label: 'BUSCAR EN EL MAZO', action: () => resolve(true) } ],
                            playerId);
                    });
                }
                if (!buscarEnMazo) {
                    calcinante = enMano;
                } else {
                    // Buscar en una PILA usa SIEMPRE su visor completo, aunque no haya ninguna
                    // elegible: se abre igual con el aviso (norma de UX del proyecto). Antes se
                    // sacaba del mazo a escondidas, sin enseñar nada.
                    const elegibles = p.deck.filter(c => c.name === 'Zoe (calcinante)');
                    let elegida = null;
                    if (typeof game.openDeckSearchViewer === 'function') {
                        elegida = await game.openDeckSearchViewer(playerId, elegibles,
                            'BUSCA A ZOE (CALCINANTE) EN TU MAZO',
                            elegibles.length ? null : 'No queda ninguna Zoe (calcinante) en el mazo. Zoe no evolucionará.',
                            1, 'deck');
                    } else {
                        elegida = elegibles[0] || null;
                    }
                    if (elegida) {
                        const deckIdx = p.deck.findIndex(c => c.instanceId === elegida.instanceId);
                        if (deckIdx !== -1) calcinante = p.deck.splice(deckIdx, 1)[0];
                        fromZone = 'deck';
                    }
                    await animateShuffle(playerId);
                    game.shuffle(p.deck);
                }
                
                if (calcinante) {
                    game.logMsg(`¡Zoe evoluciona a ${game.getCardNameWithOwner(calcinante)}!`, 'ability');
                    showFloatingText(zoe.instanceId, "¡EVOLUCIÓN!", "ft-purple", -40);
                    
                    const baseZoe = getCardTemplate(zoe.id);
                    calcinante.currentAtk += (zoe.currentAtk - baseZoe.atk);
                    calcinante.currentDef += (zoe.currentDef - baseZoe.def);
                    calcinante.maxHp += (zoe.maxHp - baseZoe.hp);
                    calcinante.currentHp = calcinante.maxHp;
                    calcinante.furor = zoe.furor;
                    // SIN copiar zoe.status (Toto, 5-ago-2026): "cura los estados alterados de
                    // Zoe" significa que la calcinante empieza LIMPIA, no que hereda el DoT o la
                    // Confusión que Zoe tuviera encima. createCardInstance ya la deja con
                    // status:{} por defecto -no hace falta tocar nada aquí, la línea vieja era
                    // justo lo que lo rompía-.
                    // Las MARCAS TEMPORALES también viajan (Toto, 31-jul-2026, barrido tras el bug
                    // de SABIDURÍA). Sin esto, el `+=` de arriba copiaba el bono como un número
                    // suelto sobre currentAtk/currentDef, y updatePassives lo borra en la primera
                    // pasada porque resetea esos stats a la plantilla: el jugador veía el +2 al
                    // evolucionar y se le evaporaba acto seguido (comprobado con probe: 11 -> 9).
                    // Las marcas son el único carrier que el motor reaplica solo, así que
                    // transferirlas es lo que hace que el bono de verdad se quede. Los equipos ya
                    // no hacen falta transferirlos aquí: Zoe no puede llevarlos al evolucionar por
                    // este camino (el Evento la sustituye entera), pero se dejan por si acaso.
                    calcinante.tempEffects = zoe.tempEffects || [];
                    if (zoe.equippedCards && zoe.equippedCards.length) {
                        calcinante.equippedCards = zoe.equippedCards;
                        calcinante.equippedCards.forEach(eq => { eq.equippedTo = calcinante.instanceId; });
                        // Rompe la referencia compartida (Toto, 5-ago-2026): calcinante.equippedCards
                        // apunta al MISMO array que zoe.equippedCards -no una copia-. El resetCard()
                        // de más abajo, al descartar a la Zoe vieja, llama a unequipAll(zoe), que
                        // desequiparía (y descartaría) esos mismos equipos TAMBIÉN de la calcinante
                        // por compartir los objetos. Vaciar aquí el array de zoe deja intacto el de
                        // calcinante (la reasignación no muta el array original).
                        zoe.equippedCards = [];
                    }

                    // La calcinante SE PRESENTA antes de sustituir a Zoe, y sale de donde de
                    // verdad venía: de tu mano, o volando del mazo si Entrenamiento arduo la
                    // buscó ahí. Después se deshace sobre Zoe mientras esta evoluciona
                    // (§14.quater). Va ANTES del intercambio: Zoe tiene que seguir en el tablero
                    // para poder ser el destino de la disolución (Toto, 13-ago-2026).
                    // BLINDADA por lo mismo que el resto: la animación no puede tumbar la jugada.
                    if (typeof game.evolucionarDesdeMano === "function") {
                        try {
                            await game.evolucionarDesdeMano(calcinante, zoe.instanceId, null,
                                `#${playerId}-${fromZone === 'deck' ? 'deck-stack' : 'hand'}`);
                        } catch (e) { console.error(e); }
                    }
                    calcinante.location = zoe.location;
                    if (zoe.location === 'vanguard') {
                        const idx = p.vanguard.findIndex(c => c.instanceId === zoe.instanceId);
                        p.vanguard[idx] = calcinante;
                    } else {
                        const idx = p.rearguard.findIndex(c => c.instanceId === zoe.instanceId);
                        p.rearguard[idx] = calcinante;
                    }

                    game.render();

                    // Limpieza universal (Toto, 5-ago-2026, betasteo: la Zoe vieja se veía Oculta,
                    // agotada y todavía afectada por Wolfgang en los descartes). Mismo patrón que
                    // ya usan Sadame/Limo primario al evolucionar -resetCard ANTES de descartar-;
                    // aquí faltaba. Va DESPUÉS de haber extraído todo lo que la calcinante necesita
                    // (diffs de stats, marcas, equipo), nunca antes.
                    zoe.location = 'discard';
                    if (typeof game.resetCard === 'function') game.resetCard(zoe);
                    p.discard.push(zoe);
                    if (fromZone === 'hand') p.hand = p.hand.filter(c => c.instanceId !== calcinante.instanceId);
                }
            }
        }
    },
    {
        name: "Zoe (calcinante)", hp: 3, def: 5, atk: 9, type: "Personaje", subtype: "Ser vivo", tags: ['Usuaria de VP'], gender: 'F', rarity: "S",
        // "Sólo se coloca por Entrenamiento arduo" era una condición de colocación redactada como
        // si fuera parte de la Pasiva; con el prefijo Requisito: sale en su propia caja del
        // detalle, como el resto de cartas condicionadas (Toto, 5-ago-2026). No es un Coste: no
        // pierdes nada al colocarla, es el Evento el que la trae.
        text: "Requisito: Completar 'Entrenamiento arduo'. P: JUSTICIERA ABRASADORA: El Daño por tiempo la cura y le da +2 de Def. Aplica Daño por tiempo (2 turnos) a sí misma y al rival tras combatir. A: AL-FÉNIX (4F): Ataca a un máximo de 3 en vanguardia y 1 en retaguardia.",
        passiveName: "JUSTICIERA ABRASADORA", activeName: "AL-FÉNIX", activeCost: 4, series: 2,
        
        onBeforePlayAsync: async function(card, game, p) {
            game.logError("Sólo puedes colocar a Zoe (calcinante) mediante el Evento 'Entrenamiento arduo'.");
            return false;
        },
        
        onDoTTick: function(card, game) {
            game.logMsg(`¡${card.passiveName} se activa! (se cura)`, 'ability');
            showFloatingText(card.instanceId, card.passiveName, "ft-ability", -40);
            if (card.currentHp < card.maxHp) {
                game.modifyStat(card, 'currentHp', 1);
            }
        },
        

        onAfterAttack: async function(attacker, defender, game) {
            game.logMsg(`¡${attacker.passiveName} quema a ambos!`, 'ability');
            game.applyStatus(attacker, 'dot', 2, attacker);
            game.applyStatus(defender, 'dot', 2, attacker);
        },
        
        onAfterDefend: async function(defender, attacker, dmg, isSpecial, game) {
            game.logMsg(`¡${defender.passiveName} quema a ambos!`, 'ability');
            game.applyStatus(defender, 'dot', 2, defender);
            game.applyStatus(attacker, 'dot', 2, defender);
        },

        // AL-FÉNIX migrada (31-jul-2026). Su parada anticipada es LEGÍTIMA -el texto dice "hasta
        // 3 en Van. y 1 en Ret."-, a diferencia de COMA/SANCIÓN/CASTIGO, donde el canStopEarly
        // estaba mal diagnosticado y en realidad exigían cantidad exacta. Por eso necesitaba dos
        // piezas que el ELEGIR declarativo no tenía y que ahora sí:
        //   · `permitirParar`: saca el botón OK para cerrar la elección antes de llenar el cupo.
        //     `hastaCantidad` NO servía: ajusta el cupo a los objetivos DISPONIBLES, pero no deja
        //     plantarse al jugador teniendo más a mano, que es justo lo que pide esta carta.
        //   · `maxPorZona`: cupo por fila además del total, porque "3 en vanguardia y 1 en
        //     retaguardia" no se puede expresar con un único `cantidad`.
        // El resto de la carta (la Pasiva JUSTICIERA ABRASADORA con su DoT que cura, y el veto de
        // colocación) sigue imperativo: son hooks sin arquetipo declarativo.
        abilities: [
            // El +2 DEF mientras tenga DoT: MISMO caso (y mismo arreglo) que la Zoe normal en
            // regresion23. La imperativa lo aplicaba con un flag-cerrojo (`zoeDefBuffActive`) que
            // solo sumaba en la transición sin-DoT -> con-DoT; pero currentDef se resetea a la
            // plantilla en CADA pasada de updatePassives, así que en cuanto había una pasada de
            // más el bono desaparecía y el cerrojo impedía volver a ponerlo. PASIVA_CONTINUA lo
            // reaplica siempre, que es la única forma de que un bono de Def persista aquí.
            { trigger: "PASIVA_CONTINUA", nombre: "JUSTICIERA ABRASADORA",
              if: { campo: "dotActivo", op: "truthy" },
              then: [ { op: "MODIFICAR_STAT", stat: "def", delta: 2 } ] },
            { trigger: "ACTIVA", nombre: "AL-FÉNIX", coste: { furor: 4 }, sinObjetivo: true,
              requisitos: [
                { count: { quien: "ENEMIGO", zona: "vanguardia", filtros: [ { campo: "stealth", op: "falsy" } ] },
                  op: ">=", valor: 1,
                  msg: "No hay enemigos válidos (sin Ocultarse) en la vanguardia para aplicar el ataque." } ],
              efectos: [
                { op: "ELEGIR", de: "ENEMIGOS", cantidad: 4,
                  permitirParar: true, maxPorZona: { vanguardia: 3, retaguardia: 1 },
                  filtros: [ { campo: "stealth", op: "falsy" } ],
                  titulo: "AL-FÉNIX: elige hasta 3 en vanguardia y 1 en retaguardia (pulsa OK al terminar)",
                  // Sin log propio: el op ATACAR no lo lleva, y no hace falta — performAttack ya
                  // anuncia cada golpe. La imperativa sí ponía uno ("¡Wolfgang ataca (Golpe N)!"),
                  // pero era un copia-pega de otra carta: aquí no interviene ninguna Wolfgang.
                  // El anuncio va DENTRO de la elección, no en el cierre genérico: por la norma
                  // del coste (7-ago-2026) esta Activa lo difiere -su primer efecto es un ELEGIR
                  // cancelable-, así que el flotante automático se silencia y hay que ponerlo en
                  // el primer instante irreversible, que es cuando ya hay objetivos elegidos.
                  efectos: [ { op: "ATACAR" } ] } ] }
        ],
    },
    {
        name: "Necronomicón", type: "Ayuda", subtype: "Mágico", tags: ["Consumible"], rarity: "B",
        text: "Coste: 2 de Furor y la acción de un aliado. Coloca en tu campo un \'Ser vivo\' o \'No-muerto\' de tu pila de descartes que no pida coste ni condiciones para colocarse.", cost: 0, series: 1,
        // Migrada al DSL (Toto, 7-ago-2026). Era imperativa y arrastraba TRES fallos, los tres
        // por no haber pasado nunca por la normalización del resto de cartas:
        //   1. El pagador se elegía con openChoiceModal (lista de botones de texto) en vez de en
        //      el tablero, violando la norma de targeting sobre cartas ya en campo.
        //   2. La búsqueda en descartes usaba openVisualSearchModal en vez del visor de la pila.
        //   3. **Corrupción de estado**: `const chosen = await openVisualSearchModal(...)` trataba
        //      el resultado como carta suelta cuando el motor devuelve un ARRAY. Cancelar daba
        //      `[]`, que es TRUTHY, así que el `if (!chosen)` no lo paraba; luego
        //      `findIndex(c => c.instanceId === undefined)` daba -1 y `splice(-1, 1)` arrancaba
        //      **la última carta del descarte**. Cancelar resucitaba una carta al azar -y sin
        //      respetar filtros: Toto lo pilló reviviendo a Xanadu-. Es el mismo bug latente ya
        //      documentado en Líquido mortal (ver tests/regresion2.js), que allí sí se corrigió
        //      al migrar y aquí seguía vivo porque la carta nunca se migró.
        // Además, el filtro de "sin condiciones extra" solo miraba `onBeforePlayAsync`, así que
        // dejaba pasar a los que se vetan por `canPlayCard` (Xanadu, Diego Antonio).
        //
        // ORDEN de los efectos: se elige pagador PRIMERO pero se cobra al FINAL, con la búsqueda
        // en medio. Así cancelar el visor no cuesta ni Furor ni la acción del aliado (la
        // imperativa también cobraba al final, a propósito; se conserva ese contrato).
        abilities: [
            { trigger: "JUGAR", requisitos: [
                { count: { filtros: [ { campo: "furor", op: ">=", valor: 2 }, { campo: "exhausted", op: "falsy" } ] }, op: ">=", valor: 1,
                  msg: "Necesitas un aliado sin agotar y con al menos 2 de Furor." },
                { count: { zona: "DESCARTES",
                    filtros: [ { o: [ [ { campo: "type", op: "==", valor: "Personaje" } ], [ { campo: "type", op: "==", valor: "Esbirro" } ] ] },
                               { o: [ [ { campo: "subtype", op: "==", valor: "Ser vivo" } ], [ { campo: "subtype", op: "==", valor: "No-muerto" } ] ] } ],
                    plantillaSin: ["onBeforePlayAsync", "canPlayCard"] },
                  op: ">=", valor: 1, msg: "No hay ningún caído apto en tu pila de descartes." } ] },
            { trigger: "AL_CONSUMIR",
              efectos: [
                { op: "ELEGIR", de: "ALIADOS", cantidad: 1,
                  filtros: [ { campo: "furor", op: ">=", valor: 2 }, { campo: "exhausted", op: "falsy" } ],
                  titulo: "¿QUIÉN LEE EL NECRONOMICÓN? (-2 FUROR, GASTA SU ACCIÓN)",
                  guardaIdsEnSelf: "necroLector", guardaEn: "lector", esTributo: 2 },
                { op: "BUSCAR", en: "DESCARTES", cantidad: 1, destino: "CAMPO", animacionResurrect: true, sinAnimacion: true,
                  filtros: [ { o: [ [ { campo: "type", op: "==", valor: "Personaje" } ], [ { campo: "type", op: "==", valor: "Esbirro" } ] ] },
                             { o: [ [ { campo: "subtype", op: "==", valor: "Ser vivo" } ], [ { campo: "subtype", op: "==", valor: "No-muerto" } ] ] } ],
                  plantillaSin: ["onBeforePlayAsync", "canPlayCard"],
                  abortaSiCancelas: true, abortaSiVacio: true, titulo: "NECRONOMICÓN: ELIGE UN CAÍDO",
                  log: "¡{objetivo} vuelve del mundo de los muertos!" },
                { op: "MODIFICAR_STAT", target: { selfLista: "necroLector" }, stat: "furor", delta: -2 },
                { op: "MARCAR", target: { selfLista: "necroLector" }, campo: "exhausted", valor: true,
                  log: "{objetivo} lee el Necronomicón y se agota..." } ] }
        ],
    },
    {
        name: "Wolfgang", hp: 5, def: 3, atk: 3, type: "Personaje", subtype: "Ser mágico", tags: ["Invocación", "Bestia animal"], gender: "F", rarity: "B",
        text: "Requisito: Aniceto en tu campo o bien Coste: Manzanahoria de tu mano. P: SABIDURÍA: Al colocar, +1 Def y Atq a vanguardia aliada. A: TENTAR A LA SUERTE (1F): 3 monedas. Ataca 1 vez por cada Cara.",
        passiveName: "SABIDURÍA", activeName: "TENTAR A LA SUERTE", activeCost: 1, series: 1,
        
        canPlayCard: function(card, game, p) {
            const hasAniceto = [...p.vanguard, ...p.rearguard].some(c => c.name === 'Aniceto');
            const hasManzanahoria = p.hand.some(c => c.name === 'Manzanahoria');
            if (!hasAniceto && !hasManzanahoria) {
                game.logError("Requiere a Aniceto en el campo o una Manzanahoria en la mano.");
                return false;
            }
            return true;
        },
        onBeforePlayAsync: async function(card, game, p) {
            const hasAniceto = [...p.vanguard, ...p.rearguard].some(c => c.name === 'Aniceto');
            const manzanahoria = p.hand.find(c => c.name === 'Manzanahoria');

            // Coste y Requisito se ANOTAN para que la presentación los enseñe: la Manzanahoria
            // viaja al escaparate al lado de Wolfgang (viene de la mano) y Aniceto se queda en
            // el campo con una flecha de "Req. cumplido" (Toto, 8-ago-2026).
            const _aniceto = [...p.vanguard, ...p.rearguard].find(c => c.name === 'Aniceto');
            const _pagarConManzanahoria = () => {
                const mIdx = p.hand.findIndex(c => c.instanceId === manzanahoria.instanceId);
                p.hand.splice(mIdx, 1);
                p.discard.push(manzanahoria);
                manzanahoria.location = 'discard';
                DSL._marcarCoste(game, manzanahoria, 'coste');
            };
            if (hasAniceto && manzanahoria) {
                return await new Promise(resolve => {
                    // CANCELAR (Toto, 13-ago-2026): elegir CÓMO se paga sigue siendo una ventana
                    // cancelable -no ha cambiado nada todavía, la carta sigue en la mano-, así
                    // que §14 exige poder arrepentirse. `false` aborta la jugada sin coste.
                    game.openChoiceModal('INVOCAR A WOLFGANG\n\nAtención: la presencia de Aniceto no te cuesta nada; descartar Manzanahoria te cuesta esa carta.', [
                        { label: 'USAR PRESENCIA DE ANICETO', action: () => { DSL._marcarCoste(game, _aniceto, 'requisito'); resolve(true); } },
                        { label: 'DESCARTAR MANZANAHORIA', action: () => { _pagarConManzanahoria(); resolve(true); } },
                        { label: 'CANCELAR', action: () => resolve(false) }
                    ]);
                });
            } else if (manzanahoria) {
                _pagarConManzanahoria();
                game.logMsg(`${game.getDisplayName(card.owner)} descarta Manzanahoria para invocar a Wolfgang.`, 'system');
                return true;
            }
            DSL._marcarCoste(game, _aniceto, 'requisito');
            return true;
        },
        // SABIDURÍA migrada para ARREGLARLA (31-jul-2026, betasteo de Toto). La versión
        // imperativa hacía `c.currentAtk += 1; c.currentDef += 1` directamente sobre los aliados,
        // y eso NO sobrevive: updatePassives resetea currentAtk/currentDef a la plantilla en cada
        // pasada, y esa función corre constantemente (cada ataque, cada carta jugada, cada cambio
        // de turno). O sea que el bono duraba hasta el siguiente recálculo -segundos- en vez de
        // ser permanente. Verificado con probe: 2/3 -> 3/4 -> 2/3 tras un solo updatePassives.
        // El arreglo es el patrón de Domador: MARCAR_TEMPORAL con `stats` y SIN ninguna marca de
        // caducidad, que el compilador reaplica en cada pasada — que es la única forma que tiene
        // este motor de que un bono de Atq/Def persista de verdad.
        // El resto de la carta (requisito de Aniceto/Manzanahoria y TENTAR A LA SUERTE) se queda
        // imperativo: aquí solo se toca la Pasiva rota.
        abilities: [
            { trigger: "AL_JUGAR",
              log: "¡SABIDURÍA! {carta} inspira a la vanguardia de {jugador}.",
              efectos: [
                { op: "MARCAR_TEMPORAL", target: { quien: "ALIADO", zona: "vanguardia", excludeSelf: true },
                  stats: { atk: 1, def: 1 },
                  floating: { texto: "SABIDURÍA", estilo: "ft-ability", offset: -40 } },
                { op: "FLOTANTE", target: { quien: "ALIADO", zona: "vanguardia", excludeSelf: true },
                  texto: "+1 ATQ", estilo: "ft-green", offset: -20 },
                { op: "FLOTANTE", target: { quien: "ALIADO", zona: "vanguardia", excludeSelf: true },
                  texto: "+1 DEF", estilo: "ft-green", offset: 0 } ] }
        ],
        canActivateAbility: function(card, game) {
            if (card.furor < 1) { game.logError("Falta Furor (1)."); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            if (game.players[enemyId].vanguard.length === 0) return false;
            return true;
        },
        onExecuteAbility: async function(card, game) {
            game.modifyStat(card, 'furor', -1);
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);
            game.logMsg(`¡Wolfgang lanza 3 monedas!`, 'ability');
            
            game.isActionLocked = true;
            const results = await game.triggerCoinFlips(3, card.owner);
            if (!results) { game.cancelAction(); return; }
            
            const heads = results.filter(r => r === 'heads').length;
            if (heads === 0) {
                game.logMsg("¡0 caras! Wolfgang no ataca.", 'neutral');
                card.exhausted = true;
                game.cancelAction();
                game.render();
                return;
            }
            
            game.logMsg(`¡${heads} CARAS! Wolfgang realizará ${heads} ataques.`, 'ability');
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { 
                targets: [], 
                maxTargets: heads, 
                name: card.activeName, 
                targetType: 'enemy', 
                cannotCancel: true, // <--- Bloquea el botón de cancelar
                isNormalAttack: true 
            };
            game.isActionLocked = true; // <--- IMPIDE RETIRARSE TRAS TIRAR MONEDAS
            game.render();
        },
        onValidateTarget: function(card, target, game, isSilent = false) {
            if (target.location !== 'vanguard') {
                if (!isSilent) game.logError("Objetivo debe estar en vanguardia.");
                return false;
            }
            if (target.stealth) {
                if (!isSilent) game.logError("No puedes seleccionar objetivos Ocultos.");
                return false;
            }
            return true;
        },
        hasMoreValidTargets: function(card, game) {
            const ctx = game.abilityContext;
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            const enemyP = game.players[enemyId];
            const validEnemies = enemyP.vanguard.filter(c => !c.stealth);
            return ctx.targets.length < ctx.maxTargets && validEnemies.length > 0;
        },
        onTargetsReady: async function(card, game) {
            const attacker = card;
            const targets = game.abilityContext.targets;
            
            game.inputState = 'EXECUTING';
            game.render();
            await game.sleep(800);
            
            for (let i = 0; i < targets.length; i++) {
                if (attacker.currentHp <= 0) break;
                const target = targets[i];
                if (target.currentHp <= 0) {
                    game.logMsg(`El objetivo ${i+1} ya está muerto.`, 'system');
                    continue;
                }
                
                game.logMsg(`¡Wolfgang ataca (Golpe ${i+1})!`, 'ability');
                const canAttack = await game.checkAttackStatus(attacker, target);
                if (!canAttack) continue;
                
                let dodged = false;
                const defTemplate = getCardTemplate(target.id);
                if (typeof defTemplate.onBeforeDefend === 'function') dodged = await defTemplate.onBeforeDefend(target, attacker, game, game.abilityContext.name, false);
                if (dodged) continue;

                let dmg = attacker.currentAtk - target.currentDef;
                if (dmg <= 0) dmg = 1;

                await game.dealDamage(attacker, target, dmg, false);
                await game.sleep(500);
                await game.checkDeath(target);
            }
            
            attacker.exhausted = true;
            game.isActionLocked = false; 
            game.cancelAction();
            game.updatePassives();
            game.render();
        }
    },
    {
        name: "Limo primario", hp: 4, def: 4, atk: 3, type: "Esbirro", subtype: "Ser vivo", tags: ["Animal salvaje"], rarity: "A",
        text: "P: CRECIMIENTO IMPARABLE: Puede rebasar su Vida máxima al curarse (hasta 9).",
        passiveName: "CRECIMIENTO IMPARABLE", series: 1,
        abilities: [
            { trigger: "SOBRECURACION", max: 9, log: "¡{pasiva}! El {carta} expande su Vida a {max}." }
        ],
    },
    {
        name: "Sadame (retornada)", hp: 4, def: 4, atk: 7, type: "Personaje", subtype: "No-muerto", tags: ["Usuaria de magia"], gender: "F", rarity: "S",
        // Requisito visible: a quién señala la flecha lima al presentarse (§14.bis).
        requisitoVisible: [ { quien: "ALIADO", filtros: [ { campo: "name", op: "==", valor: "Sadame" } ], uno: true }, { quien: "TODOS", filtros: [ { campo: "name", op: "==", valor: "Erasmo" } ], uno: true } ],
        text: "Requisito: Sadame en tu campo y Erasmo en cualquier campo. P: ÚLTIMA MISIÓN: Destruye a Sadame y ocupa su lugar, conservando sus bonos. Sus stats no bajan de las de base y restablece su Vida al colocarse. A: VUELVE A LA VIDA (3F): Revive 2 Personajes/Esbirros, dando igual sus condiciones o costes.",
        passiveName: "ÚLTIMA MISIÓN", activeName: "VUELVE A LA VIDA", activeCost: 3, series: 1,
        isEvolution: true,
        
        onBeforePlayAsync: async function(card, game, p) {
            // 1. COMPROBACIONES DE INVOCACIÓN (Antes estaban en canPlayCard)
            const hasSadame = [...p.vanguard, ...p.rearguard].some(c => c.name === 'Sadame');
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            const enemyP = game.players[enemyId];
            const hasErasmo = [...p.vanguard, ...p.rearguard, ...enemyP.vanguard, ...enemyP.rearguard].some(c => c.name === 'Erasmo'); 
            
            if (!hasSadame) {
                game.logError("Necesitas a Sadame en tu campo.");
                return false;
            }
            if (!hasErasmo) {
                game.logError("Falta Erasmo en alguno de los campos.");
                return false;
            }

            // 2. EJECUCIÓN DE LA SUSTITUCIÓN
            const sadame = [...p.vanguard, ...p.rearguard].find(c => c.name === 'Sadame');
            if (sadame) {
                game.logMsg(`¡Sadame ve a Erasmo y se convierte en ${game.getCardNameWithOwner(card)}!`, 'ability');
                // (TRANSFORMACIÓN se anuncia al empezar la transformación de verdad, más abajo)
                
                card.location = sadame.location;
                // La evolución se PRESENTA y se DESHACE sobre la carta que evoluciona, que hace a la vez
                // su propia animación (§14.quater). Va ANTES del intercambio: la base tiene que seguir
                // en el tablero para poder ser el destino de la disolución (Toto, 13-ago-2026).
                // TRANSFORMACIÓN se anuncia AQUÍ, cuando la carta base empieza a transformarse de
                // verdad -las dos animándose a la vez-, no al arrancar el viaje al escaparate,
                // que es cuando salía antes (Toto, 13-ago-2026).
                if (typeof showFloatingText === "function") showFloatingText(sadame.instanceId, "TRANSFORMACIÓN", "ft-purple", -40);
                // BLINDADA: la animación es ADORNO. Si falla en un cliente y no en el otro, la excepción
                // sube hasta playCard, aborta la jugada SOLO ahí y los dos tableros acaban distintos.
                if (typeof game.evolucionarDesdeMano === "function") {
                    try { await game.evolucionarDesdeMano(card, sadame.instanceId, null); } catch (e) { console.error(e); }
                }
                if (sadame.location === 'vanguard') {
                    const idx = p.vanguard.findIndex(c => c.instanceId === sadame.instanceId);
                    p.vanguard[idx] = card;
                } else {
                    const idx = p.rearguard.findIndex(c => c.instanceId === sadame.instanceId);
                    p.rearguard[idx] = card;
                }
                
                // Limpiamos a la Sadame original
                if (typeof game.resetCard === 'function') game.resetCard(sadame);
                sadame.location = 'discard';
                p.discard.push(sadame);
                
                const handIdx = p.hand.findIndex(c => c.instanceId === card.instanceId);
                if (handIdx !== -1) p.hand.splice(handIdx, 1);
                
                game.cancelAction();
                game.updatePassives();
                game.render();

                
                return false; // Devolvemos false para que el motor no la intente colocar otra vez de forma normal
            }
            return false;
        },
        abilities: [
            // "Stats no bajan de base": SUELO_STAT los sube de vuelta si algo los rebajó.
            // silencioso: la vieja nunca anunciaba esta parte de la pasiva.
            { trigger: "PASIVA_CONTINUA", nombre: "ÚLTIMA MISIÓN", silencioso: true,
              then: [ { op: "SUELO_STAT", stat: "def" }, { op: "SUELO_STAT", stat: "atk" } ] },
            { trigger: "INICIO_TURNO", resumenFase: "Restaura toda su Vida", porHabilidad: "ÚLTIMA MISIÓN", soloTurnoPropio: true,
              efectos: [
                { op: "CURAR", completa: true, log: "¡ÚLTIMA MISIÓN! {carta} restaura toda su Vida.", floating: "RESTAURADA", floatingStyle: "ft-green", offsetFloating: -30,
                  target: { quien: "SELF" } } ] }
        ],
        canActivateAbility: function(card, game) {
            if (card.furor < 3) { game.logError("Falta Furor (3)."); return false; }
            const p = game.players[card.owner];
            
            const currentVanCount = p.vanguard.length;
            const currentVP = p.vanguard.filter(c => c.type === 'Personaje').length;
            
            let validTargets = p.discard.filter(c => c.name !== 'Sadame' && (c.subtype === 'Ser vivo' || c.subtype === 'No-muerto') && (c.type === 'Personaje' || c.type === 'Esbirro'));
            
            if (currentVanCount < 4 && currentVP >= 2) {
                validTargets = validTargets.filter(c => c.type !== 'Personaje');
            }
            
            if (validTargets.length === 0) {
                game.logError("No hay objetivos válidos en el descarte.");
                return false;
            }
            return true;
        },
        getAbilityWarning: function(card, game) {
            const p = game.players[card.owner];
            const currentVanCount = p.vanguard.length;
            const currentVP = p.vanguard.filter(c => c.type === 'Personaje').length;
            
            if (currentVanCount < 4 && currentVP >= 2) {
                const allTargets = p.discard.filter(c => c.name !== 'Sadame' && (c.subtype === 'Ser vivo' || c.subtype === 'No-muerto') && (c.type === 'Personaje' || c.type === 'Esbirro'));
                const hasPersonajes = allTargets.some(c => c.type === 'Personaje');
                
                if (hasPersonajes) {
                    return "⚠️ LÍMITE DE VANGUARDIA: Como ya tienes 2 Personajes, los Personajes de tu descarte serán bloqueados y sólo podrás resucitar Esbirros.";
                }
            }
            return null;
        },
        onExecuteAbility: async function(card, game) {
            game.modifyStat(card, 'furor', -3);
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);
            const p = game.players[card.owner];
            
            for (let i = 0; i < 2; i++) {
                const currentVanCount = p.vanguard.length;
                const currentVP = p.vanguard.filter(c => c.type === 'Personaje').length;
                
                let validTargets = p.discard.filter(c => c.name !== 'Sadame' && (c.subtype === 'Ser vivo' || c.subtype === 'No-muerto') && (c.type === 'Personaje' || c.type === 'Esbirro'));
                
                if (currentVanCount < 4 && currentVP >= 2) {
                    validTargets = validTargets.filter(c => c.type !== 'Personaje');
                }
                
                if (validTargets.length === 0) {
                    game.logMsg(i === 0 ? "No hay objetivos válidos que cumplan las reglas." : "No hay más objetivos válidos para el segundo revivir.", 'system');
                    break;
                }
                
                // Visor de la pila de descartes (Toto, 7-ago-2026). Antes usaba el modal
                // genérico y, como Necronomicón, trataba su resultado como carta suelta cuando es
                // un ARRAY: cancelar devolvía [] -truthy, así que el `if (!chosen)` no cortaba- y
                // el `findIndex` de abajo daba -1, con lo que `splice(-1, 1)` arrancaba la ÚLTIMA
                // carta del descarte saltándose todos los filtros. Y dos veces, por el bucle.
                // El visor en modo single devuelve UNA carta o null, que es lo que este código
                // ya suponía: con él, el `if (!chosen)` corta de verdad.
                const chosen = await game.openDeckSearchViewer(card.owner, validTargets, `VUELVE A LA VIDA (${i+1}/2): ELIGE UN CAÍDO`, null, 1, 'discard');
                if (!chosen) break; 
                
                const placeChoice = p.vanguard.length < 4 ? 'vanguard' : 'rearguard';
                const placeText = placeChoice === 'vanguard' ? 'vanguardia' : 'retaguardia'; 
                
                const idx = p.discard.findIndex(c => c.instanceId === chosen.instanceId);
                const recovered = p.discard.splice(idx, 1)[0];
                
                recovered.location = placeChoice;
                if (placeChoice === 'vanguard') p.vanguard.push(recovered);
                else p.rearguard.push(recovered);
                
                const template = getCardTemplate(recovered.id);
                recovered.currentHp = template.hp;
                recovered.currentDef = template.def;
                recovered.currentAtk = template.atk;
                recovered.furor = 0;
                recovered.exhausted = false;
                
                game.logMsg(`¡${game.getCardNameWithOwner(recovered)} vuelve a la vida automáticamente en tu ${placeText}!`, 'ability'); 
                
                game.render();
                try { await animateResurrect(card.owner, recovered.instanceId); } catch(e){}
                await game.sleep(400);
            }
            
            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.updatePassives();
            game.render();
        }
    },
    {
        name: "Erasmo", hp: 4, def: 7, atk: 3, type: "Personaje", subtype: "Ser vivo", tags: ["Usuario de VP"], gender: "M", rarity: "S", cost: 1, series: 1,
        text: "P: SEGUIMIENTO: Tu rival debe tener su mano siempre visible. Además, puedes mirar la primera carta de su mazo. A: DOMINIO (2F): Elige a un enemigo cualquiera; ese enemigo realiza un ataque normal a cualquier objetivo en el campo (aliado o enemigo).",
        passiveName: "SEGUIMIENTO", activeName: "DOMINIO", activeCost: 2,
        
        // 1. Mostrar la mano del rival siempre (Hook de motor)
        onUpdatePassive: function(card, game) {
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            game.players[enemyId].handExposedTo = card.owner; 
        },
        
        // 2. El botón de la Clarividencia
        getCustomActions: function(card, game) {
            if (card.location === 'vanguard' || card.location === 'rearguard') {
                return [{
                    label: 'MIRAR MAZO RIVAL',
                    color: '#8b5cf6', 
                    action: () => {
                        const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
                        const enemyDeck = game.players[enemyId].deck;
                        if (enemyDeck.length > 0) {
                            const topCard = enemyDeck[enemyDeck.length - 1]; // La última carta del array es la de "arriba"
                            game.logMsg(`Erasmo escruta el futuro...`, 'ability');
                            // Usamos el modal de visualización en modo "Solo Lectura"
                            game.openVisualSearchModal('CARTA SUPERIOR DEL MAZO RIVAL', [topCard], 0, true, card.owner);
                        } else {
                            game.logError("El mazo del rival está vacío.");
                        }
                    }
                }];
            }
            return [];
        },
        
        // 3. Dominio (Control Mental)
        canActivateAbility: function(card, game) {
            if (card.furor < 2) { game.logError("Falta Furor (2)."); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            const validPuppets = [...game.players[enemyId].vanguard, ...game.players[enemyId].rearguard].filter(c => !getCardTemplate(c.id).isAvatar);
            if (validPuppets.length === 0) { game.logError("No hay enemigos controlables."); return false; }
            return true;
        },
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 2, name: 'DOMINIO', targetType: 'any_field' };
            game.logError("DOMINIO: Paso 1 - Elige a la Marioneta enemiga.");
            game.render();
        },
        onValidateTarget: function(card, target, game, isSilent) {
            const ctx = game.abilityContext;
            
            // Primer click: Elegir a la Marioneta (Debe ser enemigo, no Avatar)
            if (ctx.targets.length === 0) {
                if (target.owner === card.owner) {
                    if (!isSilent) game.logError("Debes elegir a un ENEMIGO como marioneta.");
                    return false;
                }
                if (getCardTemplate(target.id).isAvatar) return false;
                return true;
            }
            
            // Segundo click: Elegir a la Víctima (Cualquiera en Vanguardia o Retaguardia)
            if (ctx.targets.length === 1) {
                if (target.location !== 'vanguard' && target.location !== 'rearguard') return false;
                if (target.stealth && target.owner !== card.owner) {
                    if (!isSilent) game.logError("No puedes ordenar atacar a un objetivo Oculto.");
                    return false;
                }
                if (getCardTemplate(target.id).isAvatar) return false;
                return true;
            }
            return false;
        },
        onTargetsReady: async function(card, game) {
            const puppet = game.abilityContext.targets[0];
            const victim = game.abilityContext.targets[1];
            
            game.modifyStat(card, 'furor', -2);
            showFloatingText(card.instanceId, "DOMINIO", "ft-ability", -30);
            
            game.logMsg(`¡${game.getCardNameWithOwner(card)} toma el control de ${game.getCardNameWithOwner(puppet)} y le obliga a atacar a ${game.getCardNameWithOwner(victim)}!`, 'ability');
            
            game.inputState = 'EXECUTING';
            game.isActionLocked = true;
            game.render();
            await game.sleep(800);
            
            // Hacemos que la marioneta ejecute el ataque normal
            await game.performAttack(puppet, victim);
            
            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.render();
        }
    },
    {
        name: "Xanadu", hp: 6, def: 4, atk: 7, type: "Personaje", subtype: "Ser vivo", tags: ["Poder heredado"], gender: "M", rarity: "S", series: 1,
        // Requisito visible: a quién señala la flecha lima al presentarse (§14.bis).
        requisitoVisible: [ { quien: "TODOS", zona: "evento", filtros: [ { campo: "name", op: "==", valor: "Una buena razón" } ], uno: true } ],
        text: "Requisito: 'Una buena razón' activo en cualquier campo. P: REPULSIÓN ABSOLUTA: Al recibir un ataque normal, puede pagar 1 de Furor para evitarlo con todos sus efectos. A: ESTORNUDO DEVASTADOR (2F): Intercambia un enemigo de vanguardia por uno de retaguardia. Si no hay retaguardia enemiga, lo devuelve a su mano.",
        passiveName: "REPULSIÓN ABSOLUTA", activeName: "ESTORNUDO DEVASTADOR", activeCost: 2,

        onBeforePlayAsync: async function(card, game, p) {
            const p1Event = game.players.p1.activeEvent;
            const p2Event = game.players.p2.activeEvent;
            const eventActive = (p1Event && p1Event.name === "Una buena razón") || (p2Event && p2Event.name === "Una buena razón");
            if (!eventActive) {
                game.logMsg(`No puedes colocar a ${game.getCardNameWithOwner(card)} si 'Una buena razón' no está en juego.`, 'system');
                return false;
            }
            return true;
        },
        
        // isSpecial (29-jul-2026): mismo bug hermano que tenía Águila (corregido 28-jul-2026) —
        // el texto dice "Al recibir ataque normal" pero la heurística vieja (`!abilityName`) usaba
        // si el ataque traía NOMBRE DE HABILIDAD como proxy de "es normal", lo cual falla en los
        // dos sentidos: un ataque normal CON nombre (BOMBAZO, CABREO, SANGRE MALDITA, PUÑO DE
        // NEUTRONES...) no activaba REPULSIÓN ABSOLUTA aunque debía, y cualquier ataque especial
        // SIN nombre la activaría igual aunque no debía. El 5º parámetro ya lo pasan los 9 puntos
        // del motor desde el fix de Águila. De paso, la misma exención de Aniceto (uncounterable,
        // "sus ataques y Habilidades son imparables") que ya tiene Águila — Xanadu no la tenía.
        onBeforeDefend: async function(defender, attacker, game, abilityName, isSpecial) {
            if (isSpecial) return false; // REPULSIÓN ABSOLUTA solo repele ataques normales
            const attackerTemplate = getCardTemplate(attacker.id);
            if (attackerTemplate.uncounterable) {
                game.logMsg(`${game.getCardNameWithOwner(attacker)} ignora las defensas evasivas gracias a su pasiva.`, 'system');
                return false;
            }
            if (defender.furor >= 1) {
                const pName = defender.owner === 'p1' ? 'JUGADOR 1' : 'JUGADOR 2';
                const used = await new Promise(resolve => {
                    // Bug real corregido (29-jul-2026, betasteo de Toto): sin chooserId explícito,
                    // openChoiceModal usaba this.activePlayerId como respondedor por defecto — o sea
                    // el ATACANTE, no el dueño de Xanadu, que es quien de verdad decide si gasta su
                    // Furor. defender.owner es quien debe responder, gane o pierda el turno.
                    game.openChoiceModal(`REPULSIÓN ABSOLUTA (${pName})\n\n¿Gastar 1 Furor para repeler el ataque de ${attacker.name}?`, [
                        { label: 'SÍ (-1 FUROR)', action: () => resolve(true) },
                        { label: 'NO', action: () => resolve(false) }
                    ], defender.owner);
                });
                if (used) {
                    game.modifyStat(defender, 'furor', -1);
                    game.logMsg(`¡${defender.passiveName}! ${game.getCardNameWithOwner(defender)} repele el ataque de ${game.getCardNameWithOwner(attacker)}.`, 'ability');
                    showFloatingText(defender.instanceId, "REPELIDO", "ft-ability", -30);
                    try { await animateRepel(attacker.instanceId, defender.instanceId); } catch(e){}
                    return true;
                }
            }
            return false;
        },

        canActivateAbility: function(card, game) {
            if (card.furor < 2) { game.logMsg("Falta Furor (2).", 'system'); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            const enemyP = game.players[enemyId];

            if (enemyP.vanguard.length === 0) {
                game.logError("No hay enemigos en vanguardia."); return false;
            }

            // 1. PREVENCIÓN: Comprobamos si hay al menos un enemigo legal para intercambiar en toda la vanguardia
            if (enemyP.rearguard.length > 0) {
                const currentVP = enemyP.vanguard.filter(c => c.type === 'Personaje').length;
                let anyValid = false;
                for (let vanEnemy of enemyP.vanguard) {
                    const targetIsP = vanEnemy.type === 'Personaje' ? 1 : 0;
                    const baseVP = currentVP - targetIsP; // Cuántos Personajes quedarían si quitamos a este
                    
                    const canSwap = enemyP.rearguard.some(rearAlly => {
                        const rearIsP = rearAlly.type === 'Personaje' ? 1 : 0;
                        return (baseVP + rearIsP) <= 2;
                    });
                    if (canSwap) { anyValid = true; break; }
                }
                if (!anyValid) {
                    game.logError("Ningún enemigo de la vanguardia puede ser intercambiado legalmente (límite de Personajes).");
                    return false;
                }
            }
            return true;
        },

        onExecuteAbility: function(card, game) {
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            const enemyP = game.players[enemyId];
            const maxT = enemyP.rearguard.length === 0 ? 1 : 2;

            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: maxT, name: 'ESTORNUDO DEVASTADOR', targetType: 'enemy' };
            game.logMsg(maxT === 1 ? "ESTORNUDO: Elige un enemigo de la vanguardia para devolverlo a la mano." : "ESTORNUDO: Elige al enemigo de la vanguardia.", 'system');
            game.render();
        },

        onValidateTarget: function(card, target, game, isSilent = false) {
            const ctx = game.abilityContext;
            const enemyP = game.players[target.owner];

            if (target.stealth) {
                if (!isSilent) game.logError("No puedes seleccionar objetivos Ocultos.");
                return false;
            }

            if (ctx.targets.length === 0) {
                if (target.location !== 'vanguard') {
                    if (!isSilent) game.logError("El primer objetivo debe estar en la vanguardia.");
                    return false;
                }
                if (enemyP.rearguard.length > 0) {
                    const currentVP = enemyP.vanguard.filter(c => c.type === 'Personaje').length;
                    const targetIsP = target.type === 'Personaje' ? 1 : 0;
                    const baseVP = currentVP - targetIsP;

                    const hasValidSwap = enemyP.rearguard.some(rearAlly => {
                        const rearIsP = rearAlly.type === 'Personaje' ? 1 : 0;
                        return (baseVP + rearIsP) <= 2;
                    });

                    if (!hasValidSwap) {
                        if (!isSilent) game.logError(`No hay intercambios legales para ${target.name} (límite de Personajes).`);
                        return false;
                    }
                }
                return true;
            } else if (ctx.targets.length === 1) {
                if (target.location !== 'rearguard') {
                    if (!isSilent) game.logError("El segundo objetivo debe ser un enemigo de la retaguardia para intercambiar.");
                    return false;
                }
                const vanTarget = ctx.targets[0];
                const currentVP = enemyP.vanguard.filter(c => c.type === 'Personaje').length;
                const targetIsP = vanTarget.type === 'Personaje' ? 1 : 0;
                const baseVP = currentVP - targetIsP;
                const rearIsP = target.type === 'Personaje' ? 1 : 0;

                if ((baseVP + rearIsP) > 2) {
                    if (!isSilent) game.logError("Este intercambio superaría el límite de 2 Personajes en la vanguardia rival.");
                    return false;
                }
                return true;
            }
            return false;
        },

        onTargetsReady: async function(card, game) {
            const attacker = card;
            const target = game.abilityContext.targets[0];
            const enemyId = target.owner;
            const enemyP = game.players[enemyId];

            game.modifyStat(attacker, 'furor', -2);
            showFloatingText(attacker.instanceId, attacker.activeName, "ft-ability", -30);
            game.inputState = 'EXECUTING';
            game.render();

            if (game.abilityContext.targets.length === 1) {
                game.logMsg(`¡ESTORNUDO DEVASTADOR! El vendaval lanza a ${game.getCardNameWithOwner(target)} de vuelta a la mano rival.`, 'ability');
                try { await animateSpinToHand(target.instanceId, enemyId); } catch(e){}
                enemyP.vanguard = enemyP.vanguard.filter(c => c.instanceId !== target.instanceId);
                game.unequipAll(target); // Desequipa lo que tenga el objetivo
                target.location = 'hand';
                target.currentHp = getCardTemplate(target.id).hp;
                target.status = {};
                enemyP.hand.push(target);
            } else {
                const swapTarget = game.abilityContext.targets[1];
                game.logMsg(`¡ESTORNUDO DEVASTADOR atrapa a ${game.getCardNameWithOwner(target)} y ${game.getCardNameWithOwner(swapTarget)} en un tornado y los intercambia!`, 'ability');
                try { await animateTornadoSwap(target.instanceId, swapTarget.instanceId); } catch(e){}
                const vIdx = enemyP.vanguard.findIndex(x => x.instanceId === target.instanceId);
                const rIdx = enemyP.rearguard.findIndex(x => x.instanceId === swapTarget.instanceId);
                enemyP.vanguard[vIdx] = swapTarget;
                enemyP.rearguard[rIdx] = target;
                target.location = 'rearguard';
                swapTarget.location = 'vanguard';
            }

            attacker.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.updatePassives();
            game.render();
        }
    },
    {
        name: "Diego Antonio", hp: 7, def: 9, atk: 9, type: "Personaje", subtype: "Ser vivo", tags: ["Usuario de VP", "mafia"], gender: "M", rarity: "S", series: 1,
        // Requisito visible: a quién señala la flecha lima al presentarse (§14.bis).
        requisitoVisible: [ { quien: "TODOS", zona: "evento", filtros: [ { campo: "name", op: "==", valor: "Una buena razón" } ], uno: true } ],
        text: "Requisito: 'Una buena razón' activo en cualquier campo. P: CÓLERA INFINITA: Al colocar: +1 de Furor y 3 Contadores; en vanguardia pierde 1 por turno y a 0 muere. No puede retirarse de forma normal. Al recibir un ataque normal invierte el cálculo: no sufre daño y daña al atacante. A: PACIFISMO (3F): Este turno no baja su contador.",
        passiveName: "CÓLERA INFINITA", activeName: "PACIFISMO", activeCost: 3,
        uncopyable: true, // Requiere los contadores exclusivos de Diego
        
        cannotRetreat: true, // Flag leído por index.html para bloquear la retirada manual
        
        onBeforePlayAsync: async function(card, game, p) {
            const eventActive = (game.players.p1.activeEvent?.name === "Una buena razón") || (game.players.p2.activeEvent?.name === "Una buena razón");
            if (!eventActive) {
                game.logMsg(`No puedes colocar a ${game.getCardNameWithOwner(card)} sin el evento 'Una buena razón' en juego.`, 'system');
                return false;
            }
            return true;
        },
        // Migrado el RELOJ (5-ago-2026): la entrada (Furor + contadores), el tic de cada turno y
        // la muerte al agotarse, más PACIFISMO, que es justo lo que congela ese tic. Estrena el op
        // `CUENTA_ATRAS`, compartido con Meca EBA. Lo que se queda imperativo y por qué: el veto de
        // colocación mira un EVENTO en juego ('Una buena razón'), y los `requisitos` del DSL solo
        // saben contar CARTAS en zonas; y la inversión de daño (onBeforeTakeDamage) no tiene
        // trigger — es la única carta del juego que la usa, así que no compensa inventarlo.
        abilities: [
            { trigger: "AL_JUGAR",
              log: "¡CÓLERA INFINITA! {carta} entra con 3 contadores de Cólera.",
              efectos: [
                { op: "MODIFICAR_STAT", target: { quien: "SELF" }, stat: "furor", delta: 1 },
                { op: "MODIFICAR_CONTADORES", target: { quien: "SELF" }, contador: "diego_timer",
                  delta: 3, nombreContador: "Turnos de Cólera", icono: "⏳" } ] },
            { trigger: "FIN_TURNO", resumenFase: "Pierde 1 Contador; a 0 muere", porHabilidad: "CÓLERA INFINITA", 
              efectos: [
                { if: { campo: "location", op: "==", valor: "vanguard" },
                  op: "CUENTA_ATRAS", target: { quien: "SELF" },
                  contador: "diego_timer", nombreContador: "Turnos de Cólera", icono: "⏳",
                  salvoSi: { campo: "pacifismoActive", op: "truthy" }, consumirTrasSaltar: "pacifismoActive",
                  logSalto: "¡PACIFISMO! {carta} no pierde contador de Cólera este turno.",
                  logCero: "¡El tiempo de {carta} se ha agotado!",
                  alLlegarACero: [
                    { op: "MODIFICAR_STAT", stat: "currentHp", vaciar: true,
                      comprobarMuerte: true, sinRetribucion: true } ] } ] },
            { trigger: "ACTIVA", nombre: "PACIFISMO", coste: { furor: 3 }, sinObjetivo: true,
              log: "{carta} activa PACIFISMO. Su contador se congela este turno.",
              efectos: [ { op: "MARCAR", target: { quien: "SELF" }, campo: "pacifismoActive", valor: true } ] }
        ],
        onBeforeTakeDamage: async function(defender, attacker, dmg, isSpecial, game) {
            if (!isSpecial) {
                showFloatingText(defender.instanceId, "INVERSIÓN", "ft-ability", -30);
                game.logMsg(`¡${defender.passiveName}! ${game.getCardNameWithOwner(defender)} invierte el ataque normal de ${game.getCardNameWithOwner(attacker)}.`, 'ability');
                
                let counterDmg = defender.currentAtk - attacker.currentDef;
                if (counterDmg <= 0) counterDmg = (defender.type === 'Esbirro' && attacker.type === 'Personaje') ? 0.5 : 1;
                
                // Retraso de 400ms para sincronizar el daño visual con el choque de las cartas
                setTimeout(() => {
                    game.modifyStat(attacker, 'currentHp', -counterDmg);
                    game.logMsg(`> ${game.getCardNameWithOwner(attacker)} recibe ${counterDmg} de daño por su propia imprudencia.`, 'combat');
                    setTimeout(() => game.checkDeath(attacker), 100);
                }, 400);

                return 0; // Diego Antonio sale ileso del cálculo bruto
            }
            return dmg;
        },
    },
    {
        name: "Silhouette", hp: 7, def: 1, atk: 1, type: "Personaje", subtype: "Ser vivo", tags: ["Draconiana", "otaku", "usuaria de VP"], gender: "F", rarity: "S", series: 1,
        // Requisito visible: a quién señala la flecha lima al presentarse (§14.bis).
        requisitoVisible: [ { quien: "TODOS", zona: "evento", filtros: [ { campo: "name", op: "==", valor: "Una buena razón" } ], uno: true } ],
        text: "Requisito: 'Una buena razón' activo en cualquier campo. P: REINA DEL COSPLAY: Al inicio de tu turno, cura 2 Vida. A: PONTE TRAJE (1F): Elige cualquier aliado o enemigo en el campo. Copias sus stats base (Atq y Def).",
        passiveName: "REINA DEL COSPLAY", activeName: "PONTE TRAJE", activeCost: 1,
        
        onBeforePlayAsync: async function(card, game, p) {
            const eventActive = (game.players.p1.activeEvent?.name === "Una buena razón") || (game.players.p2.activeEvent?.name === "Una buena razón");
            if (!eventActive) {
                game.logMsg(`No puedes colocar a ${game.getCardNameWithOwner(card)} sin el evento 'Una buena razón' en juego.`, 'system');
                return false;
            }
            return true;
        },
        onStartTurn: async function(card, game) {
            if (card.owner === game.activePlayerId && card.currentHp < card.maxHp) {
                let amount = 2;
                const template = getCardTemplate(card.id);
                if (typeof template.onBeforeHealed === 'function') amount = template.onBeforeHealed(card, amount, card, game);
                
                const missing = card.maxHp - card.currentHp;
                const heal = Math.min(amount, missing);
                if (heal > 0) {
                    showFloatingText(card.instanceId, "REINA DEL COSPLAY", "ft-ability", -40);
                    game.modifyStat(card, 'currentHp', heal);
                    game.logMsg(`¡${card.passiveName}! ${game.getCardNameWithOwner(card)} se cura ${heal} Vida.`, 'ability');
                }
            }
        },
        onUpdatePassive: function(card, game) {
            if (card.copiedBaseAtk !== undefined) card.currentAtk = card.copiedBaseAtk;
            if (card.copiedBaseDef !== undefined) card.currentDef = card.copiedBaseDef;
        },
        canActivateAbility: function(card, game) {
            if (card.furor < 1) { game.logMsg("Falta Furor (1).", 'system'); return false; }
            return true;
        },
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            // Custom targetType que hemos habilitado en el index.html
            game.abilityContext = { targets: [], maxTargets: 1, name: 'PONTE TRAJE', targetType: 'any_field' };
            game.logError("PONTE TRAJE: Elige CUALQUIER aliado o enemigo en el campo.");
            game.render();
        },
        onValidateTarget: function(card, target, game, isSilent = false) {
            if (target.location !== 'vanguard' && target.location !== 'rearguard') {
                if (!isSilent) game.logMsg("El objetivo debe estar en el campo de batalla.", 'system');
                return false;
            }
            if (target.stealth && target.owner !== card.owner) {
                if (!isSilent) game.logError("No puedes seleccionar a un enemigo Oculto.");
                return false;
            }
            return true;
        },
        onTargetsReady: async function(card, game) {
            const target = game.abilityContext.targets[0];
            game.modifyStat(card, 'furor', -1);
            
            const targetTemplate = getCardTemplate(target.id);
            const oldAtk = card.currentAtk;
            const oldDef = card.currentDef;

            card.copiedBaseAtk = targetTemplate.atk;
            card.copiedBaseDef = targetTemplate.def;
            
            // Forzamos actualización para calcular la diferencia matemática
            game.updatePassives();
            
            const diffAtk = card.currentAtk - oldAtk;
            const diffDef = card.currentDef - oldDef;

            // Secuencia de popups encadenados automáticamente por la cola
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -40);
            
            if (diffAtk > 0) showFloatingText(card.instanceId, `+${diffAtk} ATQ`, "ft-green", -20);
            else if (diffAtk < 0) showFloatingText(card.instanceId, `${diffAtk} ATQ`, "ft-red-stat", -20);
            
            if (diffDef > 0) showFloatingText(card.instanceId, `+${diffDef} DEF`, "ft-green", 0);
            else if (diffDef < 0) showFloatingText(card.instanceId, `${diffDef} DEF`, "ft-red-stat", 0);

            game.logMsg(`¡${game.getCardNameWithOwner(card)} copia los stats base de ${game.getCardNameWithOwner(target)}! (ATQ: ${card.copiedBaseAtk}, DEF: ${card.copiedBaseDef})`, 'ability');
            
            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.render();
        }
    },
    {
        name: "Cañón de positrones", type: "Ayuda", subtype: "Técnica", tags: ["Consumible"], rarity: "A", series: 2, cost: 0,
        text: "Coste: 2 de Furor de un Personaje 'Karlos'. Destruye a un enemigo de la vanguardia o retaguardia rival.",
        // Migrada (30-jul-2026). El pagador (Karlos) pasa del modal genérico (violaba la norma
        // de targeting en tablero) al objetivo de AL_USAR_AYUDA (reborde verde, como Espada V);
        // el enemigo se elige con un ELEGIR anidado — SELECT_AYUDA_TARGET solo admite aliados
        // como objetivo (comprobado en el motor), así que no puede ser al revés. "Destruye"
        // usa MODIFICAR_STAT con vaciar+comprobarMuerte (el mismo canal de "daño verdadero" de
        // Granada de maná) más el nuevo flag `sinRetribucion`: la vieja llamaba a
        // checkDeath(target, false) a mano para NO dar Retribución por ser destrucción directa,
        // no muerte en combate.
        abilities: [
            { trigger: "JUGAR", requisitos: [
                { count: { filtros: [ { campo: "name", op: "contieneTexto", valor: "Karlos" }, { campo: "furor", op: ">=", valor: 2 } ] }, op: ">=", valor: 1, msg: "Necesitas un 'Karlos' con al menos 2 de Furor." },
                { count: { de: "ENEMIGOS" }, op: ">=", valor: 1, msg: "No hay enemigos a los que destruir." } ] },
            { trigger: "AL_USAR_AYUDA",
              requisitosObjetivo: [
                { campo: "name", op: "contieneTexto", valor: "Karlos", msg: "Solo un 'Karlos' puede disparar el Cañón de positrones." },
                { campo: "furor", op: ">=", valor: 2, msg: "{objetivo} necesita al menos 2 de Furor." } ],
              efectos: [
                { op: "MODIFICAR_STAT", stat: "furor", delta: -2, esCoste: true, floating: { texto: "CAÑÓN DE POSITRONES", estilo: "ft-ability", offset: -30 } },
                { op: "ELEGIR", de: "ENEMIGOS", cantidad: 1, cancelable: false,
                  titulo: "Elige al enemigo que será aniquilado",
                  efectos: [
                    { op: "MODIFICAR_STAT", stat: "currentHp", vaciar: true, sinRetribucion: true, comprobarMuerte: true,
                      log: "¡BZZZZT! El Cañón de positrones impacta de lleno en {objetivo}." } ] } ] }
        ],
    },
    {
        name: "Furia berserker", type: "Ayuda", subtype: "Técnica", tags: ["Equipable"], rarity: "B", series: 1, cost: 0,
        text: "Coste: 2 de Furor de un aliado 'Draconiano/a'. Anéxala al aliado que tributó el coste: +3 Atq mientras esté equipada.",
        abilities: [
            { trigger: "JUGAR", requisitos: [
                { count: { filtros: [ { o: [ [ { campo: "tags", op: "includes", valor: "Draconiana" } ], [ { campo: "tags", op: "includes", valor: "Draconiano" } ] ] }, { campo: "furor", op: ">=", valor: 2 } ] }, op: ">=", valor: 1, msg: "Necesitas un aliado Draconiano/a con al menos 2 de Furor." } ] },
            { trigger: "AL_EQUIPAR",
              mientrasEquipado: { atk: 3 },
              efectos: [
                { op: "ELEGIR", de: "ALIADOS", filtros: [ { o: [ [ { campo: "tags", op: "includes", valor: "Draconiana" } ], [ { campo: "tags", op: "includes", valor: "Draconiano" } ] ] }, { campo: "furor", op: ">=", valor: 2 } ], cantidad: 1,
                  titulo: "¿QUIÉN ENTRA EN FURIA? (-2 FUROR)",
                  efectos: [
                    { op: "MODIFICAR_STAT", stat: "furor", delta: -2, esCoste: true },
                    { op: "EQUIPAR",
                      floats: [ { texto: "FURIA BERSERKER", estilo: "ft-ability", offset: -40 }, { texto: "+3 ATQ (EQUIPADO)", estilo: "ft-green", offset: -20 } ],
                      log: "{objetivo} se equipa con Furia berserker (+3 ATQ)." } ] } ] }
        ],
    },
    {
        name: "Pago por adelantado", type: "Ayuda", subtype: "Técnica", tags: ["Consumible"], rarity: "C", series: 1, cost: 0,
        text: "Coste: 2 de Furor. Busca en tu mazo una carta con etiqueta 'Mercenario', añádela a tu mano y baraja.",
        abilities: [
            { trigger: "JUGAR", requisitos: [ { count: { filtros: [ { campo: "furor", op: ">=", valor: 2 } ] }, op: ">=", valor: 1, msg: "Necesitas un aliado con al menos 2 de Furor." } ] },
            { trigger: "AL_CONSUMIR",
              efectos: [
                // El pagador se ANOTA aquí pero se le cobra DESPUÉS (§14): elegirlo todavía se
                // puede cancelar, así que el Furor no puede irse hasta que la búsqueda -que es
                // el punto de compromiso de verdad- haya arrancado. Mismo patrón que usa
                // Necronomicón: guardaIdsEnSelf + un MODIFICAR_STAT con selfLista más abajo.
                { op: "ELEGIR", de: "ALIADOS", filtros: [ { campo: "furor", op: ">=", valor: 2 } ], cantidad: 1, titulo: "¿QUIÉN PAGA POR ADELANTADO? (-2 FUROR)",
                  guardaIdsEnSelf: "pagoPagador" },
                // `esCoste`: el efecto se aparca hasta el escaparate, así que sigue sin cobrarse
                // mientras te puedas arrepentir (el compromiso en el MAZO es ABRIR el visor,
                // §14) pero el "-2 FUR" sale ya a la vez que la carta se enseña. Se cobra aunque
                // no se encuentre nada — lo dice su propio texto: "el pago se ha perdido".
                { op: "MODIFICAR_STAT", target: { selfLista: "pagoPagador" }, stat: "furor", delta: -2, esCoste: true },
                { op: "BUSCAR", en: "MAZO", cantidad: 1, destino: "MANO",
                  filtros: [ { campo: "tags", op: "includes", valor: "Mercenario" } ],
                  algunFiltro: [ { campo: "type", op: "==", valor: "Personaje" }, { campo: "type", op: "==", valor: "Esbirro" } ],
                  titulo: "BUSCAR MERCENARIO EN EL MAZO",
                  log: "{jugador} contrata a {objetivo} desde su mazo.",
                  logNoValidas: "No quedan Mercenarios en el mazo de {jugador}. ¡El pago se ha perdido!",
                  barajarDespues: { log: "Barajando el mazo de {jugador}...", inclusoSinValidas: true } } ] }
        ],
    },
    {
        name: "Cápsula de bio-regeneración", type: "Ayuda", subtype: "Tecnología", tags: ["Consumible"], rarity: "B", series: 2, cost: 0,
        // Requisito visible: un requisito de RECUENTO tambien tiene a QUIEN apuntar -las
        // cartas concretas que lo cumplen-, y son TODAS, sin `uno` (Toto, 14-ago-2026).
        requisitoVisible: [ { quien: "ALIADO", zona: "vanguardia" } ],
        text: "Requisito: Tu vanguardia llena. Elige de tu descarte un 'Ser vivo' sin condiciones de colocación y colócalo en retaguardia.",
        abilities: [
            { trigger: "JUGAR", requisitos: [
                { count: { zona: "VANGUARDIA" }, op: ">=", valor: 4, msg: "Tu vanguardia debe estar llena (4 cartas)." },
                { count: { zona: "RETAGUARDIA" }, op: "<=", valor: 3, msg: "Tu retaguardia está llena." },
                { count: { zona: "DESCARTES", filtros: [ { campo: "subtype", op: "==", valor: "Ser vivo" } ], plantillaSin: ["onBeforePlayAsync"] }, op: ">=", valor: 1, msg: "No hay 'Seres vivos' aptos en tu pila de descartes." } ] },
            { trigger: "AL_CONSUMIR",
              efectos: [
                { op: "BUSCAR", en: "DESCARTES", cantidad: 1, destino: "RETAGUARDIA", animacionResurrect: true, sinAnimacion: true,
                  filtros: [ { campo: "subtype", op: "==", valor: "Ser vivo" } ], plantillaSin: ["onBeforePlayAsync"],
                  abortaSiCancelas: true, titulo: "REGENERAR EN RETAGUARDIA",
                  log: "¡La Cápsula bio-regenera a {objetivo} en la retaguardia!" } ] }
        ],
    },
    {
        name: "De compras", type: "Evento", rarity: "B", series: 1, cost: 1, duration: 2,
        text: "2 turnos. Mientras esté en juego, al final de tu turno revela cartas del mazo hasta hallar un 'Ayuda - Ingerible', 'Arma' o 'Vestimenta': la añades a la mano y barajas (si no hay, solo barajas).",
        abilities: [
            { trigger: "FIN_TURNO", resumenFase: "Revela cartas del mazo hasta hallar un Ingerible, Arma o Vestimenta y se lo lleva a la mano", soloTurnoPropio: true,
              efectos: [
                { op: "BUSCAR", en: "MAZO", seleccion: "PRIMERA", cantidad: 1, destino: "MANO",
                  logIntro: "¡Evento activo: {carta}! Buscando un chollo...",
                  filtros: [ { campo: "type", op: "==", valor: "Ayuda" } ],
                  algunFiltro: [ { campo: "subtype", op: "==", valor: "Ingerible" }, { campo: "subtype", op: "==", valor: "Arma" }, { campo: "subtype", op: "==", valor: "Vestimenta" } ],
                  log: "{jugador} ha comprado: {objetivo}.",
                  logNoEncontrada: "{jugador} ha mirado toda la tienda y no quedaba nada de eso.",
                  barajarDespues: { log: "Barajando el mazo de {jugador}..." } } ] },
            { trigger: "AL_CADUCAR", log: "Termina el día De compras de {jugador}.", logTipo: "system" }
        ],
    },
    {
        name: "Esfuerzo dividido", type: "Evento", rarity: "A", series: 1, cost: 1, duration: 4,
        // Requisito visible: un requisito de RECUENTO tambien tiene a QUIEN apuntar -las
        // cartas concretas que lo cumplen-, y son TODAS, sin `uno` (Toto, 14-ago-2026).
        requisitoVisible: [ { quien: "ALIADO", zona: "vanguardia" } ],
        text: "4 turnos. Requiere 3 aliados en vanguardia. Al colocarla, escoge 2: no pueden atacar ni usar Activas y ganan Oculto. Mientras esté en juego, si uno de ellos muere, esta carta se destruye. Al expirar, el rival roba 1 retribución.",
        // Migrada a DSL (tanda de eventos, 21-jul-2026). Piezas nuevas del intérprete
        // que estrena: ELEGIR guardaIdsEnSelf (guarda los 2 elegidos como lista),
        // AURA soloSelfLista + marcar-array (Oculto+agotado a los elegidos), triggers
        // AL_MORIR_ALIADO (se destruye si muere un elegido) y AL_DESTRUIR (limpieza al
        // destruirla), op RETRIBUCION y _pool selfLista (para la limpieza).
        abilities: [
            { trigger: "JUGAR", requisitos: [
                { count: { zona: "VANGUARDIA" }, op: ">=", valor: 3, msg: "Necesitas al menos 3 aliados en la vanguardia." } ] },
            { trigger: "AL_JUGAR", efectos: [
                { op: "ELEGIR", de: "ALIADOS", zona: "VANGUARDIA", cantidad: 2,
                  guardaIdsEnSelf: "chosenAllies",
                  titulo: "Escoge los 2 aliados que dividirán su esfuerzo",
                  logAntes: "¡{elegidos} se ocultan para dividir el esfuerzo!", logAntesTipo: "ability" } ] },
            // Los 2 elegidos quedan Ocultos y agotados mientras el Evento siga en juego.
            { trigger: "AURA", quien: "ALIADO", soloSelfLista: "chosenAllies",
              filtros: [ { campo: "location", op: "==", valor: "vanguard" } ],
              marcar: [ { campo: "stealth", valor: true }, { campo: "exhausted", valor: true } ] },
            // Si uno de los elegidos muere, el Evento se destruye.
            { trigger: "AL_MORIR_ALIADO", si: { deadCardEnSelfLista: "chosenAllies" },
              log: { msg: "Uno de los eslabones ha caído. {carta} se destruye.", tipo: "ability" },
              destruirseEvento: true },
            // Destrucción prematura (Giro de guion): limpia Oculto/agotamiento.
            { trigger: "AL_DESTRUIR", efectos: [
                { op: "MARCAR", target: { selfLista: "chosenAllies" }, campo: "stealth", valor: false },
                { op: "MARCAR", target: { selfLista: "chosenAllies" }, campo: "exhausted", valor: false } ] },
            // Expira: misma limpieza + el rival coge 1 Retribución.
            { trigger: "AL_CADUCAR", resumenFase: "Al expirar, su rival roba 1 retribución", log: "Esfuerzo dividido expira naturalmente. ¡El rival coge 1 Retribución!", logTipo: "ability",
              efectos: [
                { op: "MARCAR", target: { selfLista: "chosenAllies" }, campo: "stealth", valor: false },
                { op: "MARCAR", target: { selfLista: "chosenAllies" }, campo: "exhausted", valor: false },
                { op: "RETRIBUCION", jugador: "RIVAL" } ] },
        ]
    },
    {
        name: "Dobla la ropa", type: "Ayuda", subtype: "Técnica", tags: ["Consumible"], rarity: "C", series: 1, cost: 0,
        text: "Descarta 3 cartas de tu mano y roba 3 del mazo.",
        abilities: [
            { trigger: "JUGAR", requisitos: [ { mano: true, op: ">=", valor: 4, msg: "Necesitas al menos otras 3 cartas en tu mano para usarla." } ] },
            { trigger: "AL_CONSUMIR",
              efectos: [
                { op: "ELEGIR", de: "MANO", cantidad: 3, titulo: "ELIGE 3 CARTAS PARA DESCARTAR", logCancela: "No has seleccionado 3 cartas. Se cancela.",
                  efectos: [ { op: "DESCARTAR", log: "Descartas {objetivo}." } ] },
                { op: "ROBAR", cantidad: 3, log: "{carta} activada: {jugador} roba 3 cartas." } ] }
        ],
    },
    {
        name: "PEM", type: "Ayuda", subtype: "Técnica", tags: ["Consumible"], rarity: "C", cost: 0, series: 1,
        tempEffectText: "{genero?Paralizado|Paralizada} por PEM: se saltará su próximo turno (sin atacar, sin Habilidades y sin retirarse)",
        text: "Coste: 1 de Furor. Elige un enemigo 'Máquina'. No podrá atacar, usar Habilidades ni retirarse en su próximo turno.",
        abilities: [
            { trigger: "JUGAR", requisitos: [
                { count: { filtros: [ { campo: "furor", op: ">=", valor: 1 } ] }, op: ">=", valor: 1, msg: "Necesitas un aliado con 1 de Furor." },
                { count: { de: "ENEMIGOS", filtros: [ { campo: "subtype", op: "==", valor: "Máquina" } ] }, op: ">=", valor: 1, msg: "El rival no tiene 'Máquinas'." } ] },
            { trigger: "AL_CONSUMIR",
              efectos: [
                { op: "ELEGIR", de: "ALIADOS", filtros: [ { campo: "furor", op: ">=", valor: 1 } ], cantidad: 1,
                  titulo: "¿QUIÉN DISPARA EL PEM? (-1 FUROR)",
                  efectos: [ { op: "MODIFICAR_STAT", stat: "furor", delta: -1, esCoste: true } ] },
                { op: "ELEGIR", de: "ENEMIGOS", filtros: [ { campo: "subtype", op: "==", valor: "Máquina" } ], cantidad: 1, cancelable: false,
                  titulo: "Elige al enemigo 'Máquina' para paralizarlo",
                  efectos: [
                    { op: "MARCAR_TEMPORAL", floating: "PARALIZADO", floatingStyle: "ft-ability", offsetFloating: -30,
                      log: "¡El PEM fríe los circuitos de {objetivo}! Se saltará su próximo turno." } ] } ] }
        ],
        onStartTurnTempEffect: function(target, effect, game, currentTurnPlayerId) {
            if (currentTurnPlayerId === target.owner) {
                target.exhausted = true; // ¡Lo agotamos automáticamente!
                game.logMsg(`¡${game.getCardNameWithOwner(target)} sufre los efectos del PEM y no podrá actuar este turno!`, 'system');
                return false; 
            }
            return true; 
        }
    },
    {
        name: "Rebobinar", type: "Ayuda", subtype: "Técnica", tags: ["Consumible"], rarity: "C", cost: 0, series: 1,
        tempEffectText: "{genero?Rebobinado|Rebobinada}: no puede volver a ser {genero?rebobinado|rebobinada} este turno",
        text: "Coste: 3 de Furor del aliado agotado que elijas. Ese aliado refresca su acción. Sólo 1 vez por aliado cada turno.",
        abilities: [
            { trigger: "JUGAR", requisitos: [ { count: { filtros: [ { campo: "exhausted", op: "truthy" }, { campo: "furor", op: ">=", valor: 3 } ], sinMarcaTemporalPropia: true }, op: ">=", valor: 1, msg: "No hay aliados válidos que no hayan sido rebobinados ya." } ] },
            { trigger: "AL_CONSUMIR",
              efectos: [
                { op: "ELEGIR", de: "ALIADOS", filtros: [ { campo: "exhausted", op: "truthy" }, { campo: "furor", op: ">=", valor: 3 } ], sinMarcaTemporalPropia: true, cantidad: 1, titulo: "¿A QUIÉN QUIERES REBOBINAR? (-3 FUROR)",
                  efectos: [
                    { op: "MODIFICAR_STAT", stat: "furor", delta: -3, esCoste: true },
                    { op: "MARCAR", campo: "exhausted", valor: false },
                    { op: "MARCAR_TEMPORAL", hastaFinDeTurnoPropio: true, floating: "REBOBINAR", floatingStyle: "ft-ability", offsetFloating: -30, log: "¡{objetivo} rebobina su tiempo y recupera su acción!" } ] } ] }
        ],
    },
    {
        name: "Giro de guion", type: "Evento", rarity: "B", cost: 0, duration: 3, series: 1,
        // Requisito visible: a quién señala la flecha lima al presentarse (§14.bis).
        requisitoVisible: [ { quien: "ALIADO", zona: "evento", uno: true } ],
        canReplaceEvent: true, // Permite bypass de la regla de 1 evento máximo
        text: "3 turnos. Requiere que tengas un Evento activo. Antes de colocarla, destruye los Eventos de ambos jugadores.",
        abilities: [
            { trigger: "JUGAR", requisitos: [ { eventoActivo: true, op: ">=", valor: 1, msg: "Debes tener ya una carta de Evento en juego para hacer el Giro de guion." } ] },
            // PENDIENTE - su texto dice "Antes de colocarla" y esto corre DESPUÉS de colocarse.
            // Moverlo a ANTES_DE_JUGAR + pausaEnEscaparate funciona (verificado con sonda de
            // ORDEN: las dos destrucciones caen con la carta quieta en el centro), pero reordena
            // los logs en regresion9, 20 y 62, y en la 20 además cambia el RECUENTO -la vieja
            // emite lineas que la nueva ya no-, que es lo que falta por entender antes de
            // documentarlo. Se revierte para no dejar la bateria en rojo (Toto, 13-ago-2026).
            { trigger: "ANTES_DE_JUGAR", log: "¡Giro de guion! ¡El tablero cambia drásticamente!", logTipo: "ability",
              pausaEnEscaparate: true,
              // El PROPIO primero: es el que estás sustituyendo. Antes salía al revés porque el
              // tuyo lo destruía `canReplaceEvent` más tarde, ya fuera de la habilidad; ahora los
              // dos se destruyen aquí, en el orden que se lee en la carta (Toto, 13-ago-2026).
              efectos: [ { op: "DESTRUIR_EVENTO", deQuien: "PROPIO" },
                         { op: "DESTRUIR_EVENTO", deQuien: "RIVAL" } ] },
            { trigger: "AL_CADUCAR", log: "El Giro de guion concluye.", logTipo: "system" }
        ],
    },
    {
        name: "Overclock", type: "Ayuda", subtype: "Tecnología", tags: ["Consumible"], rarity: "C", cost: 0, series: 1,
        text: "Elige un aliado 'Máquina'. Aumenta su Def y Atq en 2 hasta el inicio de tu próximo turno.",
        abilities: [
            { trigger: "JUGAR", requisitos: [
                { count: { filtros: [ { campo: "subtype", op: "==", valor: "Máquina" } ] }, op: ">=", valor: 1, msg: "No tienes 'Máquinas'." } ] },
            { trigger: "AL_CONSUMIR",
              efectos: [
                { op: "ELEGIR", de: "ALIADOS", filtros: [ { campo: "subtype", op: "==", valor: "Máquina" } ], cantidad: 1,
                  titulo: "¿A QUIÉN APLICAS OVERCLOCK?",
                  efectos: [
                    { op: "MARCAR_TEMPORAL", conOwner: true, actualizaPasivas: true,
                      floating: { texto: "OVERCLOCK", estilo: "ft-ability", offset: -40 },
                      log: "¡{objetivo} recibe Overclock! (+2 Atq, +2 Def)." },
                    { op: "FLOTANTE", texto: "+2 ATQ / +2 DEF", estilo: "ft-green", offset: -20 } ] } ] }
        ],
        onUpdateTempEffect: function(target, effect, game) {
            target.currentAtk += 2;
            target.currentDef += 2;
        },
        onStartTurnTempEffect: function(target, effect, game, currentTurnPlayerId) {
            if (currentTurnPlayerId === effect.ownerId) {
                game.logMsg(`El Overclock de ${game.getCardNameWithOwner(target)} se ha apagado.`, 'system');
                return false; 
            }
            return true;
        },
    },
    {
        id: 2001, name: "Hagoromo", type: "Ayuda", subtype: "Vestimenta", tags: ["Equipable"], rarity: "S", cost: 0, series: 1,
        // COSTE, no Requisito (Toto, 16-ago-2026): el aliado no "tiene" 1 de Furor, lo PAGA.
        // Lo leí del CSV como una condición y es un pago, que es la diferencia que separa las
        // dos cajas del detalle. Mismo trato que Té helado, y por eso no lleva requisitoVisible:
        // la flecha la pone sola el `esCoste` del tributo, en rojo y con su "Tributa 1 FUR".
        text: "Coste: 1 de Furor. Anéxasela al aliado que tributó y cúrale 2 de Vida: +1 de Def e inmune a los estados alterados mientras la lleve. Al equiparla, se le eliminan los estados alterados que tuviera.",
        abilities: [
            { trigger: "JUGAR", requisitos: [
                { count: { filtros: [ { campo: "furor", op: ">=", valor: 1 } ] }, op: ">=", valor: 1,
                  msg: "Necesitas un aliado con al menos 1 de Furor para pagar el Hagoromo." } ] },
            { trigger: "AL_EQUIPAR",
              // `inmuneAEstados` lo reimpone onEquipUpdate en cada pasada de updatePassives, igual
              // que los stats: así se cae sola al desequipar sin tener que limpiarla a mano.
              mientrasEquipado: { def: 1, inmuneAEstados: true },
              efectos: [
                { op: "ELEGIR", de: "ALIADOS", cantidad: 1,
                  filtros: [ { campo: "furor", op: ">=", valor: 1 } ],
                  titulo: "¿QUIÉN TRIBUTA Y VISTE EL HAGOROMO?",
                  efectos: [
                    // Paga y se lo pone EL MISMO aliado, como en Té helado: una sola elección.
                    { op: "MODIFICAR_STAT", stat: "furor", delta: -1, esCoste: true },
                    // ORDEN: limpiar, equipar y curar AL FINAL. Un CURAR sobre alguien con la
                    // Vida llena devuelve 'skip' y ABORTA el resto de la cadena, así que puesto
                    // primero dejaba a un aliado sano sin limpieza y sin Hagoromo — la carta no
                    // hacía nada. Lo pilló la suite; a ojo en el navegador habría pasado por
                    // "es que ya estaba curado".
                    { op: "LIMPIAR_ESTADOS", soloObjetivo: true, todos: true },
                    { op: "EQUIPAR",
                      floats: [ { texto: "HAGOROMO", estilo: "ft-ability", offset: -40 }, { texto: "+1 DEF", estilo: "ft-green", offset: -20 } ],
                      log: "{objetivo} se viste el Hagoromo: nada podrá alterarle." },
                    { op: "CURAR", valor: 2, floating: "+2 VIDA", floatingStyle: "ft-green" } ] } ] }
        ],
    },
    {
        id: 2002, name: "Guantes sedientos", type: "Ayuda", subtype: "Arma", tags: ["Equipable", "melé"], rarity: "B", cost: 0, series: 1,
        text: "Anéxasela a un aliado: cada vez que haga daño con un ataque normal, se cura esa cantidad de Vida, hasta 1. Al cabo de 3 turnos deja de curarle y pasa a darle +2 de Atq.",
        abilities: [
            { trigger: "AL_EQUIPAR",
              efectos: [
                { op: "ELEGIR", de: "ALIADOS", cantidad: 1,
                  titulo: "¿QUIÉN SE CALZA LOS GUANTES SEDIENTOS?",
                  efectos: [
                    { op: "EQUIPAR",
                      floats: [ { texto: "GUANTES SEDIENTOS", estilo: "ft-ability", offset: -40 } ],
                      log: "{objetivo} se calza los Guantes sedientos: beben de cada golpe." },
                    // El contador va sobre el PORTADOR, no sobre la Ayuda: la Ayuda queda anexada
                    // y no se ve en el tablero, así que su badge no lo miraría nadie. Petición de
                    // Toto (16-ago-2026): que se vea cuánto queda para el cambio.
                    { op: "MODIFICAR_CONTADORES", target: { quien: "PORTADOR" }, contador: "guantes_sed",
                      delta: 3, nombreContador: "Turnos de sed", icono: "🩸" } ] } ] },
            // Mientras queden turnos de sed, bebe de cada golpe. El `si` se evalúa sobre el
            // ATACANTE (que es quien lleva los guantes), de ahí la ruta con puntos al contador.
            // `siDanoMinimo: 0.5` y no 1: el mínimo del juego NO es 1 -un Esbirro que golpea a un
            // Personaje hace 0,5-. Y se cura LO QUE HIZO con tope de 1, en vez de un 1 fijo, para
            // que ese medio golpe cure medio (Toto, 16-ago-2026).
            { trigger: "TRAS_ATACAR", soloAtaqueNormal: true, siDanoMinimo: 0.5,
              si: { campo: "counters.guantes_sed.count", op: ">", valor: 0 },
              efectos: [
                { op: "CURAR", valor: { REF: "vars.dano" }, maximo: 1, target: { quien: "SELF" },
                  floating: "SED", floatingStyle: "ft-green",
                  log: "Los Guantes sedientos beben del golpe y {objetivo} se refresca." } ] },
            // El tic. Los equipos no entraban en la fase de efectos finales; ahora sí (index.html).
            { trigger: "FIN_TURNO",
              resumenFase: "Les queda un turno menos de sed a los Guantes sedientos",
              si: { campo: "counters.guantes_sed.count", op: ">", valor: 0, de: "PORTADOR" },
              efectos: [
                { op: "MODIFICAR_CONTADORES", target: { quien: "PORTADOR" }, contador: "guantes_sed",
                  delta: -1, nombreContador: "Turnos de sed", icono: "🩸" } ] }
        ],
        // El +2 de Atq no cabe en `mientrasEquipado`, que es un objeto FIJO: solo vale cuando el
        // contador llega a 0. onEquipUpdate corre en cada pasada de updatePassives -es el mismo
        // sitio donde vivirían unos stats fijos-, así que la condición se reevalúa sola.
        onEquipUpdate: function (equipCard, hostCard, game) {
            const c = hostCard.counters && hostCard.counters.guantes_sed;
            if (!c || c.count <= 0) hostCard.currentAtk += 2;
        },
    },
    {
        name: "Shichishito", type: "Ayuda", subtype: "Arma legendaria", tags: ["Equipable", "melé"], rarity: "A", cost: 0, series: 1,
        // Requisito visible: a quién señala la flecha lima al presentarse (§14.bis).
        requisitoVisible: [ { quien: "ALIADO", zona: "vanguardia", filtros: [ { campo: "name", op: "contieneTexto", valor: "Karlos" }, { campo: "type", op: "==", valor: "Personaje" } ], uno: true } ],
        text: "Requisito: un Personaje aliado 'Karlos' en tu vanguardia. Anéxasela a ese aliado: +2 de Atq y +2 de Def mientras la lleve. Sólo puedes usar esta carta una vez por partida.",
        abilities: [
            { trigger: "JUGAR", requisitos: [
                { de: "JUGADOR", campo: "hasUsedShichishito", op: "falsy", msg: "Ya has empuñado la Shichishito en esta partida." },
                { count: { zona: "VANGUARDIA", filtros: [ { campo: "type", op: "==", valor: "Personaje" }, { campo: "name", op: "contieneTexto", valor: "Karlos" } ] }, op: ">=", valor: 1, msg: "Necesitas a Karlos en la vanguardia." } ] },
            { trigger: "AL_EQUIPAR",
              mientrasEquipado: { atk: 2, def: 2 },
              efectos: [
                { op: "ELEGIR", de: "ALIADOS", zona: "VANGUARDIA", filtros: [ { campo: "type", op: "==", valor: "Personaje" }, { campo: "name", op: "contieneTexto", valor: "Karlos" } ], cantidad: 1,
                  titulo: "¿QUIÉN EMPUÑA LA SHICHISHITO?",
                  efectos: [
                    { op: "MARCAR_JUGADOR", campo: "hasUsedShichishito", valor: true },
                    { op: "EQUIPAR",
                      floats: [ { texto: "SHICHISHITO", estilo: "ft-ability", offset: -40 }, { texto: "+2 ATQ / +2 DEF", estilo: "ft-green", offset: -20 } ],
                      log: "{objetivo} empuña la legendaria arma Shichishito." } ] } ] }
        ],
    },
    {
        name: "Kami", hp: 3, def: 9, atk: 9, type: "Personaje", subtype: "Ser vivo", tags: ["Usuaria de VP"], gender: "F", rarity: "S", cost: 0, series: 1,
        isAvatar: true, 
        text: "P: AVATAR: Inmune a TODO. No puede ser objetivo. Fin de tu turno: pierde 1 Vida. A: SACRIFICIO EQUIVALENTE (1F): Requiere otro aliado en vanguardia. Destruye un aliado de vanguardia y un enemigo.",
        passiveName: "AVATAR", activeName: "SACRIFICIO EQUIVALENTE", activeCost: 1,
        onEndTurn: async function(card, game) {
            if (card.owner === game.activePlayerId) {
                game.logMsg(`¡${card.passiveName}! Kami pierde 1 Vida por manifestarse en este mundo.`, 'ability');
                // Hemos añadido 'avatar_passive' al final para que traspase su propia inmunidad
                game.modifyStat(card, 'currentHp', -1, -30, 'avatar_passive');
                await game.checkDeath(card); // <--- ELIMINADO EL 'false' AQUÍ
            }
        },
        // BUG REAL PREEXISTENTE encontrado en el betasteo de esta migración (31-jul-2026, no
        // introducido por ella): la vieja (código imperativo original, todavía vivo en
        // cartas_antes_de_dsl.js) NUNCA podía completar SACRIFICIO EQUIVALENTE. Su
        // onExecuteAbility fija `ctx.targetType:'ally'` para TODA la selección, pero la
        // Habilidad necesita un aliado en el 1er clic y un ENEMIGO en el 2º; el gate genérico
        // de seguridad en index.html (handleCardClick, "if (isValid && ctx.targetType==='ally'
        // && card.owner !== this.selectedCard.owner) isValid=false;") ignora lo que el propio
        // onValidateTarget de Kami ya validaba bien, y bloquea el 2º clic sin más — la
        // Habilidad se queda atascada para siempre tras el primer objetivo. Esta migración lo
        // arregla DE ENCIMA: al usar ELEGIR/pickBoardTargets (dos llamadas independientes, cada
        // una con su propio pool ALIADOS/ENEMIGOS) en vez del flujo RAW de abilityContext, ese
        // gate genérico ni se toca. No se ha tocado el gate en sí (arreglarlo ahí afectaría a
        // CUALQUIER carta que dependa de esa red de seguridad; fuera de alcance de esta tanda,
        // y ya no hace falta para Kami). La vieja (congelada, nunca se edita) sigue con el bug
        // para siempre — es la base de comparación histórica, no el juego en vivo.
        // SACRIFICIO EQUIVALENTE migrada (31-jul-2026): dos ELEGIR secuenciales (1º aliado de
        // vanguardia propia, 2º enemigo), destruyendo con `vaciar+sinRetribucion+comprobarMuerte`
        // — el mismo canal de "destrucción directa" que ya usa Cañón de positrones, sin op nuevo.
        // OJO: el requisito de "otro aliado" pide >=1, no >=2 — `count:{quien:"ALIADO"}`
        // EXCLUYE Avatares por defecto (Kami: intocable, `_pool`), así que Kami misma NUNCA
        // cuenta en este recuento; >=1 ya significa "hay otro aliado además de mí".
        //
        // EJECUCIÓN DIFERIDA (betasteo de Toto, 31-jul-2026). El primer intento destruía al
        // aliado nada más elegirlo, ANTES de elegir al enemigo: si cancelabas en el 2º paso el
        // aliado ya estaba muerto sin remedio, así que ese paso tuvo que marcarse
        // `cancelable:false`. Mal: la norma del proyecto es que mientras siga una cadena de
        // elecciones y NADA haya cambiado aún en el tablero, se pueda cancelar en cualquier
        // punto y no ocurra nada. Ahora el PASO 1 solo ANOTA a quién se sacrificará
        // (`guardaIdsEnSelf`, sin efectos), y TODO se ejecuta dentro del PASO 2, ya con los dos
        // objetivos en mano. Con `costeDiferido` el Furor tampoco se cobra hasta entonces, así
        // que cancelar en cualquiera de los dos pasos deja la partida intacta (ni Furor, ni
        // acción gastada). No hizo falta tocar el compilador de ELEGIR: un ELEGIR con
        // `cantidad:N` YA recoge los N objetivos antes de ejecutar nada; lo que rompía la regla
        // era encadenar DOS ELEGIR con efectos en el primero, no el mecanismo en sí.
        abilities: [
            // Sin `costeDiferido` explícito: la norma del coste lo deduce sola (su primer efecto
            // es un ELEGIR cancelable). Y sin FLOTANTE a mano: el anuncio automático de la Activa
            // ya cae en el instante irreversible — declararlo aquí lo pintaba DOS veces
            // (Toto, 7-ago-2026: "SACRIFICIO EQUIVALENTE LITERALMENTE es el nombre de la Activa").
            { trigger: "ACTIVA", nombre: "SACRIFICIO EQUIVALENTE", coste: { furor: 1 }, sinObjetivo: true,
              requisitos: [
                { count: { quien: "ALIADO", zona: "vanguardia" }, op: ">=", valor: 1, msg: "Necesitas otro aliado en la vanguardia para el sacrificio." },
                { count: { quien: "ENEMIGO" }, op: ">=", valor: 1, msg: "No hay enemigos a los que aniquilar." } ],
              efectos: [
                { op: "ELEGIR", de: "ALIADOS", zona: "VANGUARDIA", cantidad: 1,
                  titulo: "PASO 1: Elige un aliado de TU vanguardia para sacrificar",
                  guardaIdsEnSelf: "kamiSacrificio" },
                { op: "ELEGIR", de: "ENEMIGOS", cantidad: 1,
                  titulo: "PASO 2: Elige un enemigo para aniquilar",
                  efectos: [
                    { op: "MODIFICAR_STAT", target: { selfLista: "kamiSacrificio" }, stat: "currentHp",
                      vaciar: true, sinRetribucion: true, comprobarMuerte: true,
                      log: "¡SACRIFICIO EQUIVALENTE! Kami sacrifica a {objetivo}." },
                    { op: "MODIFICAR_STAT", stat: "currentHp", vaciar: true, sinRetribucion: true, comprobarMuerte: true,
                      log: "¡SACRIFICIO EQUIVALENTE aniquila por completo a {objetivo}!" } ] } ] }
        ],
    },
    {
        name: "Apagón", type: "Evento", rarity: "C", cost: 1, duration: 2, series: 1, 
        text: "2 turnos. Mientras esté en juego, ambos jugadores echan una moneda al intentar un ataque normal o especial: con cruz, el ataque falla y el atacante gasta su acción del turno.",
        abilities: [
            { trigger: "PREVIEW_GLOBAL", lineas: [ { quien: "CUALQUIERA", soloTipos: ["Personaje", "Esbirro"], exentoPlantilla: "immuneToApagon", texto: "Sus ataques requieren moneda: con cruz fallan y gastan la acción" } ] },
            { trigger: "AL_JUGAR", log: "¡Las luces se apagan en todo el campo! El combate es un caos." },
            { trigger: "GLOBAL_ANTES_DE_ATAQUE",
              exentoPlantilla: "immuneToApagon",
              log: { msg: "¡APAGÓN interfiere! Lanzando moneda para el ataque de {atacante}...", tipo: "system" },
              moneda: {
                cruz: { log: { msg: "Moneda: CRUZ - ¡El ataque de {atacante} falla en la oscuridad!", tipo: "neutral" },
                        agotarAtacante: true, resultado: "BLOQUEAR" },
                cara: { log: { msg: "Moneda: CARA - El ataque logra iluminar el camino.", tipo: "ability" },
                        resultado: "PERMITIR" },
                sinResultado: "BLOQUEAR"
              } },
            { trigger: "AL_CADUCAR", log: "Vuelve la luz. El Apagón ha terminado.", logTipo: "system" }
        ]
    },
    {
        name: "Simon", hp: 5, def: 5, atk: 5, type: "Personaje", subtype: "Ser vivo", tags: ["Draconiano", "cyborg"], gender: "M", rarity: "A", cost: 0, series: 1,
        canAttackStealth: true,
        immuneToApagon: true,
        text: "P: OJO BIÓNICO: Puede atacar a enemigos Ocultos de vanguardia. Inmune a 'Apagón'. A: ÚLTIMA RESISTENCIA (3F): Ataca normal. Tras atacar, oculta al resto de tu vanguardia durante el próximo turno rival.",
        passiveName: "OJO BIÓNICO", activeName: "ÚLTIMA RESISTENCIA", activeCost: 3,
        
        canActivateAbility: function(card, game) {
            if (card.furor < 3) { game.logMsg("Falta Furor (3).", 'system'); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            if (game.players[enemyId].vanguard.length === 0) return false;
            return true;
        },
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 1, name: 'ÚLTIMA RESISTENCIA', targetType: 'enemy' };
            game.isActionLocked = true;
            game.logMsg("Elige objetivo para la Última Resistencia.", 'system');
            game.render();
        },
        onValidateTarget: function(card, target, game, isSilent) {
            if (target.location !== 'vanguard') { if (!isSilent) game.logMsg("Debe ser de vanguardia."); return false; }
            if (getCardTemplate(target.id).isAvatar) return false;
            return true;
        },
        onTargetsReady: async function(card, game) {
            const target = game.abilityContext.targets[0];
            game.modifyStat(card, 'furor', -3);
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);
            game.logMsg(`¡Simon lanza su ÚLTIMA RESISTENCIA!`, 'ability');
            
            await game.performAttack(card, target);
            
            game.logMsg(`El humo de su arma cubre al resto de la vanguardia.`, 'ability');
            const p = game.players[card.owner];
            
            p.vanguard.forEach(c => {
                if (c.instanceId !== card.instanceId) {
                    if (!c.tempEffects) c.tempEffects = [];
                    c.tempEffects.push({ sourceId: card.id, ownerId: card.owner });
                    showFloatingText(c.instanceId, "OCULTO", "ft-gray", -20);
                }
            });
            game.updatePassives();
        },
        onUpdateTempEffect: function(target, effect, game) {
            target.stealth = true;
        },
        onStartTurnTempEffect: function(target, effect, game, currentTurnPlayerId) {
            if (currentTurnPlayerId === effect.ownerId) {
                game.logMsg(`${game.getCardNameWithOwner(target)} sale del humo creado por Simon.`, 'system');
                return false; 
            }
            return true;
        }
    },
    {
        name: "Cogorza", type: "Evento", cost: 1, rarity: "C", series: 1,
        text: "2 turnos. Al colocarla, aumenta en 2 la Def de cada aliado de tu vanguardia actual mientras dure, y echa una moneda por cada uno: con cruz, ese aliado queda Confuso 2 turnos. Al expirar, cura 1 de Vida a cada aliado de tu vanguardia afectado por esta carta.",
        duration: 2,
        // Migrada (31-jul-2026). La auditoría la había marcado como "necesita pieza nueva" por
        // creer que el DSL no sabía lanzar UNA MONEDA POR MIEMBRO de un grupo. Falso: al leer
        // `_runEffectList` de cerca, ya itera el pool y llama a `_doEffect` una vez por objetivo,
        // así que un `MONEDA` con `target` de grupo tira una moneda por cada uno y sus ramas
        // reciben ESE objetivo. Solo faltaban dos piezas, ambas pequeñas y reutilizables:
        //   · `guardaIdsEnSelf` en un efecto normal (ELEGIR ya lo tenía): apunta a quién alcanzó
        //     el pool, para que el +2 DEF y la curación al expirar vayan a "los que bebieron" y
        //     no a "quien esté en vanguardia en ese momento".
        //   · `stats` en AURA: bono continuo de Atq/Def, además de los campos que ya marcaba.
        // La curación al expirar usa MODIFICAR_STAT y no CURAR a propósito: CURAR siempre pinta
        // su propio flotante ('CURADO') y la vieja no lo hacía — con MODIFICAR_STAT sale solo el
        // "+1 VIDA" automático, igual que antes. `ifObjetivo` cubre el "solo si está herido"
        // (mismo patrón que CHUPAALMAS de Valafar).
        abilities: [
            { trigger: "AL_JUGAR",
              efectos: [
                { op: "FLOTANTE", target: { quien: "ALIADO", zona: "VANGUARDIA" }, guardaIdsEnSelf: "affectedAllies",
                  texto: "+2 DEF", estilo: "ft-green", offset: -20 },
                { op: "MONEDA", target: { selfLista: "affectedAllies" },
                  log: "Echando moneda de la Cogorza para {objetivo}...", logTipo: "system",
                  logCara: { msg: "¡CARA! {objetivo} aguanta bien la bebida.", tipo: "neutral" },
                  logCruz: { msg: "¡CRUZ! {objetivo} se emborracha y queda {objetivoG?Confuso|Confusa}.", tipo: "ability" },
                  // Sin `fuente`: por defecto es sourceCard (la propia Cogorza), lo que deja
                  // sourceInstanceId puesto y por tanto el "Afectado por:" con formato completo
                  // ("evento Cogorza [n] de Jx"). Poner `fuente:"Cogorza"` a mano (bug mío,
                  // 31-jul-2026, betasteo de Toto) pasaba un STRING plano: sourceInstanceId se
                  // quedaba null y refCarta() nunca llegaba a construir la línea.
                  cruz: [ { op: "APLICAR_ESTADO", estado: "confusion", duracion: 2 } ] } ] },
            { trigger: "AURA", quien: "ALIADO", soloSelfLista: "affectedAllies", stats: { def: 2 } },
            { trigger: "AL_CADUCAR", resumenFase: "Al expirar, cura 1 de Vida a cada aliado de su vanguardia", 
              efectos: [
                { op: "MODIFICAR_STAT", stat: "currentHp", delta: 1, offsetY: -20, fuente: "Cogorza",
                  target: { selfLista: "affectedAllies" },
                  ifObjetivo: { campo: "currentHp", op: "<", valorCampo: "maxHp" },
                  log: "{objetivo} se recupera de la resaca y cura 1 de Vida.", logTipo: "healing" } ] }
        ],
    },
    {
        name: "Infusión de maná", type: "Ayuda", subtype: "Técnica", tags: ["Equipable"], cost: 1, rarity: "B", series: 1,
        text: "Coste: 2 de Furor. Anéxasela al aliado que tributó: todos sus ataques normales cuentan como especiales mientras la lleve.",
        abilities: [
            { trigger: "JUGAR", requisitos: [
                { count: { filtros: [ { campo: "furor", op: ">=", valor: 2 } ] }, op: ">=", valor: 1, msg: "No tienes ningún aliado con 2 o más de Furor para pagar el coste." } ] },
            // Mismo camino unico que Espada V y las otras ocho (ver su nota).
            { trigger: "AL_EQUIPAR",
              efectos: [
                { op: "ELEGIR", de: "ALIADOS", cantidad: 1,
                  filtros: [ { campo: "furor", op: ">=", valor: 2 } ],
                  titulo: "¿QUIÉN CANALIZA EL MANÁ?",
                  efectos: [
                    { op: "MODIFICAR_STAT", stat: "furor", delta: -2, esCoste: true,
                      log: "¡{objetivo} canaliza maná puro y se equipa con {carta}!" },
                    { op: "EQUIPAR" } ] } ] }
        ],
        onEquipUpdate: function(equipCard, hostCard, game) {
            // Gracias al cambio en index.html, esta bandera hace el trabajo sucio
            hostCard.treatAttacksAsSpecial = true; 
        }
    },
    {
        name: "Caza del tesoro", type: "Evento", cost: 2, rarity: "B", series: 1,
        text: "2 turnos. Al expirar, busca en tu mazo una carta 'Ayuda - Arma', 'Ayuda - Arma legendaria' o 'Ayuda - Vestimenta', añádela a tu mano y baraja; tu rival puede hacer lo mismo.",
        duration: 2,
        abilities: [
            { trigger: "AL_JUGAR", log: "¡{jugador} ha iniciado una Caza del tesoro!", logTipo: "system" },
            { trigger: "AL_CADUCAR", resumenFase: "Al expirar, ambos jugadores pueden buscar un Arma, Arma legendaria o Vestimenta en su mazo", log: "¡La Caza del tesoro ha concluido!", logTipo: "ability",
              efectos: [
                { op: "BUSCAR", en: "MAZO", deQuien: "AMBOS", cantidad: 1, destino: "MANO", sinAnimacion: true, autoSeleccion: true,
                  filtros: [ { campo: "type", op: "==", valor: "Ayuda" } ],
                  algunFiltro: [ { campo: "subtype", op: "==", valor: "Arma" }, { campo: "subtype", op: "==", valor: "Arma legendaria" }, { campo: "subtype", op: "==", valor: "Vestimenta" } ],
                  preguntarSiempre: true,
                  confirmar: { titulo: "{jugador}: ¿BUSCAR RECOMPENSA?", si: "SÍ, BUSCAR EN EL MAZO", no: "NO BUSCAR", logNo: "{jugador} decide no buscar recompensa." },
                  titulo: "{jugador}: Elige tu recompensa",
                  log: "{jugador} ha encontrado un tesoro y lo añade a su mano.", logTipo: "system",
                  logSinEleccion: "{jugador} no cogió nada.",
                  logNoValidas: "{jugador} no tiene equipamiento en su mazo.",
                  barajarDespues: { log: "Barajando el mazo de {jugador}..." } } ] }
        ],
    },
    {
        name: "Espada V", type: "Ayuda", subtype: "Arma", tags: ["melé"]  /* PENDIENTE: falta "Equipable" por consistencia; anadirlo destapa una divergencia con la base congelada (los tags no llegan a la instancia equipada en la nueva). Ver informe del 18-ago-2026. */, cost: 1, rarity: "B", series: 1,
        // Requisito visible: a quién señala la flecha lima al presentarse (§14.bis).
        requisitoVisible: [ { quien: "ALIADO", filtros: [ { campo: "type", op: "==", valor: "Personaje" } ], algunFiltro: [ { campo: "name", op: "contieneTexto", valor: "Karlos" }, { campo: "name", op: "==", valor: "Agah" } ], uno: true } ],
        text: "Requisito: un Personaje aliado 'Karlos' o 'Agah'. Anéxasela a ese aliado: +2 de Atq mientras la lleve. Sólo puedes usar esta carta una vez por partida.",
        abilities: [
            { trigger: "JUGAR", requisitos: [
                { de: "JUGADOR", campo: "espadaV_Used", op: "falsy", msg: "Ya has empuñado la Espada V en esta partida." },
                { count: { filtros: [ { o: [ [ { campo: "name", op: "contieneTexto", valor: "Karlos" } ], [ { campo: "name", op: "contieneTexto", valor: "Agah" } ] ] } ] }, op: ">=", valor: 1, msg: "No hay ningún Karlos ni Agah aliado en el campo." } ] },
            // UN SOLO CAMINO PARA EQUIPARSE (Toto, 16-ago-2026). Esta carta iba por
            // AL_USAR_AYUDA + `soloAnexar`, donde el op solo anexa y de la mano y el `location` se
            // encarga el motor de Ayudas; las otras ocho van por AL_EQUIPAR + ELEGIR, donde el op
            // lo hace todo. Hacían lo mismo: la división era historica -su version imperativa
            // usaba targeting en tablero y la migracion la replico fiel en vez de unificarla-, y
            // tener dos flujos para lo mismo ya costo un bug (el retarget de la presentacion al
            // portador vivia solo en uno de los dos). Ahora las diez van por el mismo sitio.
            { trigger: "AL_EQUIPAR",
              mientrasEquipado: { atk: 2 },
              efectos: [
                { op: "ELEGIR", de: "ALIADOS", cantidad: 1,
                  filtros: [ { o: [ [ { campo: "name", op: "contieneTexto", valor: "Karlos" } ], [ { campo: "name", op: "contieneTexto", valor: "Agah" } ] ] } ],
                  titulo: "¿QUIÉN EMPUÑA LA ESPADA V?",
                  efectos: [
                    { op: "MARCAR_JUGADOR", campo: "espadaV_Used", valor: true },
                    { op: "EQUIPAR",
                      log: "{objetivo} empuña la mítica Espada V." } ] } ] }
        ],
    },
    {
        name: "Kazuo", hp: 3, def: 5, atk: 5, type: "Personaje", subtype: "Ser vivo", tags: ["Samurái"], gender: "M", rarity: "A", cost: 4, series: 1,
        text: "P: BÚSQUEDA DE MAESTRO: Sólo colocable si tienes otro aliado en campo. Al colocar: anéxale un aliado del campo (+2 Atq mientras dure la unión). A: TSUBAMEGAESHI (2F): Realiza 3 ataques normales (máx 2 al mismo objetivo). No puedes atacar directo con los sobrantes.",
        passiveName: "BÚSQUEDA DE MAESTRO", activeName: "TSUBAMEGAESHI", activeCost: 2,
        // Sin annexEffectText (Toto, 27-jul-2026): ese campo es para lo que la unión provoca en
        // el ANEXADO (el zombi de Sadame). El +2 Atq lo recibe Kazuo, y su propia línea de stats
        // ya lo declara ("+2 ATQ por BÚSQUEDA DE MAESTRO, fuente: esta carta"): sería duplicarlo.
        // El gate de colocación (necesita OTRO aliado ya en campo) se queda imperativo:
        // es un booleano trivial, no compensa una nueva pieza de DSL solo para esto
        // (Toto, 27-jul-2026 — arquitectura de anexo). El resto (elegir maestro/a y
        // anexar, +2 Atq mientras dure) sí se migra: ver abilities más abajo.
        onBeforePlayAsync: async function(card, game, p) {
            const allies = [...p.vanguard, ...p.rearguard].filter(c => !getCardTemplate(c.id).isAvatar);
            if (allies.length === 0) {
                game.logError("Kazuo necesita a un maestro en el campo para ser colocado.");
                return false;
            }
            return true;
        },
        // ANEXAR (Toto, 27-jul-2026): reemplaza el modal genérico (openVisualSearchModal)
        // por selección en tablero (reborde verde), norma del proyecto para elegir un
        // aliado YA EN EL CAMPO — el imperativo violaba esa norma. anexoValido en la
        // PASIVA_CONTINUA sustituye al onUpdatePassive a mano (mismo criterio: maestro
        // vivo, en mesa y con el vínculo intacto; si se rompe, limpia attachments sola).
        abilities: [
            { trigger: "AL_JUGAR", efectos: [
                { op: "ELEGIR", de: "ALIADOS", cantidad: 1, excluirSelf: true,
                  titulo: "Elige a tu maestro/a", guardaEn: "maestro",
                  logDespues: "¡Kazuo reconoce a {maestro} como su {maestroG?maestro|maestra} y luchará por {maestroG?él|ella}!",
                  efectos: [ { op: "ANEXAR" } ] } ] },
            { trigger: "PASIVA_CONTINUA", nombre: "BÚSQUEDA DE MAESTRO", silencioso: true,
              if: { anexoValido: true },
              then: [ { op: "MODIFICAR_STAT", stat: "atk", delta: 2 } ] }
        ],
        canActivateAbility: function(card, game) {
            if (card.furor < (card.activeCost || 1)) { game.logError(`Falta Furor.`); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            
            // Verificamos que al menos haya un enemigo en vanguardia que NO esté en sigilo
            const validEnemies = game.players[enemyId].vanguard.filter(c => !c.stealth);
            
            if (validEnemies.length === 0) { 
                game.logError("No hay enemigos válidos (sin Ocultarse) en la vanguardia para aplicar el Tsubamegaeshi."); 
                return false; 
            }
            return true;
        },
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 3, name: 'TSUBAMEGAESHI', targetType: 'enemy', canStopEarly: true, isNormalAttack: true };
            game.isActionLocked = true;
            game.logError("Selecciona hasta 3 veces a enemigos para cortar. (Click en OK si no hay más enemigos viables).");
            game.render();
        },
        onValidateTarget: function(card, target, game, isSilent) {
            const ctx = game.abilityContext;
            if (target.owner === card.owner) return false;
            if (target.location !== 'vanguard') {
                if (!isSilent) game.logError("Debes elegir enemigos en la vanguardia.");
                return false;
            }
            if (getCardTemplate(target.id).isAvatar) return false;
            
            // Límite de 2 golpes al mismo objetivo
            const count = ctx.targets.filter(t => t.instanceId === target.instanceId).length;
            if (count >= 2) {
                if (!isSilent) game.logError("Kazuo no puede golpear al mismo objetivo más de 2 veces.");
                return false;
            }
            return true;
        },
        onTargetsReady: async function(card, game) {
            const targets = game.abilityContext.targets;
            if (targets.length === 0) {
                game.isActionLocked = false;
                game.cancelAction();
                return;
            }
            
            game.modifyStat(card, 'furor', -2);
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);
            game.logMsg(`¡Kazuo desata su letal Tsubamegaeshi! (${targets.length} cortes)`, 'ability');
            
            for (let i = 0; i < targets.length; i++) {
                // 1. ¿Sigue Kazuo vivo y en el campo antes de dar este tajo?
                if (card.currentHp <= 0 || (card.location !== 'vanguard' && card.location !== 'rearguard')) break;

                // 2. Refrescamos el objetivo
                const currentTarget = game.findCard(targets[i].instanceId);
                
                // 3. ¿Sigue el objetivo vivo Y en el campo?
                if (currentTarget && (currentTarget.location === 'vanguard' || currentTarget.location === 'rearguard') && currentTarget.currentHp > 0) {
                    game.logMsg(`Corte ${i+1} a ${game.getCardNameWithOwner(currentTarget)}...`, 'combat');
                    
                    await game.performAttack(card, currentTarget);
                    await game.sleep(300);
                } else {
                    game.logMsg(`Corte ${i+1} lanzado al aire: el objetivo ya no está ahí.`, 'combat');
                }
            }
            
            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.updatePassives();
            game.render();
        }
    },
    {
        name: "Unmei", hp: 5, def: 7, atk: 4, type: "Personaje", subtype: "Ser vivo", tags: ["Ninja"], gender: "M", rarity: "B", cost: 1, series: 1,
        text: "A: MULTIPLICACIÓN DE CUERPO (4F): Crea un 'Clon de Unmei' en el campo: copia su Atq y Def en todo momento, tiene Vida propia y no gana Furor. Si Unmei muere, el clon se desvanece sin dar Retribución.",
        activeName: "MULTIPLICACIÓN DE CUERPO", activeCost: 4,
        canActivateAbility: function(card, game) {
            if (card.furor < 4) { game.logError("Falta Furor (4)."); return false; }
            
            const p = game.players[card.owner];
            if (p.vanguard.length >= 4 && p.rearguard.length >= 4) {
                game.logError("No tienes espacio en tu campo para materializar el clon.");
                return false;
            }
            return true;
        },
        onExecuteAbility: async function(card, game) {
            game.modifyStat(card, 'furor', -4);
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);
            
            const p = game.players[card.owner];
            
            // Buscamos un hueco: prioridad a vanguardia, luego retaguardia
            let targetZone = 'vanguard';
            if (p.vanguard.length >= 4) targetZone = 'rearguard';
            
            game.logMsg(`¡${game.getCardNameWithOwner(card)} traza unos sellos con las manos y se multiplica!`, 'ability');
            
            // --- ¿Quién está usando esto? ¿Unmei o NoName? ---
            const cloneId = card.name === "NoName" ? 901 : 900;
            const clone = game.createCardInstance(cloneId, card.owner);
            
            clone.parentId = card.instanceId; 
            clone.location = targetZone;
            
            clone.maxHp = card.maxHp;
            clone.currentHp = card.maxHp; 
            
            // --- SISTEMA DE ANEXO REAL (Vínculo morado) ---
            if (!card.attachments) card.attachments = [];
            card.attachments.push(clone.instanceId);
            clone.attachedTo = card.instanceId;
            
            p[targetZone].push(clone);
            
            // Efecto visual rápido de temblor
            const el = document.querySelector(`.card[data-id="${card.instanceId}"]`);
            if (el) {
                el.classList.add('shaking');
                await game.sleep(400);
                el.classList.remove('shaking');
            }
            
            // --- LIBERAR EL BLOQUEO DE LA INTERFAZ ---
            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            
            game.updatePassives();
            game.render();
        }
    },
    {
        id: 900, name: "Clon de Unmei", hp: 5, def: 7, atk: 4, type: "Esbirro", subtype: "Ser vivo", tags: ["Ninja"], gender: "M", rarity: "B", cost: 0, series: 1,
        isToken: true, // Etiqueta clave para el motor
        reverseArrow: true, // <--- Hace que la flecha vaya del Clon hacia Unmei
        text: "Copia el Atq y Def de Unmei en todo momento. Tiene Vida propia, no gana Furor y no puede usar Habilidades. Si Unmei deja el campo, se desvanece.",
        // Migrado a DSL (trigger ESPEJO, 21-jul-2026). Unmei sigue creando el clon de
        // forma imperativa (MULTIPLICACIÓN DE CUERPO) y le fija parentId; el clon en sí
        // ya es declarativo.
        abilities: [{ trigger: "ESPEJO", de: "parentId", copiar: ["currentAtk", "currentDef"], furorCero: true, muerteSiSinPadre: true }]
    },
    {
        name: "Flash de maná", type: "Ayuda", subtype: "Mágico", rarity: "B", cost: 1, series: 1,
        text: "Coste: 2 de Furor o bien 1 de Furor si paga Eris. Consumible. Ciega a todos los enemigos de la vanguardia durante 2 turnos.",
        abilities: [
            { trigger: "JUGAR", requisitos: [
                { count: { filtros: [ { o: [ [ { campo: "furor", op: ">=", valor: 2 } ], [ { campo: "name", op: "contieneTexto", valor: "Eris" }, { campo: "furor", op: ">=", valor: 1 } ] ] } ] }, op: ">=", valor: 1, msg: "No tienes aliados con suficiente Furor para pagar (2, o 1 si es Eris)." } ] },
            { trigger: "AL_USAR_AYUDA",
              requisitosObjetivo: [
                { o: [ [ { campo: "furor", op: ">=", valor: 2 } ], [ { campo: "name", op: "contieneTexto", valor: "Eris" }, { campo: "furor", op: ">=", valor: 1 } ] ], msg: "Este aliado necesita al menos 2 de Furor (o 1 si es Eris)." } ],
              efectos: [
                { op: "MODIFICAR_STAT", stat: "furor", delta: -2, esCoste: true, deltaCondicional: [ { filtro: { campo: "name", op: "contieneTexto", valor: "Eris" }, delta: -1 } ],
                  log: "¡{objetivo} desata un Flash de maná cegador!" },
                { op: "APLICAR_ESTADO", estado: "ceguera", duracion: 2, fuente: "Flash de maná",
                  target: { quien: "ENEMIGO", zona: "VANGUARDIA" },
                  logSiVacio: "No había enemigos válidos en la vanguardia." } ] }
        ],
    },
    {
        name: "Granada de maná", type: "Ayuda", subtype: "Mágico", rarity: "C", cost: 1, series: 1,
        text: "Coste: 2 de Furor o bien 1 de Furor si paga Eris. Consumible, a distancia. Quita 1 de Vida a dos enemigos de la vanguardia, independientemente de su Def.",
        abilities: [
            { trigger: "JUGAR", requisitos: [
                { count: { filtros: [ { o: [ [ { campo: "furor", op: ">=", valor: 2 } ], [ { campo: "name", op: "contieneTexto", valor: "Eris" }, { campo: "furor", op: ">=", valor: 1 } ] ] } ] }, op: ">=", valor: 1, msg: "No tienes aliados con suficiente Furor." } ] },
            { trigger: "AL_USAR_AYUDA",
              requisitosObjetivo: [
                { o: [ [ { campo: "furor", op: ">=", valor: 2 } ], [ { campo: "name", op: "contieneTexto", valor: "Eris" }, { campo: "furor", op: ">=", valor: 1 } ] ], msg: "Este aliado necesita al menos 2 de Furor (o 1 si es Eris)." } ],
              efectos: [
                { op: "MODIFICAR_STAT", stat: "furor", delta: -2, esCoste: true, deltaCondicional: [ { filtro: { campo: "name", op: "contieneTexto", valor: "Eris" }, delta: -1 } ],
                  guardaNombre: "pagador" },
                { op: "ELEGIR", de: "ENEMIGOS", zona: "VANGUARDIA", cantidad: 2, hastaCantidad: true,
                  titulo: "Elige hasta 2 enemigos para la Granada de maná",
                  logSiVacio: "¡{pagador} lanza la Granada de maná, pero no hay objetivos en vanguardia!",
                  logAntes: "¡{pagador} hace explotar la Granada de maná!",
                  efectos: [ { op: "MODIFICAR_STAT", stat: "currentHp", delta: -1, comprobarMuerte: true,
                               animacion: "DANO_VERDADERO",
                               floating: { texto: "DAÑO VERDADERO", estilo: "ft-purple", offset: -30 } } ] } ] }
        ],
    },
    {
        name: "Hexagrama", type: "Ayuda", subtype: "Mágico", tags: ["Consumible"], rarity: "B", cost: 1, series: 1,
        text: "Coste: 1 de Furor. Busca en tu mazo cualquier carta con etiqueta 'Invocación' y añádela a tu mano. Baraja tu mazo.",
        abilities: [
            { trigger: "JUGAR", requisitos: [ { count: { filtros: [ { campo: "furor", op: ">=", valor: 1 }, { campo: "isAvatar", op: "falsy", dePlantilla: true } ] }, op: ">=", valor: 1, msg: "No tienes aliados con al menos 1 de Furor para tributar." } ] },
            { trigger: "AL_USAR_AYUDA",
              requisitosObjetivo: [
                { campo: "isAvatar", op: "falsy", dePlantilla: true, msg: "Debes elegir a uno de tus aliados." },
                { campo: "furor", op: ">=", valor: 1, msg: "Este aliado necesita al menos 1 de Furor para tributar." } ],
              efectos: [
                { op: "MODIFICAR_STAT", stat: "furor", delta: -1, esCoste: true },
                { op: "BUSCAR", en: "MAZO", cantidad: 1, destino: "MANO",
                  filtros: [ { campo: "tags", op: "includesCI", valor: "invocación" } ],
                  logIntro: "El Hexagrama brilla y permite a {jugador} buscar en su mazo...",
                  titulo: "HEXAGRAMA: Busca 1 Invocación",
                  log: "{jugador} añade {objetivo} a su mano.",
                  logNoValidas: "¡El Hexagrama fracasa! No quedan cartas de 'Invocación' en el mazo de {jugador}.",
                  barajarDespues: { log: "Barajando el mazo de {jugador}...", inclusoSinValidas: true } } ] }
        ],
    },
    {
        name: "Elemental sanador", hp: 3, def: 2, atk: 1, type: "Esbirro", subtype: "Ser mágico", rarity: "C", cost: 1, series: 1,
        text: "A: RECIEDAD (1F): Elimina todos los estados alterados que sufran tus aliados.",
        activeName: "RECIEDAD", activeCost: 1,
        abilities: [
            { trigger: "ACTIVA", nombre: "RECIEDAD", coste: { furor: 1 }, sinObjetivo: true,
              requisitos: [ { count: { algunEstado: ["dot", "confusion", "ceguera", "sueno"] }, op: ">=", valor: 1, msg: "Ninguno de tus aliados sufre estados alterados." } ],
              log: "¡El {carta} emite una luz purificadora que limpia a tus aliados!", logTipo: "ability",
              efectos: [
                { op: "LIMPIAR_ESTADOS", estados: ["dot", "confusion", "ceguera", "sueno"], floating: "LIMPIO", floatingStyle: "ft-green", offsetFloating: -20 } ] }
        ],
    },
    {
        name: "Valafar", hp: 4, def: 5, atk: 8, type: "Personaje", subtype: "Ser vivo", tags: ["Belfegor"], gender: "M", rarity: "S", cost: 1, series: 1,
        text: "Coste: 4 de Furor. P: CHUPAALMAS: Se cura 1 de Vida al hacer un ataque normal con éxito que quite >= 1 Vida. A: COMA (4F): Ataque especial a 2 enemigos de vanguardia. Les infunde Sueño 2 turnos.",
        passiveName: "CHUPAALMAS", activeName: "COMA", activeCost: 4,
        onBeforePlayAsync: async function(card, game, p) {
            const validAllies = [...p.vanguard, ...p.rearguard].filter(c => c.furor >= 4 && !getCardTemplate(c.id).isAvatar);
            if (validAllies.length === 0) {
                game.logError(`Necesitas un aliado con al menos 4 de Furor para invocar a ${card.name}.`);
                return false;
            }
            // Tributo elegido en el TABLERO (Toto, 7-ago-2026), como DSL.tributoFuror y el
            // resto de tributos. El cobro sigue siendo del motor vía tributeSourceId: aquí solo
            // cambia CÓMO se elige al pagador, no cuándo se le cobra.
            const chosen = await game.pickBoardTargets(validAllies, 1, `${card.name}: elige quién tributa 4 de Furor`, card, card.owner, true);
            if (chosen && chosen.length > 0) {
                card.tributeSourceId = chosen[0].instanceId;
                // Flecha de tributo al presentarse (§14.bis): de quién sale el Furor.
                DSL._marcarCoste(game, chosen[0], "tributo", "Tributa 4 FUR");
                return true;
            }
            return false;
        },
        // CHUPAALMAS migrada (31-jul-2026) con la extensión `siDanoMinimo` de TRAS_ATACAR
        // (umbral EXACTO, no solo "dañó algo" — el suelo de daño de 0.5, Esbirro-vs-Personaje,
        // no llega al ">= 1 Vida" que exige el texto) y `target:{quien:"SELF"}` (se cura a sí
        // mismo, no al defensor, que es el objetivo implícito por defecto de TRAS_ATACAR).
        // COMA migrada (31-jul-2026, betasteo de Toto): la vieja solo exigía 1 enemigo en
        // vanguardia para activarse y luego dejaba `canStopEarly` resolver con 1 o 2 según
        // lo clicado — un bug del código imperativo original, no un requisito real de la
        // carta (su propio texto dice "a 2 enemigos", como Bi-choque). Corregido a exigir
        // >=2 enemigos válidos ANTES de activar (mismo patrón que Bi-choque, `requisitos`
        // con `count`), con lo que la selección pasa a ser "exactamente 2, sin parada
        // anticipada" — el camino RAW de `target:{cantidad:2}` ya soportado por el
        // compilador de ACTIVA (ver DEVASTACIÓN AGAH, 2 ATACAR ya migrada), sin necesitar
        // ninguna arquitectura de canStopEarly.
        abilities: [
            { trigger: "TRAS_ATACAR", nombre: "CHUPAALMAS", soloAtaqueNormal: true, siDanoMinimo: 1,
              efectos: [
                { op: "MODIFICAR_STAT", stat: "currentHp", delta: 1, offsetY: -20, target: { quien: "SELF" },
                  ifObjetivo: { campo: "currentHp", op: "<", valorCampo: "maxHp" },
                  log: "¡CHUPAALMAS! {carta} devora la energía vital y se cura 1 de Vida.", logTipo: "healing" } ] },
            { trigger: "ACTIVA", nombre: "COMA", coste: { furor: 4 },
              target: { quien: "ENEMIGO", cantidad: 2 },
              requisitos: [
                { count: { quien: "ENEMIGO", zona: "vanguardia" }, op: ">=", valor: 2,
                  msg: "No hay suficientes enemigos en vanguardia para COMA." } ],
              log: "¡{carta} desata COMA sobre los enemigos!",
              efectos: [
                { op: "ATACAR", especial: true,
                  siExito: [
                    { op: "APLICAR_ESTADO", estado: "sueno", duracion: 2,
                      log: "{objetivo} cae en un profundo Sueño." } ] } ] }
        ],
    },
    {
        name: "Serafín", hp: 5, def: 4, atk: 8, type: "Esbirro", subtype: "Ser mágico", rarity: "S", cost: 1, series: 1,
        text: "Coste: 4 de Furor. P: MARAVILLA: Máximo 1 Serafín aliado en campo. Al colocar: cura 2 de Vida a tu vanguardia. A: CASTIGO (4F): Ataque especial a 3 enemigos de la vanguardia.",
        passiveName: "MARAVILLA", activeName: "CASTIGO", activeCost: 4,
        onBeforePlayAsync: async function(card, game, p) {
            const validAllies = [...p.vanguard, ...p.rearguard].filter(c => c.furor >= 4 && !getCardTemplate(c.id).isAvatar);
            if (validAllies.length === 0) {
                game.logError(`Necesitas un aliado con al menos 4 de Furor para invocar al ${card.name}.`);
                return false;
            }
            // Tributo en TABLERO (Toto, 7-ago-2026); gemela de la de Valafar, misma redacción.
            const chosen = await game.pickBoardTargets(validAllies, 1, `${card.name}: elige quién tributa 4 de Furor`, card, card.owner, true);
            if (chosen && chosen.length > 0) {
                card.tributeSourceId = chosen[0].instanceId;
                // Flecha de tributo al presentarse (§14.bis): de quién sale el Furor.
                DSL._marcarCoste(game, chosen[0], "tributo", "Tributa 4 FUR");
                return true;
            }
            return false;
        },
        onAfterPlayAsync: async function(card, game, p) {
            const serafines = [...p.vanguard, ...p.rearguard].filter(c => c.name === "Serafín" && c.instanceId !== card.instanceId);
            if (serafines.length > 0) {
                game.logMsg(`MARAVILLA: ¡Ya hay un Serafín aliado en el campo! Este nuevo Serafín no puede existir y se desvanece.`, 'system');
                card.currentHp = 0;
                await game.checkDeath(card, false);
                return; 
            }
            
            let healed = false;
            p.vanguard.forEach(c => {
                if (c.currentHp < c.maxHp) {
                    const healAmount = Math.min(2, c.maxHp - c.currentHp);
                    game.modifyStat(c, 'currentHp', healAmount, -20, 'healing');
                    showFloatingText(c.instanceId, "MARAVILLA", "ft-green", -40);
                    healed = true;
                }
            });
            if (healed) game.logMsg(`¡La MARAVILLA de Serafín purifica y cura 2 de Vida a la vanguardia!`, 'healing');
        },
        // CASTIGO migrada (31-jul-2026, mismo fix que COMA/SANCIÓN): la vieja solo exigía 1
        // enemigo en vanguardia para activarse y dejaba `canStopEarly` resolver con 1-3
        // objetivos — el mismo bug de diseño, no un requisito real (el texto dice "a 3
        // enemigos"). `requisitos` exige >=3 antes de activar; con esa garantía la selección
        // es "exactamente 3, sin parada anticipada", camino RAW ya soportado por el
        // compilador de ACTIVA. MARAVILLA (Pasiva: cura 2 a la vanguardia al colocarse, con
        // límite de 1 Serafín en campo) se queda imperativa: el autodestruir-si-hay-otro-igual
        // es un mecanismo propio sin precedente reutilizable, no compensa arquitectura nueva.
        abilities: [
            { trigger: "ACTIVA", nombre: "CASTIGO", coste: { furor: 4 },
              target: { quien: "ENEMIGO", cantidad: 3 },
              requisitos: [
                { count: { quien: "ENEMIGO", zona: "vanguardia" }, op: ">=", valor: 3,
                  msg: "No hay suficientes enemigos en vanguardia para CASTIGO." } ],
              log: "¡{carta} imparte su CASTIGO divino!",
              efectos: [ { op: "ATACAR", especial: true } ] }
        ],
    },
    {
        name: "Edrielle", hp: 3, def: 3, atk: 5, type: "Personaje", subtype: "Ser mágico", tags: ["Invocación", "diosa"], gender: "F", rarity: "B", cost: 1, series: 1,
        text: "Coste: 4 de Furor. P: BELLEZA INCOMPARABLE: Oculta permanentemente. Si es tu único aliado al inicio de tu turno, lanza moneda: Cruz = pierde Oculto este turno. A: TORMENTA PERFECTA (4F): Quita 2 de Vida (daño verdadero) a TODOS los enemigos.",
        passiveName: "BELLEZA INCOMPARABLE", activeName: "TORMENTA PERFECTA", activeCost: 4,
        
        onBeforePlayAsync: async function(card, game, p) {
            return await DSL.tributoFuror(card, game, p, 4, {
                msgSinPagador: "Necesitas un aliado con 4 de Furor para invocar a Edrielle.",
                titulo: 'TRIBUTO PARA EDRIELLE (-4 FUROR)' });
        },
        
        onStartTurn: async function(card, game) {
            // Comprueba si es el turno de su dueño
            if (card.owner !== game.activePlayerId) return;
            
            const p = game.players[card.owner];
            const totalAllies = p.vanguard.length + p.rearguard.length;
            
            // Si está sola ante el peligro
            if (totalAllies === 1) {
                game.logMsg(`¡${game.getCardNameWithOwner(card)} está sola en el campo! Su escondite flaquea...`, 'system');
                const results = await game.triggerCoinFlips(1, card.owner);
                
                if (results && results[0] === 'tails') {
                    card.edrielleExposed = true; // Marca que anula el sigilo
                    game.logMsg(`Moneda: CRUZ - ¡${game.getCardNameWithOwner(card)} queda expuesta a plena vista!`, 'ability');
                    showFloatingText(card.instanceId, "EXPUESTA", "ft-red-stat", -30);
                    // Fix (betasteo de Toto, 30-jul-2026): el badge de Oculto lo pinta render() a
                    // partir de card.stealth, y ese campo SOLO se recalcula en onUpdatePassive —
                    // sin este refresco explícito el badge aguantaba puesto hasta la siguiente
                    // pasada natural (Fase principal), o sea que el log y el flotante cantaban
                    // "EXPUESTA" mientras la carta seguía marcada como Oculta en el tablero.
                    game.updatePassives();
                    game.render();
                } else {
                    game.logMsg(`Moneda: CARA - ¡${game.getCardNameWithOwner(card)} logra mantenerse oculta en las sombras!`, 'neutral');
                    card.edrielleExposed = false;
                }
            } else {
                // Si invocaste a alguien el turno anterior, vuelve a estar a salvo
                card.edrielleExposed = false;
            }
        },

        onUpdatePassive: function(card, game) {
            const p = game.players[card.owner];
            const totalAllies = p.vanguard.length + p.rearguard.length;
            
            // Si hay guardaespaldas, reseteamos la exposición por si acaso
            if (totalAllies > 1) {
                card.edrielleExposed = false;
            }
            
            // La pasiva le da sigilo SOLO si no ha sido expuesta
            card.stealth = !card.edrielleExposed;
        },

        // ACTIVA migrada (30-jul-2026): sin selección — daño verdadero a TODOS los enemigos
        // (vanguardia+retaguardia) de una tacada, vía MODIFICAR_STAT con target:{quien:"ENEMIGO"}
        // (sin zona = las dos filas) — _runEffectList itera automáticamente sobre TODO el pool
        // resuelto, así que no hace falta ningún flag de "aplícalo a todos". Excluye Avatares
        // por defecto (Kami: intocable), igual que el `!isAvatar` a mano de la vieja.
        abilities: [
            { trigger: "ACTIVA", nombre: "TORMENTA PERFECTA", coste: { furor: 4 }, sinObjetivo: true,
              requisitos: [ { count: { quien: "ENEMIGO" }, op: ">=", valor: 1, msg: "No hay enemigos en el campo." } ],
              log: "¡{carta} desata una TORMENTA PERFECTA sobre todo el campo enemigo!",
              efectos: [
                { op: "MODIFICAR_STAT", stat: "currentHp", delta: -2, target: { quien: "ENEMIGO" }, comprobarMuerte: true,
                  animacion: "DANO_VERDADERO",
                  floating: { texto: "DAÑO VERDADERO", estilo: "ft-purple", offset: -30 } } ] }
        ],
    },
    {
        name: "Némesis", hp: 7, def: 7, atk: 8, type: "Personaje", subtype: "Ser vivo", tags: ["Diosa"], gender: "F", rarity: "S", cost: 2, series: 1,
        text: "Coste: Tu vanguardia llena, que se destruye al colocar esta carta. P: NACIMIENTO DE DIVINIDAD: Una vez por turno, puedes destruir un aliado para curarla 1 Vida. A: OBLITERACIÓN (3F): Ataque especial que ignora completamente la Def del enemigo.",
        passiveName: "NACIMIENTO DE DIVINIDAD", activeName: "OBLITERACIÓN", activeCost: 3,
        // Coste de colocación migrado (31-jul-2026). Usa JUGAR requisitos (vanguardia llena) +
        // Su vanguardia entera es el COSTE: cada una manda su flecha ámbar a Némesis mientras
        // espera en el centro, y solo entonces empiezan a caer. Se declara aquí y no en el efecto
        // porque el efecto corre DENTRO del escaparate, cuando las marcas ya se han consumido.
        costeVisible: [ { quien: "ALIADO", zona: "vanguardia" } ],
        // pausaEnEscaparate (Toto, 13-ago-2026): su coste son CARTAS DEL CAMPO que se destruyen,
        // y eso hay que verlo. La carta se queda enseñada y quieta en el centro mientras su
        // vanguardia se aniquila, y solo entonces viaja a su hueco. Su ZONA se decide DESPUÉS de
        // pagar (por eso `zonaSel` admite una función): al vaciarse la vanguardia deja de estar
        // llena, y decidirlo antes la mandaba a retaguardia. Ver §14.ter.
        // ANTES_DE_JUGAR (corre ANTES de colocar a Némesis, así que su propia vanguardia-
        // objetivo son solo las 4 cartas YA en el campo, ella misma no cuenta todavía) con
        // MODIFICAR_STAT `vaciar+sinRetribucion+comprobarMuerte` — el MISMO canal de
        // "destrucción directa" que ya usa Cañón de positrones, sin necesitar ningún op
        // "DESTRUIR" nuevo. `_pool` ya excluye Avatares por defecto (Kami intocable), así que
        // no hace falta filtrar isAvatar a mano. `log` en ANTES_DE_JUGAR era una pieza que
        // faltaba (sus hermanos AL_JUGAR/INICIO_TURNO/FIN_TURNO ya la tenían), añadida aquí.
        // Simplificación aceptada: la vieja pasaba `skipAnim:true` a checkDeath para que las 4
        // muertes no animen individualmente encima de animateMassiveSacrifice (coreografía
        // visual, invisible al harness); la nueva anima cada una por separado.
        //
        // OBLITERACIÓN y NACIMIENTO DE DIVINIDAD se quedan imperativas JUNTAS, a propósito:
        // comparten los mismos onValidateTarget/onTargetsReady (bifurcan por
        // ctx.name==='SACRIFICIO_NEMESIS'), y NACIMIENTO DE DIVINIDAD depende de
        // getCustomActions (botón extra fuera del flujo estándar) — migrar solo OBLITERACIÓN
        // dejaría el compilador sin poder generar su propio onExecuteAbility/onTargetsReady
        // (el guard genérico es "si ya existe la función, no la toques", y aquí YA existe por
        // culpa del sacrificio compartido) — la declaración quedaría muerta, sin ejecutarse
        // nunca. No compensa reescribir a mano el multiplexado solo para esta carta.
        abilities: [
            { trigger: "JUGAR", requisitos: [
                { count: { quien: "ALIADO", zona: "vanguardia" }, op: ">=", valor: 4,
                  msg: "Necesitas tener la vanguardia llena (4 aliados) para colocar a Némesis." } ] },
            { trigger: "ANTES_DE_JUGAR", pausaEnEscaparate: true,
              log: "¡Némesis desciende y aniquila a toda su propia vanguardia como tributo!",
              efectos: [
                // La flecha la declara `costeVisible` arriba, no un `esCoste` aquí: este efecto
                // corre DENTRO del escaparate y allí las marcas ya se han consumido.
                { op: "MODIFICAR_STAT", target: { quien: "ALIADO", zona: "VANGUARDIA" }, stat: "currentHp",
                  vaciar: true, sinRetribucion: true, comprobarMuerte: true } ] }
        ],
        onStartTurn: function(card, game) {
            card.nemesisHealUsed = false; // Reseteamos la habilidad pasiva
        },

        // --- EL NUEVO SISTEMA DE BOTONES EXTRA ---
        getCustomActions: function(card, game) {
            const alliesCount = [...game.players[card.owner].vanguard, ...game.players[card.owner].rearguard].length;
            
            // Solo devolvemos el botón si cumple las condiciones para curarse
            if (card.location === 'vanguard' && !card.nemesisHealUsed && alliesCount > 1 && card.currentHp < card.maxHp) {
                return [{
                    label: 'SACRIFICAR',
                    color: '#8b5cf6', // Morado Diosa
                    bottomOffset: '35px', // Lo subimos para que no pise al principal
                    action: () => {
                        game.selectedCard = card;
                        game.inputState = 'SELECT_ABILITY_TARGETS';
                        game.abilityContext = { targets: [], maxTargets: 1, name: 'SACRIFICIO_NEMESIS', targetType: 'ally' };
                        game.logError("Elige a un aliado para sacrificar y curar 1 de Vida a Némesis.");
                        game.render();
                    }
                }];
            }
            return [];
        },

        canActivateAbility: function(card, game) {
            if (card.furor < 3) { game.logError("Falta Furor (3)."); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            if (game.players[enemyId].vanguard.length === 0) { game.logError("No hay enemigos en vanguardia."); return false; }
            return true;
        },
        
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 1, name: 'OBLITERACIÓN', targetType: 'enemy' };
            game.logError("Elige un enemigo para OBLITERAR.");
            game.render();
        },
        
        onValidateTarget: function(card, target, game, isSilent) {
            const ctx = game.abilityContext;
            if (ctx.name === 'SACRIFICIO_NEMESIS') {
                if (target.owner !== card.owner || target.instanceId === card.instanceId) return false;
            } else {
                if (target.owner === card.owner || target.location !== 'vanguard') return false;
            }
            if (getCardTemplate(target.id).isAvatar) return false;
            return true;
        },
        
        onTargetsReady: async function(card, game) {
            const ctx = game.abilityContext;
            const target = ctx.targets[0];
            
            game.isActionLocked = true;
            game.inputState = 'EXECUTING';
            game.render();

            if (ctx.name === 'SACRIFICIO_NEMESIS') {
                game.logMsg(`¡Némesis consume a ${game.getCardNameWithOwner(target)} para curarse!`, 'ability');
                // Flotantes (betasteo de Toto, 31-jul-2026): "razón" (el nombre de la Pasiva que
                // lo provoca) sobre Némesis y DESTRUIDO/A sobre el aliado consumido — mismo
                // criterio y mismo orden que Kami. Ya no daba NINGÚN flotante: ponía currentHp=0
                // a mano, saltándose modifyStat por completo.
                showFloatingText(card.instanceId, card.passiveName, "ft-ability", -30);
                game.floatingDestruido(target);
                target.currentHp = 0;
                await game.checkDeath(target, false);
                
                // CORRECCIÓN: Cálculo de Vida faltante para no hacer "Cobrecura"
                const missingHp = card.maxHp - card.currentHp;
                if (missingHp > 0) {
                    const healAmount = Math.min(1, missingHp);
                    game.modifyStat(card, 'currentHp', healAmount, -20, 'healing');
                } else {
                    game.logMsg(`Némesis devora el alma, pero ya estaba a plena Vida.`, 'system');
                }
                
                card.nemesisHealUsed = true;
                
                game.isActionLocked = false;
                game.cancelAction();
                game.render();
                return;
            }

            // OBLITERACIÓN
            game.modifyStat(card, 'furor', -3);
            showFloatingText(card.instanceId, "OBLITERACIÓN", "ft-ability", -30);
            game.logMsg(`¡Némesis OBLITERA a ${game.getCardNameWithOwner(target)} ignorando su defensa!`, 'ability');
            
            // Ignora DEF: El daño es directamente el ATQ de Némesis
            await game.dealDamage(card, target, card.currentAtk, true);
            await game.sleep(400);
            await game.checkDeath(target);

            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.updatePassives();
            game.render();
        }
    },
    {
        name: "Frasco maldito", type: "Ayuda", subtype: "Mágico", tags: ["Consumible"], rarity: "C", cost: 1, series: 1,
        text: "Reacción. Puedes usarla antes de recibir un ataque normal. Baja en 2 el Atq del atacante hasta el inicio de tu próximo turno.",
        // Migrada a DSL (trigger REACCION sobre DAÑO, 22-jul-2026). La reacción es
        // declarativa (y así estrena el prompt con las cartas atacante→objetivo); el
        // efecto persistente -2 ATQ y su caducidad siguen en onUpdateTempEffect /
        // onStartTurnTempEffect imperativos (híbrido). El tempEffect lo empuja
        // MARCAR_TEMPORAL con conOwner (mismo {sourceId, ownerId} que la vieja + un
        // sourceInstanceId inerte).
        abilities: [{
            trigger: 'REACCION', sobre: 'DAÑO',
            si: { soloDañoNormal: true, defensorEsPropio: true, atacanteNoAvatar: true },
            prompt: '¿Usar Frasco maldito contra el atacante (-2 ATQ temporal)?',
            log: { msg: '¡{reactor} lanza un Frasco maldito a {atacante}!', tipo: 'ability' },
            efectos: [
                { op: 'MARCAR_TEMPORAL', quien: 'ATACANTE', conOwner: true,
                  floating: { texto: '-2 ATQ (Frasco)', estilo: 'ft-red-stat', offset: -20 } },
                { op: 'FIJAR_DAÑO', reducir: 2 },
            ],
        }],
        onUpdateTempEffect: function(target, effect, game) {
            target.currentAtk -= 2;
        },
        onStartTurnTempEffect: function(target, effect, game, currentTurnPlayerId) {
            // Expira al INICIO del próximo turno del dueño del frasco
            if (currentTurnPlayerId === effect.ownerId) {
                game.logMsg(`El efecto del Frasco maldito sobre ${game.getCardNameWithOwner(target)} desaparece.`, 'system');
                return false; 
            }
            return true;
        }
    },
    {
        name: "Poción revitalizante", type: "Ayuda", subtype: "Mágico", tags: ["Consumible"], rarity: "C", cost: 1, series: 1,
        text: "+1 Def y +1 Atq a un aliado durante 3 turnos (baja la cuenta al final de tu turno). No acumulable en el mismo aliado.",
        // Migrada al DSL (27-jul-2026): usaba el modal genérico para elegir un aliado YA EN EL
        // CAMPO, violación de la norma de targeting en tablero (única infracción conocida que
        // quedaba). sinMarcaTemporalPropia (ya existente en requisitos/ELEGIR) cubre el "no
        // acumulable". La cuenta atrás de 3 turnos se queda imperativa a propósito (ver
        // comentario de `duracion` en MARCAR_TEMPORAL): no hay aún trigger DSL genérico para
        // eso, y no compensa inventarlo para una sola carta.
        abilities: [
            { trigger: "JUGAR", requisitos: [
                { count: { sinMarcaTemporalPropia: true }, op: ">=", valor: 1, msg: "Todos tus aliados ya tienen los efectos de la poción activos." } ] },
            { trigger: "AL_CONSUMIR",
              efectos: [
                { op: "ELEGIR", de: "ALIADOS", sinMarcaTemporalPropia: true, cantidad: 1,
                  titulo: "Elige a quién revitalizar",
                  efectos: [
                    { op: "MARCAR_TEMPORAL", conOwner: true, actualizaPasivas: true, duracion: 3,
                      floating: { texto: "REVITALIZANTE", estilo: "ft-ability", offset: -40 },
                      log: "¡{objetivo} bebe la Poción revitalizante! (+1 Atq, +1 Def por 3 turnos)." },
                    { op: "FLOTANTE", texto: "+1 ATQ / +1 DEF", estilo: "ft-green", offset: -20 } ] } ] }
        ],
        onUpdateTempEffect: function(target, effect, game) {
            target.currentAtk += 1;
            target.currentDef += 1;
        },
        onEndTurnTempEffect: function(target, effect, game, currentTurnPlayerId) {
            // Si estamos en el mismo turno en el que se bebió la poción, ignoramos el descuento
            if (effect.turnApplied === game.turn) return true;

            // Solo baja la cuenta si es el final de tu turno
            if (currentTurnPlayerId === effect.ownerId) {
                effect.duration--;
                if (effect.duration <= 0) {
                    game.logMsg(`Los efectos de la Poción revitalizante sobre ${DSL._nombre(game, target)} se han desvanecido.`, 'system');
                    return false; // Se elimina el efecto
                }
            }
            return true;
        },
        // Sin onGetPreviewEffects (27-jul-2026): el registro automático de modificadores
        // (updatePassives -> _anota sobre onUpdateTempEffect) ya produce la línea con la
        // sintaxis estándar, incluida su cuenta atrás y la referencia a la carta en el
        // descarte. La línea que devolvía este hook era además SIEMPRE descartada por el
        // dedupe de stats del panel, así que era código muerto.
    },
    {
        name: "Plan de equipo", type: "Evento", rarity: "C", cost: 1, duration: 1, series: 1,
        // Requisito visible: un requisito de RECUENTO tambien tiene a QUIEN apuntar -las
        // cartas concretas que lo cumplen-, y son TODAS, sin `uno` (Toto, 14-ago-2026).
        requisitoVisible: [ { quien: "ALIADO", zona: "vanguardia" } ],
        text: "1 turno. Requiere no haber atacado este turno y tener 2 o más aliados. Mientras esté en juego, solo puedes atacar 1 vez: el Atq del atacante será la suma del Atq de 2 aliados que elijas.",
        // Migrada al DSL sobre el punto único de intercepción (§11). Cambio de estado
        // deliberado respecto a la imperativa: el candado de un-ataque vive en la
        // PROPIA carta de evento (planUsado, viaja con exportGameState) en vez de en
        // flags sueltos del jugador; muere con la carta, así que no necesita onExpire.
        abilities: [
            { trigger: "PREVIEW_GLOBAL", lineas: [ { quien: "ALIADO", soloTipos: ["Personaje", "Esbirro"], texto: "Puede aportar su Atq al único ataque combinado del turno" } ] },
            { trigger: "PREVIEW_GLOBAL", lineas: [ { quien: "ALIADO", soloTipos: ["Personaje", "Esbirro"], texto: "Plan de equipo: solo 1 ataque este turno (Atq = suma de 2 aliados elegidos)" } ] },
            { trigger: "JUGAR", requisitos: [
                { count: { filtros: [ { campo: "hasAttackedThisTurn", op: "truthy" } ] }, op: "==", valor: 0, msg: "Ya has atacado este turno." },
                { count: {}, op: ">=", valor: 2, msg: "Necesitas al menos 2 aliados en campo." } ] },
            { trigger: "AL_JUGAR", log: "¡Plan de equipo activado! ¡Tus aliados sincronizan sus fuerzas!" },
            { trigger: "GLOBAL_ANTES_DE_ATAQUE",
              soloAtacante: "PROPIO",
              unaVez: { campoSelf: "planUsado", logRepite: "Con 'Plan de equipo' sólo puedes atacar una vez este turno." },
              efectos: [
                { op: "ELEGIR", de: "ALIADOS", cantidad: 2, opcional: true,
                  titulo: "PLAN DE EQUIPO: ELIGE 2 ALIADOS PARA SUMAR SU ATQ",
                  guardaSuma: { campo: "currentAtk", en: "sumaAtq" }, guardaNombres: "duo" },
                { op: "FIJAR_STAT", stat: "currentAtk", valor: { REF: "vars.sumaAtq" },
                  log: "¡{duo} unen fuerzas! El ATQ de {objetivo} sube a {valor}.",
                  floating: { texto: "ATQ = {valor}", estilo: "ft-ability", offset: -40 } } ] }
        ],
    },
    {
        name: "Jarabe amargo", type: "Ayuda", subtype: "Ingerible", tags: ["Consumible"], rarity: "C", cost: 1, series: 1,
        text: "Elimina el Sueño, la Confusión y la Ceguera de todos tus aliados.",
        abilities: [
            { trigger: "JUGAR", requisitos: [ { count: { algunEstado: ["sueno", "confusion", "ceguera"] }, op: ">=", valor: 1, msg: "Tus aliados no sufren ningún estado curable por el jarabe." } ] },
            { trigger: "AL_CONSUMIR", log: "¡El olor del Jarabe amargo despierta y limpia a tus aliados!", logTipo: "ability",
              efectos: [ { op: "LIMPIAR_ESTADOS", estados: ["confusion", "ceguera", "sueno"], floating: "LIMPIO", floatingStyle: "ft-green", offsetFloating: -20 } ] }
        ],
    },
    {
        name: "Salsa de curry", type: "Ayuda", subtype: "Ingerible", tags: ["Consumible"], rarity: "C", cost: 1, series: 1,
        text: "Coste: 1 de Furor. Cura TODOS los estados alterados (incluyendo Daño por tiempo) de todos tus aliados.",
        abilities: [
            { trigger: "JUGAR", requisitos: [
                { count: { filtros: [ { campo: "furor", op: ">=", valor: 1 } ] }, op: ">=", valor: 1, msg: "Necesitas un aliado con 1 Furor para pagar la Salsa." },
                { count: { conAlgunEstado: true }, op: ">=", valor: 1, msg: "Ninguno de tus aliados sufre estados alterados." } ] },
            { trigger: "AL_CONSUMIR",
              efectos: [
                { op: "ELEGIR", de: "ALIADOS", filtros: [ { campo: "furor", op: ">=", valor: 1 } ], cantidad: 1, titulo: "¿QUIÉN PAGA LA SALSA? (-1 FUROR)",
                  efectos: [ { op: "MODIFICAR_STAT", stat: "furor", delta: -1, esCoste: true } ],
                  logDespues: "¡La poderosa Salsa de curry purifica el campo aliado!" },
                { op: "LIMPIAR_ESTADOS", todos: true, floating: "PURIFICADO", floatingStyle: "ft-green", offsetFloating: -20 } ] }
        ],
    },
    {
        name: "Barritas energéticas", type: "Ayuda", subtype: "Ingerible", tags: ["Consumible"], rarity: "C", cost: 1, series: 1,
        text: "Cura 1 de Vida a dos aliados.",
        abilities: [
            { trigger: "JUGAR", requisitos: [
                { count: { filtros: [ { campo: "currentHp", op: "<", valorCampo: "maxHp" } ] }, op: ">=", valor: 2, msg: "Necesitas al menos 2 aliados dañados para usar las Barritas." } ] },
            { trigger: "AL_CONSUMIR",
              efectos: [
                { op: "ELEGIR", de: "ALIADOS", filtros: [ { campo: "currentHp", op: "<", valorCampo: "maxHp" } ], cantidad: 2,
                  titulo: "BARRITAS: ELIGE 2 ALIADOS PARA CURAR",
                  logAntes: "¡{elegidos} comen Barritas energéticas!", logAntesTipo: "healing",
                  efectos: [ { op: "CURAR", valor: 1, floating: "BARRITAS" } ] } ] }
        ],
    },
    {
        name: "Chaqueta metálica defensiva de la muerte", type: "Ayuda", subtype: "Vestimenta", tags: ["Equipable"], rarity: "C", cost: 1, series: 1,
        text: "Requisito: un aliado sin la etiqueta 'Cosa'. Anéxasela: +3 de Def y -3 de Atq mientras la lleve.",
        abilities: [
            { trigger: "JUGAR", requisitos: [
                { count: { filtros: [ { no: true, campo: "tags", op: "includes", valor: "Cosa" } ] }, op: ">=", valor: 1, msg: "No tienes aliados válidos (sin etiqueta 'Cosa')." } ] },
            { trigger: "AL_EQUIPAR",
              mientrasEquipado: { def: 3, atk: -3 },
              efectos: [
                { op: "ELEGIR", de: "ALIADOS", filtros: [ { no: true, campo: "tags", op: "includes", valor: "Cosa" } ], cantidad: 1,
                  titulo: "¿QUIÉN SE PONE LA CHAQUETA METÁLICA?",
                  efectos: [
                    { op: "EQUIPAR",
                      floats: [ { texto: "CHAQUETA METÁLICA", estilo: "ft-ability", offset: -40 }, { texto: "+3 DEF / -3 ATQ", estilo: "ft-green", offset: -20 } ],
                      log: "{objetivo} se pone la Chaqueta (+3 Def, -3 Atq)." } ] } ] }
        ],
    },
    {
        name: "Muro parlante", hp: 5, def: 7, atk: 0, type: "Esbirro", subtype: "Ser mágico", tags: ["Cosa"], rarity: "C", cost: 1, series: 1,
        text: "P: INAMOVIBLE: Mientras tenga 0 de Atq, no puede realizar ataques normales.",
        passiveName: "INAMOVIBLE",
        abilities: [
            { trigger: "PUEDE_ATACAR", resumenFase: "Con 0 de Atq no puede realizar ataques normales", porHabilidad: "INAMOVIBLE", si: { campo: "currentAtk", op: ">", valor: 0 },
              msg: "INAMOVIBLE: {carta} no puede atacar mientras su ATQ sea 0 o menor." }
        ],
    },
    {
        name: "Canceladora", tempEffectText: "{genero?Cancelado|Cancelada}: perderá su próximo turno", type: "Ayuda", subtype: "Arma", tags: ["Consumible", "a distancia"], rarity: "B", cost: 1, series: 1,
        text: "Elige un enemigo con la etiqueta 'Usuario de VP'. Ese enemigo no podrá actuar (atacar, usar Habilidad o retirarse) en su próximo turno.",
        abilities: [
            { trigger: "JUGAR", requisitos: [ { count: { de: "ENEMIGOS", algunFiltro: [ { campo: "tags", op: "includes", valor: "Usuaria de VP" }, { campo: "tags", op: "includes", valor: "Usuario de VP" } ] }, op: ">=", valor: 1, msg: "El rival no tiene Usuarios de VP en el campo." } ] },
            { trigger: "AL_CONSUMIR",
              efectos: [
                { op: "ELEGIR", de: "ENEMIGOS", algunFiltro: [ { campo: "tags", op: "includes", valor: "Usuaria de VP" }, { campo: "tags", op: "includes", valor: "Usuario de VP" } ], cantidad: 1, titulo: "CANCELADORA: ELIGE OBJETIVO",
                  efectos: [ { op: "MARCAR_TEMPORAL", conOwner: true, floating: { texto: "CANCELADO", estilo: "ft-ability", offset: -40 }, log: "¡La Canceladora golpea a {objetivo}! Perderá su próximo turno." } ] } ] }
        ],
        onStartTurnTempEffect: function(target, effect, game, currentTurnPlayerId) {
            if (currentTurnPlayerId === target.owner) {
                target.exhausted = true; // No puede actuar
                game.logMsg(`¡${game.getCardNameWithOwner(target)} no puede actuar este turno debido a la Canceladora!`, 'system');
                return false; // El efecto se elimina tras hacerle perder el turno
            }
            return true;
        }
    },
    {
        name: "Karlitos", hp: 3, def: 2, atk: 3, type: "Personaje", subtype: "Ser vivo", tags: ["Usuario de Súper Evolución"], gender: "M", rarity: "A", cost: 4, series: 1,
        text: "P: PRÁCTICA CONSTANTE: Inicio de tu turno: +1 contador. A los 3, busca 'Súper Evolución' en mazo o descarte. A: APRENDIZ DE ARMAS (1F): Equipa un Arma de tu mano ignorando requisitos, luego ataca normal.",
        passiveName: "PRÁCTICA CONSTANTE", activeName: "APRENDIZ DE ARMAS", activeCost: 1,
        superStats: { hp: 4, def: 7, atk: 7 }, 
        
        // Migrada por completo (31-jul-2026). Tres piezas nuevas, las tres reutilizables:
        //   · `_field` admite RUTAS CON PUNTOS ("counters.karlitos_entrenamiento.count"): los
        //     contadores viven anidados, así que hasta ahora no se podía condicionar por su valor.
        //   · `BUSCAR` admite un ARRAY en `en` (aquí mazo Y descartes a la vez): cada carta sale
        //     de la zona en la que estuviera de verdad y solo se baraja si el MAZO iba incluido.
        //     Multi-zona cae al modal visual, que es justo lo que usaba la vieja.
        //   · `EQUIPAR` gana `invertido`: al revés del caso normal -aquí el OBJETIVO es el arma y
        //     la carta FUENTE quien la lleva-. Sin pasar por requisitos, como dice el texto.
        // El encadenado "equipa y luego ataca" NO necesitó nada: son dos ELEGIR seguidos (uno de
        // MANO, otro de ENEMIGOS) con ATACAR al final, el patrón de Gólem de tierra/Raiju.
        //
        // `karlitosEntrenado` se queda como campo propio (la vieja lo inicializaba en
        // onAfterPlayAsync; aquí basta con que empiece indefinido: `truthy`+`no` lo trata igual).
        abilities: [
            { trigger: "INICIO_TURNO", resumenFase: "Gana 1 Contador; al tercero busca Súper Evolución", porHabilidad: "PRÁCTICA CONSTANTE", soloTurnoPropio: true,
              si: [ { campo: "karlitosEntrenado", op: "truthy", no: true } ],
              efectos: [
                // Sin `fuente`: por defecto es sourceCard.name ("Karlitos"), que al coincidir
                // con el nombre de la propia carta objetivo resuelve a "esta carta" en
                // "Afectado por:" (mismo bug que Cogorza, betasteo de Toto: había puesto
                // `fuente:"PRÁCTICA CONSTANTE"` a mano, un string que nunca podía igualar
                // card.name). `floating` pinta el nombre de la Pasiva en cada tick, cosa que
                // ni esta migración ni la vieja hacían automáticamente — Toto lo pidió.
                { op: "MODIFICAR_CONTADORES", target: { quien: "SELF" }, contador: "karlitos_entrenamiento",
                  delta: 1, nombreContador: "Práctica", icono: "🏋️",
                  floating: { texto: "PRÁCTICA CONSTANTE", estilo: "ft-ability", offset: -40 } },
                // A partir de aquí, solo al llegar a 3 (ruta con puntos sobre el contador).
                { if: { campo: "counters.karlitos_entrenamiento.count", op: ">=", valor: 3 },
                  op: "FLOTANTE", target: { quien: "SELF" }, texto: "¡PRÁCTICA COMPLETADA!", estilo: "ft-ability", offset: -40,
                  log: "¡{carta} ha completado su entrenamiento!" },
                { if: { campo: "counters.karlitos_entrenamiento.count", op: ">=", valor: 3 },
                  op: "MARCAR", target: { quien: "SELF" }, campo: "karlitosEntrenado", valor: true },
                // confirmarPorZona (31-jul-2026, betasteo de Toto): antes mazo+descartes caían
                // en el modal genérico MEZCLADOS, y aceptar barajaba el mazo aunque la carta
                // encontrada viniera de los descartes (el jugador aprendía implícitamente que
                // tenía una copia en el mazo sin haber elegido mirarlo). Ahora la pregunta es
                // "¿en qué zona buscas?": MAZO abre el visor completo (y baraja, porque ya se ha
                // inspeccionado); DESCARTES coge la primera coincidencia sin modal y sin tocar
                // el mazo para nada (el orden de los descartes da igual).
                { if: { campo: "counters.karlitos_entrenamiento.count", op: ">=", valor: 3 },
                  op: "BUSCAR", en: ["MAZO", "DESCARTES"], filtros: [ { campo: "name", op: "==", valor: "Súper Evolución" } ],
                  titulo: "BUSCAR SÚPER EVOLUCIÓN",
                  confirmarPorZona: true,
                  confirmar: { titulo: "PRÁCTICA COMPLETADA", no: "NO BUSCAR",
                               porZona: { MAZO: "BUSCAR EN EL MAZO", DESCARTES: "BUSCAR EN LOS DESCARTES" } },
                  log: "Añades {objetivo} a tu mano.",
                  logNoValidas: "No quedan cartas de Súper Evolución en el mazo ni en los descartes.",
                  logNoEncontrada: "No hay ninguna Súper Evolución ahí.",
                  barajarDespues: { log: "Barajando el mazo de {jugador}..." } },
                // El contador se retira DESPUÉS de la búsqueda: si se limpiara antes, las
                // condiciones de los efectos siguientes (que lo consultan) dejarían de cumplirse.
                { if: { campo: "counters.karlitos_entrenamiento.count", op: ">=", valor: 3 },
                  op: "MODIFICAR_CONTADORES", target: { quien: "SELF" }, contador: "karlitos_entrenamiento", delta: -3 } ] },
            // costeDiferido (Toto, 7-ago-2026): hasta que el arma no se equipa NO ha cambiado
            // nada en el tablero, así que cancelar la elección debe salir gratis. Antes se
            // cobraba 1 de Furor y se agotaba a Karlitos nada más confirmar la Habilidad, así
            // que arrepentirse costaba el turno. Como este modo silencia el flotante genérico
            // del nombre, se declara abajo un FLOTANTE en el punto irreversible (al equipar).
            { trigger: "ACTIVA", nombre: "APRENDIZ DE ARMAS", coste: { furor: 1 }, sinObjetivo: true, ataqueNormal: true, costeDiferido: true,
              requisitos: [
                { count: { quien: "ALIADO", zona: "mano", algunFiltro: [ { campo: "subtype", op: "==", valor: "Arma" }, { campo: "subtype", op: "==", valor: "Arma legendaria" } ] },
                  op: ">=", valor: 1, msg: "No tienes armas en la mano." },
                { count: { quien: "ENEMIGO", zona: "vanguardia" }, op: ">=", valor: 1, msg: "No hay enemigos para atacar." } ],
              efectos: [
                { op: "ELEGIR", de: "MANO", cantidad: 1, autoSeleccion: true,
                  titulo: "APRENDIZ: ELIGE ARMA PARA EQUIPAR",
                  algunFiltro: [ { campo: "subtype", op: "==", valor: "Arma" }, { campo: "subtype", op: "==", valor: "Arma legendaria" } ],
                  efectos: [
                    // El anuncio va AQUÍ y no en el cierre genérico: con `costeDiferido` aquel se
                    // silencia a propósito, porque saldría antes de elegir el arma -o sea, antes
                    // de que hubiera pasado nada- y el rival vería una Habilidad que aún puede
                    // cancelarse. Este es el primer instante irreversible.
                    { op: "EQUIPAR", invertido: true,
                      log: "¡{carta} se equipa velozmente con {objetivo} y se prepara para atacar!" } ] },
                { op: "ELEGIR", de: "ENEMIGOS", zona: "VANGUARDIA", cantidad: 1, cancelable: false,
                  titulo: "Elige un enemigo de la vanguardia para atacarlo",
                  logAntes: "¡{carta} ataca a {elegidos} con su nueva arma!",
                  efectos: [ { op: "ATACAR" } ] } ] }
        ],
    },
    {
        name: "Súper Evolución", type: "Ayuda", subtype: "Técnica", tags: ["Equipable"], rarity: "B", cost: 4, series: 1,
        // tempEffectSinLinea (31-jul-2026, betasteo de Toto): sin esto, "Efectos actuales" de
        // Súper Evolución mostraba una segunda línea "Súper Evolución, objetivo: X" además de los
        // +ATQ/+DEF ya calculados (vía onEquipUpdate/_statMods) -redundante y sin info real, ya
        // que el tempEffect a mano no lleva `duration`-.
        tempEffectSinLinea: true,
        text: "Equipa a un aliado con etiqueta 'Usuario de Súper Evolución' de tu vanguardia: adopta las stats de Súper Evolución, recupera toda su Vida y pierde sus estados alterados. Tras 3 turnos tuyos se destruye y le devuelve sus stats, la Vida y la limpieza de estados.",
        // Migrada por completo (31-jul-2026). Tres piezas nuevas, las tres compartidas con las
        // otras dos cartas de la tanda (Poder Legado y Milkor MGL):
        //   · `mientrasEquipado: {superStats:true}` — el bono NO es un delta fijo sino la
        //     diferencia entre los superStats de la plantilla DEL PORTADOR y su base, así que
        //     `{atk:N,def:N}` no podía expresarlo. De paso fija maxHp y cura ("restaurando Vida").
        //   · `cuentaAtras` en MARCAR_TEMPORAL — baja 1 por turno propio del portador y dispara
        //     efectos al llegar a 0. Antes `duracion` solo etiquetaba la marca y decrementar era
        //     cosa del onStartTurnTempEffect a mano de cada carta.
        //   · Op `DESEQUIPAR` (con `restaurarStats`/`limpiarEstados`) — el final de vida de un
        //     equipo, que las tres resolvían a mano cada una a su manera.
        // AL_EQUIPAR y no AL_USAR_AYUDA a propósito: ese otro pipeline (executeAyuda) manda la
        // carta jugada a DESCARTES aunque quede anexada -la rareza documentada en Espada V-, y
        // aquí eso dejaría el equipo en descartes desde el minuto uno, rompiendo el DESEQUIPAR
        // final. AL_EQUIPAR conserva el flujo onPlay original (mano -> equipped) y el targeting
        // en tablero lo da ELEGIR, que ya usa pickBoardTargets.
        abilities: [
            { trigger: "JUGAR", requisitos: [
                { count: { quien: "ALIADO", zona: "vanguardia", filtros: [ { campo: "tags", op: "includes", valor: "Usuario de Súper Evolución" } ] },
                  op: ">=", valor: 1, msg: "No hay ningún 'Usuario de Súper Evolución' en vanguardia." } ] },
            { trigger: "AL_EQUIPAR",
              mientrasEquipado: { superStats: true },
              efectos: [
                { op: "ELEGIR", de: "ALIADOS", zona: "VANGUARDIA", cantidad: 1,
                  filtros: [ { campo: "tags", op: "includes", valor: "Usuario de Súper Evolución" } ],
                  titulo: "¿A QUIÉN APLICAR SÚPER EVOLUCIÓN?",
                  efectos: [
                    { op: "EQUIPAR", animacion: "evolucion",
                      floats: [ { texto: "¡SÚPER EVOLUCIÓN!", estilo: "ft-purple", offset: -40 } ],
                      log: "¡{objetivo} alcanza su Súper Evolución! Su cuerpo se restaura y libera un poder abrumador." },
                    { op: "LIMPIAR_ESTADOS", soloObjetivo: true, todos: true },
                    { op: "MARCAR_TEMPORAL", conOwner: true, duracion: 3,
                      cuentaAtras: {
                        floating: { texto: "SÚPER EVO: {n}/{total}", estilo: "ft-ability", offset: -20 },
                        contador: { id: "super_evo_timer", nombre: "Turnos Evo", icono: "⚡" },
                        log: "¡La Súper Evolución de {objetivo} se ha agotado!",
                        floatingFinal: { texto: "AGOTADO", estilo: "ft-red-stat", offset: -30 },
                        alCaducar: [ { op: "DESEQUIPAR", restaurarStats: true, limpiarEstados: true } ] } } ] } ] }
        ],
    },
    {
        name: "Karolina", hp: 2, def: 3, atk: 7, type: "Personaje", subtype: "Ser vivo", tags: ["Mercenaria"], gender: "F", rarity: "A", cost: 4, series: 1,
        text: "P: HUESO DURO: Def máxima 6. Ante ataque normal, solo pierde Vida si (Atq atacante - su Def) >= 2. Ante ataque especial, si es >= 1. A: HOSTIA MÁGICA TERRIBLE (2F): Ataque especial. Si tiene éxito, +1 Def permanente (máx 2 por puesta en juego).",
        passiveName: "HUESO DURO", activeName: "HOSTIA MÁGICA TERRIBLE", activeCost: 2,
        
        onAfterPlayAsync: async function(card, game, p) {
            card.karolinaDefBoosts = 0; // Reiniciamos sus bufos al ser jugada
        },
        
        // El +Def se atribuye a su Activa HOSTIA MÁGICA TERRIBLE (Toto, 27-jul-2026): es ella
        // quien de verdad concede el bono al incrementar karolinaDefBoosts; esta PASIVA_CONTINUA
        // solo lo REAPLICA en cada pasada (mismo criterio que Xidachane/FRUSTRACIÓN). El techo
        // de Def SÍ es de su Pasiva real (HUESO DURO), así que TECHO_STAT lleva su propio nombre.
        // silencioso: la vieja no anunciaba la reaplicación (el "+1 Def" real lo anuncia la
        // Activa, imperativa, al incrementar karolinaDefBoosts). El techo SÍ se anuncia si de
        // verdad corrige algo: ver el clamp final en updatePassives (index.html).
        abilities: [
            { trigger: "PASIVA_CONTINUA", nombre: "HOSTIA MÁGICA TERRIBLE", silencioso: true,
              then: [ { op: "MODIFICAR_STAT", stat: "def", delta: { REF: "self.karolinaDefBoosts" } },
                      { op: "TECHO_STAT", stat: "def", valor: 6, nombre: "HUESO DURO" } ] }
        ],
        
        onBeforeTakeDamage: async function(card, attacker, dmg, isSpecial, game) {
            // Calculamos la diferencia bruta de fuerza antes de que el motor aplique mínimos de daño
            let rawDiff = attacker.currentAtk - card.currentDef;
            
            if (!isSpecial) {
                // Ataque normal: Solo pierde vida si rawDiff >= 2
                if (rawDiff < 2) {
                    game.logMsg(`¡${card.passiveName}! ${game.getCardNameWithOwner(card)} absorbe el golpe normal sin inmutarse.`, 'ability');
                    showFloatingText(card.instanceId, "BLOQUEADO", "ft-ability", -30);
                    return 0; // Anula el daño por completo
                }
            } else {
                // Ataque especial: Solo pierde vida si rawDiff >= 1
                if (rawDiff < 1) {
                    game.logMsg(`¡${card.passiveName}! ${game.getCardNameWithOwner(card)} resiste el ataque especial gracias a su Hueso Duro.`, 'ability');
                    showFloatingText(card.instanceId, "BLOQUEADO", "ft-ability", -30);
                    return 0;
                }
            }
            return dmg; // Si superó la coraza, se come el daño precalculado por el motor
        },
        
        canActivateAbility: function(card, game) {
            if (card.furor < 2) { game.logError("Falta Furor (2)."); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            if (game.players[enemyId].vanguard.length === 0) { game.logError("No hay enemigos en vanguardia."); return false; }
            return true;
        },
        
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 1, name: 'HOSTIA MÁGICA TERRIBLE', targetType: 'enemy' };
            game.logError("Elige un enemigo para HOSTIA MÁGICA TERRIBLE.");
            game.render();
        },
        
        onValidateTarget: function(card, target, game, isSilent) {
            if (target.owner === card.owner || target.location !== 'vanguard' || getCardTemplate(target.id).isAvatar) return false;
            return true;
        },
        
        onTargetsReady: async function(card, game) {
            const target = game.abilityContext.targets[0];
            game.modifyStat(card, 'furor', -2);
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);
            game.logMsg(`¡Karolina lanza una HOSTIA MÁGICA TERRIBLE a ${game.getCardNameWithOwner(target)}!`, 'ability');
            
            game.inputState = 'EXECUTING';
            game.render();
            await game.sleep(500);

            // Intentamos hacer el ataque especial
            let dodged = false;
            const defTemplate = getCardTemplate(target.id);
            if (typeof defTemplate.onBeforeDefend === 'function') {
                dodged = await defTemplate.onBeforeDefend(target, card, game, game.abilityContext.name, true);
            }

            if (!dodged) {
                let dmg = card.currentAtk - target.currentDef;
                if (dmg <= 0) dmg = (card.type === 'Esbirro' && target.type === 'Personaje') ? 0.5 : 1;

                await game.dealDamage(card, target, dmg, true); // true = Ataque Especial
                
                // Efecto de éxito: Aumento permanente de DEF (Máx 2)
                if (card.karolinaDefBoosts === undefined) card.karolinaDefBoosts = 0;
                if (card.karolinaDefBoosts < 2) {
                    card.karolinaDefBoosts++;
                    game.logMsg(`¡El impacto de la Hostia motiva a Karolina! (+1 DEF permanente)`, 'ability');
                    showFloatingText(card.instanceId, "+1 DEF BASE", "ft-green", -20);
                }
                
                await game.sleep(400);
                await game.checkDeath(target);
            }
            
            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.updatePassives();
            game.render();
        }
    },
    {
        name: "Berry", hp: 2, def: 1, atk: 1, type: "Personaje", subtype: "Ser vivo", tags: ["Usuaria de VP"], gender: "F", rarity: "S", cost: 1, series: 1,
        // Requisito visible: un requisito de RECUENTO tambien tiene a QUIEN apuntar -las
        // cartas concretas que lo cumplen-, y son TODAS, sin `uno` (Toto, 14-ago-2026).
        requisitoVisible: [ { quien: "ALIADO", zona: "vanguardia" } ],
        text: "Requisito: Tu vanguardia llena; se coloca en retaguardia. P: IDOL A DISTANCIA: Siempre Oculta. Desde la retaguardia: Gana 1 de Furor en la Fase de Furor y puede usar su Activa. A: INTERFAZ (1F): Busca 'Rebobinar', 'Cambio de canal' o 'Publicidad mental' en mazo o descarte. Baraja si buscas en mazo.",
        passiveName: "IDOL A DISTANCIA", activeName: "INTERFAZ", activeCost: 1,
        
        canUseAbilityFromRearguard: true, // Permite usar Habilidad activa
        canGainFurorFromRearguard: true,  // Permite ganar Furor en su fase correcta
        
        onBeforePlayAsync: async function(card, game, p) {
            if (p.vanguard.length < 4) {
                game.logError("Berry sólo puede ser colocada si tu vanguardia está llena (debe entrar directamente a la retaguardia).");
                return false;
            }
            return true;
        },
        
        // silencioso: la vieja nunca anunciaba esta pasiva (solo marcaba el campo).
        abilities: [
            { trigger: "PASIVA_CONTINUA", nombre: "IDOL A DISTANCIA", silencioso: true,
              then: [ { op: "MARCAR", campo: "stealth", valor: true, badge: "oculto" } ] },
            // INTERFAZ migrada (Toto, 7-ago-2026). Era imperativa y mezclaba las coincidencias de
            // MAZO y DESCARTES en un mismo modal genérico: enseñaba qué copias tenías en el mazo
            // sin que hubieras decidido mirarlo, y barajaba siempre aunque la carta saliera del
            // descarte. Es exactamente lo que ya se corrigió en Karlitos, así que usa la misma
            // pieza -`confirmarPorZona`-: primero eliges ZONA, el mazo abre su visor completo (y
            // se baraja, porque ya lo has inspeccionado) y los descartes no lo tocan para nada.
            { trigger: "ACTIVA", nombre: "INTERFAZ", coste: { furor: 1 }, sinObjetivo: true,
              efectos: [
                { op: "BUSCAR", en: ["MAZO", "DESCARTES"], destino: "MANO",
                  algunFiltro: [
                    { campo: "name", op: "==", valor: "Rebobinar" },
                    { campo: "name", op: "==", valor: "Cambio de canal" },
                    { campo: "name", op: "==", valor: "Publicidad mental" } ],
                  titulo: "INTERFAZ: ELIGE UNA CARTA",
                  confirmarPorZona: true,
                  confirmar: { titulo: "INTERFAZ", no: "NO BUSCAR",
                               porZona: { MAZO: "BUSCAR EN EL MAZO", DESCARTES: "BUSCAR EN LOS DESCARTES" } },
                  log: "¡Berry teclea velozmente y te consigue {objetivo}!",
                  logNoValidas: "Error 404: no quedan cartas compatibles con la Interfaz en tu mazo ni en los descartes.",
                  logNoEncontrada: "Error 404: no hay ninguna carta compatible ahí.",
                  barajarDespues: { log: "Barajando el mazo de {jugador}..." } } ] }
        ],
        
    },
    {
        name: "Achmay", hp: 8, def: 2, atk: 0, type: "Personaje", subtype: "Ser mágico", tags: ["Cosa"], gender: "M", rarity: "S", cost: 3, series: 1,
        text: "P: YOLOLO: No puede atacar. Todos los ataques normales enemigos deben ir dirigidos a él. Si recibe un ataque normal, quita 1 Vida al atacante. A: PÉGAME, PERRA (2F): Obliga a un enemigo a realizar un ataque normal hacia Achmay en su próximo turno (si puede). Esta habilidad no gasta la acción de Achmay.",
        passiveName: "YOLOLO", activeName: "PÉGAME, PERRA", activeCost: 2,
        
        isTaunt: true, // Propiedad mágica que lee el motor para obligar los ataques

        canAttackNormally: function() {
            return false; // Prohibido atacar (una línea: no compensa arquitectura para esto)
        },

        // Migrada (31-jul-2026). YOLOLO usa el TRAS_DEFENDER de Imp mayor con la extensión
        // `soloAtaqueNormal` (onAfterDefend ya recibe el isSpecial real de dealDamage, sin
        // heurísticas). PÉGAME PERRA usa dos piezas nuevas: `sinAgotar` en ACTIVA (el cierre
        // genérico agota SIEMPRE salvo que se pida lo contrario; el texto de la carta dice
        // explícitamente que no gasta la acción) y `provocaAtaque` en MARCAR_TEMPORAL (deja
        // forcedAttackTarget -campo YA genérico del motor, leído en la fase de inicio de
        // turno- a la carta marcada cuando empieza SU turno, autoconsumiéndose).
        // Betasteo de Toto (31-jul-2026): la vieja pintaba "-1 VIDA (Espinas)" a mano ADEMÁS
        // del "-1 VIDA" automático de modifyStat (dos flotantes seguidos por el mismo golpe).
        // Sin `floating` aquí, la nueva se queda solo con el automático — a la espera de un
        // sistema general (pendiente, valorado para Opus) que añada "(fuente)" al flotante
        // automático cuando la pérdida no venga de un ataque/Habilidad/Ayuda obvios.
        abilities: [
            { trigger: "TRAS_DEFENDER", nombre: "YOLOLO", soloAtaqueNormal: true,
              efectos: [
                { op: "MODIFICAR_STAT", stat: "currentHp", delta: -1, comprobarMuerte: true,
                  log: "¡YOLOLO! {objetivo} se pincha con la barrera de Achmay.", logTipo: "combat" } ] },
            { trigger: "ACTIVA", nombre: "PÉGAME, PERRA", coste: { furor: 2 }, sinAgotar: true,
              target: { quien: "ENEMIGO", cantidad: 1 },
              requisitos: [
                { count: { quien: "ENEMIGO" }, op: ">=", valor: 1, msg: "No hay enemigos a los que provocar." } ],
              efectos: [
                { op: "MARCAR_TEMPORAL", conOwner: true, provocaAtaque: true,
                  log: "¡{carta} insulta a {objetivo}! ¡Deberá atacarle en su próximo turno!",
                  floating: { texto: "PROVOCADO", estilo: "ft-red-stat", offset: -20 } } ] }
        ],
    },
    {
        name: "Rezo en grupo", type: "Ayuda", subtype: "Técnica", tags: ["Consumible"], rarity: "C", cost: 2, series: 2,
        text: "Coste: 1 de Furor de dos aliados distintos. Busca en tu mazo cualquier carta con la etiqueta 'Dios/a' y añádela a tu mano. Baraja tu mazo.",
        abilities: [
            { trigger: "JUGAR", requisitos: [ { count: { filtros: [ { campo: "furor", op: ">=", valor: 1 } ] }, op: ">=", valor: 2, msg: "Necesitas al menos 2 aliados con 1 de Furor cada uno." } ] },
            { trigger: "AL_CONSUMIR",
              efectos: [
                // Los dos pagadores se anotan y se les cobra DESPUÉS (§14, ver Pago por
                // adelantado). Aquí ya se salvaba de rebote -al pedir DOS, la elección no
                // resuelve hasta tenerlos ambos- pero dependía de esa casualidad; ahora es
                // explícito y no se rompe si algún día pide uno solo.
                { op: "ELEGIR", de: "ALIADOS", filtros: [ { campo: "furor", op: ">=", valor: 1 } ], cantidad: 2, titulo: "ELIGE 2 ALIADOS (-1 FUROR C/U)",
                  guardaIdsEnSelf: "rezoPagadores",
                  logDespues: "Tributo pagado. ¡Inicia el Rezo en grupo!" },
                // El tributo va AQUÍ, en su sitio natural: `esCoste` lo aparca solo hasta el
                // escaparate, así que no se cobra mientras la búsqueda aún se pueda cancelar
                // y el "-1 FUR" sale a la vez que la carta se presenta.
                { op: "MODIFICAR_STAT", target: { selfLista: "rezoPagadores" }, stat: "furor", delta: -1, esCoste: true },
                { op: "BUSCAR", en: "MAZO", cantidad: 1, destino: "MANO",
                  algunFiltro: [ { campo: "tags", op: "includes", valor: "Diosa" }, { campo: "tags", op: "includes", valor: "Dios" } ],
                  titulo: "BUSCAR DIOS/A EN EL MAZO",
                  log: "¡La deidad {objetivo} acude a la mano de {jugador}!",
                  logNoValidas: "No quedan Dioses ni Diosas en el mazo de {jugador}.",
                  barajarDespues: { log: "Barajando el mazo de {jugador}...", inclusoSinValidas: true } } ] }
        ],
    },
    {
        name: "Dáedra", type: "Evento", rarity: "B", cost: 1, duration: 3, series: 2,
        text: "3 turnos. Mientras esté en juego, los aliados con etiqueta 'Usuario de magia' o 'Monstruo' reciben el doble de Furor al inicio de cada turno.",
        onPlay: function(card, game) {
            game.logMsg(`¡La influencia de Dáedra inunda el campo!`, 'ability');
        },
        // Migrada (31-jul-2026) con la pieza que le faltaba a GLOBAL_MODIFICAR_FUROR:
        // `accion.multiplicar`, hermana de `fijar`/`sumar`. El resto (si.objetivoDe,
        // si.algunaEtiqueta, log con {objetivo}, preview) ya existía.
        abilities: [
            { trigger: "GLOBAL_MODIFICAR_FUROR", resumenFase: "Los aliados con etiqueta 'Usuario de magia' o 'Monstruo' reciben el doble de Furor", reglas: [
                { si: { objetivoDe: "PROPIO", algunaEtiqueta: ["Usuario de magia", "Usuaria de magia", "Monstruo"] },
                  log: { msg: "¡Dáedra potencia la recuperación de {objetivo}! (+1 Furor extra)", tipo: "ability" },
                  preview: "Doble Furor al inicio del turno",
                  accion: { multiplicar: 2 } }
            ] }
        ],
        onExpire: function(card, game, playerId) {
            game.logMsg("El evento Dáedra se desvanece.", 'system');
        }
    },
    {
        name: "La Bestia", hp: 8, def: 4, atk: 4, type: "Esbirro", subtype: "Ser mágico", tags: ["Invocación"], rarity: "S", cost: 1, series: 2,
        text: "Coste: 6 de Furor repartidos entre tus aliados. P: MANIFESTACIÓN PROHIBIDA: Si 'Dáedra' está activo (tuyo o rival), Def y Atq = 8. Si expira, baja. A: CATÁSTROFE (1F): Busca 'Fusión de planos' en el mazo. Baraja siempre.",
        passiveName: "MANIFESTACIÓN PROHIBIDA", activeName: "CATÁSTROFE", activeCost: 1,
        abilities: [
            { trigger: "ACTIVA", nombre: "CATÁSTROFE", coste: { furor: 1 }, sinObjetivo: true,
              efectos: [
                { op: "BUSCAR", en: "MAZO", cantidad: 1, destino: "MANO",
                  filtros: [ { campo: "name", op: "==", valor: "Fusión de planos" } ],
                  titulo: "BUSCAR FUSIÓN DE PLANOS",
                  log: "¡{carta} atrae el caos! {objetivo} va a la mano de {jugador}.",
                  logNoValidas: "No queda ninguna Fusión de planos en el mazo de {jugador}.",
                  barajarDespues: { log: "Barajando el mazo de {jugador}...", inclusoSinValidas: true } } ] }
        ],
        onBeforePlayAsync: async function(card, game, p) {
            let totalFuror = 0;
            [...p.vanguard, ...p.rearguard].forEach(c => totalFuror += c.furor);
            if (totalFuror < 6) { game.logError("Necesitas un total de 6 de Furor entre todos tus aliados."); return false; }

            game.logMsg("Se requiere un tributo masivo de 6 Furor.", 'system');
            let remaining = 6;
            // Quién ha puesto cuánto: el tributo se reparte, así que cada flecha tiene que decir
            // la cantidad REAL de esa carta y no "6" (§14.bis).
            const puesto = new Map();
            
            // Loop para exprimir furor carta a carta hasta llegar a 6
            while (remaining > 0) {
                const valid = [...p.vanguard, ...p.rearguard].filter(c => c.furor > 0 && !getCardTemplate(c.id).isAvatar);
                const chosen = await game.pickBoardTargets(valid, 1, `TRIBUTO PARA LA BESTIA (Faltan ${remaining})`, card, card.owner, true);
                if (!chosen || chosen.length === 0) return false; // Canceló el tributo
                
                game.modifyStat(chosen[0], 'furor', -1);
                puesto.set(chosen[0], (puesto.get(chosen[0]) || 0) + 1);
                remaining--;
            }
            // Se marca al final, con el reparto ya cerrado.
            for (const [aliado, cuanto] of puesto) DSL._marcarCoste(game, aliado, 'tributo', `Tributa ${cuanto} FUR`);
            return true;
        },
        onUpdatePassive: function(card, game) {
            const p1Event = game.players.p1.activeEvent;
            const p2Event = game.players.p2.activeEvent;
            const daedraActive = (p1Event && p1Event.name === "Dáedra") || (p2Event && p2Event.name === "Dáedra");

            if (daedraActive) {
                card.currentAtk = 8;
                card.currentDef = 8;
            } else {
                const base = getCardTemplate(card.id);
                card.currentAtk = base.atk;
                card.currentDef = base.def;
            }
        },
        canActivateAbility: function(card, game) {
            if (card.furor < 1) { game.logError("Falta Furor (1)."); return false; }
            return true;
        },
        // CATÁSTROFE migrada al op BUSCAR (13-ago-2026). Hacía a mano el mismo baile que las
        // otras búsquedas, y de paso arrastraba dos cosas mal: los avisos de "no quedan" y
        // "barajando" salían por `logError` -el canal de ERRORES, en rojo, para algo que es
        // información normal- y la carta encontrada no se presentaba, así que el rival no la
        // veía. El coste, el flotante de la Activa y el agotado los pone ya el compilador.
        // `inclusoSinValidas`: su texto dice "Baraja siempre".
    },
    {
        name: "Xidachane", hp: 3, def: 3, atk: 4, type: "Personaje", subtype: "Ser vivo", tags: ["Alienígena", "Usuario de Súper Evolución"], gender: "M", rarity: "S", cost: 4, series: 2,
        text: "P: PIRATA GALÁCTICO: Sus stats base son (3/3/4). Cada vez que destruye a un enemigo, gana un contador. A los 3 contadores, vuelve a tu mano. A: FRUSTRACIÓN (1F): Ataque normal. Si no tuviera éxito (no hace daño), aumenta todas sus stats y Vida en +2 permanentemente.",
        passiveName: "PIRATA GALÁCTICO", activeName: "FRUSTRACIÓN", activeCost: 1,
        superStats: { hp: 6, def: 5, atk: 7 },
        // Atribuida a FRUSTRACIÓN, no a PIRATA GALÁCTICO (Toto, 27-jul-2026): el +2 a Atq/Def
        // por contador lo concede la ACTIVA (que sube xidachaneBoosts cuando su ataque no tiene
        // éxito); la pasiva PIRATA GALÁCTICO solo lleva la cuenta de bajas y la vuelta a la mano.
        // Esta PASIVA_CONTINUA únicamente REAPLICA en cada pasada el bonus que dio la Activa.
        // silencioso: el aviso real ("+2 A TODO") lo emite onTargetsReady en el momento de subirlo.
        abilities: [
            { trigger: "PASIVA_CONTINUA", nombre: "FRUSTRACIÓN", silencioso: true,
              then: [
                { op: "MODIFICAR_STAT", stat: "def", delta: { REF: "self.xidachaneBoosts", factor: 2 } },
                { op: "MODIFICAR_STAT", stat: "atk", delta: { REF: "self.xidachaneBoosts", factor: 2 } } ] }
        ],
        onAfterAttack: async function(attacker, defender, game) {
            // Hook para los Kills
            if (defender.currentHp <= 0) {
                game.modifyCounters(attacker, 'xidachane_kills', 1, 'Bajas', attacker, '💀', 'PIRATA GALÁCTICO');
                if (attacker.counters['xidachane_kills'] && attacker.counters['xidachane_kills'].count >= 3) {
                    game.logMsg(`¡${game.getCardNameWithOwner(attacker)} ha reunido botín suficiente y escapa a la mano!`, 'ability');
                    showFloatingText(attacker.instanceId, "ESCAPA", "ft-purple", -30);
                    
                    const p = game.players[attacker.owner];
                    p.vanguard = p.vanguard.filter(c => c.instanceId !== attacker.instanceId);
                    p.rearguard = p.rearguard.filter(c => c.instanceId !== attacker.instanceId);
                    
                    if(typeof game.resetCard === 'function') game.resetCard(attacker);
                    attacker.location = 'hand';
                    p.hand.push(attacker);
                    try { await window.animateSpinToHand(attacker.instanceId, attacker.owner); } catch(e){}
                }
            }
        },
        canActivateAbility: function(card, game) {
            if (card.furor < 1) { game.logError("Falta Furor (1)."); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            if (game.players[enemyId].vanguard.length === 0) return false;
            return true;
        },
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 1, name: 'FRUSTRACIÓN', targetType: 'enemy', isNormalAttack: true };
            game.logError("FRUSTRACIÓN: Elige objetivo enemigo.");
            game.render();
        },
        onTargetsReady: async function(card, game) {
            const target = game.abilityContext.targets[0];
            game.modifyStat(card, 'furor', -1);
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);

            // Guardamos la vida del objetivo para ver si tuvo "éxito"
            const startHp = target.currentHp;
            await game.performAttack(card, target);

            // Si el objetivo no perdió vida (lo esquivó, escudo, inmunidad...)
            if (target.currentHp >= startHp) {
                game.logMsg(`¡El ataque no tuvo éxito! La frustración invade a ${game.getCardNameWithOwner(card)} y se hace más fuerte.`, 'ability');
                if (!card.xidachaneBoosts) card.xidachaneBoosts = 0;
                card.xidachaneBoosts++;
                card.maxHp += 2;
                card.currentHp += 2;
                showFloatingText(card.instanceId, "+2 A TODO", "ft-green", -20);
                game.updatePassives();
                game.render();
            }
        }
    },
    {
        name: "Honsow", hp: 4, def: 4, atk: 3, type: "Personaje", subtype: "Ser vivo", tags: ["Usuario de VP"], gender: "M", rarity: "B", cost: 3, series: 2,
        text: "P: MAESTRO DE ARMAS: Puedes equipar a Honsow cualquier Arma ignorando condiciones. A: GENERACIÓN DE ARMAMENTO MELÉ (1F): Busca un Arma no legendaria con etiqueta 'melé' en tu mano o mazo, equípatela y ataca a un enemigo (si lo hay).",
        passiveName: "MAESTRO DE ARMAS", activeName: "GENERACIÓN DE ARMAMENTO MELÉ", activeCost: 1,
        // Migrada (31-jul-2026), reutilizando las piezas de Karlitos (`BUSCAR` multi-zona) más
        // dos añadidos suyos: `destino:"EQUIPADO"` (lo encontrado se equipa a la carta fuente en
        // vez de ir a la mano) y `barajarDespues.soloSiDelMazo` (su arma puede venir de la MANO,
        // y entonces el mazo ni se toca — la vieja lo distinguía con un flag `fromDeck`).
        // `costeDiferido` reproduce que el Furor se cobre DESPUÉS de elegir el arma: si cancelas
        // el modal, la vieja tampoco cobraba nada (por eso el `abortaSiCancelas`).
        // El ataque encadenado no necesitó nada: un ELEGIR de ENEMIGOS + ATACAR.
        //
        // MAESTRO DE ARMAS (la Pasiva) se queda como está porque NO TIENE IMPLEMENTACIÓN: solo
        // existe en el texto de la carta, ni la vieja ni ninguna otra parte del motor la cablean.
        // No es algo que esta migración haya perdido; queda anotado por si algún día se codifica.
        abilities: [
            { trigger: "ACTIVA", nombre: "GENERACIÓN DE ARMAMENTO MELÉ", coste: { furor: 1 },
              sinObjetivo: true, ataqueNormal: true, costeDiferido: true,
              requisitos: [
                { count: { quien: "ENEMIGO", zona: "vanguardia" }, op: ">=", valor: 1, msg: "No hay enemigos para atacar." } ],
              efectos: [
                // confirmarPorZona (Toto, 7-ago-2026): antes mezclaba MANO y MAZO en un mismo
                // modal, con los dos defectos que eso trae — te enseñaba qué armas te quedaban en
                // el mazo sin haber decidido mirarlo, y te obligaba a barajar aunque el arma
                // saliera de la mano. Ahora eliges zona primero. El MAZO se ofrece siempre
                // (ocultarlo delataría que no queda ninguna); la MANO solo si tiene alguna, que
                // el jugador ya la está viendo.
                { op: "BUSCAR", en: ["MANO", "MAZO"], destino: "EQUIPADO", abortaSiCancelas: true, abortaSiVacio: true,
                  filtros: [ { campo: "subtype", op: "==", valor: "Arma" }, { campo: "tags", op: "includes", valor: "melé" } ],
                  titulo: "GENERACIÓN: BUSCAR ARMA MELÉ",
                  confirmarPorZona: true,
                  confirmar: { titulo: "GENERACIÓN DE ARMAMENTO MELÉ", no: "NO BUSCAR",
                               porZona: { MANO: "COGER DE LA MANO", MAZO: "BUSCAR EN EL MAZO" } },
                  logNoValidas: "No hay armas 'melé' válidas en tu mano ni en tu mazo.",
                  logNoEncontrada: "No hay ningún arma 'melé' ahí.",
                  log: "¡{carta} genera y se equipa con {objetivo} ignorando sus condiciones!",
                  barajarDespues: { log: "Barajando el mazo...", soloSiDelMazo: true } },
                { op: "ELEGIR", de: "ENEMIGOS", zona: "VANGUARDIA", cantidad: 1, cancelable: false,
                  titulo: "Elige un enemigo para atacarlo con tu nueva arma",
                  efectos: [ { op: "ATACAR" } ] } ] }
        ],
    },
    {
        name: "Domador", type: "Ayuda", subtype: "Ser vivo", tags: ["Consumible"], rarity: "C", cost: 1, series: 2,
        text: "Elige un aliado con etiqueta 'Animal salvaje'. Aumenta su Def y Atq en 2 permanentemente (mientras siga en juego).",
        // Migrada (29-jul-2026): mismo patrón que Poción revitalizante (JUGAR requisitos +
        // AL_CONSUMIR con ELEGIR en tablero), pero con `stats` en MARCAR_TEMPORAL (28-jul-2026,
        // Capitán Guardia Real) en vez de un onUpdateTempEffect a mano — no hace falta escribirlo,
        // el compilador ya lo reaplica solo. "Permanente" sale gratis: sin duracion/
        // hastaFinDeTurnoPropio/hastaInicioTurnoLanzador, ninguno de los tres puntos de caducidad
        // genéricos retira la marca nunca (replica el `return true` a mano de la vieja en
        // onStartTurnTempEffect/onEndTurnTempEffect). `tempEffectText` conserva LITERAL el texto
        // rico que tenía el onGetPreviewEffects a mano (orden DEF->ATQ, "(permanente)") vía el
        // mecanismo genérico ya existente (Clarise/PEM/Rebobinar/Canceladora) — sin él, la marca
        // habría quedado invisible en "Afectado por:" (le pasa hoy a LIDERAZGO, que no lo declara).
        tempEffectText: "+2 DEF y +2 ATQ (permanente)",
        abilities: [
            { trigger: "JUGAR", requisitos: [
                { count: { filtros: [ { campo: "tags", op: "includesCI", valor: "animal salvaje" } ] }, op: ">=", valor: 1, msg: "No tienes 'Animales salvajes' en el campo." } ] },
            { trigger: "AL_CONSUMIR",
              efectos: [
                { op: "ELEGIR", de: "ALIADOS", filtros: [ { campo: "tags", op: "includesCI", valor: "animal salvaje" } ], cantidad: 1,
                  titulo: "¿A qué animal domar?",
                  efectos: [
                    { op: "MARCAR_TEMPORAL", conOwner: true, actualizaPasivas: true, stats: { atk: 2, def: 2 },
                      floating: { texto: "DOMADO", estilo: "ft-ability", offset: -40 },
                      log: "¡{objetivo} ha sido domado y recibe +2 Atq y +2 Def!" },
                    { op: "FLOTANTE", texto: "+2 ATQ / +2 DEF", estilo: "ft-green", offset: -20 } ] } ] }
        ],
    },
    {
        name: "Gólem de tierra", hp: 4, def: 4, atk: 2, type: "Esbirro", subtype: "Ser mágico", tags: ["Invocación", "Gólem"], rarity: "B", cost: 1, series: 2,
        text: "A: SEÍSMO (1F): Elige a dos enemigos distintos de la vanguardia del rival para hacerle un ataque normal a cada uno.",
        activeName: "SEÍSMO", activeCost: 1,
        // SEÍSMO exige EXACTAMENTE 2 objetivos (a diferencia de SANCIÓN de Ángel, que
        // admite parar en 1 con canStopEarly y por eso se quedó imperativa): encaja
        // limpio en ELEGIR normal (sin hastaCantidad), que ya dedupe por sí solo
        // (pickBoardTargets/_dslPickClick) y cierra ATACAR por objetivo sin bucle a
        // mano — mismo patrón que Granada de maná pero con ATACAR en vez de daño fijo.
        abilities: [
            { trigger: "ACTIVA", nombre: "SEÍSMO", coste: { furor: 1 }, sinObjetivo: true,
              requisitos: [
                { count: { quien: "ENEMIGO", zona: "vanguardia", filtros: [ { campo: "isTaunt", op: "truthy", dePlantilla: true } ] }, op: "==", valor: 0, msg: "Hay un enemigo Provocando, no puedes atacar a objetivos múltiples." },
                { count: { quien: "ENEMIGO", zona: "vanguardia", filtros: [ { campo: "stealth", op: "falsy" } ] }, op: ">=", valor: 2, msg: "No hay suficientes enemigos válidos en vanguardia para SEÍSMO." } ],
              efectos: [
                { op: "ELEGIR", de: "ENEMIGOS", zona: "VANGUARDIA", cantidad: 2, filtros: [ { campo: "stealth", op: "falsy" } ], cancelable: false,
                  titulo: "SEÍSMO: elige 2 enemigos distintos de la vanguardia",
                  efectos: [ { op: "ATACAR" } ] } ] }
        ]
    },
    {
        name: "Karlos (KL)", hp: 6, def: 7, atk: 6, type: "Personaje", subtype: "Ser vivo", tags: ["Mercenario", "Usuario de VP"], gender: "M", rarity: "A", cost: 4, series: 2,
        // Requisito visible: a quién señala la flecha lima al presentarse (§14.bis).
        requisitoVisible: [ { quien: "ALIADO", algunFiltro: [ { campo: "name", op: "==", valor: "Karolina" }, { campo: "name", op: "==", valor: "Karlitos" }, { campo: "name", op: "==", valor: "Igniz" } ], uno: true } ],
        text: "Requisito: Karolina, Karlitos o Igniz en tu campo o bien Coste: 2 de Furor. P: DAME TRABAJOS: Si su Vida <= 3, +2 Atq. A: ULTRA-CHOQUE (2F): Dos ataques normales a vanguardia rival.",
        passiveName: "DAME TRABAJOS", activeName: "ULTRA-CHOQUE", activeCost: 2,
        abilities: [
            // Sin silencioso (Toto, 23-jul-2026): es la MISMA pasiva que MEGADRENALINA de
            // Karlos (base) con el mismo umbral — solo cambia el Coste/Requisito para colocar
            // al Personaje, no la pasiva en sí. La vieja nunca la anunciaba (asimetría sin
            // motivo aparente respecto a Karlos); se le da el mismo anuncio a propósito.
            { trigger: "PASIVA_CONTINUA", nombre: "DAME TRABAJOS",
              if: { campo: "self.hp", op: "<=", valor: 3 },
              then: [ { op: "MODIFICAR_STAT", stat: "atk", delta: 2 } ] }
        ],
        onBeforePlayAsync: async function(card, game, p) {
            const hasFriend = [...p.vanguard, ...p.rearguard].some(c => c.name === 'Karolina' || c.name === 'Karlitos' || c.name === 'Igniz');
            if (hasFriend) {
                game.logMsg(`Karlos (KL) se une al grupo sin cobrar.`, 'ability');
                return true;
            }

            // DSL.tributoFuror (Toto, 7-ago-2026): hacía a mano exactamente lo que el helper ya
            // hace -mismo filtro (Furor suficiente y no-Avatar), mismo cobro-, pero con el modal
            // genérico en vez del reborde verde en tablero.
            return await DSL.tributoFuror(card, game, p, 2, {
                msgSinPagador: "No tienes a Karolina/Karlitos/Igniz, ni aliados con 2 de Furor para pagarle.",
                titulo: 'DAME TRABAJOS: ELIGE QUIÉN PAGA (-2 FUROR)' });
        },
        canActivateAbility: function(card, game) {
            if (card.furor < 2) { game.logError("Falta Furor (2)."); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            const enemyP = game.players[enemyId];
            const hasTaunt = enemyP.vanguard.some(c => getCardTemplate(c.id).isTaunt);
            if (hasTaunt) { game.logError("Hay un enemigo Provocando, no puedes atacar a múltiples."); return false; }
            
            const valid = enemyP.vanguard.filter(c => !c.stealth);
            if (valid.length < 2) { game.logError("No hay suficientes enemigos válidos en vanguardia para SANCIÓN."); return false; }
            return true;
        },
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 2, name: 'ULTRA-CHOQUE', targetType: 'enemy', isNormalAttack: true };
            game.logMsg("Elige al primer objetivo del ultra-choque.", 'system');
            game.render();
        },
        onValidateTarget: function(card, target, game, isSilent) {
            if (target.location !== 'vanguard') return false;
            if (game.abilityContext.targets.some(t => t.instanceId === target.instanceId)) return false;
            return true;
        },
        hasMoreValidTargets: function(card, game) {
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            const enemyP = game.players[enemyId];
            const unselected = enemyP.vanguard.filter(c => !c.stealth && !game.abilityContext.targets.some(t => t.instanceId === c.instanceId)).length;
            return unselected > 0;
        },
        onTargetsReady: async function(card, game) {
            game.modifyStat(card, 'furor', -2);
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);
            game.inputState = 'EXECUTING';
            game.render();
            await game.sleep(800);

            const targets = game.abilityContext.targets;
            for (let target of targets) {
                if (card.currentHp <= 0) break;
                if (target.currentHp > 0) {
                    await game.performAttack(card, target);
                    await game.sleep(400);
                }
            }
            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.render();
        }
    },
    {
        name: "Poder Legado", type: "Ayuda", subtype: "Técnica", tags: ["Equipable"], rarity: "S", cost: 1, series: 2,
        // Requisito visible: a quién señala la flecha lima al presentarse (§14.bis).
        requisitoVisible: [ { quien: "ALIADO", zona: "vanguardia", filtros: [ { campo: "name", op: "contieneTexto", valor: "Karlos" }, { campo: "currentHp", op: "<=", valor: 1 } ], uno: true } ],
        text: "Requisito: un 'Karlos' de tu vanguardia con 1 de Vida o menos. Equípaselo: sus stats pasan a 9 y quedan fijas, y quien le ataque pierde 1 de Furor. Al inicio de tu próximo turno el equipo se destruye y Karlos vuelve a tu mano.",
        // Migrada (31-jul-2026), segunda de la tanda de equipos con vida propia. Reutiliza
        // `cuentaAtras` de Súper Evolución (aquí de UN solo turno) y estrena dos piezas:
        //   · `mientrasEquipado: {fijar:{...}, ignorarTopes:true}` — stats BLOQUEADOS a un valor
        //     en vez de sumados, con el ignoreStatCaps del motor para que ningún techo los baje
        //     ("inamovible", dice el texto). Hermano del `superStats` de Súper Evolución.
        //   · Trigger `EQUIPO_ANTES_DE_DEFENDER` -> onEquipBeforeDefend: el interceptor que corre
        //     cuando atacan a quien lleva el equipo. Es el hermano de ANTES_DE_DEFENDER, pero
        //     declarado desde el equipo y no desde la carta que defiende.
        // Al caducar basta con VOLVER_A_MANO con `reset`: resetCard llama a unequipAll, así que
        // el propio equipo se va a la basura solo -sin él, el Karlos volvería a la mano con los
        // stats aún bloqueados a 9 y el equipo encima-.
        // El detalle lo pinta la línea AUTOMÁTICA de stats (el registro de updatePassives), que
        // ya dice "+3 VIDA MÁX., +3 DEF y +4 ATQ" con los números reales de ESTE portador.
        // `notaEfecto` le añade lo único que los números no cuentan. Antes esto era un
        // `tempEffectText` escrito a mano que salía TRES veces en "Afectado por:" (Toto,
        // 31-jul-2026): una por ser equipo (sin el [n], porque ahí el 3er parámetro es la carta
        // equipada y no la marca), otra por tener marca temporal (con el [n]) y la automática.
        // `tempEffectSinLinea` mata además la línea genérica de la vista inversa.
        notaEfecto: "vuelve a la mano al inicio de tu próximo turno",
        tempEffectSinLinea: true,
        abilities: [
            { trigger: "JUGAR", requisitos: [
                { count: { quien: "ALIADO", zona: "vanguardia", filtros: [ { campo: "name", op: "contieneTexto", valor: "Karlos" }, { campo: "currentHp", op: "<=", valor: 1 } ] },
                  op: ">=", valor: 1, msg: "Necesitas un Karlos en vanguardia con 1 de Vida o menos." } ] },
            { trigger: "AL_EQUIPAR",
              mientrasEquipado: { fijar: { atk: 9, def: 9, hp: 9 }, ignorarTopes: true },
              efectos: [
                { op: "ELEGIR", de: "ALIADOS", zona: "VANGUARDIA", cantidad: 1,
                  filtros: [ { campo: "name", op: "contieneTexto", valor: "Karlos" }, { campo: "currentHp", op: "<=", valor: 1 } ],
                  titulo: "¿QUIÉN DESPIERTA EL PODER LEGADO?",
                  efectos: [
                    { op: "EQUIPAR",
                      floats: [ { texto: "PODER LEGADO", estilo: "ft-purple", offset: -40 } ],
                      log: "¡{objetivo} despierta su verdadero poder!" },
                    { op: "MARCAR_TEMPORAL", conOwner: true, duracion: 1,
                      cuentaAtras: {
                        log: "El Poder Legado ha consumido la energía de {objetivo}. Regresa a la mano.",
                        logTipo: "ability",
                        alCaducar: [ { op: "VOLVER_A_MANO", reset: true } ] } } ] } ] },
            { trigger: "EQUIPO_ANTES_DE_DEFENDER",
              log: "El aura del Poder Legado drena la energía de {objetivo}. (-1 Furor)",
              efectos: [
                { op: "MODIFICAR_STAT", stat: "furor", delta: -1,
                  floating: { texto: "-1 FUR (Aura)", estilo: "ft-red-stat", offset: -20 } } ] }
        ],
    },
    {
        name: "Igniz", hp: 3, def: 2, atk: 4, type: "Personaje", subtype: "Ser vivo", tags: ["Mercenario", "Procedencia virtual", "Energía Adán"], gender: "M", rarity: "A", cost: 4, series: 2,
        text: "P: CONOCIMIENTO TEÓRICO: Al colocar, puedes buscar una 'Ayuda' en tu mazo y añadirla a tu mano. Si buscas, baraja el mazo. A: LLAMAR MECA (2F): Busca 'Meca EBA' en mano o mazo y colócalo en campo. Si buscas en mazo, baraja. Puedes activar su Habilidad gratis de inmediato.",
        passiveName: "CONOCIMIENTO TEÓRICO", activeName: "LLAMAR MECA", activeCost: 2,
        
        // CONOCIMIENTO TEÓRICO migrada al op BUSCAR (13-ago-2026). Hacía a mano exactamente lo
        // que BUSCAR ya sabe: preguntar, abrir el visor del mazo, llevarse la elegida a la mano y
        // barajar. Al migrarla hereda gratis lo que le faltaba: el visor se abre AUNQUE no queden
        // Ayudas (norma de UX: la pila se enseña entera igual, con su aviso) y la carta se
        // PRESENTA camino de la mano, que es lo que hacía que el rival no llegara a verla.
        // `inclusoSinValidas`: si has mirado el mazo, se baraja aunque no te lleves nada.
        abilities: [
            { trigger: "AL_JUGAR",
              efectos: [
                { op: "BUSCAR", en: "MAZO", cantidad: 1, destino: "MANO",
                  filtros: [ { campo: "type", op: "==", valor: "Ayuda" } ],
                  confirmar: { titulo: "CONOCIMIENTO TEÓRICO", si: "BUSCAR AYUDA EN EL MAZO", no: "NO BUSCAR" },
                  titulo: "BUSCAR AYUDA",
                  log: "{jugador} obtiene {objetivo} gracias al Conocimiento Teórico de {carta}.",
                  logNoValidas: "No quedan cartas de Ayuda en el mazo de {jugador}.",
                  barajarDespues: { log: "Barajando el mazo de {jugador}...", inclusoSinValidas: true } } ] }
        ],
        
        canActivateAbility: function(card, game) {
            if (card.furor < 2) { game.logError("Falta Furor (2)."); return false; }
            const p = game.players[card.owner];
            if (p.vanguard.length >= 4 && p.rearguard.length >= 4) {
                game.logError("Tu campo está lleno. No puedes llamar al Meca.");
                return false;
            }
            const hasMeca = [...p.hand, ...p.deck].some(c => c.name === "Meca EBA");
            if (!hasMeca) {
                game.logError("No tienes 'Meca EBA' en mano ni mazo.");
                return false;
            }
            return true;
        },
        
        // --- ACTIVA CORREGIDA (Lógica de mano vs mazo) ---
        onExecuteAbility: async function(card, game) {
            // EL COSTE NO SE COBRA AQUÍ (§14, Toto 18-ago-2026). Se cobraba lo primero, antes
            // del modal, y luego se DEVOLVÍA al cancelar: es exactamente lo que la norma prohíbe
            // -nada irreversible mientras se pueda cancelar-. Ahora se cobra en el punto de
            // compromiso, que depende del camino, y no queda nada que devolver.
            const _cobrar = () => {
                if (card.__ignizCobrado) return;
                card.__ignizCobrado = true;
                game.modifyStat(card, 'furor', -2);
                showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);
            };
            // Salida limpia de una cancelación: sin esto Igniz se quedaba resaltada esperando algo
            // que ya no iba a pasar, con la X en gris y el velo diciendo "no puedes cancelar".
            const _abortar = () => {
                delete card.__ignizCobrado;
                game.cancelAction();
                game.inputState = 'IDLE';
                game.isActionLocked = false;
                game.selectedCard = null;
                game.render();
            };
            
            const p = game.players[card.owner];
            
            // 1. Miramos si hay Mecas en la mano
            const mecasInHand = p.hand.filter(c => c.name === "Meca EBA");
            let mecaToPlay = null;
            let searchedDeck = false;

            if (mecasInHand.length > 0) {
                // Preguntamos al jugador si quiere usar el de la mano o buscar en mazo
                const choice = await new Promise(resolve => {
                    game.openChoiceModal('¿DE DÓNDE LLAMAS AL MECA EBA?\n\nAtención: tienes un Meca EBA en la mano. Si buscas en el mazo y no queda ninguno, te quedarás sin llamarlo.', [
                        { label: 'DESDE LA MANO', action: () => resolve('hand') },
                        { label: 'BUSCAR EN EL MAZO', action: () => resolve('deck') },
                        { label: 'CANCELAR', action: () => resolve('cancel') }
                    ], card.owner);
                });

                if (choice === 'cancel') {
                    _abortar();   // nada que devolver: no se ha cobrado
                    return;
                } else if (choice === 'hand') {
                    _cobrar();   // punto de compromiso: la sacas de tu mano, ya es irreversible
                    mecaToPlay = mecasInHand[0]; // Coge el primero sin preguntar
                    // NO se saca de la mano aquí: lo hace la presentación, a la vez que arranca su
                    // clon del hueco exacto y el resto de la mano se desliza. Sacarla antes dejaba
                    // el estado y el DOM descompasados y se veía una COPIA en la mano mientras el
                    // original volaba (Toto, 18-ago-2026; van varias veces con este mismo fallo).
                } else if (choice === 'deck') {
                    searchedDeck = true;
                }
            } else {
                // Si no hay en mano, busca en mazo directamente
                searchedDeck = true;
            }

            // 2. Si ha decidido (o no le queda otra) que buscar en mazo:
            if (searchedDeck) {
                const validDeck = p.deck.filter(c => c.name === "Meca EBA");
                // §12.bis: el MAZO compromete al ABRIR el visor -mirarlo sería leerlo gratis-,
                // así que el coste se cobra justo antes. Si no queda ninguno se pierde, que es lo
                // que avisa el propio modal ("te quedarás sin llamarlo").
                _cobrar();
                const _elegida = await game.openDeckSearchViewer(card.owner, validDeck, 'BUSCAR MECA EBA EN MAZO', null, 1, 'deck', 'Meca EBA');
                const chosen = _elegida ? [_elegida] : [];
                
                // Barajamos SIEMPRE tras abrir el modal del mazo
                game.logMsg(`Barajando el mazo de ${game.getDisplayName(p.id)}...`, 'system');
                if (typeof animateShuffle === 'function') await animateShuffle(p.id);
                game.shuffle(p.deck);

                if (!chosen || chosen.length === 0) { _abortar(); return; }   // ya se cobró: §12.bis
                
                mecaToPlay = chosen[0];
                const dIdx = p.deck.findIndex(c => c.instanceId === mecaToPlay.instanceId);
                p.deck.splice(dIdx, 1);
            }

            // 3. Colocación y Activación
            _cobrar();                     // red por si un camino nuevo llegara aquí sin cobrar
            delete card.__ignizCobrado;    // marca de ESTA activación: no viaja con la carta
            game.logMsg(`¡Igniz llama a su ${game.getCardNameWithOwner(mecaToPlay)}!`, 'ability');

            const placeChoice = p.vanguard.length < 4 ? 'vanguard' : 'rearguard';
            // El Meca va AL CAMPO, no a la mano: antes usaba animateStackToHand -la animación de
            // "algo vuela a tu mano"- para una carta que aterriza en una fila, y con el cambio a
            // presentación eso la mandaba al escaparate rumbo a la mano para aparecer luego en el
            // tablero. Se presenta hacia su FILA, aterrizando en el hueco (Toto, 13-ago-2026).
            const _filaMeca = `#${p.id}-${placeChoice === 'rearguard' ? 'rearguard' : 'vanguard'}`;
            const _colocarMeca = () => {
                mecaToPlay.location = placeChoice;
                p[placeChoice].push(mecaToPlay);
                if (typeof game.render === 'function') game.render();
                return mecaToPlay.instanceId;
            };
            if (typeof animarPresentacionCarta === 'function') {
                // El ORIGEN es de donde sale de verdad. Estaba cableado al mazo, así que un Meca
                // cogido de la MANO se veía salir volando de la pila de la izquierda (Toto,
                // 18-ago-2026). El dorso igual: del mazo viene tapada; de la mano ya la veías.
                const _desdeMano = !searchedDeck;
                await animarPresentacionCarta(mecaToPlay.id,
                    _desdeMano ? `#${p.id}-hand` : `#${p.id}-deck-stack`, _filaMeca, !_desdeMano,
                    { zonaSel: _filaMeca, colocar: _colocarMeca,
                      // Las DOS piezas que hacen que una carta salga de la mano de verdad:
                      // `origenId` arranca su clon del hueco exacto y desliza el resto, y
                      // `alSalirDeLaMano` la saca del ESTADO en ese mismo instante. Faltando
                      // cualquiera de las dos se ve la copia fantasma. Lo comprueba
                      // tests/auditar_llegadas.js.
                      origenId: _desdeMano ? mecaToPlay.instanceId : null,
                      alSalirDeLaMano: _desdeMano ? () => {
                          const hi = p.hand.findIndex(c => c.instanceId === mecaToPlay.instanceId);
                          if (hi !== -1) p.hand.splice(hi, 1);
                      } : null });
            } else { _colocarMeca(); }

            const mecaTemplate = getCardTemplate(mecaToPlay.id);
            if (typeof mecaTemplate.onAfterPlayAsync === 'function') {
                await mecaTemplate.onAfterPlayAsync(mecaToPlay, game, p);
            }
            
            game.render();

            const validPilots = [...p.vanguard, ...p.rearguard, ...p.hand].filter(c => c.tags && c.tags.includes("Energía Adán"));
            if (validPilots.length > 0) {
                const wantPilot = await new Promise(resolve => {
                    game.openChoiceModal('¿ACTIVAR MECA EBA AHORA?', [
                        { label: 'SÍ (GRATIS)', action: () => resolve(true) },
                        { label: 'NO', action: () => resolve(false) }
                    ], card.owner);
                });

                if (wantPilot) {
                    await mecaTemplate.doEmplazarPiloto(mecaToPlay, game, true);
                }
            }

            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.updatePassives();
            game.render();
        }
    },
    {
        name: "Meca EBA", hp: 5, def: 7, atk: 6, type: "Esbirro", subtype: "Máquina", tags: ["Controlable"], rarity: "B", cost: 4, series: 2,
        text: "P: CONSUMO DESMESURADO: Máx 2 de Furor. Al colocar: +1 de Furor. No gana Furor en la Fase de Furor. Fin de tu turno: -1 de Furor; si baja a 0 así, se destruye. A: EMPLAZAR PILOTO (1F): Requiere un aliado con etiqueta 'Energía Adán' en campo o mano. Destrúyelo/descártalo (si en campo, intercambia posición con Meca EBA antes). Anula la Pasiva de este Meca.",
        passiveName: "CONSUMO DESMESURADO", activeName: "EMPLAZAR PILOTO", activeCost: 1,
        
        maxFuror: 2, // El motor ya se encarga de capar el límite con esta propiedad
        
        // Migrada la BATERÍA (5-ago-2026): el Furor inicial y el consumo de cada turno que la
        // desploma al llegar a 0. Usa el mismo op `CUENTA_ATRAS` que Diego Antonio, en su variante
        // sobre un STAT en vez de un contador: aquí el reloj ES el Furor. Se queda imperativo el
        // veto de ganancia pasiva (onBeforeGainFuror, sin trigger) y EMPLAZAR PILOTO, que
        // intercambia posiciones — la familia "swap", irreducible por §6 del doc de diseño.
        abilities: [
            { trigger: "AL_JUGAR",
              log: "{carta} entra al campo y gana 1 de Furor inicial.",
              efectos: [
                { op: "MODIFICAR_STAT", target: { quien: "SELF" }, stat: "furor", delta: 1,
                  floating: { texto: "CONSUMO DESMESURADO", estilo: "ft-ability", offset: -30 } } ] },
            { trigger: "FIN_TURNO", resumenFase: "Pierde 1 de Furor; si baja a 0 así, se destruye", porHabilidad: "CONSUMO DESMESURADO", 
              efectos: [
                { op: "CUENTA_ATRAS", target: { quien: "SELF" }, stat: "furor",
                  salvoSi: { campo: "pilotoEmplazado", op: "truthy" },
                  floating: { texto: "-1 FUR (Consumo)", estilo: "ft-red-stat", offset: -30 },
                  logCero: "¡A {carta} se le agotó la energía por completo y se desploma!",
                  alLlegarACero: [
                    { op: "MODIFICAR_STAT", stat: "currentHp", vaciar: true,
                      comprobarMuerte: true, sinRetribucion: true } ] } ] }
        ],

        
        onBeforeGainFuror: function(card, amount, source, game) {
            if (source === 'fase_furor' && !card.pilotoEmplazado) {
                game.logMsg(`${game.getCardNameWithOwner(card)} no recupera energía pasivamente.`, 'system');
                return 0; // Anula la ganancia pasiva en la fase de furor
            }
            return amount;
        },
        
        canActivateAbility: function(card, game) {
            if (card.furor < 1) { game.logError("Falta Furor (1)."); return false; }
            const p = game.players[card.owner];
            const valid = [...p.vanguard, ...p.rearguard, ...p.hand].filter(c => c.tags && c.tags.includes("Energía Adán"));
            if (valid.length === 0) { game.logError("No tienes aliados con 'Energía Adán' en campo ni en mano."); return false; }
            return true;
        },
        
        onExecuteAbility: async function(card, game) {
            // El coste NO se cobra aquí (Toto, 7-ago-2026). Antes se descontaba nada más
            // confirmar y, si cancelabas, se "devolvía" con un +1 FUR — un parche que ni
            // revierte de verdad (la acción ya se había gastado, así que la Activa quedaba
            // inservible ese turno) ni cumple la norma: el coste y el anuncio solo aparecen
            // cuando algo ya no se puede deshacer. Ahora lo cobra doEmplazarPiloto, justo
            // antes de mover al piloto, que es el primer punto irreversible.
            await getCardTemplate(card.id).doEmplazarPiloto(card, game, false);
        },
        
        // Función ayudante para que Igniz también pueda llamarla "gratis" si quiere
        doEmplazarPiloto: async function(card, game, isFree) {
            const p = game.players[card.owner];
            // Buscamos pilotos que no sean el propio Meca
            const _esPiloto = (c) => c.tags && c.tags.includes("Energía Adán") && c.instanceId !== card.instanceId;
            const enCampo = [...p.vanguard, ...p.rearguard].filter(_esPiloto);
            const enMano = p.hand.filter(_esPiloto);

            // Campo y mano NO se mezclan en un mismo selector (Toto, 7-ago-2026). Era la última
            // carta que lo hacía: el modal genérico las listaba juntas, sacándolas de su sitio.
            // Ahora, si hay pilotos en las dos zonas se pregunta primero por CUÁL, y cada una usa
            // su propio picker -campo con reborde verde en el tablero, mano oscureciendo todo lo
            // demás-. Con pilotos en una sola zona se va directo a ella, sin preguntar de más.
            let zona = enCampo.length ? 'CAMPO' : 'MANO';
            if (enCampo.length && enMano.length) {
                zona = await new Promise(resolve => {
                    game.openChoiceModal('¿DE DÓNDE SALE EL PILOTO?\n\nDel campo gastas un aliado ya colocado; de la mano, una carta que aún no has jugado.', [
                        { label: 'DEL CAMPO', action: () => resolve('CAMPO') },
                        { label: 'DE LA MANO', action: () => resolve('MANO') },
                        { label: 'CANCELAR', action: () => resolve(null) },
                    ], card.owner);
                });
            }
            const pool = zona === 'MANO' ? enMano : enCampo;
            const chosen = zona === null ? null
                : await game.pickBoardTargets(pool, 1, 'ELIGE PILOTO (ENERGÍA ADÁN)', card, card.owner, true,
                    { mano: zona === 'MANO' });
            if (!chosen || chosen.length === 0) {
                // Cancelado: NO se ha tocado nada, así que no hay nada que devolver ni que
                // gastar. La carta se queda con su Furor y con su acción del turno intactos.
                game.isActionLocked = false;
                game.cancelAction();
                game.render();
                return;
            }
            
            const pilot = chosen[0];
            // PUNTO IRREVERSIBLE: a partir de aquí el piloto se mueve. Aquí y no antes es donde
            // se paga y se anuncia.
            if (!isFree) game.modifyStat(card, 'furor', -1);
            showFloatingText(card.instanceId, "EMPLAZAR PILOTO", "ft-ability", -40);

            if (pilot.location === 'hand') {
                const idx = p.hand.findIndex(c => c.instanceId === pilot.instanceId);
                p.hand.splice(idx, 1);
                
                if (typeof game.resetCard === 'function') game.resetCard(pilot);
                p.discard.push(pilot);
                pilot.location = 'discard';
                game.logMsg(`¡${game.getCardNameWithOwner(pilot)} aborda el ${game.getCardNameWithOwner(card)} saltando desde la mano!`, 'ability');
            } else {
                game.logMsg(`¡${game.getCardNameWithOwner(pilot)} corre a abordar el ${game.getCardNameWithOwner(card)} en el campo!`, 'ability');
                
                if (typeof game.animateSwap === 'function') {
                    await game.animateSwap(card.instanceId, pilot.instanceId);
                }
                
                const cardArray = p[card.location];
                const pilotArray = p[pilot.location];

                const cIdx = cardArray.findIndex(c => c.instanceId === card.instanceId);
                const pIdx = pilotArray.findIndex(c => c.instanceId === pilot.instanceId);
                
                // Intercambio de matrices y ubicaciones
                cardArray[cIdx] = pilot;
                pilotArray[pIdx] = card;

                const tempLoc = card.location;
                card.location = pilot.location;
                pilot.location = tempLoc;

                // El piloto se destruye tras el intercambio
                pilot.currentHp = 0;
                await game.checkDeath(pilot, false);
            }

            card.pilotoEmplazado = true;
            game.logMsg(`${game.getCardNameWithOwner(card)} ahora tiene piloto. CONSUMO DESMESURADO desactivado.`, 'system');

            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.updatePassives();
            game.render();
        },
        
        onGetPreviewEffects: function(card, game) {
            if (card.pilotoEmplazado) return ["Piloto emplazado: Pasiva 'Consumo desmesurado' desactivada."];
            return [];
        }
    },
    {
        name: "Época de estudio", type: "Evento", rarity: "C", cost: 1, duration: 3, series: 2,
        // Requisito visible: a quién señala la flecha lima al presentarse (§14.bis).
        requisitoVisible: [ { quien: "ALIADO", algunFiltro: [ { campo: "tags", op: "includesCI", valor: "estudioso" }, { campo: "tags", op: "includesCI", valor: "estudiosa" } ], uno: true } ],
        text: "3 turnos. Requiere un aliado con etiqueta 'Estudioso' en el campo. Mientras esté en juego, los aliados con etiqueta 'Estudioso' no ganan Furor al inicio del turno y quedan Ocultos (inmunes a ataques normales). Al expirar, robas 2 cartas por cada aliado afectado.",
        abilities: [
            // Un solo PREVIEW_GLOBAL: el compilador coge el PRIMERO (`abs.find`), así que el
            // segundo que había aquí era código muerto -y decía lo mismo, peor y sin género-.
            { trigger: "PREVIEW_GLOBAL", lineas: [ { quien: "ALIADO", algunaEtiqueta: ["Estudioso", "Estudiosa"], texto: "No gana Furor al inicio del turno y permanece {genero?Oculto|Oculta}" } ] }
        ],
        // Ancla de las flechas del detalle. El automático solo lo genera el compilador para las
        // reglas de Furor DECLARATIVAS (GLOBAL_MODIFICAR_FUROR), y esta carta corta el Furor con
        // un hook imperativo (onGlobalBeforeGainFuror), así que se quedaba sin él: la flecha solo
        // llegaba a la badge de Oculto y no a la del Furor negado (Toto, 13-ago-2026).
        // Las DOS, porque la carta hace las dos cosas a la vez.
        onGlobalGetPreviewBadges: function(ev, targetCard, game) {
            if (targetCard.owner !== ev.owner) return [];
            const esEstudioso = targetCard.tags && (targetCard.tags.includes('Estudioso') || targetCard.tags.includes('Estudiosa'));
            return esEstudioso ? ['furor', 'oculto'] : [];
        },
        canPlayCard: function(card, game, p) {
            const hasEstudioso = [...p.vanguard, ...p.rearguard].some(c => c.tags && c.tags.includes('Estudioso'));
            if (!hasEstudioso) { game.logError("Necesitas al menos un aliado 'Estudioso' en el campo."); return false; }
            return true;
        },
        onPlay: function(card, game) {
            card.affectedEstudiosos = new Set(); // Empezamos a llevar la cuenta de afectados únicos
            game.logMsg(`¡Empieza la Época de estudio! Los estudiosos se ocultan a leer.`, 'ability');
        },
        onUpdatePassive: function(card, game, p) {
            if (!card.affectedEstudiosos) card.affectedEstudiosos = new Set();
            
            // Mantenemos ocultos a los estudiosos
            [...p.vanguard, ...p.rearguard].forEach(ally => {
                if (ally.tags && ally.tags.includes("Estudioso")) {
                    ally.stealth = true;
                    card.affectedEstudiosos.add(ally.instanceId); // Lo registramos para el robo final
                }
            });
        },
        onGlobalBeforeGainFuror: function(eventCard, targetCard, amount, game) {
            // Anula la ganancia de Furor si es Estudioso y es el turno pasivo
            if (targetCard.owner === eventCard.owner && targetCard.tags && targetCard.tags.includes("Estudioso")) {
                return 0; 
            }
            return amount;
        },
        onExpire: async function(card, game, playerId) {
            const p = game.players[playerId];
            const affectedCount = card.affectedEstudiosos ? card.affectedEstudiosos.size : 0;
            const drawAmount = affectedCount * 2;
            
            game.logMsg(`¡La Época de estudio ha terminado! Afectó a ${affectedCount} estudioso(s).`, 'ability');
            
            if (drawAmount > 0) {
                game.logMsg(`${game.getDisplayName(playerId)} roba ${drawAmount} cartas.`, 'system');
                for (let i = 0; i < drawAmount; i++) {
                    await game.drawCard(playerId);
                }
            }
        }
    },
    {
        name: "Arthas", hp: 2, def: 3, atk: 6, type: "Personaje", subtype: "Arma legendaria", tags: ["Equipable", "melé"], rarity: "B", cost: 4, series: 2,
        isDual: true, // <--- LA PALANCA PARA QUE EL MOTOR PINTE EL DEGRADADO
        text: "Requisito: Karolina no está en tu vanguardia; si entra, Arthas se autodestruye. P: HERRERO LEGENDARIO: Carta dual. Como Personaje: equípalo gratis a un aliado en tu turno, dejando su hueco; si el portador cae, vuelve al campo, o a descartes si no hay sitio. Como Ayuda: anexa a un aliado sin etiqueta 'Animal salvaje' ni 'Cosa', ni sea Karolina, y le da +3 de Atq.",
        passiveName: "HERRERO LEGENDARIO",
        
        canPlayCard: function(card, game, p) {
            if (p.vanguard.some(c => c.name === 'Karolina')) {
                game.logError("Arthas se niega a actuar si Karolina lidera la vanguardia.");
                return false;
            }
            return true;
        },

        // Límite de colocación alcanzado: saltamos el modal y vamos directos al modo Arma legendaria
        onDualLimitFallback: async function(card, game) {
            const p = game.players[card.owner];
            if (p.vanguard.some(c => c.name === 'Karolina')) {
                game.logError("Arthas se niega a actuar si Karolina lidera la vanguardia.");
                return;
            }
            game.selectedCard = card;
            game.inputState = 'SELECT_AYUDA_TARGET';
            game.logError("Ya has colocado un aliado: Arthas solo puede equiparse. Elige a un aliado digno.");
            game.render();
        },
        
        onBeforePlayAsync: async function(card, game, p) {
            if (p.vanguard.some(c => c.name === 'Karolina')) {
                game.logError("No puedes colocar a Arthas si Karolina está en tu vanguardia.");
                return false;
            }
            
            const choice = await new Promise(resolve => {
                game.openChoiceModal('¿CÓMO QUIERES JUGAR A ARTHAS?', [
                    { label: 'INVOCAR COMO PERSONAJE EN EL CAMPO', action: () => resolve('personaje') },
                    { label: 'EQUIPAR COMO ARMA LEGENDARIA A UN ALIADO', action: () => resolve('ayuda') },
                    { label: 'CANCELAR', action: () => resolve('cancel') }
                ], card.owner);
            });
            
            if (choice === 'cancel') return false;
            
            if (choice === 'ayuda') {
                game.selectedCard = card;
                game.inputState = 'SELECT_AYUDA_TARGET';
                game.logError("Elige a un aliado digno para empuñar a Arthas.");
                game.render();
                return false; 
            }
            
            return true;
        },

        onValidateTarget: function(card, target, game, isSilent) {
            if (target.owner !== card.owner) return false;
            if (target.instanceId === card.instanceId) return false; 
            
            if (target.name === 'Karolina') {
                if (!isSilent) game.logError("Arthas jamás servirá a Karolina.");
                return false;
            }
            if (target.tags && (target.tags.includes('Animal salvaje') || target.tags.includes('Cosa'))) {
                if (!isSilent) game.logError("Los animales y las cosas no saben usar armas legendarias.");
                return false;
            }
            return true;
        },

        onExecuteAyuda: async function(card, target, game) {
            const p = game.players[card.owner];
            
            const handIdx = p.hand.findIndex(c => c.instanceId === card.instanceId);
            if (handIdx !== -1) {
                p.hand.splice(handIdx, 1);
            } else {
                p.vanguard = p.vanguard.filter(c => c.instanceId !== card.instanceId);
                p.rearguard = p.rearguard.filter(c => c.instanceId !== card.instanceId);
            }
            
            if (!target.equippedCards) target.equippedCards = [];
            target.equippedCards.push(card);
            card.location = 'equipped';
            card.equippedTo = target.instanceId;
            
            showFloatingText(target.instanceId, "ARTHAS", "ft-purple", -40);
            game.logMsg(`¡${game.getCardNameWithOwner(target)} empuña al legendario Arthas!`, 'ability');
            
            return false; 
        },

        getCustomActions: function(card, game) {
            if ((card.location === 'vanguard' || card.location === 'rearguard') && !card.hasAttackedThisTurn) {
                return [{
                    label: 'EQUIPAR COMO ARMA',
                    color: '#8b5cf6', // <--- MORADO IDENTICO AL DE NÉMESIS
                    action: () => {
                        game.selectedCard = card;
                        game.inputState = 'SELECT_AYUDA_TARGET';
                        game.logMsg("Elige a un aliado para que empuñe a Arthas.", 'system');
                        game.render();
                    }
                }];
            }
            return [];
        },

        onUpdatePassive: function(card, game) {
            // Chequeo destructivo de Karolina
            if (card.location === 'vanguard' || card.location === 'rearguard' || card.location === 'equipped') {
                const p = game.players[card.owner];
                if (p.vanguard.some(c => c.name === 'Karolina')) {
                    if (!card.pendingArthasDestruction) {
                        card.pendingArthasDestruction = true;
                        game.logMsg(`¡Karolina pisa la vanguardia y Arthas deja de actuar por sí mismo!`, 'ability');
                        
                        if (card.location === 'equipped' && card.equippedTo) {
                            const host = game.findCard(card.equippedTo);
                            if (host && host.equippedCards) {
                                host.equippedCards = host.equippedCards.filter(eq => eq.instanceId !== card.instanceId);
                            }
                        }
                        
                        card.currentHp = 0;
                        setTimeout(async () => {
                            await game.checkDeath(card, true); 
                            game.render();
                        }, 50); 
                    }
                }
            }
        },

        onEquipUpdate: function(equipCard, target, game) {
            target.currentAtk += 3;
        },

        onUnequip: function(equipCard, hostCard, game) {
            const p = game.players[equipCard.owner];
            
            // Contamos cuántos Personajes hay exactamente en cada fila
            const vangPers = p.vanguard.filter(c => c.type === 'Personaje').length;
            const rearPers = p.rearguard.filter(c => c.type === 'Personaje').length;
            
            let placeChoice = null;
            
            // Comprobamos cupo global (< 4) y cupo de Personajes (< 2)
            if (p.vanguard.length < 4 && vangPers < 2) {
                placeChoice = 'vanguard';
            } else if (p.rearguard.length < 4 && rearPers < 2) {
                placeChoice = 'rearguard';
            }
            
            if (!placeChoice) {
                game.logMsg(`¡${game.getCardNameWithOwner(hostCard)} cae, pero no hay hueco para Arthas (límite de Personajes)! Arthas se pierde en los descartes.`, 'system');
                equipCard.equippedTo = null;
                return false; // Devuelve false -> El motor lo manda a descartes
            }
            
            equipCard.location = placeChoice;
            equipCard.equippedTo = null;
            p[placeChoice].push(equipCard);
            game.logMsg(`¡Al perder a su portador, Arthas recobra su forma y cae en la ${placeChoice}!`, 'ability');
            
            equipCard.currentHp = getCardTemplate(equipCard.id).hp;
            equipCard.hasAttackedThisTurn = true; 
            
            return true; // Devuelve true -> El motor NO lo manda a descartes
        }
    },
    {
        name: "NoName", hp: 3, def: 3, atk: 6, type: "Personaje", subtype: "Máquina", tags: ["Con conciencia"], gender: "M", rarity: "S", cost: 1, series: 2,
        text: "P: ABSORCIÓN DE MAGIA: Mientras esté en vanguardia, el rival no gana Furor al inicio de turno, y todos los ataques especiales enemigos hacen 0 daño. A: RÉPLICA (? de Furor): Copia la Habilidad Activa de un enemigo y úsala en su contra (requiere el mismo coste).",
        passiveName: "ABSORCIÓN DE MAGIA", activeName: "RÉPLICA", activeCost: 0,
        uncopyable: true, // NoName no puede copiar a NoName
        
        onGlobalBeforeGainFuror: function(vCard, targetCard, amount, game, source) {
            if (vCard.location === 'vanguard' && targetCard.owner !== vCard.owner && source === 'fase_furor') {
                return 0; // Neutraliza el Furor pasivo enemigo
            }
            return amount;
        },
        
        onGlobalBeforeTakeDamage: function(vCard, attacker, defender, dmg, isSpecial, game) {
            if (vCard.location === 'vanguard' && attacker.owner !== vCard.owner && isSpecial) {
                game.logMsg(`¡ABSORCIÓN DE MAGIA! NoName desintegra el daño del ataque especial de ${game.getCardNameWithOwner(attacker)}.`, 'ability');
                return 0;
            }
            return dmg;
        },

        // --- SISTEMA DE REFLEXIÓN DE CÓDIGO (RÉPLICA) ---
        canActivateAbility: function(card, game) {
            if (card.mimicId) {
                const mimicTemplate = getCardTemplate(card.mimicId);
                if (typeof mimicTemplate.canActivateAbility === 'function') return mimicTemplate.canActivateAbility(card, game);
                return true;
            }
            
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            const validEnemies = [...game.players[enemyId].vanguard, ...game.players[enemyId].rearguard].filter(c => {
                const temp = getCardTemplate(c.id);
                return temp.activeName && !temp.uncopyable && card.furor >= (temp.activeCost || 1);
            });
            if (validEnemies.length === 0) {
                game.logError("El rival no tiene Habilidades Activas que seas capaz de costear o replicar.");
                return false;
            }
            return true;
        },
        
        onExecuteAbility: function(card, game) {
            if (card.mimicId) {
                const mimicTemplate = getCardTemplate(card.mimicId);
                if (typeof mimicTemplate.onExecuteAbility === 'function') mimicTemplate.onExecuteAbility(card, game);
                return;
            }
            
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 1, name: 'RÉPLICA', targetType: 'enemy' };
            game.logMsg("RÉPLICA: Escanea a un enemigo para plagiar su Habilidad Activa.", 'system');
            game.render();
        },
        
        onValidateTarget: function(card, target, game, isSilent = false) {
            if (card.mimicId) {
                const mimicTemplate = getCardTemplate(card.mimicId);
                if (typeof mimicTemplate.onValidateTarget === 'function') return mimicTemplate.onValidateTarget(card, target, game, isSilent);
                return true;
            }
            
            if (target.owner === card.owner) return false;
            const temp = getCardTemplate(target.id);
            if (!temp.activeName || temp.uncopyable) {
                if (!isSilent) game.logError("Esta carta no tiene una habilidad replicable.");
                return false;
            }
            const cost = temp.activeCost || 1;
            if (card.furor < cost) {
                if (!isSilent) game.logError(`Sistema insuficiente: Necesitas ${cost} Furor para copiar esa habilidad.`);
                return false;
            }
            return true;
        },
        
        hasMoreValidTargets: function(card, game) {
            if (card.mimicId) {
                const mimicTemplate = getCardTemplate(card.mimicId);
                if (typeof mimicTemplate.hasMoreValidTargets === 'function') return mimicTemplate.hasMoreValidTargets(card, game);
            }
            return false;
        },
        
        onTargetsReady: async function(card, game) {
            if (card.mimicId) {
                const mimicTemplate = getCardTemplate(card.mimicId);
                if (typeof mimicTemplate.onTargetsReady === 'function') await mimicTemplate.onTargetsReady(card, game);
                return;
            }
            
            const target = game.abilityContext.targets[0];
            const mimicTemplate = getCardTemplate(target.id);
            
            // Verificamos si, asumiendo su identidad, realmente podríamos activarla
            card.mimicId = target.id;
            
            if (typeof mimicTemplate.canActivateAbility === 'function') {
                if (!mimicTemplate.canActivateAbility(card, game)) {
                    game.logMsg(`¡NoName escaneó [${mimicTemplate.activeName}], pero las condiciones del campo no permiten ejecutarla!`, 'system');
                    card.mimicId = null; // Borramos la memoria RAM
                    game.isActionLocked = false;
                    game.cancelAction();
                    game.render();
                    return;
                }
            }

            game.logMsg(`¡NoName escanea y replica [${mimicTemplate.activeName}] de ${game.getCardNameWithOwner(target)}!`, 'ability');
            showFloatingText(card.instanceId, "RÉPLICA", "ft-ability", -40);
            
            await game.sleep(500);
            
            // Re-enrutamos la matriz de ejecución hacia la carta original haciéndole creer que somos ella
            if (typeof mimicTemplate.onExecuteAbility === 'function') {
                mimicTemplate.onExecuteAbility(card, game);
            } else {
                card.exhausted = true;
                game.isActionLocked = false;
                game.cancelAction();
                game.render();
            }
        },
        
        onTypeSelected: function(card, type, game) {
            if (card.mimicId) {
                const mimicTemplate = getCardTemplate(card.mimicId);
                if (typeof mimicTemplate.onTypeSelected === 'function') mimicTemplate.onTypeSelected(card, type, game);
            }
        },
        
        onHandViewClosed: function(card, game) {
            if (card.mimicId) {
                const mimicTemplate = getCardTemplate(card.mimicId);
                if (typeof mimicTemplate.onHandViewClosed === 'function') mimicTemplate.onHandViewClosed(card, game);
            }
        },
        
        getAbilityWarning: function(card, game) {
            if (card.mimicId) {
                const mimicTemplate = getCardTemplate(card.mimicId);
                if (typeof mimicTemplate.getAbilityWarning === 'function') return mimicTemplate.getAbilityWarning(card, game);
            }
            return null;
        },

        // Limpiador automático si el usuario se arrepiente a mitad de plagio
        onCancelAbility: function(card, game) {
            card.mimicId = null;
        }
    },
    {
        id: 901, name: "Clon de NoName", hp: 3, def: 3, atk: 6, type: "Esbirro", subtype: "Máquina", tags: ["Con conciencia"], gender: "M", rarity: "S", cost: 0, series: 1,
        isToken: true, // Etiqueta clave para ocultarlo
        reverseArrow: true, 
        text: "Copia el Atq y Def de NoName en todo momento. Tiene Vida propia, no gana Furor y no puede usar Habilidades. Si NoName deja el campo, se desvanece.",
        // Migrado a DSL (trigger ESPEJO, 21-jul-2026). Idéntico al Clon de Unmei.
        abilities: [{ trigger: "ESPEJO", de: "parentId", copiar: ["currentAtk", "currentDef"], furorCero: true, muerteSiSinPadre: true }]
    },
    {
        name: "Capitán Guardia Real", hp: 3, def: 4, atk: 5, type: "Esbirro", subtype: "Ser vivo", tags: ["Guardia Real", "Traje protector"], rarity: "A", cost: 1, series: 2,
        text: "A: LIDERAZGO (1F): Elige un aliado de tu vanguardia que no haya atacado. +2 Atq hasta el final del turno. Puedes usarla desde retaguardia.",
        activeName: "LIDERAZGO", activeCost: 1,
        canUseAbilityFromRearguard: true,
        
        // ACTIVA migrada (28-jul-2026, tanda de volumen #2). Estrena `stats` en
        // MARCAR_TEMPORAL: bono continuo de Atq/Def mientras la marca dure, sin escribir un
        // onUpdateTempEffect a mano (el compilador lo genera solo, reutilizable por cualquier
        // carta futura con este mismo patrón "+N hasta que se cumpla X"). El log de expiración
        // SÍ se queda a mano (más abajo): el `hastaFinDeTurnoPropio` genérico no anuncia nada al
        // caducar, y aquí Toto quería avisar. `duracion: 1` (mismo campo de Poción revitalizante)
        // es SOLO para que "Afectado por:" muestre "(1 turno restante)" — nada lo decrementa,
        // porque siempre es literalmente cierto mientras la marca exista: expira sí o sí al
        // final de este mismo turno (hastaFinDeTurnoPropio es quien de verdad la quita).
        abilities: [
            { trigger: "ACTIVA", nombre: "LIDERAZGO", coste: { furor: 1 },
              requisitos: [ { count: { zona: "vanguardia", filtros: [ { campo: "hasAttackedThisTurn", op: "falsy" } ] }, op: ">=", valor: 1, msg: "No hay aliados válidos en vanguardia que no hayan atacado." } ],
              target: { quien: "ALIADO", cantidad: 1 },
              validarObjetivo: [
                { campo: "location", op: "==", valor: "vanguard" },
                { campo: "hasAttackedThisTurn", op: "falsy", msg: "Ese aliado ya ha atacado este turno." }
              ],
              efectos: [
                { op: "MARCAR_TEMPORAL", conOwner: true, actualizaPasivas: true, hastaFinDeTurnoPropio: true, duracion: 1,
                  stats: { atk: 2 },
                  floating: { texto: "+2 ATQ", estilo: "ft-green", offset: -20 },
                  log: "{carta} motiva profundamente a {objetivo}. (+2 ATQ temporal)" }
              ] }
        ],
        onEndTurnTempEffect: function(target, effect, game, currentTurnPlayerId) {
            if (effect.hastaFinDeTurnoPropio && target.owner === currentTurnPlayerId) {
                game.logMsg(`El Liderazgo sobre ${DSL._nombre(game, target)} expira.`, 'system');
                return false;
            }
            return true;
        }
    },
    {
        name: "Llamada del deber", type: "Evento", rarity: "B", cost: 1, duration: 2, series: 2,
        text: "2 turnos. Al colocarla, los aliados con etiqueta 'Guardia Real' ganan 1 de Furor. Mientras esté en juego, al final de tu turno puedes buscar una carta con etiqueta 'Guardia Real' en tu mazo, añadirla a la mano y barajar.",
        abilities: [
            { trigger: "AL_JUGAR", log: "¡Llamada del deber activada!", logTipo: "ability" },
            { trigger: "AL_ENTRAR", si: { quien: "ALIADO", algunaEtiqueta: ["Guardia Real"] }, marcador: "llamadaBuffed",
              efectos: [ { op: "MODIFICAR_STAT", stat: "furor", valor: 1, floating: "+1 FUR", floatingStyle: "ft-green", offsetFloating: -20,
                           log: "¡Llamada del deber inspira a {objetivo}!" } ] },
            { trigger: "FIN_TURNO", resumenFase: "Puede buscar una carta con etiqueta 'Guardia Real' en su mazo", soloTurnoPropio: true,
              efectos: [
                { op: "BUSCAR", en: "MAZO", cantidad: 1, destino: "MANO",
                  filtros: [ { campo: "tags", op: "includes", valor: "Guardia Real" } ],
                  preguntarSiempre: true,
                  confirmar: { titulo: "LLAMADA DEL DEBER", si: "BUSCAR GUARDIA REAL EN MAZO", no: "NO BUSCAR" },
                  titulo: "RECLUTAR GUARDIA REAL",
                  log: "{jugador} recluta a {objetivo} desde su cuartel.",
                  barajarDespues: { log: "Barajando el mazo de {jugador}..." } } ] },
            { trigger: "AL_CADUCAR", log: "La Llamada del deber se extingue.", logTipo: "system" }
        ],
    },
    {
        name: "Clarise", hp: 4, def: 3, atk: 6, type: "Personaje", subtype: "Ser vivo", tags: ["Usuaria de VP", "Estudiosa"], gender: "F", rarity: "C", cost: 1, series: 2,
        text: "A: PESANTEZ MUTUA (1F): El enemigo que elijas no podrá realizar ataques normales en el próximo turno del rival (sí Habilidades, pero fallarán si involucran ataques).",
        activeName: "PESANTEZ MUTUA", activeCost: 1,
        // Migrada por completo (28-jul-2026). Estrena dos piezas simétricas a las de LIDERAZGO:
        // `vetoAtaqueNormal` (veto continuo mientras dure la marca, como `stats` es un bono
        // continuo) y `hastaInicioTurnoLanzador` (caduca al empezar el turno de quien la puso,
        // o sea que cubre exactamente el turno del rival). Los dos textos van en plantilla,
        // mismo sitio que el `tempEffectText` del preview, porque los hooks genéricos reciben
        // la marca y no el op que la creó — y meter strings en la marca ensuciaría el estado
        // exportado. `tempEffectText` es nuevo: la imperativa no mostraba NADA en el detalle
        // sobre la Pesantez, ahora sale en "Afectado por:" como cualquier otro efecto temporal.
        tempEffectText: "{genero?Inmovilizado|Inmovilizada} por Pesantez Mutua: no puede realizar ataques normales",
        tempEffectVetoLog: "¡PESANTEZ MUTUA! {objetivo} está {genero?inmovilizado|inmovilizada} y no puede realizar ataques físicos.",
        tempEffectExpiraLog: "La Pesantez Mutua sobre {objetivo} desaparece.",
        abilities: [
            { trigger: "ACTIVA", nombre: "PESANTEZ MUTUA", coste: { furor: 1 },
              requisitos: [ { count: { quien: "ENEMIGO" }, op: ">=", valor: 1 } ],
              target: { quien: "ENEMIGO", cantidad: 1 },
              efectos: [
                { op: "MARCAR_TEMPORAL", conOwner: true, vetoAtaqueNormal: true, hastaInicioTurnoLanzador: true, duracion: 1,
                  floating: { texto: "INMOVILIZADO", estilo: "ft-purple", offset: -30 },
                  log: "¡{objetivo} sufre Pesantez Mutua! Sus piernas pesan toneladas." } ] }
        ]
    },
    {
        name: "Alumno con VP", hp: 2, def: 1, atk: 3, type: "Esbirro", subtype: "Ser vivo", tags: ["Usuario de VP", "Estudioso"], rarity: "C", cost: 1, series: 2,
        text: "A: ACERTIJO (1F): Moneda. Cara: Elige enemigo y le quita 2 de Furor. Cruz: Rival elige enemigo y le quita 1 de Furor.",
        activeName: "ACERTIJO", activeCost: 1,
        // Migrada al DSL. Cambio de comportamiento deliberado: la comprobación de
        // "hay enemigos" pasa a requisitos (como Contendiente/Sra. Kumicho), así que
        // se evalúa ANTES de pagar el Furor y lanzar la moneda. La imperativa
        // gastaba ambos igualmente cuando no había objetivos válidos.
        abilities: [
            { trigger: "ACTIVA", nombre: "ACERTIJO", coste: { furor: 1 }, sinObjetivo: true,
              requisitos: [ { count: { quien: "ENEMIGO" }, op: ">=", valor: 1, msg: "No hay enemigos para escuchar el acertijo." } ],
              efectos: [
                { op: "MONEDA",
                  logCara: { msg: "Moneda: CARA - Tú eliges a quién vaciarle la mente.", tipo: "ability" },
                  cara: [
                    { op: "ELEGIR", de: "ENEMIGOS", cantidad: 1, cancelable: false, titulo: "ACERTIJO (CARA): TÚ ELIGES (-2 FUR)",
                      efectos: [ { op: "MODIFICAR_STAT", stat: "furor", delta: -2, log: "¡{objetivo} no sabe la respuesta y pierde 2 de Furor!" } ] } ],
                  logCruz: { msg: "Moneda: CRUZ - El rival decide quién de sus tropas sufrirá la jaqueca.", tipo: "ability" },
                  cruz: [
                    { op: "ELEGIR", de: "ENEMIGOS", elegidoPor: "RIVAL", cantidad: 1, cancelable: false, titulo: "ACERTIJO (CRUZ): ELIGE UN ALIADO PARA PERDER 1 FUR",
                      efectos: [ { op: "MODIFICAR_STAT", stat: "furor", delta: -1, log: "El rival decide sacrificar 1 Furor de {objetivo}." } ] } ] } ] }
        ],
    },
    {
        name: "Frikazo", hp: 3, def: 2, atk: 2, type: "Esbirro", subtype: "Ser vivo", tags: ["Estudioso", "Otaku"], rarity: "C", cost: 1, series: 2,
        text: "A: FIJACIÓN (1F): Anexa a un Personaje aliado. Mientras esté activo, Frikazo recibe en su lugar los ataques que vayan dirigidos a ese Personaje. Reusable.",
        activeName: "FIJACIÓN", activeCost: 1,
        // Migrada (31-jul-2026). FIJACIÓN ancla AL REVÉS que Gladiador/Kazuo (ver la nota junto
        // a `reverse` en el op ANEXAR): el Personaje protegido guarda `attachments` (el bucle
        // de interceptores de index.html recorre `currentDefender.attachments`), Frikazo guarda
        // `attachedTo`. `INTERCEPTOR_ATAQUE` (trigger nuevo) compila a `onInterceptAttack`, un
        // hook YA genérico en el motor (el bucle soporta cualquier carta anexada que lo
        // implemente, hoy solo Frikazo) — sin prompt/moneda, siempre redirige mientras el
        // vínculo esté activo.
        abilities: [
            { trigger: "ACTIVA", nombre: "FIJACIÓN", coste: { furor: 1 }, sinObjetivo: true,
              requisitos: [
                { count: { quien: "ALIADO", filtros: [ { campo: "type", op: "==", valor: "Personaje" } ] }, op: ">=", valor: 1,
                  msg: "No hay Personajes aliados a los que proteger." } ],
              efectos: [
                { op: "ELEGIR", de: "ALIADOS", filtros: [ { campo: "type", op: "==", valor: "Personaje" } ], cantidad: 1, cancelable: false,
                  guardaEn: "objetivo", logDespues: "¡{carta} se vuelve el fan número 1 de {objetivo} y lo protegerá con su vida!",
                  efectos: [ { op: "ANEXAR", reverse: true } ] } ] },
            { trigger: "INTERCEPTOR_ATAQUE", nombre: "FIJACIÓN",
              log: "¡FIJACIÓN! {carta} se lanza cual guardaespaldas a recibir el golpe en lugar de {defensor}.",
              floating: { texto: "¡CUIDADO!", estilo: "ft-purple", offset: -30 } }
        ],
    },
    {
        name: "Gladiador", hp: 5, def: 4, atk: 5, type: "Personaje", subtype: "Ser vivo", tags: ["Mercenario", "Draconiano", "Maleante"], rarity: "C", cost: 1, series: 2,
        text: "P: OBSESIÓN DE VENGANZA: Al colocar: puedes anexarle un aliado de tu campo. Mientras la unión dure, gana +1 de Vida, Def y Atq. Al romperse, su Vida nunca baja a 0 por ello.",
        passiveName: "OBSESIÓN DE VENGANZA",
        // Sin annexEffectText: igual que Kazuo, el +1 lo recibe Gladiador y su propia línea de
        // stats ya lo declara ("+1 VIDA MÁX., +1 DEF y +1 ATQ por OBSESIÓN DE VENGANZA").
        // ANEXAR (Toto, 27-jul-2026): mismo criterio que Kazuo (ver su comentario) — el
        // vínculo pasa por el ELEGIR en tablero (norma del proyecto) en vez del modal
        // genérico, y ahora es cancelable (nada irreversible se ha comprometido aún).
        // NO silencioso (a diferencia de Kazuo/Xidachane/Karolina): aquí SÍ interesa el
        // anuncio genérico de activación/desactivación de PASIVA_CONTINUA, porque es el
        // único sitio que anuncia la ROTURA del vínculo (antes, un log a mano); se
        // estandariza al mismo formato ya aprobado por Toto para Karlos/Kyle. El +1 Vida
        // Máx. (con el suelo de 1 al perderlo) lo cubre el manejo de "hp" ya genérico del
        // compilador de PASIVA_CONTINUA — el mismo mecanismo por el que se diseñó.
        abilities: [
            { trigger: "AL_JUGAR", efectos: [
                { op: "ELEGIR", de: "ALIADOS", cantidad: 1, excluirSelf: true, opcional: true,
                  titulo: "OBSESIÓN DE VENGANZA: ANEXAR ALIADO", guardaEn: "aliado",
                  logDespues: "¡Gladiador se obsesiona y anexa a {aliado}!",
                  efectos: [ { op: "ANEXAR" } ] } ] },
            { trigger: "PASIVA_CONTINUA", nombre: "OBSESIÓN DE VENGANZA",
              if: { anexoValido: true },
              then: [
                { op: "MODIFICAR_STAT", stat: "hp", delta: 1 },
                { op: "MODIFICAR_STAT", stat: "def", delta: 1 },
                { op: "MODIFICAR_STAT", stat: "atk", delta: 1 } ] }
        ],
    },
    {
        name: "Contendiente", hp: 3, def: 3, atk: 4, type: "Esbirro", subtype: "Ser vivo", tags: ["Guardia Real", "Draconiana", "Maleante"], rarity: "C", cost: 1, series: 2,
        text: "A: BOMBAZO (1F): Ataque normal con +2 Atq durante el golpe. Lanza moneda: Cruz = pierde 1 Vida.",
        activeName: "BOMBAZO", activeCost: 1,
        abilities: [
            { trigger: "ACTIVA", nombre: "BOMBAZO", coste: { furor: 1 },
              requisitos: [ { count: { quien: "ENEMIGO", zona: "vanguardia" }, op: ">=", valor: 1 } ],
              target: { quien: "ENEMIGO", cantidad: 1 },
              ataqueNormal: true,
              floatingExtra: [ { texto: "+2 ATQ", estilo: "ft-green", offset: -10 } ],
              efectos: [
                { op: "ATACAR", bonoAtq: 2 },
                { if: { campo: "self.hp", op: ">", valor: 0 },
                  op: "MONEDA", target: { quien: "SELF" },
                  logCruz: { msg: "Moneda: CRUZ - ¡El retroceso del Bombazo hiere a Contendiente!", tipo: "combat" },
                  cruz: [ { op: "MODIFICAR_STAT", stat: "currentHp", delta: -1, fuente: null, comprobarMuerte: true } ],
                  logCara: { msg: "Moneda: CARA - Contendiente soporta el retroceso intacta.", tipo: "neutral" } }
              ] }
        ]
    },
    {
        name: "Investigar y desarrollar", type: "Evento", rarity: "B", cost: 1, duration: 3, series: 2,
        text: "3 turnos. Mientras esté en juego, los aliados con etiqueta 'Científico' ganan +1 de Furor al inicio del turno (incluso en retaguardia). Al expirar, robas 3 cartas y recuperas un Esbirro 'No-muerto' o con etiqueta 'Creación artificial' del descarte.",
        abilities: [
            { trigger: "AL_JUGAR", log: "¡La investigación comienza!" },
            { trigger: "GLOBAL_MODIFICAR_FUROR", resumenFase: "Los aliados con etiqueta 'Científico' ganan 1 de Furor adicional, incluso en retaguardia", reglas: [
                { si: { origen: "fase_furor", objetivoDe: "PROPIO", algunaEtiqueta: ["Científico", "Científica"] },
                  preview: "+1 de Furor extra en tu fase de Furor",
                  log: { msg: "¡{objetivo} investiga y gana Furor extra!", tipo: "ability" },
                  accion: { sumar: 1 } }
            ] },
            { trigger: "AL_CADUCAR", resumenFase: "Al expirar, roba 3 cartas y recupera un Esbirro 'No-muerto' o 'Creación artificial'", log: "¡La investigación concluye! {jugador} roba 3 cartas.", logTipo: "ability",
              efectos: [
                { op: "ROBAR", cantidad: 3, sinAnimacion: true, velocidad: 200, soloSiHayMazo: true },
                { op: "BUSCAR", en: "DESCARTES", cantidad: 1, destino: "MANO",
                  filtros: [ { campo: "type", op: "==", valor: "Esbirro" } ],
                  algunFiltro: [ { campo: "subtype", op: "==", valor: "No-muerto" }, { campo: "tags", op: "includes", valor: "Creación artificial" } ],
                  confirmar: { titulo: "RESULTADO DEL EXPERIMENTO", si: "RECUPERAR ESBIRRO DEL DESCARTE", no: "IGNORAR" },
                  titulo: "RECUPERAR ESBIRRO",
                  log: "{objetivo} es reanimado y se añade a la mano." } ] }
        ],
    },
    {
        name: "Investigador demente", hp: 3, def: 4, atk: 2, type: "Esbirro", subtype: "Ser vivo", tags: ["Científico"], gender: "M", rarity: "B", cost: 2, series: 2,
        text: "A: INYECCIÓN DE MEJUNJE (1F): Elige un enemigo y echa una moneda. Cara: Ataque normal y lo duerme 2 turnos. Cruz: Sólo le inflige Daño por tiempo 2 turnos.",
        activeName: "INYECCIÓN DE MEJUNJE", activeCost: 1,
        // Migrada por completo (28-jul-2026). Mismo patrón que Limo artificial: ATACAR
        // especial:false para el golpe de la rama CARA, con chequearEstado (la vieja SÍ
        // comprobaba checkAttackStatus antes de golpear, a diferencia de Limo artificial).
        // Aquí la moneda va ANTES del ataque (decide si se ataca o no), así que MONEDA envuelve
        // a ATACAR en vez de ir dentro de un siExito.
        abilities: [
            { trigger: "ACTIVA", nombre: "INYECCIÓN DE MEJUNJE", coste: { furor: 1 },
              requisitos: [ { count: { quien: "ENEMIGO", zona: "vanguardia" }, op: ">=", valor: 1 } ],
              target: { quien: "ENEMIGO", cantidad: 1 },
              validarObjetivo: [ { campo: "location", op: "==", valor: "vanguard", msg: "Debe estar en vanguardia." } ],
              efectos: [
                { op: "MONEDA",
                  logCara: { msg: "Moneda: CARA - ¡Ataque normal y sedante fuerte!", tipo: "ability" },
                  logCruz: { msg: "Moneda: CRUZ - ¡El mejunje le quema la piel! (Daño por tiempo 2T)", tipo: "ability" },
                  cara: [ { op: "ATACAR", especial: false, chequearEstado: true,
                            siExito: [ { op: "APLICAR_ESTADO", estado: "sueno", duracion: 2 } ] } ],
                  cruz: [ { op: "APLICAR_ESTADO", estado: "dot", duracion: 2 } ]
                }
              ] }
        ]
    },
    {
        name: "Ayudante perturbada", hp: 2, def: 2, atk: 3, type: "Esbirro", subtype: "Ser vivo", tags: ["Científica"], gender: "F", rarity: "C", cost: 1, series: 2,
        text: "P: MANO PARÁSITA: Cada vez que vaya a atacar, echa una moneda. Si sale cara, aumenta en 2 su Atq durante ese ataque.",
        passiveName: "MANO PARÁSITA",
        // Migrada (31-jul-2026): mismo esqueleto que Oni ancho (YŌKAI VIOLENTO) — ANTES_DE_ATACAR
        // + MONEDA + BONO_ATAQUE, que ya recompute vía updatePassives en vez de restar a mano
        // (evita el bug de doble resta documentado en Hiposaurio/Hawke/Guardia/Megalimo/Oni ancho).
        // `requiereObjetivo` (pieza nueva, ver el compilador) reproduce el "si es ataque directo,
        // sin defensor, saltar la moneda" que la vieja comprobaba a mano.
        abilities: [
            { trigger: "ANTES_DE_ATACAR", nombre: "MANO PARÁSITA", requiereObjetivo: true,
              log: "¡MANO PARÁSITA! La mano parásita reacciona...", logTipo: "ability",
              efectos: [
                { op: "MONEDA",
                  logCara: { msg: "Moneda: CARA - ¡La mano otorga fuerza sobrehumana! (+2 ATQ)", tipo: "ability" },
                  logCruz: { msg: "Moneda: CRUZ - La mano no coopera.", tipo: "neutral" },
                  cara: [ { op: "BONO_ATAQUE", valor: 2, floating: { texto: "+2 ATQ", estilo: "ft-green", offset: -20 } } ] } ] }
        ],
    },
    {
        name: "Feria del cómic", type: "Evento", rarity: "A", cost: 1, duration: 2, series: 2,
        text: "2 turnos. Mientras esté en juego, todo el campo sin la etiqueta 'Otaku' queda Silenciado. Al final de tu turno, moneda: con cara, busca una carta con etiqueta 'Otaku' en tu mazo y añádela a tu mano.",
        // Migrada al DSL (fase interceptores). Fidelidad: el AURA no exime a los
        // Avatares (la imperativa silenciaba también a Kami); se baraja aunque la
        // compra se cancele (la búsqueda ya revolvió el mazo); silencio si no hay
        // Otakus... solo el aviso, sin barajar. Logs visibles pasados a 3ª persona.
        abilities: [
            { trigger: "AL_JUGAR", log: "¡Empieza la Feria del Cómic! Hay demasiado ruido para concentrarse..." },
            { trigger: "AURA", quien: "CUALQUIERA",
              filtros: [ { no: true, campo: "tags", op: "includes", valor: "Otaku" }, { no: true, campo: "tags", op: "includes", valor: "otaku" } ],
              marcar: { campo: "isSilenced", valor: true } },
            { trigger: "PREVIEW_GLOBAL", lineas: [
                { quien: "CUALQUIERA", soloTipos: ["Personaje", "Esbirro"],
                  filtros: [ { no: true, campo: "tags", op: "includes", valor: "Otaku" }, { no: true, campo: "tags", op: "includes", valor: "otaku" } ],
                  texto: "{genero?Silenciado|Silenciada}" } ] },
            { trigger: "FIN_TURNO", resumenFase: "Moneda: con cara, busca una carta con etiqueta 'Otaku' en su mazo", soloTurnoPropio: true, log: "Feria del cómic: Buscando merchandising exclusivo...", logTipo: "system",
              efectos: [
                { op: "MONEDA",
                  logCara: { msg: "Moneda: CARA - ¡{jugador} ha encontrado algo genial en la Feria!", tipo: "ability" },
                  cara: [
                    { op: "BUSCAR", en: "MAZO", cantidad: 1, destino: "MANO",
                      algunFiltro: [ { campo: "tags", op: "includes", valor: "Otaku" }, { campo: "tags", op: "includes", valor: "otaku" } ],
                      preguntarSiempre: true,
                      confirmar: { titulo: "FERIA DEL CÓMIC", si: "COMPRAR MERCHANDISING (BUSCAR OTAKU)", no: "NO COMPRAR" },
                      titulo: "COMPRAR CARTA OTAKU",
                      log: "{jugador} añade {objetivo} a su mano.",
                      logNoValidas: "{jugador} ha mirado en todos los puestos, pero no quedan cartas Otaku en su mazo.",
                      barajarDespues: { log: "Barajando el mazo de {jugador}..." } } ],
                  logCruz: { msg: "Moneda: CRUZ - Había demasiada cola y {jugador} se fue con las manos vacías.", tipo: "neutral" } } ] },
            { trigger: "AL_CADUCAR", resumenFase: "Al expirar, los Silenciados se liberan", log: "La Feria del cómic cierra sus puertas.", logTipo: "system" }
        ],
    },
    {
        name: "Deuda con la mafia", type: "Evento", rarity: "A", cost: 1, duration: 2, series: 2,
        text: "2 turnos. Al colocarla, elige un aliado: queda Silenciado y no gana Furor mientras dure. Al expirar, busca en tu mazo una carta con etiqueta 'Mafia', añádela a la mano y baraja; el rival puede hacer lo mismo.",
        // Migrada al DSL (fase interceptores). El deudor se ancla en la propia
        // carta (mafiaTargetId, mismo campo que la imperativa: estado exportado
        // idéntico). El silencio es un AURA sobre ese id; el corte de Furor, una
        // regla GLOBAL_MODIFICAR_FUROR con objetivoSelfId. La elección previa a
        // la colocación (cancelable) vive en ANTES_DE_JUGAR.
        abilities: [
            { trigger: "PREVIEW_GLOBAL", lineas: [ { campoSelfId: "mafiaTargetId", texto: "{genero?Silenciado|Silenciada} y sin ganar Furor al inicio de cada turno por su deuda" } ] },
            { trigger: "JUGAR", requisitos: [
                { count: {}, op: ">=", valor: 1, msg: "Necesitas al menos 1 aliado en el campo para contraer la deuda." } ] },
            { trigger: "ANTES_DE_JUGAR",
              efectos: [
                { op: "ELEGIR", de: "ALIADOS", cantidad: 1,
                  titulo: "¿QUIÉN CONTRAE LA DEUDA?",
                  guardaIdEnSelf: "mafiaTargetId", guardaEn: "deudor" } ] },
            { trigger: "AL_JUGAR", log: "¡{deudor} se ha endeudado con la mafia! Queda {deudorG?silenciado|silenciada} y sin cobrar Furor." },
            { trigger: "AURA", quien: "ALIADO", soloSelfId: "mafiaTargetId",
              marcar: { campo: "isSilenced", valor: true } },
            { trigger: "GLOBAL_MODIFICAR_FUROR", resumenFase: "El aliado elegido no gana Furor", reglas: [
                { si: { origen: "fase_furor", objetivoSelfId: "mafiaTargetId" }, accion: { fijar: 0 } } ] },
            { trigger: "AL_CADUCAR", resumenFase: "Al expirar, ambos jugadores pueden buscar una carta con etiqueta 'Mafia' en su mazo", log: "¡La Deuda ha sido saldada! Ambos jugadores pueden contactar a la Mafia.",
              efectos: [
                { op: "BUSCAR", en: "MAZO", deQuien: "AMBOS", cantidad: 1, destino: "MANO",
                  algunFiltro: [ { campo: "tags", op: "includes", valor: "Mafia" }, { campo: "tags", op: "includes", valor: "mafia" } ],
                  preguntarSiempre: true,
                  confirmar: { titulo: "{jugador}: COBRAR FAVOR A LA MAFIA", si: "BUSCAR MAFIA EN EL MAZO", no: "NO BUSCAR" },
                  titulo: "{jugador}: Llama a un contacto",
                  log: "{jugador} recibe a {objetivo} desde el submundo.", logTipo: "system",
                  barajarDespues: { log: "Barajando el mazo de {jugador}..." } } ] }
        ],
    },
    {
        name: "Escape con bomba de humo", type: "Evento", rarity: "C", cost: 1, duration: 1, series: 2,
        text: "1 turno. Mientras esté en juego, puedes retirar a tus aliados sin coste de Furor. Al expirar, cura 3 de Vida a cada aliado con etiqueta 'Ninja'.",
        abilities: [
            // zona VANGUARDIA (Toto, 23-jul-2026): retirarse es pasar de vanguardia a
            // retaguardia, así que quien YA está en retaguardia no puede beneficiarse — el
            // motor siempre lo hizo bien (executeRetreat parte de la carta de vanguardia),
            // pero la línea de preview y su flecha sí salían en los de retaguardia.
            // (Esta ability estaba además DUPLICADA, lo que la listaba dos veces.)
            { trigger: "PREVIEW_GLOBAL", lineas: [ { quien: "ALIADO", zona: "VANGUARDIA", soloTipos: ["Personaje", "Esbirro"], texto: "Puede retirarse sin coste de Furor" } ] },
            { trigger: "AL_JUGAR", log: "¡Bomba de humo! El campo se llena de niebla.", logTipo: "ability" },
            { trigger: "AL_CADUCAR", resumenFase: "Al expirar, cura 3 de Vida a cada aliado con etiqueta 'Ninja'", log: "La niebla se disipa.", logTipo: "system",
              efectos: [ { op: "CURAR", valor: 3, conBeforeHealed: false, soloSiHerido: true,
                           floating: "CURADO", floatingStyle: "ft-green", offsetY: -20, fuente: "healing",
                           target: { quien: "ALIADO", filtros: [ { campo: "tags", op: "includes", valor: "Ninja" } ] } } ],
              logSiAplicado: { msg: "Los Ninjas emergen revitalizados de las sombras.", tipo: "healing" } }
        ]
    },
    {
        name: "Guardaespaldas", hp: 4, def: 4, atk: 3, type: "Esbirro", subtype: "Ser vivo", tags: ["Mafia"], rarity: "B", cost: 1, series: 2,
        text: "P: YO SIEMPRE TE AMARÉ: Cuando un aliado vaya a recibir un ataque letal, puedes destruir a Guardaespaldas en su lugar. El rival se lleva la Retribución y se activan los efectos de muerte.",
        passiveName: "YO SIEMPRE TE AMARÉ",
        onLethalDamageIntercept: async function(card, defender, attacker, game) {
            const pName = card.owner === 'p1' ? 'JUGADOR 1' : 'JUGADOR 2';
            const used = await new Promise(resolve => {
                game.openChoiceModal(`¿SACRIFICAR AL GUARDAESPALDAS?\n\n¡${defender.name} va a recibir un golpe letal!`, [
                    { label: `SÍ, SACRIFICAR A GUARDAESPALDAS`, action: () => resolve(true) },
                    { label: `NO, DEJAR MORIR A ${defender.name.toUpperCase()}`, action: () => resolve(false) }
                ], card.owner);
            });

            if (used) {
                game.logMsg(`¡${card.passiveName}! Guardaespaldas se arroja heroicamente frente al ataque de ${game.getCardNameWithOwner(attacker)}.`, 'ability');
                showFloatingText(card.instanceId, "¡NOOO!", "ft-purple", -30);
                
                card.currentHp = 0;
                await game.checkDeath(card, true); // True = el rival roba retribución
                return true; 
            }
            return false;
        }
    },
    {
        name: "Sra. Kumicho", hp: 3, def: 3, atk: 4, type: "Esbirro", subtype: "Ser vivo", tags: ["Mafia"], gender: "F", rarity: "B", cost: 1, series: 2,
        text: "A: PUÑALADA (1F): Realiza un ataque normal a un enemigo; si tiene éxito, le inflige Daño por tiempo durante 3 turnos.",
        activeName: "PUÑALADA", activeCost: 1,
        abilities: [
            { trigger: "ACTIVA", nombre: "PUÑALADA", coste: { furor: 1 },
              requisitos: [ { count: { quien: "ENEMIGO", zona: "vanguardia" }, op: ">=", valor: 1 } ],
              target: { quien: "ENEMIGO", cantidad: 1 },
              ataqueNormal: true,
              efectos: [
                { op: "ATACAR",
                  siExito: [ { op: "APLICAR_ESTADO", estado: "dot", duracion: 3, log: "¡La puñalada estaba envenenada!" } ] }
              ] }
        ]
    },
    {
        name: "Pequeña traición", type: "Ayuda", subtype: "Técnica", tags: ["Consumible"], rarity: "C", cost: 1, series: 2,
        text: "Reacción. Puedes usarla antes de recibir un ataque normal o especial. Elige un aliado distinto para que reciba el ataque en su lugar, ignorando los demás efectos del ataque original.",
        // Migrada a DSL (trigger REACCION, 21-jul-2026). Sin gate soloAtaqueNormal: sirve
        // para ataques normales Y especiales (caso raro, pedido por Toto). REDIRIGIR
        // elige la nueva víctima con reborde verde en el tablero (norma de targeting),
        // no con el modal de búsqueda visual que usaba la vieja.
        abilities: [{
            trigger: 'REACCION', sobre: 'ATAQUE',
            prompt: '¿Usar Pequeña traición para desviar el ataque hacia otro aliado?',
            efectos: [
                { op: 'REDIRIGIR', titulo: 'ELIGE A LA NUEVA VÍCTIMA',
                  log: { msg: '¡Pequeña traición! El ataque es redirigido vilmente hacia {objetivo}.', tipo: 'ability' },
                  floating: { texto: 'OBJETIVO', estilo: 'ft-purple', offset: -30 } },
            ],
        }],
    },
    {
        name: "Inspiración", type: "Ayuda", subtype: "Técnica", tags: ["Consumible"], rarity: "C", cost: 1, series: 2,
        text: "Reacción. Puedes usarla antes de recibir un ataque normal. Busca hasta dos 'Ayuda - Técnica' en tu mazo (al menos una), añádelas y baraja.",
        abilities: [{
            trigger: 'REACCION', sobre: 'ATAQUE',
            si: { soloAtaqueNormal: true },
            prompt: '¿Usar Inspiración mientras te atacan?',
            // 3ª persona (antes: "te da Inspiración", 2ª persona).
            log: { msg: '¡La adrenalina del combate le da Inspiración a {reactor}!', tipo: 'ability' },
            efectos: [
                { op: 'BUSCAR', en: 'MAZO', cantidad: 2,
                  filtros: [{ campo: 'subtype', op: '==', valor: 'Técnica' }],
                  titulo: 'BUSCAR HASTA 2 TÉCNICAS',
                  // Log por cada carta cogida, visible por ambos (sintaxis estándar): la
                  // vieja las movía en silencio; pedido por Toto que se informe siempre.
                  log: '{jugador} añade {objetivo} a su mano.', logTipo: 'ability',
                  barajarDespues: {} },
            ],
        }],
    },
    {
        name: "Jugada arriesgada", type: "Ayuda", subtype: "Técnica", tags: ["Consumible"], rarity: "B", cost: 1, series: 2,
        text: "Reacción. Puedes usarla antes de recibir un ataque normal o especial. Moneda. Cara = el atacante se ataca a sí mismo. Cruz = el ataque ocurre y el atacante pierde 1 de Furor.",
        abilities: [{
            trigger: 'REACCION', sobre: 'ATAQUE',
            prompt: '¿Lanzar Jugada arriesgada ante este ataque?',
            log: { msg: '¡{reactor} opta por una Jugada arriesgada!', tipo: 'ability' },
            efectos: [
                { op: 'MONEDA',
                  logCara: { msg: 'Moneda: CARA - ¡El ataque de {atacante} rebota contra sí mismo!', tipo: 'combat' },
                  // 3ª persona compartida (antes: logError privado, solo lo veía el reactor).
                  logCruz: { msg: 'Moneda: CRUZ - El ataque procede, pero le costará energía.', tipo: 'combat' },
                  cara: [ { op: 'ATACANTE_SE_AUTOATACA' }, { op: 'CANCELAR_ATAQUE' } ],
                  cruz: [ { op: 'MARCAR_DRENAJE' } ] },
            ],
        }],
    },
    {
        name: "Cortarrollos", type: "Ayuda", subtype: "Técnica", tags: ["Consumible"], rarity: "B", cost: 1, series: 2,
        text: "Reacción. Puedes usarla antes de recibir un ataque normal o especial. El atacante pierde TODO su Furor instantáneamente.",
        abilities: [{
            trigger: 'REACCION', sobre: 'ATAQUE',
            si: { atacante: { campo: 'furor', op: '>', valor: 0 } },
            prompt: '¿Usar Cortarrollos para vaciar el Furor del atacante?',
            log: { msg: '¡Cortarrollos anula la inercia de {atacante}! Pierde todo el Furor.', tipo: 'ability' },
            efectos: [
                { op: 'MODIFICAR_STAT', quien: 'ATACANTE', stat: 'furor', vaciar: true },
            ],
        }],
    },
    {
        name: "Milkor MGL", type: "Ayuda", subtype: "Arma", tags: ["Equipable", "a distancia"], rarity: "B", cost: 1, series: 2,
        text: "Equípala a un aliado sin etiqueta 'Animal salvaje'. Al atacar normal, moneda - Cara: +4 de Atq durante el golpe, hasta un máximo de 8. Cruz: el rival elige el objetivo y el daño baja en 3. Se destruye al segundo uso.",
        // Migrada (31-jul-2026), tercera y última de la tanda de equipos con vida propia. Es la
        // que tenía el trozo delicado: su interceptor DEVUELVE un valor al motor
        // ({dmgMod, newDefender}) y, en la rama de cruz, hace elegir al RIVAL a mitad del ataque.
        // Piezas nuevas:
        //   · Trigger `EQUIPO_ANTES_DE_ATACAR` -> onEquipBeforeAttack, gemelo del
        //     EQUIPO_ANTES_DE_DEFENDER de Poder Legado pero para cuando ATACA el portador.
        //   · Ops `DAÑO_ATAQUE` (modificador del daño del golpe, no del Atq) y `REDIRIGIR_ATAQUE`
        //     (cambia el destinatario), que llenan el transitorio que el trigger devuelve. Mismo
        //     criterio que ESQUIVAR: viven en `game`, son de UNA resolución y no viajan.
        //   · `{instancia}` en el id de MODIFICAR_CONTADORES/DESEQUIPAR, para que dos copias del
        //     arma sobre el mismo portador no compartan la cuenta de disparos.
        // La elección del rival es un `ELEGIR` de ENEMIGOS con `elegidoPor:"RIVAL"` -que ya
        // existía desde ACERTIJO- y por tanto va por reborde verde en el tablero del rival, no
        // por el modal genérico que usaba la vieja: cumple la norma de targeting sin nada nuevo.
        //
        // OJO, hueco de la carta que NO arregla la migración (igual que MAESTRO DE ARMAS en
        // Honsow): el texto dice "Aumenta su Atq en 4 durante el ataque (MÁXIMO 8)" y ese tope
        // de 8 no lo aplicaba la imperativa ni se añade aquí — replicar 1:1 manda. Avisado a Toto.
        // Lo que el arma le hace a quien la lleva, para su "Afectado por:" (Toto, 31-jul-2026):
        // el Milkor no toca Atq ni Def, así que sin esto no aparecía por ningún lado en el detalle
        // del portador pese a cambiarle lo que ocurre al atacar. El contador de disparos no lo
        // sustituye: ese dice cuántas balas quedan, no qué hace el arma.
        // OJO al redactar estos textos: " · " está RESERVADO como separador de la coletilla
        // opcional (`notaEfecto`) en el detalle, así que no debe aparecer dentro de la afección.
        efectoEquipadoTexto: "Sus ataques normales gastan un disparo y lanzan moneda: cara suma 4 al daño; cruz lo baja 3 y el rival redirige el golpe",
        abilities: [
            { trigger: "JUGAR", requisitos: [
                { count: { quien: "ALIADO", filtros: [ { campo: "tags", op: "includes", valor: "Animal salvaje", no: true } ] },
                  op: ">=", valor: 1, msg: "No hay aliados válidos para empuñar el arma." } ] },
            { trigger: "AL_EQUIPAR",
              efectos: [
                { op: "ELEGIR", de: "ALIADOS", cantidad: 1,
                  filtros: [ { campo: "tags", op: "includes", valor: "Animal salvaje", no: true } ],
                  titulo: "¿QUIÉN EMPUÑA EL MILKOR MGL?",
                  efectos: [
                    { op: "MARCAR", target: { quien: "SELF" }, campo: "milkorCounters", valor: 0 },
                    { op: "EQUIPAR", log: "{objetivo} carga el Milkor MGL." } ] } ] },
            { trigger: "EQUIPO_ANTES_DE_ATACAR", soloAtaqueNormal: true,
              efectos: [
                { op: "MARCAR", target: { quien: "SELF" }, campo: "milkorCounters", delta: 1 },
                // Espejo del contador en la ANFITRIONA: badge visible, flecha y línea de detalle.
                { op: "MODIFICAR_CONTADORES", target: { quien: "ATACANTE" }, contador: "milkor_{instancia}",
                  delta: 1, nombreContador: "Disparos Milkor", icono: "💥" },
                { op: "FLOTANTE", target: { quien: "ATACANTE" }, texto: "¡MILKOR!", estilo: "ft-ability", offset: -40,
                  log: "¡{objetivo} dispara el Milkor MGL!" },
                { op: "MONEDA",
                  logCara: { msg: "Moneda: CARA - ¡Impacto explosivo! (+4 ATQ temporal)", tipo: "combat" },
                  cara: [ { op: "DAÑO_ATAQUE", delta: 4, enAtacante: true,
                            floating: { texto: "+4 ATQ", estilo: "ft-green", offset: -20 } } ],
                  logCruz: { msg: "Moneda: CRUZ - ¡El disparo se desvía! El rival redirige el daño reducido.", tipo: "neutral" },
                  cruz: [
                    { op: "DAÑO_ATAQUE", delta: -3 },
                    { op: "ELEGIR", de: "ENEMIGOS", elegidoPor: "RIVAL", cantidad: 1, cancelable: false, opcional: true,
                      titulo: "MILKOR FALLIDO: ELIGE QUIÉN RECIBE EL ROCE",
                      efectos: [ { op: "REDIRIGIR_ATAQUE" } ] } ] },
                // Sin munición: el arma se suelta y va al descarte, llevándose su contador.
                { if: { campo: "milkorCounters", op: ">=", valor: 2 },
                  op: "DESEQUIPAR", contador: "milkor_{instancia}",
                  log: "El Milkor MGL se queda sin munición y es descartado." } ] }
        ],
    },
    {
        name: "Apuesta", type: "Evento", rarity: "C", cost: 1, duration: 2, series: 2,
        text: "2 turnos. Mientras esté en juego, tu rival echa una moneda al inicio de cada turno suyo, antes de ganar Furor: con cruz, cada Personaje suyo que debiera ganarlo pierde 1 de Furor. Al expirar, cada aliado de tu vanguardia gana 1 de Furor por cada cruz sacada.",
        abilities: [
            { trigger: "GLOBAL_INICIO_TURNO", resumenFase: "Su rival echa una moneda antes de ganar Furor", turnoDe: "RIVAL",
              log: { msg: "¡Apuesta activa! El azar decide el destino de la energía de {jugador}...", tipo: "ability" },
              moneda: {
                cruz: { log: { msg: "Moneda: CRUZ - ¡Mala suerte! Sus Personajes perderán el Furor de este turno.", tipo: "combat" },
                        marcar: [ { campo: "apuestaFailed", valor: true }, { campo: "apuestaCruces", sumar: 1 } ] },
                cara: { log: { msg: "Moneda: CARA - Mantiene su energía intacta.", tipo: "neutral" },
                        marcar: [ { campo: "apuestaFailed", valor: false } ] }
              } },
            { trigger: "GLOBAL_MODIFICAR_FUROR", resumenFase: "Con cruz, cada Personaje del rival que debiera ganar Furor pierde 1", reglas: [
                { si: { origen: "fase_furor", objetivoDe: "RIVAL", campoObjetivo: { campo: "type", op: "==", valor: "Personaje" }, campoSelf: { campo: "apuestaFailed", op: "truthy" } },
                  preview: "Perderá 1 de Furor al recibirlo este turno (cruz de Apuesta)",
                  floating: { texto: "APUESTA FALLIDA", estilo: "ft-red-stat", offset: -30 },
                  accion: { fijar: -1 } }
            ] },
            { trigger: "AL_CADUCAR", resumenFase: "Al expirar, cada aliado de su vanguardia gana 1 de Furor", log: "La mesa de apuestas se cierra.", logTipo: "system",
              efectos: [
                { if: { campo: "apuestaCruces", op: ">", valor: 0 },
                  op: "MODIFICAR_STAT", stat: "furor", delta: { REF: "self.apuestaCruces" }, fuente: null,
                  target: { quien: "ALIADO", zona: "vanguardia" },
                  floating: { texto: "+FUROR (Apuesta)", estilo: "ft-green", offset: -20 },
                  log: "¡{objetivo} cobra la apuesta ({antes} -> {despues} de Furor)!" }
              ] }
        ]
    },
    {
        name: "Sifón de maná", type: "Evento", rarity: "C", cost: 1, duration: 2, series: 2,
        text: "2 turnos. Mientras esté en juego, cada vez que un aliado tuyo realice un ataque normal con éxito, roba 1 de Furor del enemigo golpeado.",
        abilities: [
            { trigger: "PREVIEW_GLOBAL", lineas: [ { quien: "ALIADO", soloTipos: ["Personaje", "Esbirro"], texto: "Roba 1 de Furor al enemigo que golpee con un ataque normal" } ] },
            { trigger: "PREVIEW_GLOBAL", lineas: [ { quien: "ALIADO", soloTipos: ["Personaje", "Esbirro"], texto: "Sus ataques normales con éxito roban 1 de Furor al enemigo golpeado" } ] },
            { trigger: "GLOBAL_TRAS_ATAQUE",
              si: { atacante: "PROPIO", soloAtaqueNormal: true, dañoMinimo: 1, defensor: { campo: "furor", op: ">", valor: 0 } },
              log: { msg: "¡Sifón de maná roba energía de {defensor}!", tipo: "ability" },
              efectos: [
                { op: "MODIFICAR_STAT", stat: "furor", delta: -1, fuente: null, target: { quien: "DEFENSOR" } },
                { op: "MODIFICAR_STAT", stat: "furor", delta: 1, fuente: null, target: { quien: "ATACANTE" } }
              ] }
        ]
    },
    {
        name: "Gallina del infinito", hp: 1, def: 2, atk: 7, type: "Esbirro", subtype: "Ser vivo", tags: ["Animal salvaje"], rarity: "C", cost: 1, series: 2,
        text: "Bwaak."
    },
    {
        name: "Bancarrota", type: "Evento", rarity: "A", cost: 1, duration: 3, series: 2,
        text: "3 turnos. Mientras esté en juego, aliados y enemigos tienen siempre 0 de Furor y no ganan ninguno; el Furor original se restablece cuando esta carta expira o es destruida.",
        // Migrada (31-jul-2026). Era la última de las "pieza pequeña" y necesitaba tres:
        //   · Ops `SECUESTRAR_STAT` / `DEVOLVER_STAT`: guardan un stat en el bolsillo dejándolo a
        //     un valor fijo, y lo reponen. Van SIEMPRE en pareja.
        //   · Trigger `GLOBAL_ANTES_DE_CAMBIO_STAT` -> onGlobalBeforeStatChange: intercepta
        //     CUALQUIER cambio de stat mientras el Evento viva. Ojo, no es GLOBAL_MODIFICAR_FUROR:
        //     aquel solo mira la ganancia de la fase de Furor, y esta carta tiene que atajar
        //     también las subidas y bajadas que vengan de efectos de carta.
        //   · `valorCampo` en PREVIEW_GLOBAL, para que la línea del detalle diga el Furor ORIGINAL
        //     de cada carta ("originalmente 3"); antes el texto solo sabía interpolar el género.
        // AL_DESTRUIR repite el mismo efecto que AL_CADUCAR: si la destruyen antes de tiempo
        // (Giro de guion), el Furor tiene que volver igual.
        //
        // FIEL A LA VIEJA, aunque chiríe: el secuestro y el bloqueo alcanzan a TODAS las cartas,
        // incluidas las inmunes a Eventos enemigos (Kami), mientras que la línea del detalle SÍ
        // las excluye — esa incoherencia ya estaba en la imperativa y se replica sin tocarla.
        // Cambiarla es una decisión de diseño de Toto, no un efecto colateral de la migración.
        abilities: [
            { trigger: "AL_JUGAR", log: "¡BANCARROTA! Toda la energía del tablero queda congelada a 0.",
              efectos: [
                { op: "SECUESTRAR_STAT", target: { quien: "TODOS" }, stat: "furor",
                  guardarEn: "bankruptStoredFuror", valor: 0 } ] },
            { trigger: "GLOBAL_ANTES_DE_CAMBIO_STAT",
              reglas: [ { stat: "furor", fijar: 0 } ] },
            { trigger: "PREVIEW_GLOBAL",
              lineas: [
                { soloTipos: ["Personaje", "Esbirro"], valorCampo: "bankruptStoredFuror",
                  texto: "Furor agotado (originalmente {valor})" } ] },
            { trigger: "AL_CADUCAR", resumenFase: "Al expirar, se restablece el Furor original de todos", log: "La Bancarrota ha terminado. El Furor vuelve a fluir a sus dueños.", logTipo: "system",
              efectos: [
                { op: "DEVOLVER_STAT", target: { quien: "TODOS" }, stat: "furor",
                  guardadoEn: "bankruptStoredFuror" } ] },
            // AL_DESTRUIR usa `log: {msg, tipo}` (objeto), no el string plano de AL_CADUCAR.
            { trigger: "AL_DESTRUIR", log: { msg: "La Bancarrota ha terminado. El Furor vuelve a fluir a sus dueños.", tipo: "system" },
              efectos: [
                { op: "DEVOLVER_STAT", target: { quien: "TODOS" }, stat: "furor",
                  guardadoEn: "bankruptStoredFuror" } ] }
        ]
    },
    {
        name: "Imp mayor", hp: 6, def: 2, atk: 4, type: "Esbirro", subtype: "Ser mágico", tags: ["Monstruo"], rarity: "B", cost: 1, series: 2,
        text: "Coste: 2 de Furor. P: DEMONIO VIL: Cada vez que sea atacado, el atacante pierde 1 de Furor.",
        passiveName: "DEMONIO VIL",
        onBeforePlayAsync: async function(card, game, p) {
            return await DSL.tributoFuror(card, game, p, 2, { msgSinPagador: `Necesitas un aliado con al menos 2 de Furor para invocar al ${card.name}.`, titulo: `${card.name}: ELIGE TRIBUTO (-2 FUROR)` });
        },
        // DEMONIO VIL migrada (31-jul-2026) con el trigger NUEVO TRAS_DEFENDER (onAfterDefend):
        // "pierde Furor" es una CONSECUENCIA de ser atacado, no una condición previa, así que
        // corre DESPUÉS del golpe -incluida la animación completa-, no antes (betasteo de
        // Toto: con un primer intento vía ANTES_DE_DEFENDER, el flotante "-1 FUR" salía nada
        // más empezar la animación de ataque, en vez de al volver el atacante a su sitio). El
        // `log` vive DENTRO del efecto (no en el nivel de la Habilidad) para que se calle
        // igual que la vieja cuando el atacante no tiene Furor -`ifObjetivo` hace `continue`
        // antes de llegar a _doEffect, así que ni el log ni el MODIFICAR_STAT llegan a correr-.
        abilities: [
            { trigger: "TRAS_DEFENDER", nombre: "DEMONIO VIL",
              efectos: [
                { op: "MODIFICAR_STAT", stat: "furor", delta: -1,
                  ifObjetivo: { campo: "furor", op: ">", valor: 0 },
                  log: "¡DEMONIO VIL! El aura del Imp drena 1 de Furor de {objetivo}." } ] }
        ],
    },
    {
        name: "Gul guerrero", hp: 3, def: 2, atk: 5, type: "Esbirro", subtype: "No-muerto", tags: ["Monstruo", "Ninja"], rarity: "B", cost: 1, series: 2,
        text: "Coste: 2 de Furor. P: DEMONIO BELICOSO: Al atacar con éxito, el enemigo pierde 1 de Furor. A: SANGRE MALDITA (1F): Ataque normal. Aplica Daño por tiempo al enemigo (3 turnos).",
        passiveName: "DEMONIO BELICOSO", activeName: "SANGRE MALDITA", activeCost: 1,
        // El tributo se queda imperativo (DSL.tributoFuror ya usa selección en tablero).
        // DEMONIO BELICOSO migra el 31-jul-2026 con el trigger NUEVO `TRAS_ATACAR`: hasta
        // ahora no existía ningún trigger para "tras un ataque de ESTA carta en concreto"
        // (GLOBAL_TRAS_ATAQUE es de ámbito Evento), que era justo lo que la dejaba a medias.
        // `soloSiDaño` hace por su cuenta la contabilidad de la Vida enemiga antes/después que
        // la vieja llevaba a mano con _enemyHpBefore, y `siObjetivo` cubre el "solo si le queda
        // Furor que quitar". SANGRE MALDITA ya estaba migrada.
        onBeforePlayAsync: async function(card, game, p) {
            return await DSL.tributoFuror(card, game, p, 2, { msgSinPagador: `Necesitas un aliado con 2 Furor para el tributo.` });
        },
        abilities: [
            { trigger: "TRAS_ATACAR", nombre: "DEMONIO BELICOSO", soloSiDaño: true,
              siObjetivo: { campo: "furor", op: ">=", valor: 1 },
              log: "¡DEMONIO BELICOSO! El Gul desgarra la energía de {objetivo}.",
              efectos: [ { op: "MODIFICAR_STAT", stat: "furor", delta: -1 } ] },
            { trigger: "ACTIVA", nombre: "SANGRE MALDITA", coste: { furor: 1 },
              requisitos: [ { count: { quien: "ENEMIGO", zona: "vanguardia" }, op: ">=", valor: 1 } ],
              target: { quien: "ENEMIGO", cantidad: 1 },
              ataqueNormal: true,
              efectos: [
                { op: "ATACAR",
                  siExito: [ { op: "APLICAR_ESTADO", estado: "dot", duracion: 3, log: "La sangre maldita infecta a {objetivo}." } ] }
              ] }
        ]
    },
    {
        name: "Oni ancho", hp: 4, def: 4, atk: 6, type: "Esbirro", subtype: "Ser mágico", tags: ["Monstruo"], rarity: "B", cost: 1, series: 2,
        text: "Coste: 2 de Furor. P: YŌKAI VIOLENTO: Al realizar un ataque normal, echa una moneda. Cara: +1 Atq. Cruz: -1 Atq durante ese ataque.",
        passiveName: "YŌKAI VIOLENTO",
        onBeforePlayAsync: async function(card, game, p) {
            return await DSL.tributoFuror(card, game, p, 2, { titulo: `${card.name}: ELIGE TRIBUTO (-2 FUROR)` });
        },
        // YŌKAI VIOLENTO migrada (31-jul-2026) con el trigger NUEVO `ANTES_DE_ATACAR` y el op
        // `BONO_ATAQUE`. `soloAtaqueNormal` replica el `!game.abilityContext ||
        // isNormalAttack` que la vieja hacía a mano. El bono lo deshace el propio compilador
        // (recompute con updatePassives), así que la carta ya no lleva la contabilidad del
        // oniModifier — que era, además, el patrón que en otras cartas acabó en el bug de
        // doble resta. Aquí NO lo había: en Oni ancho el += y el -= viven DENTRO de
        // performAttack, antes de su updatePassives final, así que se compensaban.
        abilities: [
            { trigger: "ANTES_DE_ATACAR", nombre: "YŌKAI VIOLENTO", soloAtaqueNormal: true,
              log: "¡YŌKAI VIOLENTO! La brutalidad del Oni lo vuelve impredecible...",
              efectos: [
                { op: "MONEDA",
                  logCara: { msg: "Moneda: CARA - ¡Golpe brutal! (+1 ATQ)", tipo: "combat" },
                  logCruz: { msg: "Moneda: CRUZ - El Oni tropieza ligeramente. (-1 ATQ)", tipo: "neutral" },
                  cara: [ { op: "BONO_ATAQUE", valor: 1, floating: { texto: "+1 ATQ", estilo: "ft-green", offset: -20 } } ],
                  cruz: [ { op: "BONO_ATAQUE", valor: -1, floating: { texto: "-1 ATQ", estilo: "ft-red-stat", offset: -20 } } ] } ] }
        ]
    },
    {
        name: "Tengu orgulloso", hp: 5, def: 2, atk: 5, type: "Esbirro", subtype: "Ser mágico", tags: ["Monstruo"], rarity: "B", cost: 1, series: 2,
        // Sin passiveName ni "P: ..." (Toto, 27-jul-2026): mismo caso que Raiju/Súcubo —
        // YŌKAI SOBERBIO era solo el tributo de colocación, ya visible en la caja COSTE.
        text: "Coste: 2 de Furor. A: DOMINANCIA ILUSORIA (1F): Echa 2 monedas. Por cada cara, realiza 2 ataques normales a un enemigo (pudiendo elegir objetivos distintos para cada ráfaga).",
        activeName: "DOMINANCIA ILUSORIA", activeCost: 1,
        onBeforePlayAsync: async function(card, game, p) {
            return await DSL.tributoFuror(card, game, p, 2, { titulo: `${card.name}: ELIGE TRIBUTO (-2 FUROR)` });
        },
        canActivateAbility: function(card, game) {
            if (card.furor < (card.activeCost || 1)) { game.logError(`Falta Furor.`); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            
            // Verificamos que al menos haya un enemigo en vanguardia que NO esté en sigilo
            const validEnemies = game.players[enemyId].vanguard.filter(c => !c.stealth);
            
            if (validEnemies.length === 0) { 
                game.logError("No hay enemigos válidos (sin Ocultarse) en la vanguardia para aplicar el ataque."); 
                return false; 
            }
            return true;
        },
        onExecuteAbility: async function(card, game) {
            game.modifyStat(card, 'furor', -1);
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);
            
            game.logMsg(`¡${game.getCardNameWithOwner(card)} invoca ilusiones y lanza 2 monedas!`, 'ability');
            game.isActionLocked = true;
            const results = await game.triggerCoinFlips(2, card.owner);
            if (!results) { game.cancelAction(); return; }
            
            const heads = results.filter(r => r === 'heads').length;
            if (heads === 0) {
                game.logMsg("0 CARAS. Las ilusiones se desvanecen.", 'neutral');
                card.exhausted = true;
                game.isActionLocked = false;
                game.cancelAction();
                game.render();
                return;
            }
            
            game.logMsg(`${heads} CARAS. ${game.getCardNameWithOwner(card)} realizará ${heads} ráfagas de 2 ataques.`, 'ability');
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: heads, name: 'DOMINANCIA ILUSORIA', targetType: 'enemy', isNormalAttack: true, cannotCancel: true };
            game.isActionLocked = true;
            game.render();
        },
        onValidateTarget: function(card, target, game, isSilent) {
            if (target.owner === card.owner || target.location !== 'vanguard') return false;
            return true; 
        },
        onTargetsReady: async function(card, game) {
            const targets = game.abilityContext.targets;
            game.inputState = 'EXECUTING';
            game.render();
            await game.sleep(500);
            
            for (let t of targets) {
                // Abortar si el Tengu muere/desaparece antes de empezar esta ráfaga
                if (card.currentHp <= 0 || (card.location !== 'vanguard' && card.location !== 'rearguard')) break;
                
                const realTarget = game.findCard(t.instanceId);
                
                // Comprobamos Vida y UBICACIÓN (que siga en el campo)
                if (realTarget && (realTarget.location === 'vanguard' || realTarget.location === 'rearguard') && realTarget.currentHp > 0) {
                    game.logMsg(`¡Tengu dirige una ráfaga de 2 ataques hacia ${game.getCardNameWithOwner(realTarget)}!`, 'ability');
                    
                    for (let i = 0; i < 2; i++) {
                        // Antes de cada guantazo, doble comprobación
                        if (card.currentHp <= 0 || (card.location !== 'vanguard' && card.location !== 'rearguard')) break;
                        if (realTarget.currentHp <= 0 || (realTarget.location !== 'vanguard' && realTarget.location !== 'rearguard')) break;
                        
                        await game.performAttack(card, realTarget);
                        await game.sleep(400);
                    }
                }
            }
            
            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.render();
        }
    },
    {
        // Sin passiveName ni "P: ..." en el text (Toto, 27-jul-2026): su supuesta pasiva
        // DEMONIO VOLUPTUOSO no tenía descripción — era solo el tributo para colocarla, que
        // ya sale en la caja COSTE del detalle. Se listaba como "Pasiva: DEMONIO" con la
        // descripción partida ("VOLUPTUOSO.") por el parser. El Oculto continuo lo concede
        // su Activa SEDUCCIÓN, así que la pasiva continua se atribuye a ella.
        name: "Súcubo", hp: 2, def: 3, atk: 4, type: "Esbirro", subtype: "Ser mágico", tags: ["Monstruo"], gender: 'F', rarity: "B", cost: 1, series: 2,
        text: "Coste: 2 de Furor. A: SEDUCCIÓN (1F): Permanece Oculta permanentemente mientras siga en el campo.",
        activeName: "SEDUCCIÓN", activeCost: 1,
        onBeforePlayAsync: async function(card, game, p) {
            return await DSL.tributoFuror(card, game, p, 2, { titulo: `${card.name}: ELIGE TRIBUTO (-2 FUROR)` });
        },
        canActivateAbility: function(card, game) {
            if (card.furor < 1) { game.logError("Falta Furor (1)."); return false; }
            if (card.permanentStealth) { game.logError("Súcubo ya está en estado de Seducción."); return false; }
            return true;
        },
        onExecuteAbility: function(card, game) {
            game.modifyStat(card, 'furor', -1);
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);
            
            card.stealth = true;
            card.permanentStealth = true;
            game.logMsg(`¡Súcubo envuelve el campo en un halo de seducción y se oculta indefinidamente!`, 'ability');
            
            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.updatePassives();
            game.render();
        },
        // silencioso: la vieja nunca anunciaba esto. permanentStealth lo enciende su Activa
        // SEDUCCIÓN (imperativa); esta pasiva continua solo lo SOSTIENE mientras siga en el
        // campo, así que se atribuye a SEDUCCIÓN en el detalle.
        abilities: [
            { trigger: "PASIVA_CONTINUA", nombre: "SEDUCCIÓN", silencioso: true,
              if: { campo: "permanentStealth", op: "truthy" },
              then: [ { op: "MARCAR", campo: "stealth", valor: true, badge: "oculto" } ] }
        ]
    },
    {
        name: "Fanático", hp: 3, def: 3, atk: 3, type: "Esbirro", subtype: "Ser vivo", tags: ["Usuario de magia"], rarity: "B", cost: 1, series: 2,
        text: "P: ADORACIÓN PERVERSA: Aumenta todas sus estadísticas (+1 Vida, +1 Def, +1 Atq) por cada aliado 'Ser mágico' con etiqueta 'Monstruo' (máximo de +3).",
        passiveName: "ADORACIÓN PERVERSA",
        // Vida/Def/Atq suben LOS TRES a la vez, con el mismo recuento (aliados 'Ser mágico'
        // con etiqueta 'Monstruo', tope 3). El motor ya sabe reaplicar atk/def en cada pasada
        // (se resetean solos); la Vida Máx. necesita el manejo especial por diferencia que
        // hace el compilador de PASIVA_CONTINUA con el stat "hp" (ver _passiveDeltas/
        // onUpdatePassive en el intérprete), porque maxHp NO se resetea cada pasada.
        abilities: [
            { trigger: "PASIVA_CONTINUA", nombre: "ADORACIÓN PERVERSA",
              then: [
                { op: "MODIFICAR_STAT", stat: "hp", delta: { COUNT: { quien: "ALIADO", excludeSelf: true, filtros: [ { campo: "subtype", op: "==", valor: "Ser mágico" }, { campo: "tags", op: "includes", valor: "Monstruo" } ], max: 3 } } },
                { op: "MODIFICAR_STAT", stat: "def", delta: { COUNT: { quien: "ALIADO", excludeSelf: true, filtros: [ { campo: "subtype", op: "==", valor: "Ser mágico" }, { campo: "tags", op: "includes", valor: "Monstruo" } ], max: 3 } } },
                { op: "MODIFICAR_STAT", stat: "atk", delta: { COUNT: { quien: "ALIADO", excludeSelf: true, filtros: [ { campo: "subtype", op: "==", valor: "Ser mágico" }, { campo: "tags", op: "includes", valor: "Monstruo" } ], max: 3 } } } ] }
        ],
    },
    {
        name: "Raiju", hp: 2, def: 4, atk: 5, type: "Esbirro", subtype: "Ser mágico", tags: ["Invocación", "Monstruo"], rarity: "B", cost: 1, series: 2,
        // Sin passiveName ni "P: ..." (Toto, 27-jul-2026): ENTIDAD ELÉCTRICA no tenía
        // descripción — era solo el tributo de colocación, que ya sale en la caja COSTE del
        // detalle. El parser la listaba como "Pasiva:" con la descripción partida.
        text: "Coste: 1 de Furor. A: FOSFORESCENCIA (1F): Realiza 2 ataques especiales a enemigos distintos y les ciega (2 turnos).",
        activeName: "FOSFORESCENCIA", activeCost: 1,
        onBeforePlayAsync: async function(card, game, p) {
            return await DSL.tributoFuror(card, game, p, 1, { titulo: `${card.name}: ELIGE TRIBUTO (-1 FUROR)` });
        },
        // Migrada (30-jul-2026): mismo esqueleto que Gólem de tierra (ELEGIR de cantidad EXACTA
        // 2 + ATACAR anidado), pero con especial:true en vez de especial ausente, y con
        // APLICAR_ESTADO en siExito para la Ceguera. A diferencia de Gólem de tierra, la vieja
        // NO excluye Ocultos aquí (ni en canActivateAbility ni en onValidateTarget) — se
        // replica fiel, sin el filtro de stealth que sí lleva SEÍSMO. El tributo de colocación
        // se queda imperativo (DSL.tributoFuror, sin op DSL para "elegir pagador genérico").
        abilities: [
            { trigger: "ACTIVA", nombre: "FOSFORESCENCIA", coste: { furor: 1 }, sinObjetivo: true,
              // count/ELEGIR excluyen Avatares por defecto (Kami: intocable), igual que el
              // `!getCardTemplate(c.id).isAvatar` a mano de la vieja — sin filtro adicional.
              requisitos: [
                { count: { quien: "ENEMIGO", zona: "vanguardia" }, op: ">=", valor: 2, msg: "Necesitas al menos 2 enemigos en vanguardia para golpear a objetivos distintos." } ],
              log: "¡Raiju desata una tormenta eléctrica cegadora!",
              efectos: [
                { op: "ELEGIR", de: "ENEMIGOS", zona: "VANGUARDIA", cantidad: 2, cancelable: false,
                  titulo: "FOSFORESCENCIA: elige 2 enemigos distintos",
                  efectos: [
                    { op: "ATACAR", especial: true,
                      siExito: [ { op: "APLICAR_ESTADO", estado: "ceguera", duracion: 2, log: "El fogonazo ciega a {objetivo}." } ] } ] } ] }
        ]
    },
    {
        name: "Muñeca del mal", hp: 2, def: 2, atk: 4, type: "Esbirro", subtype: "No-muerto", tags: ["Monstruo", "Creación artificial"], rarity: "B", cost: 1, series: 2,
        text: "P: IMPRECACIÓN: Cuando su Vida llegue a 0 debido a un ataque, echa una moneda. Si sale cara, destruye la carta que realizó ese ataque.",
        passiveName: "IMPRECACIÓN",
        // Migrada (31-jul-2026): TRAS_DEFENDER (mismo trigger de Imp mayor/Gólem multielemental)
        // con `si:{campo:"self.hp"}` para "cuando su Vida llegue a 0" e `ifObjetivo` para "SI el
        // atacante sigue vivo" (evita procesar la maldición si el golpe mató a ambos a la vez).
        // Piezas nuevas en MONEDA: `log` (anuncio ANTES de lanzar, distinto de logCara/logCruz
        // que anuncian el resultado) y `objetivo` en el fill de logCara/logCruz (faltaba).
        //
        // CAMBIO DE REGLA, no cosmético (betasteo de Toto, 31-jul-2026): ahora lleva
        // `sinRetribucion: true`, así que la víctima NO da Retribución. La vieja pasaba
        // `checkDeath(attacker, true)` (SÍ la daba) y en la primera migración se replicó tal
        // cual. Es casi seguro un descuido del código original: el texto dice literalmente
        // "destruye la carta que realizó ese ataque", y la norma de Toto define destruir como
        // "mandada a los descartes SIN dar retribución" — de las cinco cartas del juego que
        // dicen "destruye" (Cañón de positrones, Kami, Némesis, Gárgola y esta), las otras
        // CUATRO ya pasaban `false`; Muñeca del mal era la única excepción. Sin este flag el
        // flotante tampoco podía decir DESTRUIDO (los dos van atados por definición).
        // Revertir = quitar `sinRetribucion` de la línea de abajo.
        abilities: [
            { trigger: "TRAS_DEFENDER", nombre: "IMPRECACIÓN",
              si: { campo: "self.hp", op: "<=", valor: 0 },
              efectos: [
                { op: "MONEDA", ifObjetivo: { campo: "hp", op: ">", valor: 0 },
                  log: "¡IMPRECACIÓN! La muñeca lanza una maldición final antes de expirar...",
                  logCara: { msg: "Moneda: CARA - ¡La maldición atrapa a {objetivo} y lo destruye!", tipo: "combat" },
                  logCruz: { msg: "Moneda: CRUZ - La maldición se disipa en el aire.", tipo: "neutral" },
                  cara: [ { op: "MODIFICAR_STAT", stat: "currentHp", vaciar: true, sinRetribucion: true, comprobarMuerte: true,
                            floating: { texto: "MALDITO", estilo: "ft-purple", offset: -30 } } ] } ] }
        ],
    },
    {
        name: "Experimento fallido", hp: 4, def: 3, atk: 5, type: "Esbirro", subtype: "No-muerto", tags: ["Monstruo", "Creación artificial"], rarity: "B", cost: 1, series: 2,
        text: "Coste: 1 de Furor. P: ABOMINACIÓN AFABLE: Su coste se tributa al colocar esta carta en el campo.",
        passiveName: "ABOMINACIÓN AFABLE",
        onBeforePlayAsync: async function(card, game, p) {
            return await DSL.tributoFuror(card, game, p, 1, { msgSinPagador: "Necesitas un aliado con al menos 1 de Furor para el tributo.", titulo: `${card.name}: ELIGE TRIBUTO (-1 FUROR)` });
        }
    },
    {
        name: "Hiposaurio", hp: 6, def: 4, atk: 2, type: "Esbirro", subtype: "Ser vivo", tags: ["Bestia salvaje"], rarity: "B", cost: 1, series: 2,
        text: "P: ECOSISTEMA VIVIENTE: Al sufrir Daño por tiempo, pierde 3 de Vida en vez de 1. A: CABREO (3F): Ataque normal con +2 de Atq durante el golpe.",
        passiveName: "ECOSISTEMA VIVIENTE", activeName: "CABREO", activeCost: 3,
        // ECOSISTEMA VIVIENTE se queda imperativa (27-jul-2026, tanda de volumen): no hay
        // trigger DSL para "modificar el tick de Daño por tiempo", y no compensa crear uno
        // para una sola carta. CABREO sí migra: ataque normal + bono de Atq, mismo patrón
        // ya usado por BOMBAZO (Contendiente).
        onDoTTick: function(card, game) {
            // El motor base quita 1 HP. Quitamos 2 más para llegar a 3.
            game.logMsg(`¡${card.passiveName}! El veneno afecta drásticamente al Hiposaurio.`, 'ability');
            showFloatingText(card.instanceId, "-2 VIDA EXTRA", "ft-purple", -30);
            game.modifyStat(card, 'currentHp', -2);
        },
        abilities: [
            { trigger: "ACTIVA", nombre: "CABREO", coste: { furor: 3 },
              requisitos: [ { count: { quien: "ENEMIGO", zona: "vanguardia" }, op: ">=", valor: 1 } ],
              target: { quien: "ENEMIGO", cantidad: 1 },
              ataqueNormal: true,
              floatingExtra: [ { texto: "+2 ATQ", estilo: "ft-green", offset: -10 } ],
              efectos: [ { op: "ATACAR", bonoAtq: 2 } ] }
        ]
    },
    {
        name: "Lolita", hp: 2, def: 2, atk: 2, type: "Esbirro", subtype: "Ser vivo", tags: ["Otaku"], rarity: "A", cost: 1, series: 2,
        isToken: true, // Esto le quita la retribución al morir automáticamente en checkDeath
        text: "P: PRESTIGIO: Esta carta no te otorga retribución cuando su Vida llega a 0. A: NOCIONES DE OCULTISMO (1F): Ataque especial con +2 de Atq durante el golpe.",
        passiveName: "PRESTIGIO", activeName: "NOCIONES DE OCULTISMO", activeCost: 1,
        // Migrada por completo (27/28-jul-2026, tanda de volumen #2). Mismo patrón que
        // Hechicero/CHIRIBITA: ATACAR especial:true. CORRECCIÓN igual que allí: la vieja
        // no comprobaba onBeforeDefend antes de golpear.
        abilities: [
            { trigger: "ACTIVA", nombre: "NOCIONES DE OCULTISMO", coste: { furor: 1 },
              requisitos: [ { count: { quien: "ENEMIGO", zona: "vanguardia" }, op: ">=", valor: 1 } ],
              target: { quien: "ENEMIGO", cantidad: 1 },
              floatingExtra: [ { texto: "+2 ATQ", estilo: "ft-green", offset: -10 } ],
              efectos: [ { op: "ATACAR", especial: true, bonoAtq: 2 } ] }
        ]
    },
    {
        name: "Uniojo", hp: 2, def: 1, atk: 4, type: "Esbirro", subtype: "Ser vivo", tags: ["Animal salvaje"], rarity: "C", cost: 1, series: 2,
        text: "P: COMENSAL: Reacción. Si la Vida de un aliado 'Ser vivo' llega a 0, puedes colocar a Uniojo desde tu mano en su misma posición. Si lo haces, aumenta su Vida máxima en 2.",
        passiveName: "COMENSAL",
        onHandReactionToAllyDeath: async function(handCard, deadCard, game) {
            if (deadCard.subtype !== 'Ser vivo') return false;
            
            const pName = handCard.owner === 'p1' ? 'JUGADOR 1' : 'JUGADOR 2';
            const wantUse = await new Promise(resolve => {
                game.openChoiceModal(`REACCIÓN DE ${pName}\n\n¿Colocar a Uniojo en el lugar de ${deadCard.name}?`, [
                    { label: 'SÍ', action: () => resolve(true) },
                    { label: 'NO', action: () => resolve(false) }
                ], handCard.owner);
            });

            if (wantUse) {
                game.logMsg(`¡Uniojo aprovecha el vacío de ${game.getCardNameWithOwner(deadCard)} y entra al campo!`, 'ability');
                const p = game.players[handCard.owner];
                
                handCard.location = deadCard.location;
                if (deadCard.location === 'vanguard') p.vanguard.push(handCard);
                else p.rearguard.push(handCard);
                
                handCard.maxHp += 2;
                handCard.currentHp = handCard.maxHp;
                showFloatingText(handCard.instanceId, "+2 VIDA MÁX.", "ft-green", -30);
                
                game.render();
                try { await animateResurrect(handCard.owner, handCard.instanceId); } catch(e){}
                return true;
            }
            return false;
        }
    },
    {
        name: "Limo crecido", hp: 4, def: 2, atk: 2, type: "Esbirro", subtype: "Ser vivo", tags: ["Creación artificial"], rarity: "B", cost: 1, series: 2,
        isEvolution: true,
        text: "P: AUMENTO: Puedes destruir un 'Limo artificial' de tu campo y ocupar su lugar, conservando sus bonos. A: ABRAZO VISCOSO (2F): Ataque normal. Si tiene éxito, confunde 2 turnos.",
        passiveName: "AUMENTO", activeName: "ABRAZO VISCOSO", activeCost: 2,
        canPlayCard: function() { return true; }, 
        onBeforePlayAsync: async function(card, game, p) {
            const limos = [...p.vanguard, ...p.rearguard].filter(c => c.name === 'Limo artificial');
            if (limos.length > 0) {
                // CANCELAR (Toto, 13-ago-2026): elegir cómo colocarla es una ventana cancelable —
                // nada ha cambiado todavía—, así que §14 exige poder arrepentirse. Y con la
                // opción puesta, clicar el velo del modal la dispara sola.
                const choice = await new Promise(resolve => {
                    game.openChoiceModal('¿CÓMO COLOCAR A LIMO CRECIDO?\n\nEvolucionar destruye el Limo artificial, pero Limo crecido conserva sus bonos.', [
                        { label: 'EVOLUCIONAR LIMO ARTIFICIAL', action: () => resolve('evo') },
                        { label: 'COLOCAR COMO ESBIRRO NUEVO', action: () => resolve('nuevo') },
                        { label: 'CANCELAR', action: () => resolve('cancelar') }
                    ], card.owner);
                });
                if (choice === 'cancelar') return false;   // jugada abortada: sigue en la mano
                if (choice === 'evo') {
                    // En tablero (Toto, 7-ago-2026): el limo a sustituir ya está en el campo.
                    const chosen = await game.pickBoardTargets(limos, 1, 'ELIGE EL LIMO ARTIFICIAL A EVOLUCIONAR', card, card.owner, true);
                    if (chosen && chosen.length > 0) {
                        const oldLimo = chosen[0];
                        const _zonaLimo = oldLimo.location;
                        card.location = _zonaLimo;
                        // Se limpia el estado de entrada ANTES de la animación: en online,
                        // cancelAction avisa al rival, y hacerlo a mitad de una animación de
                        // 2 segundos lo metía en medio de la cadena del otro cliente.
                        game.cancelAction();

                        // La evolución se PRESENTA y se DESHACE sobre la carta que evoluciona, que hace a la vez
                        // su propia animación (§14.quater). Va ANTES del intercambio: la base tiene que seguir
                        // en el tablero para poder ser el destino de la disolución (Toto, 13-ago-2026).
                        // BLINDADA: es ADORNO. Si falla en un cliente y no en el otro -y falla en
                        // uno solo con facilidad, porque el rival ve esta carta de dorso y no
                        // tiene los mismos elementos en el DOM-, la excepción sube hasta playCard,
                        // aborta la jugada SOLO ahí y los dos tableros acaban distintos: uno con
                        // el Limo crecido de vuelta en la mano y el otro con la evolución hecha
                        // (Toto, 13-ago-2026). El estado nunca puede depender de que la animación
                        // salga bien.
                        if (typeof game.evolucionarDesdeMano === "function") {
                            try { await game.evolucionarDesdeMano(card, oldLimo.instanceId, null); } catch (e) { console.error(e); }
                        }
                        // Los índices se vuelven a buscar DESPUÉS de la espera: entre medias ha
                        // podido llegar una instantánea del rival y reconstruir los arrays.
                        const _fila = _zonaLimo === 'vanguard' ? p.vanguard : p.rearguard;
                        const idx = _fila.findIndex(c => c.instanceId === oldLimo.instanceId);
                        if (idx !== -1) _fila[idx] = card; else _fila.push(card);
                        
                        const baseOld = getCardTemplate(oldLimo.id);
                        card.currentAtk += (oldLimo.currentAtk - baseOld.atk);
                        card.currentDef += (oldLimo.currentDef - baseOld.def);
                        card.maxHp += (oldLimo.maxHp - baseOld.hp);
                        card.currentHp = card.maxHp;
                        card.furor = oldLimo.furor;
                        card.status = { ...oldLimo.status };

                        if (typeof game.resetCard === 'function') game.resetCard(oldLimo);
                        oldLimo.location = 'discard';
                        p.discard.push(oldLimo);
                        
                        const handIdx = p.hand.findIndex(c => c.instanceId === card.instanceId);
                        if (handIdx !== -1) p.hand.splice(handIdx, 1);
                        
                        game.updatePassives();
                        game.render();
                        // SIN forceSync. Lo puse de red de seguridad cuando no sabía de dónde venía
                        // la desincronización, y es peor que el problema: los DOS clientes replican
                        // esta jugada, así que los dos emitían una instantánea autoritativa en
                        // instantes distintos y el que perdía la carrera enseñaba un frame con el
                        // estado viejo -la carta de vuelta en la mano- antes de corregirse. La
                        // réplica es determinista: no hace falta que nadie mande fotos
                        // (Toto, 13-ago-2026).
                        return false; 
                    }
                    // Cancelar el objetivo CANCELA la jugada. Antes caía al `return true` de
                    // abajo, o sea "colócala normal": el jugador cancelaba y le aparecía un
                    // Esbirro nuevo, con los dos clientes desincronizándose a base de re-syncs
                    // (Toto, 13-ago-2026). Cancelar es cancelar (§14).
                    return false;
                }
            }
            return true; 
        },
        // ACTIVA migrada (30-jul-2026): ataque normal + Confusión en siExito, mismo esqueleto
        // que Limo artificial (su propio ABRAZO PEGAJOSO) pero sin la moneda intermedia — aquí
        // la Confusión se aplica directa si el golpe tiene éxito, sin lanzar nada.
        abilities: [
            { trigger: "ACTIVA", nombre: "ABRAZO VISCOSO", coste: { furor: 2 }, ataqueNormal: true,
              target: { quien: "ENEMIGO", cantidad: 1 },
              requisitos: [ { count: { quien: "ENEMIGO", zona: "vanguardia" }, op: ">=", valor: 1 } ],
              efectos: [
                { op: "ATACAR",
                  siExito: [ { op: "APLICAR_ESTADO", estado: "confusion", duracion: 2, log: "¡El líquido envuelve a {objetivo}!" } ] } ] }
        ],
    },
    {
        name: "Matón", hp: 3, def: 3, atk: 4, type: "Esbirro", subtype: "Ser vivo", tags: ["Maleante"], rarity: "C", cost: 1, series: 2,
        text: "P: PANDILLA: Puedes colocar en tu campo durante el mismo turno hasta tres copias de esta carta, si las tienes en la mano.",
        passiveName: "PANDILLA",
        // Migrada (31-jul-2026). NOTA: `game.placedUnitThisTurn` (candado global de "1 unidad
        // por turno") es del JUGADOR, no de esta carta -por eso la vieja lo tocaba directo-, así
        // que aquí se toca vía MARCAR_JUGADOR igual que la vieja tocaba `game.placedUnitThisTurn`
        // (sin `ownerId`: es un campo de `game`, no de `game.players[x]` -inconsistencia ya
        // existente del motor, replicada tal cual). Piezas nuevas, pequeñas y reutilizables:
        // `_zone` admite zona:"mano"; `_cond`/`if` admite array (AND) y `campoJugador` (condición
        // sobre un campo del JUGADOR dueño, no de la carta); MARCAR_JUGADOR admite `delta` y `log`.
        abilities: [
            { trigger: "AL_JUGAR",
              efectos: [
                { op: "MARCAR_JUGADOR", campo: "matonesPlayedThisTurn", delta: 1 },
                { if: [
                    { campoJugador: "matonesPlayedThisTurn", op: "<", valor: 3 },
                    { count: { quien: "ALIADO", zona: "mano", filtros: [ { campo: "name", op: "==", valor: "Matón" } ] }, op: ">=", valor: 1 } ],
                  op: "MARCAR_PARTIDA", campo: "placedUnitThisTurn", valor: false,
                  log: "¡PANDILLA! Aún puedes colocar más Matones este turno." } ] },
            { trigger: "INICIO_TURNO",
              efectos: [ { op: "MARCAR_JUGADOR", campo: "matonesPlayedThisTurn", valor: 0 } ] }
        ],
    },
    {
        name: "Droide antidisturbios", hp: 2, def: 4, atk: 5, type: "Esbirro", subtype: "Máquina", tags: ["Controlable"], rarity: "C", cost: 1, series: 2,
        text: "-"
    },
    {
        name: "Hechicero", hp: 3, def: 3, atk: 4, type: "Esbirro", subtype: "Ser vivo", tags: ["Usuario de magia"], rarity: "B", cost: 1, series: 2,
        text: "A: CHIRIBITA (1F): Ataque especial con +1 de Atq durante el golpe.",
        activeName: "CHIRIBITA", activeCost: 1,
        // Migrada por completo (27-jul-2026, tanda de volumen). Estrena `especial: true` en el
        // op ATACAR: la fórmula de daño de un ataque especial (Atq-Def, suelo 0.5/1 para
        // Esbirro-vs-Personaje) estaba duplicada a mano en más de una docena de sitios del
        // archivo; ahora es un op reutilizable. CORRECCIÓN encontrada en la migración: la vieja
        // NO comprobaba `onBeforeDefend` (esquiva) antes de golpear —a diferencia de Karolina o
        // Raiju, que sí lo hacen en su propio ataque especial—, así que un objetivo con una
        // habilidad de esquiva no podía usarla contra CHIRIBITA. El op genérico SÍ la comprueba,
        // igual que el resto de ataques especiales; solo importa si el rival tiene una de las 4
        // cartas del juego con `onBeforeDefend`, caso raro no cubierto por la vieja.
        abilities: [
            { trigger: "ACTIVA", nombre: "CHIRIBITA", coste: { furor: 1 },
              requisitos: [ { count: { quien: "ENEMIGO", zona: "vanguardia" }, op: ">=", valor: 1 } ],
              target: { quien: "ENEMIGO", cantidad: 1 },
              floatingExtra: [ { texto: "+1 ATQ", estilo: "ft-green", offset: -10 } ],
              efectos: [ { op: "ATACAR", especial: true, bonoAtq: 1 } ] }
        ]
    },
    {
        name: "Megalimo", hp: 6, def: 3, atk: 2, type: "Esbirro", subtype: "Ser vivo", tags: ["Creación artificial"], rarity: "S", cost: 1, series: 2,
        isEvolution: true,
        text: "P: EVOLUCIÓN: Solo se coloca destruyendo un 'Limo crecido' de tu campo y ocupando su lugar, conservando sus bonos. Botón Extra: Consume el Furor que quieras para curar esa misma Vida. A: ABRAZO PERTURBADOR (3F): Ataque normal con +4 Atq. Si tiene éxito, confunde 2 turnos.",
        passiveName: "EVOLUCIÓN", activeName: "ABRAZO PERTURBADOR", activeCost: 3,
        onBeforePlayAsync: async function(card, game, p) {
            const limos = [...p.vanguard, ...p.rearguard].filter(c => c.name === 'Limo crecido');
            if (limos.length === 0) {
                game.logError("Necesitas un Limo crecido para evolucionarlo a Megalimo.");
                return false;
            }
            // En tablero (Toto, 7-ago-2026): el limo a sustituir ya está en el campo. Cancelable:
            // no se ha cobrado nada todavía.
            const chosen = await game.pickBoardTargets(limos, 1, 'ELIGE EL LIMO CRECIDO A EVOLUCIONAR', card, card.owner, true);
            if (chosen && chosen.length > 0) {
                const oldLimo = chosen[0];
                card.location = oldLimo.location;
                
                // La evolución se PRESENTA y se DESHACE sobre la carta que evoluciona, que hace a la vez
                // su propia animación (§14.quater). Va ANTES del intercambio: la base tiene que seguir
                // en el tablero para poder ser el destino de la disolución (Toto, 13-ago-2026).
                // BLINDADA: la animación es ADORNO. Si falla en un cliente y no en el otro, la excepción
                // sube hasta playCard, aborta la jugada SOLO ahí y los dos tableros acaban distintos.
                if (typeof game.evolucionarDesdeMano === "function") {
                    try { await game.evolucionarDesdeMano(card, oldLimo.instanceId, null); } catch (e) { console.error(e); }
                }
                if (oldLimo.location === 'vanguard') {
                    const idx = p.vanguard.findIndex(c => c.instanceId === oldLimo.instanceId);
                    p.vanguard[idx] = card;
                } else {
                    const idx = p.rearguard.findIndex(c => c.instanceId === oldLimo.instanceId);
                    p.rearguard[idx] = card;
                }
                
                const baseOld = getCardTemplate(oldLimo.id);
                card.currentAtk += (oldLimo.currentAtk - baseOld.atk);
                card.currentDef += (oldLimo.currentDef - baseOld.def);
                card.maxHp += (oldLimo.maxHp - baseOld.hp);
                card.currentHp = card.maxHp;
                card.furor = oldLimo.furor;
                card.status = { ...oldLimo.status };

                if (typeof game.resetCard === 'function') game.resetCard(oldLimo);
                oldLimo.location = 'discard';
                p.discard.push(oldLimo);
                
                const handIdx = p.hand.findIndex(c => c.instanceId === card.instanceId);
                if (handIdx !== -1) p.hand.splice(handIdx, 1);
                
                game.cancelAction();
                game.updatePassives();
                game.render();
                return false; 
            }
            return false; // Si el jugador cancela el modal, se aborta la invocación
        },
        getCustomActions: function(card, game) {
            if ((card.location === 'vanguard' || card.location === 'rearguard') && card.furor > 0 && card.currentHp < card.maxHp) {
                return [{
                    label: `CONSUMIR FUROR PARA CURAR`,
                    color: '#8b5cf6', // Color morado estándar
                    action: async () => {
                        const maxPossible = Math.min(card.maxHp - card.currentHp, card.furor);
                        
                        // Creamos las opciones dinámicamente según lo que pueda curarse
                        const amountToHeal = await new Promise(resolve => {
                            const options = [];
                            for (let i = 1; i <= maxPossible; i++) {
                                options.push({ label: `CURAR ${i} VIDA (-${i} FUROR)`, action: () => resolve(i) });
                            }
                            options.push({ label: 'CANCELAR', action: () => resolve(0) });
                            
                            game.openChoiceModal(`¿CUÁNTO FUROR CONSUMIR?`, options, card.owner);
                        });

                        if (amountToHeal > 0) {
                            game.modifyStat(card, 'furor', -amountToHeal);
                            game.modifyStat(card, 'currentHp', amountToHeal, -20, 'healing');
                            game.logMsg(`¡Megalimo consume ${amountToHeal} Furor y se regenera!`, 'healing');
                            game.render();
                        }
                    }
                }];
            }
            return [];
        },
        // ACTIVA migrada (30-jul-2026): mismo esqueleto que Limo crecido/ABRAZO VISCOSO, con
        // bonoAtq:4 (arregla de encima el mismo bug de doble resta de Hiposaurio/Hawke/Guardia:
        // la vieja hacía "currentAtk += 4; performAttack; currentAtk -= 4" y performAttack ya
        // llama a updatePassives() por dentro) y el filtro anti-sigilo que SÍ lleva esta carta
        // (a diferencia de Limo crecido, que no lo tenía).
        abilities: [
            { trigger: "ACTIVA", nombre: "ABRAZO PERTURBADOR", coste: { furor: 3 }, ataqueNormal: true,
              target: { quien: "ENEMIGO", cantidad: 1 },
              requisitos: [
                { count: { quien: "ENEMIGO", zona: "vanguardia", filtros: [ { campo: "stealth", op: "falsy" } ] }, op: ">=", valor: 1,
                  msg: "No hay enemigos válidos (sin Ocultarse) en la vanguardia." } ],
              floatingExtra: [ { texto: "+4 ATQ", estilo: "ft-green", offset: -10 } ],
              efectos: [
                { op: "ATACAR", bonoAtq: 4,
                  siExito: [ { op: "APLICAR_ESTADO", estado: "confusion", duracion: 2, log: "¡La inmensa viscosidad satura los sentidos de {objetivo}!" } ] } ] }
        ],
    },
    {
        name: "Gárgola", hp: 6, def: 4, atk: 4, type: "Esbirro", subtype: "Ser mágico", tags: ["Monstruo"], gender: "F", rarity: "A", cost: 1, series: 2,
        text: "P: PRUEBA DE CARÁCTER: Al colocar esta carta, echa dos monedas. 1ª Cara: elige enemigo y quítale 2 de Furor. 2ª Cruz: tributa 2 de Furor de un aliado o Gárgola se destruye.",
        passiveName: "PRUEBA DE CARÁCTER",
        // Migrada (31-jul-2026). El elegir enemigo pasa del modal genérico (violaba la norma de
        // targeting en tablero) a ELEGIR/pickBoardTargets, como toda migración previa de este
        // tipo. Pieza nueva: `siNoElegido` en ELEGIR (rama "de lo contrario", corre si el pool
        // está vacío O si el jugador declina) — hacía falta para "tributa O se destruye", que
        // ni pool vacío ni decline tenían forma de disparar un efecto real hasta ahora.
        // Simplificación de log aceptada: la vieja distingue dos mensajes de fallo ("Nadie pagó
        // el tributo" si declinas habiendo pagadores válidos, "No hay aliados con suficiente
        // Furor" si no los hay); `siNoElegido` no puede distinguir la causa (mismo camino para
        // las dos), así que la nueva usa un único texto para ambos casos.
        abilities: [
            { trigger: "AL_JUGAR",
              log: "¡PRUEBA DE CARÁCTER! Gárgola te juzga y lanza dos monedas.",
              efectos: [
                { op: "MONEDA",
                  logCara: { msg: "Moneda 1: CARA - ¡Drenaje de Furor enemigo!", tipo: "ability" },
                  logCruz: { msg: "Moneda 1: CRUZ - Sin efecto.", tipo: "neutral" },
                  cara: [
                    { op: "ELEGIR", de: "ENEMIGOS", cantidad: 1, opcional: true, cancelable: false,
                      // cancelable:false (Toto, 31-jul-2026): la moneda ya salió CARA -acción
                      // comprometida-, así que si hay enemigos elegibles no se puede declinar
                      // (mismo criterio que ACERTIJO/PEM tras pagar/lanzar). `opcional` se queda
                      // para el caso de pool VACÍO (nadie elegible), que ni siquiera llega a
                      // mostrar el picker.
                      titulo: "GÁRGOLA: ELIGE ENEMIGO PARA QUITARLE 2 FUROR",
                      logSiVacio: "No hay enemigos para drenar.", logSiVacioTipo: "system",
                      efectos: [ { op: "MODIFICAR_STAT", stat: "furor", delta: -2 } ] } ] },
                { op: "MONEDA",
                  logCara: { msg: "Moneda 2: CARA - Gárgola está satisfecha.", tipo: "neutral" },
                  logCruz: { msg: "Moneda 2: CRUZ - ¡Gárgola exige un tributo de 2 Furor!", tipo: "ability" },
                  cruz: [
                    { op: "ELEGIR", de: "ALIADOS", excluirSelf: true, filtros: [ { campo: "furor", op: ">=", valor: 2 } ], cantidad: 1,
                      titulo: "GÁRGOLA: ELIGE TRIBUTO O SE DESTRUYE (-2 FUROR)",
                      siNoElegido: [
                        { op: "MODIFICAR_STAT", target: { quien: "SELF" }, stat: "currentHp", vaciar: true, sinRetribucion: true, comprobarMuerte: true,
                          log: "¡Nadie paga el tributo! Gárgola se hace pedazos.", logTipo: "combat" } ],
                      efectos: [ { op: "MODIFICAR_STAT", stat: "furor", delta: -2 } ] } ] } ] }
        ],
    },
    {
        name: "Ángel", hp: 4, def: 4, atk: 4, type: "Esbirro", subtype: "Ser mágico", tags: ["Monstruo"], rarity: "A", cost: 1, series: 2,
        text: "Coste: 2 de Furor. P: PRODIGIO: Al colocar: cura 1 de Vida a tu vanguardia. A: SANCIÓN (2F): Ataque especial a dos enemigos de la vanguardia rival.",
        passiveName: "PRODIGIO", activeName: "SANCIÓN", activeCost: 2,
        // PRODIGIO migrada (27-jul-2026, tanda de volumen): curar 1 a toda la vanguardia
        // dañada, mismo patrón ya usado por Escape con bomba de humo (CURAR soloSiHerido en
        // grupo). SANCIÓN migrada (31-jul-2026, betasteo de Toto): la vieja solo exigía 1
        // enemigo en vanguardia para activarse y dejaba `canStopEarly` resolver con 1 o 2
        // objetivos — bug del código imperativo original, no un requisito real de la carta
        // (su texto dice "a dos enemigos", como Bi-choque/COMA). Corregido a exigir >=2
        // enemigos válidos antes de activar, con lo que la selección pasa a ser "exactamente
        // 2, sin parada anticipada" — el camino RAW de `target:{cantidad:2}` ya soportado por
        // el compilador de ACTIVA (ver DEVASTACIÓN AGAH / COMA), sin canStopEarly.
        onBeforePlayAsync: async function(card, game, p) {
            return await DSL.tributoFuror(card, game, p, 2, { msgSinPagador: "Necesitas un aliado con 2 Furor para el tributo.", titulo: `TRIBUTO PARA ÁNGEL (-2 FUROR)` });
        },
        abilities: [
            { trigger: "AL_JUGAR",
              efectos: [ { op: "CURAR", valor: 1, conBeforeHealed: false, soloSiHerido: true,
                           offsetY: -20, fuente: "healing",
                           target: { quien: "ALIADO", zona: "VANGUARDIA" } } ],
              logSiAplicado: { msg: "¡La luz del Ángel sana a la vanguardia!", tipo: "healing" } },
            { trigger: "ACTIVA", nombre: "SANCIÓN", coste: { furor: 2 },
              target: { quien: "ENEMIGO", cantidad: 2 },
              requisitos: [
                { count: { quien: "ENEMIGO", zona: "vanguardia" }, op: ">=", valor: 2,
                  msg: "No hay suficientes enemigos en vanguardia para SANCIÓN." } ],
              efectos: [ { op: "ATACAR", especial: true } ] }
        ],
    },
    // ===== CARTAS DECLARATIVAS DE PRUEBA (motor híbrido / DSL) =====
    {
        id: 990, name: "Bersérker de prueba", hp: 5, def: 4, atk: 3, type: "Esbirro", subtype: "Ser vivo", tags: ["Prueba"], rarity: "B", cost: 1, series: 1,
        text: "P: FURIA: +3 Atq mientras su Vida sea <= 3.",
        passiveName: "FURIA",
        abilities: [
            { trigger: "PASIVA_CONTINUA", nombre: "FURIA",
              if: { campo: "self.hp", op: "<=", valor: 3 },
              then: [ { op: "MODIFICAR_STAT", stat: "atk", delta: 3 } ] }
        ]
    },
    {
        id: 991, name: "Tótem de prueba", hp: 6, def: 5, atk: 1, type: "Esbirro", subtype: "Ser vivo", tags: ["Prueba"], rarity: "B", cost: 1, series: 1,
        text: "P: COMUNIÓN: +1 Atq y +1 Def por cada aliado con etiqueta 'Prueba' en mesa (máx 3).",
        passiveName: "COMUNIÓN",
        abilities: [
            { trigger: "PASIVA_CONTINUA", nombre: "COMUNIÓN",
              then: [
                { op: "MODIFICAR_STAT", stat: "atk", delta: { COUNT: { quien: "ALIADO", excludeSelf: true, filtros: [ { campo: "tags", op: "includes", valor: "Prueba" } ], max: 3 } } },
                { op: "MODIFICAR_STAT", stat: "def", delta: { COUNT: { quien: "ALIADO", excludeSelf: true, filtros: [ { campo: "tags", op: "includes", valor: "Prueba" } ], max: 3 } } }
              ] }
        ]
    },
    {
        id: 992, name: "Meteorito de prueba", type: "Evento", rarity: "C", cost: 0, duration: 1, series: 1,
        text: "1 turno. Al colocarla, inflige 2 de daño a cada enemigo de vanguardia.",
        abilities: [
            { trigger: "AL_JUGAR", log: "¡Meteorito! Llueve fuego sobre la vanguardia enemiga.",
              efectos: [ { op: "DAÑO", valor: 2, target: { quien: "ENEMIGO", zona: "vanguardia" } } ] }
        ]
    },
    {
        id: 993, name: "Biblioteca de prueba", type: "Evento", rarity: "C", cost: 0, duration: 2, series: 1,
        text: "2 turnos. Al expirar, robas 2 cartas.",
        abilities: [
            { trigger: "AL_CADUCAR", resumenFase: "Al expirar, roba 2 cartas", log: "La biblioteca cierra: te llevas lo aprendido.",
              efectos: [ { op: "ROBAR", cantidad: 2 } ] }
        ]
    },
    {
        id: 994, name: "Maldición de prueba", type: "Evento", rarity: "C", cost: 0, duration: 2, series: 1,
        text: "2 turnos. Al colocarla, aplica Daño por tiempo (2 turnos) y un contador de Maldición a cada enemigo de vanguardia.",
        abilities: [
            { trigger: "AL_JUGAR", log: "¡Una maldición doble cae sobre la vanguardia enemiga!",
              efectos: [
                { op: "APLICAR_ESTADO", estado: "dot", duracion: 2, target: { quien: "ENEMIGO", zona: "vanguardia" } },
                { op: "MODIFICAR_CONTADORES", contador: "maldicion", delta: 1, nombreContador: "Maldición", icono: "💀", target: { quien: "ENEMIGO", zona: "vanguardia" } }
              ] }
        ]
    },
    {
        name: "Neo", hp: 3, def: 8, atk: 6, type: "Personaje", subtype: "Ser vivo",
        tags: ["Usuaria de semblanza", "mafia"], gender: "F", rarity: "A", series: "R",
        // "Requisito: ..." al inicio (Toto, 31-jul-2026): el cliente ya sabe formatear ese prefijo
        // en su propia caja tipo stats (misma norma Coste/Requisito de siempre) — no hace falta
        // nada nuevo, solo escribirlo. Es un REQUISITO y no un Coste porque no se paga/pierde
        // nada al colocarla: es solo la condición que dispara la reacción.
        text: "Requisito: Un 'cebo' que ataque o vaya a sufrir daño. P: IMAGINACIÓN HIPERACTIVA: No se coloca de forma normal. Cuando un 'cebo' declare un ataque o vaya a recibir daño, cámbialo por Neo desde tu mano: el cebo vuelve a tu mano y Neo ocupa su hueco, con sus equipos y bonos, y da o recibe el golpe. Cebo: Personaje o Esbirro aliado sin requisitos de colocación, que no sea Máquina, Ser mágico, Animal salvaje ni Cosa, y que no haya atacado, recibido daño ni usado su Activa. A: PARED FALSA (4F): Pon un contador en Neo. El próximo ataque que reciba, normal o especial, queda anulado con todos sus efectos y se retira el contador. No acumulable.",
        passiveName: "IMAGINACIÓN HIPERACTIVA", activeName: "PARED FALSA", activeCost: 4,

        // PARED FALSA es 100% declarativa y no necesitó ninguna pieza nueva: el op ESQUIVAR ya
        // anula el golpe Y todos sus efectos (el motor lo trata como ataque fallido), y sirve
        // igual para normal y especial porque ANTES_DE_DEFENDER solo se limita a normales si se
        // le pide con `soloAtaqueNormal`. El "no acumulable" es un requisito sobre su propio
        // contador, gracias a que `_field` sabe leer rutas con puntos.
        abilities: [
            { trigger: "ACTIVA", nombre: "PARED FALSA", coste: { furor: 4 }, sinObjetivo: true,
              requisitos: [
                { campo: "counters.pared_falsa.count", op: "falsy",
                  msg: "Neo ya tiene su Pared falsa levantada." } ],
              efectos: [
                { op: "MODIFICAR_CONTADORES", target: { quien: "SELF" }, contador: "pared_falsa",
                  delta: 1, nombreContador: "Pared falsa", icono: "🧱",
                  log: "{carta} levanta una Pared falsa." } ] },
            { trigger: "ANTES_DE_DEFENDER",
              si: [ { campo: "counters.pared_falsa.count", op: ">=", valor: 1 } ],
              efectos: [
                { op: "FLOTANTE", target: { quien: "SELF" }, texto: "¡PARED FALSA!", estilo: "ft-purple", offset: -40 },
                { op: "MODIFICAR_CONTADORES", target: { quien: "SELF" }, contador: "pared_falsa", delta: -1 },
                { op: "ESQUIVAR", sinAnimacion: true,
                  log: "¡El ataque de {objetivo} atraviesa a {defensor}: no era más que una Pared falsa!" } ] }
        ],

        // ---- IMAGINACIÓN HIPERACTIVA (imperativa: no hay arquetipo DSL para esto) ----
        // "No puedes colocar a Neo de manera normal": el motor consulta canPlayCard también para
        // Personaje/Esbirro desde la migración de Némesis, así que basta con negar aquí. De paso
        // es el sitio natural para el diagnóstico que pidió Toto: al clicarla te explica por qué
        // no cualifica cada aliado, en vez de dejarte adivinando.
        canPlayCard: function(card, game, p) {
            game.logError(NEO.diagnostico(card, game, p));
            return false;
        },

        // Reacción al DECLARAR un ataque con un cebo (punto nuevo del motor:
        // onHandReactionToAllyAttack, ver ofrecerReaccionAtacante). Devuelve el nuevo atacante.
        onHandReactionToAllyAttack: async function(handCard, atacante, defensor, game) {
            if (!NEO.puedeSustituir(handCard, atacante, game)) return null;
            const ok = await NEO.preguntar(handCard, atacante, game,
                `¿Cambiar a ${game.getCardNameWithOwner(atacante)} por Neo para atacar?`);
            if (!ok) return null;
            await NEO.revelar(handCard, atacante, game);
            return { nuevoAtacante: handCard };
        },

        // Reacción a que un cebo VAYA A RECIBIR DAÑO, del tipo que sea. Usa el punto ÚNICO del
        // motor (ofrecerReaccionDano), al que llaman tanto dealDamage -ataques normales y
        // especiales, y el op DAÑO- como el MODIFICAR_STAT del DSL, que es por donde entra el
        // daño de efecto (Atomización, TORMENTA PERFECTA...) y que antes se escapaba.
        onHandReactionToAllyDamage: async function(handCard, objetivo, origen, game) {
            if (!NEO.puedeSustituir(handCard, objetivo, game)) return null;
            const ok = await NEO.preguntar(handCard, objetivo, game,
                `¿Cambiar a ${game.getCardNameWithOwner(objetivo)} por Neo para recibir el golpe?`);
            if (!ok) return null;
            await NEO.revelar(handCard, objetivo, game);
            return { nuevoObjetivo: handCard };
        },
    },

    // ===================================================================
    //  TANDA 1 DE CARTAS NUEVAS (7-ago-2026) — los Eventos que OTRAS CARTAS
    //  YA BUSCAN. Se hacen primero a propósito: no son cartas nuevas sueltas,
    //  son las que arreglan cartas ya implementadas que hoy no funcionan.
    // ===================================================================
    {
        // LA MÁS BLOQUEANTE DEL EXCEL: la exigen ocho cartas (Xanadu, Diego Antonio,
        // Silhouette, sus tres versiones KL, y Reimu y Marisa jugables). De esas, Xanadu y
        // Diego Antonio YA ESTÁN IMPLEMENTADAS y eran INCOLOCABLES: su canPlayCard busca
        // este Evento por nombre y no existía en CARD_DB. Con solo añadir la carta, las dos
        // vuelven a jugarse sin tocarles una línea.
        //
        // "No puedes volver a usarla el resto de la partida (pero tu rival sí)": NO necesita
        // pieza nueva. Es el patrón que ya usan Espada V y Shichishito -MARCAR_JUGADOR al
        // jugarla + un requisito sobre ese campo del JUGADOR-, y por vivir en el jugador y no
        // en la carta, sale gratis que sea por jugador y no global.
        name: "Una buena razón", type: "Evento", rarity: "A", cost: 0, duration: 2, series: 1,
        // Lo que hace legal esta jugada es un HUECO: que el rival no tenga Evento. La flecha
        // sale de su ranura vacía (Toto, 14-ago-2026).
        requisitoZona: [ { sel: "#{RIVAL}-event-slot", siVacia: "RIVAL" } ],
        text: "2 turnos. Requiere que tu rival no tenga Evento en juego. Al expirar, no puedes volver a jugarla en toda la partida.",
        abilities: [
            { trigger: "JUGAR", requisitos: [
                { de: "JUGADOR", campo: "usadaUnaBuenaRazon", op: "falsy",
                  msg: "Ya has jugado 'Una buena razón' en esta partida." },
                { eventoActivoRival: true, op: "==", valor: 0,
                  msg: "No puedes jugarla mientras tu rival tenga un Evento en juego." } ] },
            { trigger: "AL_JUGAR", log: "{jugador} tiene una buena razón para todo esto.", logTipo: "ability",
              efectos: [ { op: "MARCAR_JUGADOR", campo: "usadaUnaBuenaRazon", valor: true } ] },
            { trigger: "AL_CADUCAR", resumenFase: "Al expirar, no podrá volver a jugarse en toda la partida", log: "{carta} de {jugador} se ha desvanecido, y no volverá.", logTipo: "system" }
        ],
    },
    {
        // La busca La Bestia (CATÁSTROFE), que YA está implementada: su Activa buscaba esta
        // carta en el mazo y nunca podía encontrarla.
        //
        // Lo que el texto del Excel pide -"los Esbirros 'Monstruo' que pidan tributo de Furor
        // sólo requieren la mitad"- NO se implementa todavía: el tributo lo resuelve
        // DSL.tributoFuror con la cantidad fija que cada carta le pasa, así que rebajarlo
        // exige un punto de consulta que hoy no existe. Se deja anotado como la pieza
        // "descuento de tributo" y la carta entra con lo demás funcionando, que es lo que
        // desbloquea a La Bestia. Ojo: NO se inventa nada, el texto lo dice y está pendiente.
        name: "Fusión de planos", type: "Evento", rarity: "S", cost: 0, duration: 3, series: 1,
        text: "3 turnos. Al expirar, todos los enemigos pierden 2 de Furor.",
        abilities: [
            { trigger: "AL_CADUCAR", resumenFase: "Al expirar, todos los enemigos pierden 2 de Furor", log: "¡Los planos se separan de nuevo, drenando a los enemigos!", logTipo: "ability",
              efectos: [
                { op: "MODIFICAR_STAT", target: { quien: "ENEMIGO" }, stat: "furor", delta: -2 } ] }
        ],
    },
    {
        // Berry (INTERFAZ) busca 'Rebobinar', 'Cambio de canal' o 'Publicidad mental'. Solo
        // existía la primera, así que su Activa ofrecía un tercio de lo que promete su texto.
        name: "Cambio de canal", type: "Evento", rarity: "C", cost: 0, duration: 3, series: 1,
        text: "3 turnos. Al expirar, robas 3 cartas.",
        abilities: [
            { trigger: "AL_CADUCAR", resumenFase: "Al expirar, roba 3 cartas", log: "Cambio de canal: {jugador} se pone al día y roba 3 cartas.", logTipo: "ability",
              efectos: [ { op: "ROBAR", cantidad: 3 } ] }
        ],
    },
    {
        // La otra que buscaba Berry. Pareja de Exhibicionismo (que baja Def en vez de Atq):
        // se hacen juntas porque comparten estructura EXACTA, que es justo el criterio de
        // familias de la §9 de la rúbrica — misma mecánica, misma redacción.
        name: "Publicidad mental", type: "Evento", rarity: "C", cost: 0, duration: 2, series: 1,
        text: "2 turnos. Requiere elegir un aliado de tu vanguardia. Mientras esté en juego, ese aliado y todos los enemigos pierden 2 de Atq.",
        abilities: [
            { trigger: "JUGAR", requisitos: [
                { count: { zona: "VANGUARDIA" }, op: ">=", valor: 1,
                  msg: "Necesitas un aliado en vanguardia al que anunciar." } ] },
            { trigger: "ANTES_DE_JUGAR", efectos: [
                { op: "ELEGIR", de: "ALIADOS", zona: "vanguardia", cantidad: 1,
                  titulo: "¿A QUIÉN LE PONEMOS LOS ANUNCIOS?",
                  guardaIdEnSelf: "objetivoPublicidad", guardaEn: "anunciado", esRequisito: true } ] },
            { trigger: "AL_JUGAR", log: "¡Publicidad mental! {anunciado} y todos los enemigos se distraen." },
            { trigger: "AURA", quien: "ALIADO", soloSelfId: "objetivoPublicidad", stats: { atk: -2 } },
            { trigger: "AURA", quien: "ENEMIGO", stats: { atk: -2 } },
            { trigger: "AL_CADUCAR", log: "Se acaban los anuncios.", logTipo: "system" }
        ],
    },
    {
        // Gemela de Publicidad mental: misma estructura, Def en vez de Atq. No la busca
        // ninguna carta, pero entra aquí porque escribirla aparte habría costado más que
        // copiar la de al lado, y así las dos nacen redactadas igual (rúbrica §9).
        name: "Exhibicionismo", type: "Evento", rarity: "C", cost: 0, duration: 2, series: 1,
        text: "2 turnos. Requiere elegir un aliado de tu vanguardia. Mientras esté en juego, ese aliado y todos los enemigos pierden 2 de Def.",
        abilities: [
            { trigger: "JUGAR", requisitos: [
                { count: { zona: "VANGUARDIA" }, op: ">=", valor: 1,
                  msg: "Necesitas un aliado en vanguardia que se exhiba." } ] },
            { trigger: "ANTES_DE_JUGAR", efectos: [
                { op: "ELEGIR", de: "ALIADOS", zona: "vanguardia", cantidad: 1,
                  titulo: "¿QUIÉN SE EXHIBE?",
                  guardaIdEnSelf: "objetivoExhibicion", guardaEn: "exhibido", esRequisito: true } ] },
            { trigger: "AL_JUGAR", log: "¡Exhibicionismo! {exhibido} y todos los enemigos bajan la guardia." },
            { trigger: "AURA", quien: "ALIADO", soloSelfId: "objetivoExhibicion", stats: { def: -2 } },
            { trigger: "AURA", quien: "ENEMIGO", stats: { def: -2 } },
            { trigger: "AL_CADUCAR", log: "Se acaba el espectáculo.", logTipo: "system" }
        ],
    },
    {
        name: "Quema de maná", type: "Ayuda", subtype: "Mágico", tags: ["Consumible"], rarity: "C", series: 1,
        text: "Quita 2 de Furor a un enemigo.",
        abilities: [
            { trigger: "AL_CONSUMIR",
              efectos: [
                { op: "ELEGIR", de: "ENEMIGOS", cantidad: 1, titulo: "Elige a quién quemarle el maná",
                  efectos: [
                    { op: "MODIFICAR_STAT", stat: "furor", delta: -2,
                      log: "{carta} quema el maná de {objetivo}." } ] } ] }
        ],
    },
    {
        name: "Cóctel molotov", type: "Ayuda", subtype: "Arma", tags: ["Consumible"], rarity: "C", series: 1,
        text: "Quita 1 de Vida a un enemigo y le inflige Daño por tiempo durante 2 turnos.",
        abilities: [
            { trigger: "AL_CONSUMIR",
              efectos: [
                { op: "ELEGIR", de: "ENEMIGOS", cantidad: 1, titulo: "Elige el objetivo del Cóctel molotov",
                  efectos: [
                    { op: "MODIFICAR_STAT", stat: "currentHp", delta: -1, comprobarMuerte: true,
                      animacion: "DANO_VERDADERO",
                      log: "¡{carta} estalla sobre {objetivo}!" },
                    { op: "APLICAR_ESTADO", estado: "dot", duracion: 2 } ] } ] }
        ],
    },
    {
        name: "Consagración", type: "Evento", rarity: "A", cost: 0, duration: 3, series: 1,
        text: "3 turnos. Mientras esté en juego, cura 1 de Vida a cada aliado al final de tu turno. Al expirar, cura 1 de Vida a cada aliado.",
        abilities: [
            { trigger: "FIN_TURNO", resumenFase: "Cura 1 de Vida a cada aliado", 
              efectos: [
                { op: "CURAR", valor: 1, conBeforeHealed: false, soloSiHerido: true,
                  offsetY: -20, fuente: "healing",
                  target: { quien: "ALIADO" },
                  // logResumen (Toto, 7-ago-2026): SOLO si curó a alguien -si todos estaban a
                  // Vida llena no sale nada-. `delta` es lo que de verdad ocurrió, no el `valor`
                  // declarado, así que sigue siendo correcto si algún día algo lo cambia a 0.5.
                  logResumen: { msg: "La luz de Consagración cura +{delta} de Vida a {lista}.",
                                msgVariado: "La luz de Consagración recorre el campo, curando a {lista}.",
                                tipo: "healing" } } ] },
            { trigger: "AL_CADUCAR", resumenFase: "Al expirar, cura 1 de Vida a cada aliado", log: "Consagración se desvanece con una última bendición.", logTipo: "ability",
              efectos: [
                { op: "CURAR", valor: 1, conBeforeHealed: false, soloSiHerido: true,
                  offsetY: -20, fuente: "healing",
                  target: { quien: "ALIADO" },
                  logResumen: { msg: "Antes de apagarse del todo, cura +{delta} de Vida a {lista}.",
                                msgVariado: "Antes de apagarse del todo, cura a {lista}.",
                                tipo: "healing" } } ] }
        ],
    },
    {
        name: "Robot de asalto AU", hp: 5, def: 5, atk: 5, type: "Esbirro", subtype: "Máquina", tags: ["Controlable"], gender: "N", rarity: "C", series: 1,
        text: "P: SOBRECALENTAMIENTO: Al final de cada turno en el que tenga 2 o más de Furor, pierde 3 de Vida.",
        passiveName: "SOBRECALENTAMIENTO",
        abilities: [
            { trigger: "FIN_TURNO", resumenFase: "Con 2 o más de Furor, pierde 3 de Vida", porHabilidad: "SOBRECALENTAMIENTO", 
              efectos: [
                { if: { campo: "furor", op: ">=", valor: 2 },
                  op: "MODIFICAR_STAT", target: { quien: "SELF" }, stat: "currentHp", delta: -3, comprobarMuerte: true,
                  log: "¡SOBRECALENTAMIENTO! {carta} pierde 3 de Vida." } ] }
        ],
    },
    {
        // EN CONSTRUCCIÓN (Toto, 7-ago-2026). El Excel le da tipo, stats y etiquetas, pero su
        // Pasiva "MAYOR GENERAL" está SIN DESCRIPCIÓN — o sea que la carta está a medias. Entra
        // igualmente porque su etiqueta 'Energía Adán' es la que Meca EBA busca para emplazar
        // piloto, y sin ella ese camino no se puede ni probar. NO se inventa la Pasiva: cuando
        // Toto la escriba, se añade aquí y se le quita `enConstruccion`.
        // `enConstruccion` lo lista tests/auditar_textos.js para que no se olvide.
        name: "Yuriy", hp: 3, def: 4, atk: 4, type: "Personaje", subtype: "Ser vivo",
        tags: ["Cyborg", "Energía Adán"], gender: "M", rarity: "B", series: 4,
        enConstruccion: true,
        text: "Carta en construcción: todavía no tiene Habilidades.",
    },
    {
        name: "Nigromántica", hp: 3, def: 4, atk: 2, type: "Esbirro", subtype: "Ser vivo", tags: ["Usuaria de magia"], gender: "F", rarity: "B", series: 1,
        text: "A: ARTES PROHIBIDAS (1 de Furor): Coloca en tu campo un 'Ser vivo' o 'No-muerto' de tu pila de descartes que no pida coste ni condiciones para colocarse. Puedes descartar un 'Necronomicón' de tu mano para ganar 1 de Furor.",
        activeName: "ARTES PROHIBIDAS",
        abilities: [
            { trigger: "ACTIVA", nombre: "ARTES PROHIBIDAS", coste: { furor: 1 }, sinObjetivo: true, costeDiferido: true,
              requisitos: [
                { count: { zona: "DESCARTES",
                    filtros: [ { o: [ [ { campo: "type", op: "==", valor: "Personaje" } ], [ { campo: "type", op: "==", valor: "Esbirro" } ] ] },
                               { o: [ [ { campo: "subtype", op: "==", valor: "Ser vivo" } ], [ { campo: "subtype", op: "==", valor: "No-muerto" } ] ] } ],
                    plantillaSin: ["onBeforePlayAsync", "canPlayCard"] },
                  op: ">=", valor: 1, msg: "No hay ningún caído apto en tu pila de descartes." } ],
              efectos: [
                // El BUSCAR va PRIMERO y el flotante DESPUÉS (Toto, 7-ago-2026): con
                // `costeDiferido` la Activa se puede cancelar mientras eliges, y el flotante que
                // el rival ve es su único aviso de que ha pasado algo. Anunciándolo antes, cerrar
                // el visor dejaba al rival creyendo que se había usado una Habilidad que en
                // realidad nunca llegó a ocurrir.
                { op: "BUSCAR", en: "DESCARTES", cantidad: 1, destino: "CAMPO", animacionResurrect: true, sinAnimacion: true,
                  filtros: [ { o: [ [ { campo: "type", op: "==", valor: "Personaje" } ], [ { campo: "type", op: "==", valor: "Esbirro" } ] ] },
                             { o: [ [ { campo: "subtype", op: "==", valor: "Ser vivo" } ], [ { campo: "subtype", op: "==", valor: "No-muerto" } ] ] } ],
                  plantillaSin: ["onBeforePlayAsync", "canPlayCard"],
                  abortaSiCancelas: true, abortaSiVacio: true, titulo: "ARTES PROHIBIDAS: ELIGE UN CAÍDO",
                  log: "¡Artes prohibidas! {carta} devuelve a {objetivo} al campo de batalla." },
                { op: "ELEGIR", de: "MANO", cantidad: 1, opcional: true,
                  filtros: [ { campo: "name", op: "contieneTexto", valor: "Necronomicón" } ],
                  titulo: "Puedes elegir ahora un Necronomicón de tu mano para descartarlo y ganar 1 de Furor",
                  efectos: [
                    { op: "DESCARTAR" },
                    // Sin `floating`: modifyStat ya pinta su "+1 FUR" automático para cualquier
                    // cambio de Furor. Declararlo aquí salía DOS veces (Toto, 7-ago-2026).
                    { op: "MODIFICAR_STAT", target: { quien: "SELF" }, stat: "furor", delta: 1,
                      log: "{carta} devora el Necronomicón y gana Furor." } ] } ] }
        ],
    },
];

// ===================================================================
//  NEO — IMAGINACIÓN HIPERACTIVA
//  Vive aparte porque son varias piezas que se llaman entre sí y meterlas dentro de la carta
//  la volvía ilegible. La Pasiva NO es declarable: no existe (ni compensa inventar) un
//  arquetipo para "sustituir un aliado por mí desde la mano en mitad de un ataque".
// ===================================================================
const NEO = {
    // Un cebo es un aliado que sigue INTACTO y que no es de los "raros". Cada condición se
    // evalúa por separado para poder explicar en el log cuál falla (ver diagnostico).
    // El orden importa poco, pero se listan de la más estructural a la más circunstancial.
    razonesNoCebo(c, game) {
        const razones = [];
        const t = getCardTemplate(c.id) || {};
        if (c.type !== 'Personaje' && c.type !== 'Esbirro') razones.push('no es Personaje ni Esbirro');
        if (c.subtype === 'Máquina') razones.push('es una Máquina');
        if (c.subtype === 'Ser mágico') razones.push('es un Ser mágico');
        if ((c.tags || []).includes('Animal salvaje')) razones.push('es un Animal salvaje');
        if ((c.tags || []).includes('Cosa')) razones.push('es una Cosa');
        // "No ha tenido requisitos para colocarse" se mide sobre la PLANTILLA (decisión de Toto):
        // canPlayCard es el gancho de los requisitos y onBeforePlayAsync el de los tributos.
        if (typeof t.canPlayCard === 'function' || typeof t.onBeforePlayAsync === 'function') {
            razones.push('tuvo requisitos para colocarse');
        }
        // Las tres marcas del motor (ver modifyStat / performAttack / executeConfirmedAbility).
        if (c._haAtacado) razones.push('atacó');
        if (c._haRecibidoDano) razones.push('sufrió daño');
        if (c._haUsadoActiva) razones.push('usó su Activa');
        // Límite de sitio (Toto, 31-jul-2026): Neo ES un Personaje, así que sustituir un cebo EN
        // VANGUARDIA le añade uno a la cuenta. Un cebo que ya sea Personaje no tiene este problema
        // -al reemplazarlo el recuento no cambia, Neo ocupa exactamente su hueco-, pero un Esbirro
        // que por lo demás cualificara puede topar con el máximo de 2. Mismo recuento que usa el
        // motor para el límite de colocación (game.players[...].vanguard.filter(tipo Personaje)):
        // si algún día un Personaje deja de contar para ese límite, hay que tocar los dos sitios.
        if (c.location === 'vanguard') {
            const otrosPersonajes = game.players[c.owner].vanguard
                .filter(x => x.type === 'Personaje' && x.instanceId !== c.instanceId).length;
            if (otrosPersonajes >= 2) razones.push('no cabría (ya hay 2 Personajes en vanguardia)');
        }
        return razones;
    },

    esCebo(c, game) { return this.razonesNoCebo(c, game).length === 0; },

    // "Karlos atacó y sufrió daño" — enumeración natural, con "y" antes de la última.
    _enumerar(xs) {
        if (xs.length <= 1) return xs[0] || '';
        return xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1];
    },

    // Texto que sale al clicar a Neo en la mano. Explica por qué NO se puede colocar y, si algún
    // aliado no cualifica, por qué no — que es justo lo que el jugador necesita para decidir.
    diagnostico(card, game, p) {
        const base = 'Neo solo se coloca si un cebo declara un ataque o va a recibir daño.';
        const colocados = [...p.vanguard, ...p.rearguard];
        const fallan = colocados
            .map(c => ({ c, razones: this.razonesNoCebo(c, game) }))
            .filter(x => x.razones.length > 0);
        if (colocados.length === 0) return `${base} Ahora mismo no tienes ningún aliado colocado.`;
        if (fallan.length === 0) return base;
        const detalle = fallan
            .map(x => `${game.nCarta(x.c)} ${this._enumerar(x.razones)}`)
            .join('; ');
        const todos = fallan.length === colocados.length;
        // "No cualifican" (plural), no "cualifica": la frase anterior habla de Neo, y en singular
        // se leía como si el sujeto siguiera siendo ella. El plural deja claro que habla de los
        // aliados listados a continuación (Toto, 31-jul-2026). "Ninguno cualifica" se queda en
        // singular a propósito: "ninguno" ya es un pronombre singular sin ambigüedad posible.
        return `${base} ${todos ? 'Ninguno cualifica' : 'No cualifican'}: ${detalle}.`;
    },

    // Además de ser cebo, hay un límite de sitio: Neo es un Personaje, así que si el cebo está en
    // vanguardia y ya hay DOS Personajes MÁS, no cabría (el motor solo admite 2 por vanguardia).
    // El límite de sitio ya vive DENTRO de esCebo/razonesNoCebo (así el diagnóstico del log y la
    // comprobación real en el momento de la reacción usan el MISMO cómputo; antes estaban
    // duplicados y podían desincronizarse en silencio).
    puedeSustituir(neo, cebo, game) {
        return !!cebo && cebo.owner === neo.owner && this.esCebo(cebo, game);
    },

    preguntar(neo, cebo, game, titulo) {
        return new Promise(resolve => {
            game.openChoiceModal(titulo, [
                { label: 'SÍ, REVELAR A NEO', action: () => resolve(true) },
                { label: 'NO', action: () => resolve(false) },
            ], neo.owner);
        });
    },

    async revelar(neo, cebo, game) {
        // Neo SE PRESENTA al revelarse (Toto, 14-ago-2026). Es lo que arregla el problema de la
        // flecha: marcar el cebo no servía de nada porque el intercambio lo manda a la mano al
        // instante, así que cuando se iba a dibujar ya no había a quién apuntar.
        // Presentándose, el orden se ordena solo y encaja con todo lo demás:
        //   1. Neo sale de tu mano al escaparate — el rival la ve por primera vez AQUÍ, o sea que
        //      la sorpresa no se pierde: no se delata nada antes de que ocurra.
        //   2. Con ella quieta en el centro, el cebo -que TODAVÍA está en el campo- le manda su
        //      flecha "Cebo".
        //   3. Solo entonces se hace el intercambio, dentro del escaparate: el cebo vuelve a la
        //      mano y Neo aterriza en su hueco.
        // Mismo mecanismo que Némesis (§14.ter): la carta espera en el centro mientras pasa lo
        // que tiene que pasar, y viaja a su sitio cuando ha terminado.
        game.logMsg(`¡IMAGINACIÓN HIPERACTIVA! ${game.getCardNameWithOwner(cebo)} no era más que un señuelo: ${game.nCarta(neo)} ocupa su lugar.`, 'ability');
        if (typeof DSL !== 'undefined' && DSL._marcarCoste) DSL._marcarCoste(game, cebo, 'requisito', 'Cebo');
        const _cambio = async () => {
            await game.sustituirEnCampo(cebo, neo);
            if (typeof showFloatingText === 'function') showFloatingText(neo.instanceId, '¡NEO!', 'ft-purple', -40);
            return neo.instanceId;
        };
        const _fila = `#${neo.owner}-${cebo.location === 'rearguard' ? 'rearguard' : 'vanguard'}`;
        if (typeof animarPresentacionCarta === 'function') {
            // De dorso: para el rival, Neo estaba en una mano que no ve. El volteo ES la sorpresa.
            const _deDorso = game.gameMode === 'online' && game.myPlayerId !== neo.owner;
            try {
                await animarPresentacionCarta(neo.id, `#${neo.owner}-hand`, _fila, _deDorso,
                    { origenId: neo.instanceId, zonaSel: _fila, enElEscaparate: async () => {}, colocar: _cambio });
            } catch (e) { console.error(e); _cambio(); }
        } else { _cambio(); }
    },
};

// --- AUTO-GENERADOR DE IDs ---
let _autoIdCounter = 1000;
CARD_DB.forEach(card => {
    if (card.id === undefined) {
        card.id = _autoIdCounter++;
    }
});

// ===================================================================
//  CAPA DE REGLAS (números del juego con overrides por carta)
//  Regla de resolución: instancia -> plantilla -> valor por defecto.
//  Nunca comparar contra literales: consultar siempre estos helpers.
// ===================================================================
const KARLOS_RULES = {
    furorMaxDefault: 4,
    getFurorMax(card) {
        if (card && typeof card.furorMax === 'number') return card.furorMax;           // override de instancia
        const t = card && (typeof getCardTemplate === 'function' ? getCardTemplate(card.id) : CARD_DB.find(c => c.id === card.id));
        if (t && typeof t.furorMax === 'number') return t.furorMax;                     // override de plantilla
        return KARLOS_RULES.furorMaxDefault;
    }
};

// ===================================================================
//  INTÉRPRETE DECLARATIVO v3 (motor híbrido)
//  Triggers: PASIVA_CONTINUA, JUGAR, AL_JUGAR, AL_USAR_AYUDA, AL_CADUCAR
//  Primitivas: MODIFICAR_STAT, CURAR (2 variantes), DAÑO (async)
//  Valores: número | {COUNT:{...}} | {REF:"objetivo.furorMax"} (campos computados)
// ===================================================================
const DSL = {
    TRIGGERS: ['PASIVA_CONTINUA', 'JUGAR', 'AL_JUGAR', 'AL_USAR_AYUDA', 'AL_CADUCAR', 'FIN_TURNO', 'INICIO_TURNO', 'AL_ENTRAR', 'AL_CONSUMIR', 'AL_EQUIPAR', 'PREVIEW_GLOBAL', 'ACTIVA', 'GLOBAL_TRAS_ATAQUE', 'GLOBAL_MODIFICAR_FUROR', 'GLOBAL_INICIO_TURNO', 'GLOBAL_ANTES_DE_ATAQUE', 'AURA', 'ANTES_DE_JUGAR', 'PUEDE_ATACAR', 'SOBRECURACION', 'REACCION', 'AL_MORIR', 'AL_MORIR_ALIADO', 'AL_DESTRUIR', 'ESPEJO', 'ANTES_DE_ATACAR', 'TRAS_ATACAR', 'TRAS_DEFENDER', 'ANTES_DE_DEFENDER', 'INTERCEPTOR_ATAQUE', 'EQUIPO_ANTES_DE_DEFENDER', 'EQUIPO_ANTES_DE_ATACAR', 'GLOBAL_ANTES_DE_CAMBIO_STAT'],
    // Los 5 últimos ops solo tienen sentido dentro de una REACCION (los interpreta
    // DSL._runReaccion, no _doEffect): controlan el resultado que la reacción
    // devuelve al motor de combate (redirigir el ataque, cancelarlo, drenar Furor
    // tras él, fijar el daño, autoataque del atacante).
    OPS_EFECTO: ['MODIFICAR_STAT', 'CURAR', 'DAÑO', 'APLICAR_ESTADO', 'MODIFICAR_CONTADORES', 'ATACAR', 'MONEDA', 'ROBAR', 'BUSCAR', 'MARCAR', 'VER_MANO', 'LIMPIAR_ESTADOS', 'ELEGIR', 'DESTRUIR_EVENTO', 'MARCAR_TEMPORAL', 'DESCARTAR', 'EQUIPAR', 'MARCAR_JUGADOR', 'FLOTANTE', 'FIJAR_STAT', 'REDIRIGIR', 'CANCELAR_ATAQUE', 'MARCAR_DRENAJE', 'FIJAR_DAÑO', 'ATACANTE_SE_AUTOATACA', 'VOLVER_A_MANO', 'RETRIBUCION', 'SUELO_STAT', 'TECHO_STAT', 'NO_CONSUMIR', 'BONO_ATAQUE', 'MARCAR_PARTIDA', 'ESQUIVAR', 'DESEQUIPAR', 'DAÑO_ATAQUE', 'REDIRIGIR_ATAQUE', 'SECUESTRAR_STAT', 'DEVOLVER_STAT', 'CUENTA_ATRAS'],
    OPS_CMP: ['==', '!=', '<=', '>=', '<', '>', 'includes', 'contieneTexto', 'includesCI', 'truthy', 'falsy'],
    QUIEN: ['SELF', 'ALIADO', 'ENEMIGO', 'TODOS', 'ATACANTE', 'DEFENSOR', 'PORTADOR'], // ATACANTE/DEFENSOR: solo en GLOBAL_TRAS_ATAQUE y REACCION

    _tmpl(id) { return (typeof getCardTemplate === 'function') ? getCardTemplate(id) : CARD_DB.find(c => c.id === id); },

    // ¿Le afecta de verdad un veto de ataque NORMAL (vetoAtaqueNormal) a esta carta?
    // (Toto, 28-jul-2026). Dos exenciones, ambas leídas del texto de las cartas implicadas:
    //   · `uncounterable` (Aniceto, SAPIENCIA MÁGICA: "No se pueden contrarrestar sus ataques
    //     ni su Habilidad activa con Habilidades, ni con cartas de Ayuda o de Evento") — un
    //     veto puesto por una Activa enemiga es exactamente eso, así que no le alcanza.
    //   · `treatAttacksAsSpecial` (marca de instancia, p. ej. la que pone Infusión de maná):
    //     si TODOS sus ataques cuentan como especiales, un veto de ataques normales no tiene
    //     nada que vetar.
    // Se consulta desde los dos sitios que aplican el veto (el temprano, al clicar la carta,
    // y el del momento del golpe) para que no puedan discrepar.
    _vetoAtaqueAplica(atacante) {
        if (!atacante) return false;
        if (atacante.treatAttacksAsSpecial) return false;
        const t = DSL._tmpl(atacante.id) || {};
        if (t.uncounterable) return false;
        return true;
    },
    _field(c, campo) {
        const k = String(campo).replace(/^self\./, '');
        if (k === 'hp') return c.currentHp;
        if (k === 'atk') return c.currentAtk;
        if (k === 'def') return c.currentDef;
        if (k === 'furorMax') return KARLOS_RULES.getFurorMax(c); // campo computado (capa de reglas)
        if (k === 'dotActivo') return !!(c.status && c.status.dot && c.status.dot.duration > 0); // campo computado: ¿tiene Daño por Tiempo activo?
        // Ruta con puntos (Karlitos, 31-jul-2026): "counters.karlitos_entrenamiento.count".
        // Los contadores viven anidados, así que sin esto no se podía condicionar por su valor.
        // Devuelve undefined en cuanto un tramo falta, en vez de reventar.
        if (k.indexOf('.') !== -1) return k.split('.').reduce((o, kk) => (o === undefined || o === null) ? undefined : o[kk], c);
        return c[k];
    },
    _ref(path, ctx) { // "objetivo.furorMax" | "self.atk" | "vars.sumaAtq" (guardado por ELEGIR)
        const [who, campo] = String(path).split('.');
        if (who === 'vars') return ctx && ctx.vars ? ctx.vars[campo] : undefined;
        const c = who === 'objetivo' ? ctx.objetivo : ctx.self;
        return c ? DSL._field(c, campo) : undefined;
    },
    _cmp(a, op, b) {
        switch (op) {
            case '==': return a === b;   case '!=': return a !== b;
            case '<=': return a <= b;    case '>=': return a >= b;
            case '<': return a < b;      case '>': return a > b;
            case 'includes': return Array.isArray(a) && a.includes(b);
            case 'includesCI': return Array.isArray(a) && a.some(x => String(x).toLowerCase() === String(b).toLowerCase());
            case 'contieneTexto': return String(a).includes(b);
            case 'truthy': return !!a;   case 'falsy': return !a;
            default: return false;
        }
    },
    _match(c, f) {
        let res;
        if (f.o) res = f.o.some(grupo => grupo.every(sub => DSL._match(c, sub))); // OR de grupos-AND
        else if (f.dePlantilla) { const t = getCardTemplate(c.id) || {}; res = DSL._cmp(t[f.campo], f.op, f.valor); }
        else {
            const b = f.valorCampo !== undefined ? DSL._field(c, f.valorCampo) : f.valor;
            res = DSL._cmp(DSL._field(c, f.campo), f.op, b);
        }
        return f.no ? !res : res; // no: true invierte el filtro
    },
    _zone(game, pid, zona) {
        const p = game.players[pid];
        const z = String(zona || '').toLowerCase(); // acepta 'VANGUARDIA' y 'vanguardia'
        if (z === 'vanguardia') return [...p.vanguard];
        if (z === 'retaguardia') return [...p.rearguard];
        if (z === 'mano') return [...p.hand]; // Matón, 31-jul-2026: "¿tengo más copias en la mano?"
        // El Evento activo cuenta como carta del campo: hay cartas cuyo requisito ES un Evento
        // ('Una buena razón' para Xanadu), y la flecha tiene que poder apuntarle.
        if (z === 'evento') return p.activeEvent ? [p.activeEvent] : [];
        return [...p.vanguard, ...p.rearguard];
    },
    _pool(ownerId, game, spec, selfCard) {
        if (spec.quien === 'SELF') return selfCard ? [selfCard] : [];
        // ATACANTE (Milkor MGL, 31-jul-2026): dentro de EQUIPO_ANTES_DE_ATACAR la carta fuente es
        // el EQUIPO, así que "SELF" no sirve para apuntar a quien lo empuña. El trigger deja al
        // portador en este transitorio de `game` (no viaja en el estado, igual que ESQUIVAR).
        if (spec.quien === 'ATACANTE') return game._dslEquipoAtacante ? [game._dslEquipoAtacante] : [];
        // PORTADOR (Guantes sedientos, 16-ago-2026): quien lleva ESTE equipo, resuelto desde
        // `equippedTo`. ATACANTE solo vale dentro de EQUIPO_ANTES_DE_ATACAR, que deja al portador
        // en un transitorio; esto sirve en cualquier trigger del equipo -su fin de turno, por
        // ejemplo- y es lo que permite que un contador salga en la carta que se ve en el tablero
        // y no en la Ayuda, que está anexada y no se ve.
        if (spec.quien === 'PORTADOR') {
            const _id = selfCard && selfCard.equippedTo;
            if (!_id) return [];
            const _todas = [...game.players.p1.vanguard, ...game.players.p1.rearguard,
                            ...game.players.p2.vanguard, ...game.players.p2.rearguard];
            const _h = _todas.find(c => c.instanceId === _id);
            return _h ? [_h] : [];
        }
        // selfLista: cartas en mesa cuyo instanceId está en la lista guardada en la
        // propia carta (p. ej. Esfuerzo dividido con chosenAllies). Ignora bandos.
        if (spec.selfLista) {
            const ids = (selfCard && Array.isArray(selfCard[spec.selfLista])) ? selfCard[spec.selfLista] : [];
            return [...DSL._zone(game, 'p1', spec.zona), ...DSL._zone(game, 'p2', spec.zona)].filter(c => ids.includes(c.instanceId));
        }
        const en = ownerId === 'p1' ? 'p2' : 'p1';
        let pool = spec.quien === 'ENEMIGO' ? DSL._zone(game, en, spec.zona)
                 : spec.quien === 'TODOS' ? [...DSL._zone(game, 'p1', spec.zona), ...DSL._zone(game, 'p2', spec.zona)]
                 : DSL._zone(game, ownerId, spec.zona);
        if (spec.excludeSelf && selfCard) pool = pool.filter(c => c.instanceId !== selfCard.instanceId);
        if (!spec.permitirAvatar) pool = pool.filter(c => !((getCardTemplate(c.id) || {}).isAvatar)); // Kami: intocable por defecto
        // Inmunidad a Eventos enemigos (Eris; Toto, 5-ago-2026): si la carta fuente es un
        // EVENTO, sus efectos no alcanzan a los enemigos que la declaren. Va aquí, en el punto
        // único por el que pasan TODOS los targets del DSL, y no en cada carta: hasta ahora la
        // inmunidad solo se respetaba en las líneas del detalle (onGlobalGetPreviewEffects), así
        // que Bancarrota decía "no te afecto" y te congelaba el Furor igual. Mismo criterio de
        // default-on que el filtro de Avatar de la línea de arriba.
        if (selfCard && (getCardTemplate(selfCard.id) || {}).type === 'Evento') {
            pool = pool.filter(c => !(c.owner !== selfCard.owner && (getCardTemplate(c.id) || {}).immuneToEnemyEvents));
        }
        if (spec.algunEstado) pool = pool.filter(c => c.status && spec.algunEstado.some(k => c.status[k])); // mismo criterio que canPlayCard (JUGAR)
        (spec.filtros || []).forEach(f => { pool = pool.filter(c => DSL._match(c, f)); });
        // Filtro IMPLÍCITO de los equipables: si la carta que se está jugando es un equipo, quedan
        // fuera los aliados que ya lleven uno de su tipo. Va aquí y no en los `requisitos` de cada
        // carta a propósito -son diez, y la undécima se olvidaría-, y como filtro de elección hace
        // que el aliado inelegible ni siquiera salga con reborde verde, que es la norma de UX.
        // Solo cuando la carta jugada es la AYUDA que se anexa. Karlitos también pasa por
        // _esEquipo -su ARMAMENTO MELÉ usa `EQUIPAR invertido`, donde él se calza un arma-, y ahí
        // el pool son ARMAS, no portadores: aplicarles esta regla no tiene sentido y rompía su
        // Activa entera.
        const _tEq = selfCard ? DSL._tmpl(selfCard.id) : null;
        if (_tEq && _tEq.type === 'Ayuda' && DSL._esEquipo(_tEq)) {
            pool = pool.filter(c => DSL._puedeEquiparse(c, _tEq));
        }
        // algunFiltro (Karlitos, 31-jul-2026): OR de filtros, como ya aceptaban ELEGIR y BUSCAR.
        // Faltaba aquí, así que un `count` con `algunFiltro` NO filtraba nada y contaba de más
        // (el requisito "tienes un Arma en la mano" daba por bueno cualquier carta).
        if (spec.algunFiltro) pool = pool.filter(c => spec.algunFiltro.some(f => DSL._match(c, f)));
        return pool;
    },
    _count(ownerId, game, spec, selfCard) {
        let n = DSL._pool(ownerId, game, spec, selfCard).length;
        if (typeof spec.max === 'number') n = Math.min(n, spec.max);
        return n;
    },
    _value(ownerId, game, v, selfCard, ctx) {
        // Literales pasan tal cual (número, string o booleano: p. ej. PASIVA_CONTINUA
        // comparando campo:"pajaritaStance" contra valor:"DEFENSA" — Toto, 23-jul-2026).
        if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
        if (v && v.COUNT) return DSL._count(ownerId, game, v.COUNT, selfCard);
        if (v && v.REF) {
            const base = DSL._ref(v.REF, ctx || { self: selfCard });
            // factor (Toto, 27-jul-2026): multiplica el valor referenciado — p. ej. Xidachane,
            // cuyo Atq/Def suben 2 por cada contador acumulado en un campo propio. OJO: si el
            // ref no resuelve (undefined), se propaga TAL CUAL, sin inventar un 0 — FIJAR_STAT
            // depende de recibir undefined para saber que debe omitirse sin abortar la cadena
            // (bug real encontrado con Plan de equipo: una elección cancelada dejaba de
            // detectarse porque este helper devolvía 0 en vez de undefined).
            if (v.factor === undefined || typeof base !== 'number') return base;
            return base * v.factor;
        }
        return 0;
    },
    _cond(card, game, c) {
        if (!c) return true;
        // Array de condiciones (Matón, 31-jul-2026): TODAS deben cumplirse (AND). Extensión
        // mínima, genérica — hasta ahora `if` solo admitía una condición suelta.
        if (Array.isArray(c)) return c.every(x => DSL._cond(card, game, x));
        if (c.anexoValido !== undefined) return DSL._anexoValido(card, game) === c.anexoValido;
        let r;
        // campoJugador (Matón, 31-jul-2026): condición sobre un campo del JUGADOR dueño de la
        // carta (game.players[owner][campo]), no de la carta — necesario para contadores por
        // turno que no viven en ninguna carta concreta (p. ej. "cuántos Matones coloqué ya").
        if (c.campoJugador !== undefined) r = DSL._cmp(game.players[card.owner][c.campoJugador], c.op, c.valor);
        // count (Matón, 31-jul-2026): condición sobre un recuento de cartas (mismo `count` que
        // ya usan `requisitos`), directamente en un `if` de efecto.
        else if (c.count) r = DSL._cmp(DSL._count(card.owner, game, c.count, card), c.op, c.valor);
        else r = DSL._cmp(DSL._field(card, c.campo), c.op, DSL._value(card.owner, game, c.valor, card, { self: card }));
        // no (Gólem multielemental, 31-jul-2026): niega el resultado — mismo flag que `_match`
        // ya admite por filtro, aquí para `if` de efecto/ability. Sirve para comparar contra un
        // contador propio que puede empezar `undefined` (p. ej. "defBoosts < 3" fallaría con
        // undefined<3===false; "NO defBoosts>=3" da el resultado correcto también sin inicializar).
        return c.no ? !r : r;
    },
    // Un anexo (Kazuo/Gladiador) es válido si la carta tiene un aliado anexado
    // (attachments[0]) que sigue vivo, en mesa, y cuyo attachedTo aún apunta de
    // vuelta a esta carta. Si el vínculo se rompió (el anexado murió o volvió a
    // la mano), se limpia aquí mismo el array — mismo criterio que aplicaban a
    // mano Kazuo/Gladiador en su onUpdatePassive imperativo (Toto, 27-jul-2026).
    _anexoValido(card, game) {
        if (!card.attachments || !card.attachments.length) return false;
        const t = game.findCard(card.attachments[0]);
        const ok = !!(t && (t.location === 'vanguard' || t.location === 'rearguard') && t.attachedTo === card.instanceId);
        if (!ok) card.attachments = [];
        return ok;
    },
    _fill(txt, ctx) {
        // Genérico: cualquier {clave} presente en ctx se sustituye.
        // Género (Toto, 21-jul-2026): {clave?masculino|femenino} — clave es un
        // código de género ('M'/'F'/'N'/'N/A') en ctx; 'F' usa la rama femenina,
        // cualquier otra cosa (incluida ausencia de clave) usa la masculina.
        // Reutiliza el campo card.gender que ya existía en el motor (antes solo
        // se consultaba con ternarios sueltos, p. ej. "ha sido destruido/a").
        let s = String(txt).replace(/\{(\w+)\?([^|{}]*)\|([^}]*)\}/g, (_, k, m, f) => ((ctx || {})[k] === 'F' ? f : m));
        for (const [k, val] of Object.entries(ctx || {})) s = s.split('{' + k + '}').join(val !== undefined && val !== null ? val : '');
        return s;
    },
    // Dispara el cobro+anuncio ARMADO de una Activa en el primer instante irreversible (ver
    // _ejecutarActiva). Lo llaman las elecciones al resolverse. El instanceId evita que una
    // cadena anidada cobre por la Activa equivocada; si no hay nada armado, no hace nada.
    _dispararCobro(sourceCard) {
        const cp = DSL._cobroPendiente;
        if (!cp || !sourceCard || cp.id !== sourceCard.instanceId) return;
        DSL._cobroPendiente = null;
        cp.fn();
    },
    _nombre(game, c) { return (game && typeof game.getCardNameWithOwner === 'function') ? game.getCardNameWithOwner(c) : c.name; },

    // Tributo de Furor al colocar una carta ("Coste: N de Furor"): elige un aliado del CAMPO
    // que pueda pagarlo y le resta el Furor. Devuelve true si se pagó (la colocación sigue) o
    // false si no hay pagador o se canceló. Comparte forma con una docena de cartas que lo
    // hacían copiado-y-pegado con el modal genérico de búsqueda; ahora usan la selección en
    // tablero (reborde verde), que es la norma del proyecto para elegir cartas YA EN EL CAMPO
    // (Toto, 27-jul-2026). Sirve tanto en onBeforePlayAsync como a mitad de partida (Gárgola).
    //   opts.excluirSelf  -> no puede pagarse a sí misma (la carta ya está en el campo)
    //   opts.msgSinPagador-> logError si nadie puede pagar (si se omite, mensaje genérico)
    //   opts.titulo       -> texto del prompt de selección
    async tributoFuror(card, game, p, coste, opts) {
        const o = opts || {};
        const valid = [...p.vanguard, ...p.rearguard].filter(c =>
            c.furor >= coste && !(getCardTemplate(c.id) || {}).isAvatar &&
            !(o.excluirSelf && c.instanceId === card.instanceId));
        if (valid.length === 0) {
            game.logError(o.msgSinPagador || `Necesitas un aliado con al menos ${coste} de Furor para el tributo de ${card.name}.`);
            return false;
        }
        const titulo = o.titulo || `${card.name}: ELIGE TRIBUTO (-${coste} FUROR)`;
        const sel = await game.pickBoardTargets(valid, 1, titulo, card, card.owner, true);
        if (sel && sel.length > 0) {
            game.modifyStat(sel[0], 'furor', -coste);
            // Flecha de tributo al presentarse (§14.bis): de quién sale el Furor y cuánto. Va
            // aquí, en el helper, y no carta por carta: lo usan las nueve que tributan Furor al
            // invocarse (Imp mayor, Gul guerrero, Oni ancho, Tengu orgulloso, Súcubo, Raiju,
            // Experimento fallido, Ángel y Edrielle).
            DSL._marcarCoste(game, sel[0], 'tributo', `Tributa ${coste} FUR`);
            return true;
        }
        return false;
    },

    // `hp` significa Vida Máx. OJO: a diferencia de atk/def, maxHp NO se resetea en cada
    // pasada de updatePassives (persiste entre pasadas, como cualquier otro stat "normal"
    // fuera de las pasivas) — así que out.hp NO es un delta a sumar directamente: es el valor
    // TOTAL que la pasiva quiere aportar en ESTA pasada, y quien lo consume (más abajo en el
    // compilador de PASIVA_CONTINUA) debe compararlo con el aportado en la pasada anterior y
    // aplicar solo la DIFERENCIA (igual que hacían a mano Fanático/Xidachane/Gladiador).
    _passiveDeltas(card, game, effects) {
        const out = { atk: 0, def: 0, hp: 0 };
        (effects || []).forEach(e => {
            if (e.if) { const s = DSL._passiveDeltas(card, game, DSL._cond(card, game, e.if) ? e.then : (e.else || [])); out.atk += s.atk; out.def += s.def; out.hp += s.hp; return; }
            if (e.op === 'MODIFICAR_STAT') {
                // _passiveDeltas SIEMPRE necesita un número (una pasiva se recalcula sola cada
                // pasada, no hay "elección" que resolver): si _value devuelve undefined (un REF
                // a un campo aún sin inicializar, p. ej. Xidachane antes de su primer contador),
                // se trata como 0. Este `|| 0` es LOCAL a las pasivas; _value en general NO lo
                // aplica, porque FIJAR_STAT depende de que undefined se propague sin tocar.
                const d = DSL._value(card.owner, game, e.delta, card) || 0;
                if (e.stat === 'atk') out.atk += d;
                else if (e.stat === 'def') out.def += d;
                else if (e.stat === 'hp') out.hp += d;
            }
        });
        return out;
    },
    // Efectos de PASIVA_CONTINUA que NO son un delta de Atq/Def y por tanto no pasan por
    // _passiveDeltas (que solo suma/resta). Se aplican directamente sobre la carta, DESPUÉS
    // de los deltas, con la misma recursión de if/then/else:
    //   · MARCAR      -> pone un campo de la propia carta (p. ej. stealth: siempre Oculta).
    //   · SUELO_STAT  -> impide que un stat baje de su valor base de plantilla ("no bajan de base").
    // El motor los recoge igual en el registro de modificadores (updatePassives diffea antes
    // y después), así que salen en "Afectado por:" con la sintaxis estándar sin nada extra.
    _passiveExtras(card, game, effects, nombreHab) {
        (effects || []).forEach(e => {
            if (e.if) { DSL._passiveExtras(card, game, DSL._cond(card, game, e.if) ? e.then : (e.else || []), nombreHab); return; }
            if (e.op === 'MARCAR') {
                card[e.campo] = (e.valor !== undefined) ? e.valor : true;
                // badge: la marca es CONTINUA y debe salir en "Afectado por:" en TODAS las
                // pasadas. El registro por diferencias solo la vería la primera vez (el campo
                // persiste), así que se declara explícitamente. Ver registrarStatMod.
                if (e.badge && typeof game.registrarStatMod === 'function') {
                    game.registrarStatMod(card, {
                        stat: e.badge === 'oculto' ? 'OCULTO' : 'SILENCIO', delta: 1,
                        fuente: nombreHab, ref: 'esta carta', habilidad: nombreHab || null, turnos: null,
                        srcId: card.instanceId, srcAltId: null, srcZone: null, badgeKey: e.badge,
                    });
                }
            }
            // SUELO_STAT no se aplica aquí: sería inútil, porque equipos, eventos y efectos
            // temporales se procesan DESPUÉS de las pasivas de carta y volverían a bajar el
            // stat. El compilador lo traduce a `tmpl.sueloStats` y updatePassives lo aplica
            // como CLAMP FINAL (junto al tope 0-9), que es lo que significa "no bajan de base".
        });
    },
    _applyPassive(card, game, effects) {
        (effects || []).forEach(e => {
            if (e.if) { DSL._applyPassive(card, game, DSL._cond(card, game, e.if) ? e.then : (e.else || [])); return; }
            if (e.op === 'MODIFICAR_STAT') {
                const d = DSL._value(card.owner, game, e.delta, card);
                if (e.stat === 'atk') card.currentAtk += d;
                else if (e.stat === 'def') card.currentDef += d;
            }
        });
    },

    // Acciones. Devuelve: true (aplicado) | false (fallo, aborta y no consume) | 'skip' (no aplicaba, sigue).
    // Subconjunto SÍNCRONO de efectos (para triggers que corren dentro de updatePassives, como AL_ENTRAR)
    _doEffectSync(e, sourceCard, target, game, ownerId) {
        if (e.op === 'MODIFICAR_STAT') {
            const v = DSL._value(ownerId, game, e.valor, sourceCard, { self: sourceCard, objetivo: target });
            game.modifyStat(target, e.stat, v);
            if (e.floating && typeof showFloatingText === 'function') showFloatingText(target.instanceId, e.floating, e.floatingStyle || 'ft-green', e.offsetFloating !== undefined ? e.offsetFloating : -20);
            if (e.log) game.logMsg(DSL._fill(e.log, { carta: DSL._nombre(game, sourceCard), objetivo: DSL._nombre(game, target) }), e.logTipo || 'ability');
            return true;
        }
        if (e.op === 'APLICAR_ESTADO') {
            game.applyStatus(target, e.estado, e.duracion, e.fuente !== undefined ? e.fuente : sourceCard, null);
            if (e.floating && typeof showFloatingText === 'function') showFloatingText(target.instanceId, e.floating, e.floatingStyle || 'ft-red-stat', e.offsetFloating !== undefined ? e.offsetFloating : -20);
            if (e.log) game.logMsg(DSL._fill(e.log, { carta: DSL._nombre(game, sourceCard), objetivo: DSL._nombre(game, target) }), e.logTipo || 'ability');
            return true;
        }
        if (e.op === 'MODIFICAR_CONTADORES') {
            // La CARTA fuente, no su nombre: modifyCounters guarda el instanceId y el detalle
            // puede construir la referencia completa. `habilidad` va aparte y solo existe para
            // Pasivas/Activas, así que los Eventos/Ayudas no meten el "por HABILIDAD" que la
            // norma les prohíbe (sus triggers no llevan nombre de habilidad).
            game.modifyCounters(target, e.contador, e.delta, e.nombreContador, e.fuente !== undefined ? e.fuente : sourceCard, e.icono, habilidad || null);
            if (e.log) game.logMsg(DSL._fill(e.log, { carta: DSL._nombre(game, sourceCard), objetivo: DSL._nombre(game, target) }), e.logTipo || 'ability');
            return true;
        }
        console.error('[DSL] AL_ENTRAR solo admite efectos síncronos (MODIFICAR_STAT, APLICAR_ESTADO, MODIFICAR_CONTADORES):', e.op);
        return false;
    },

    // PUNTO DE COMPROMISO (§14), en un solo sitio. Cobro de la Activa y presentación de la
    // carta tienen que caer EXACTAMENTE en el mismo instante -el primero en que algo deja de
    // poder deshacerse- así que se disparan juntos y desde aquí. Antes cada uno colgaba de un
    // sitio distinto y el cobro seguía atado a la PRIMERA elección resuelta: con una Activa que
    // encadena dos elecciones cancelables (Kami, SACRIFICIO EQUIVALENTE) elegir el aliado ya
    // cobraba el Furor, agotaba la carta y pintaba los flotantes; cancelar después lo dejaba
    // todo pagado. Mismo fallo que tenía Atomización con la presentación, y misma solución:
    // no se cuentan elecciones, se mira cuándo MUTA el estado.
    async _comprometer(sourceCard, game) {
        if (!game) return;
        DSL._dispararCobro(sourceCard);
        if (game._presentacionArmada) await game._dispararPresentacion();
        // Red de seguridad: lo que la presentación no haya llegado a cobrar se cobra aquí. La
        // animación es adorno y puede fallar (sin DOM, con la animación saltada, si revienta y
        // se la traga el .catch de la cola); un COSTE no puede perderse por eso. Se drena, no se
        // recorre, así que lo que ya cobró el escaparate no se cobra dos veces.
        await DSL._drenarCobros(game);
    },

    // Costes de una Ayuda DIRIGIDA, marcados ANTES de que la presentación se dispare.
    //
    // El problema: en una Ayuda dirigida el punto de compromiso es confirmar el objetivo, así que
    // executeAyuda presenta la carta y SOLO DESPUÉS corre AL_USAR_AYUDA. Un `esCoste` de esa
    // lista se marcaba con el escaparate ya terminado: no salía flecha, y peor, la marca se
    // quedaba suelta y se la comía la SIGUIENTE presentación de la cadena (con Hexagrama, la
    // flecha aparecía sobre la carta encontrada en el mazo). Toto, 13-ago-2026.
    //
    // Aquí solo se pueden resolver los costes que se le cobran AL PROPIO OBJETIVO (los que no
    // declaran `target`): el objetivo ya se conoce. Un coste que elija pagador más adelante no
    // se puede saber todavía, y por eso no se marca -ver la nota de Té helado en la rúbrica-.
    _marcarCostesDeclarados(sourceCard, game, objetivo) {
        if (!game || !objetivo) return;
        const tmpl = (typeof getCardTemplate === 'function' && getCardTemplate(sourceCard.id)) || {};
        for (const ab of (tmpl.abilities || [])) {
            if (ab.trigger !== 'AL_USAR_AYUDA') continue;
            for (const e of (ab.efectos || [])) {
                if (e.target || (!e.esCoste && !e.esRequisito)) continue;
                if (e.esRequisito) { DSL._marcarCoste(game, [objetivo], 'requisito'); continue; }
                if (e.op === 'MODIFICAR_STAT' && e.stat === 'furor') {
                    const d = Math.abs(DSL._deltaStat(e, sourceCard, objetivo, game, sourceCard.owner));
                    DSL._marcarCoste(game, [objetivo], 'tributo', `Tributa ${d} FUR`);
                } else DSL._marcarCoste(game, [objetivo], 'coste');
            }
        }
    },

    // REQUISITOS VISIBLES: qué carta del campo hace legal esta jugada.
    //
    // Un requisito no se pierde, solo se comprueba — pero el jugador merece ver CUÁL lo cumple,
    // sobre todo cuando hay varias candidatas ('Una buena razón' puede estar en cualquiera de los
    // dos campos). Se declara en la habilidad JUGAR con `requisitoVisible`, que es una lista de
    // specs de pool iguales a las de cualquier `target`:
    //
    //   requisitoVisible: [ { quien: "ALIADO", filtros: [ { campo: "name", op: "==", valor: "Zoe" } ] } ]
    //
    // Solo se marca lo que existe y se puede señalar. Un requisito de RECUENTO ("tu vanguardia
    // llena", "3 aliados") o NEGATIVO ("Karolina no está") no lleva flecha a propósito: no hay
    // una carta concreta a la que apuntar, y una flecha a un aliado cualquiera mentiría.
    _marcarRequisitosVisibles(sourceCard, game) {
        if (!sourceCard || !game) return;
        const tmpl = (typeof getCardTemplate === 'function' && getCardTemplate(sourceCard.id)) || {};
        const ab = (tmpl.abilities || []).find(a => a.trigger === 'JUGAR');
        // `costeVisible`: igual que requisitoVisible pero ÁMBAR, para un coste que se paga con
        // cartas del campo. Hace falta declararlo aquí y no en el efecto porque esas cartas se
        // destruyen DENTRO del escaparate (pausaEnEscaparate), o sea después de que la
        // presentación haya consumido las marcas: si se marcan allí, la flecha no llega a
        // dibujarse nunca. Es el caso de Némesis (Toto, 14-ago-2026).
        // `requisitoZona`: lo que hace legal la jugada es un HUECO, no una carta.
        for (const z of (tmpl.requisitoZona ? (Array.isArray(tmpl.requisitoZona) ? tmpl.requisitoZona : [tmpl.requisitoZona]) : [])) {
            const rival = sourceCard.owner === 'p1' ? 'p2' : 'p1';
            const sel = String(z.sel || '').replace('{RIVAL}', rival).replace('{YO}', sourceCard.owner);
            if (z.siVacia && game.players[z.siVacia === 'RIVAL' ? rival : sourceCard.owner].activeEvent) continue;
            DSL._marcarZona(game, sel, z.tipo || 'requisito', z.etiqueta);
        }
        for (const [campo, tipo] of [['requisitoVisible', 'requisito'], ['costeVisible', 'coste']]) {
            const specs = (ab && ab[campo]) || tmpl[campo];
            if (!specs) continue;
            for (const s of (Array.isArray(specs) ? specs : [specs])) {
                let pool = DSL._pool(sourceCard.owner, game, s, sourceCard) || [];
                // `uno`: con varias candidatas basta una para que la jugada sea legal, así que se
                // señala la primera en vez de llenar el tablero de flechas iguales. Un coste, en
                // cambio, se paga con TODAS: ahí no se recorta.
                if (s.uno) pool = pool.slice(0, 1);
                if (pool.length) DSL._marcarCoste(game, pool, tipo);
            }
        }
    },

    // ¿Esta Ayuda se EQUIPA a un aliado en vez de irse al descarte?
    // Importa porque la presentación manda al descarte a toda Ayuda por defecto, y EQUIPAR saca
    // la carta DE LA MANO: si el descarte se ha adelantado, el splice no encuentra nada y la
    // carta acaba a la vez en la pila y en `equippedCards` del objetivo. Eso es lo que dejaba a
    // Shichishito volando al descarte sin que Karlos la equipara, y a Espada V poblando la pila
    // un instante antes de aparecer bien puesta (Toto, 13-ago-2026).
    // Una Ayuda que se EQUIPA no viaja a la pila de descartes: su presentación termina EN QUIEN
    // SE LA PONE. Es de cajón -si algo se equipa, se coloca detrás de su portador- y aun así se
    // ha colado dos veces, porque el retarget vivía SOLO en executeAyuda (el camino de Espada V,
    // donde el objetivo se conoce antes de jugar la carta). Las que equipan con AL_EQUIPAR +
    // ELEGIR -Shichishito, Hagoromo, Guantes sedientos- eligen portador DENTRO de la cadena y no
    // pasan por ahí, así que volaban al descarte y se anexaban después (Toto, 16-ago-2026).
    // Ahora la regla vive aquí y la llaman los dos caminos, que es lo que impide que vuelva.
    _presentaHaciaElPortador(game, sourceCard, portador) {
        if (!game || !portador || !game._presentacionArmada) return;
        if (!DSL._esEquipo(DSL._tmpl(sourceCard.id))) return;
        game._presentacionArmada.destino = `.card[data-id="${portador.instanceId}"]`;
        game._presentacionArmada.fundirEn = null;   // no se funde con ninguna pila: aterriza encima
    },

    // Los nombres CONCRETOS que busca un BUSCAR, si busca por nombre. Sirve para que el visor
    // pueda decir "No queda ningún Escudo mágico en el mazo" en vez del genérico "no hay cartas
    // elegibles" (Toto, 18-ago-2026: "sustituyendo el nombre de la carta por el que sea, y si son
    // varias, que salgan todas"). Solo un filtro `name ==` da un nombre presentable; un filtro por
    // etiqueta o por tipo ("Ser vivo", "Otaku") no es el nombre de ninguna carta, así que ahí se
    // devuelve vacío y el visor cae al texto genérico, que para ese caso es el correcto.
    _nombresBuscados(e) {
        const out = [];
        const mirar = (f) => {
            if (!f) return;
            if (Array.isArray(f)) return f.forEach(mirar);
            if (f.o) return f.o.forEach(mirar);
            if (f.campo === 'name' && f.op === '==' && typeof f.valor === 'string') out.push(f.valor);
        };
        mirar(e.filtros); mirar(e.algunFiltro);
        return out.filter((x, i, a) => a.indexOf(x) === i);
    },

    // EL texto de "aquí no hay nada". Una sola redacción, la usan el op BUSCAR (que la pasa) y
    // openDeckSearchViewer (que la pone de oficio si el llamante no pasó ninguna). Tenerla en dos
    // sitios era pedir que se separaran.
    _avisoVacio(nombres, zona, barajaDespues) {
        const n = (Array.isArray(nombres) ? nombres : (nombres ? [nombres] : [])).filter(Boolean);
        const pila = zona === 'discard' ? 'esta pila de descartes' : 'este mazo';
        // "No queda ninguna CARTA DE X" y no "ningún X": los nombres de carta no concuerdan en
        // género -"ningún Súper Evolución" chirría- y anteponer "carta de" lo resuelve para todos
        // de una vez, sin tener que saber el género de cada una (Toto, 18-ago-2026).
        let t;
        if (n.length === 1) t = `No queda ninguna carta de ${n[0]} en ${pila}.`;
        else if (n.length > 1) t = `No queda ninguna carta de ${n.slice(0, -1).join(', ')} ni de ${n[n.length - 1]} en ${pila}.`;
        else t = `No hay cartas elegibles en ${pila}.`;
        return barajaDespues ? t + ' Se barajará al cerrar el visor.' : t;
    },

    // UN EQUIPO POR TIPO (Toto, 18-ago-2026). Puedes llevar varios equipos a la vez mientras no
    // sean del mismo tipo. "Arma" y "Arma legendaria" cuentan como EL MISMO tipo a estos efectos y
    // solo a estos: no puedes empuñar dos armas por muy legendaria que sea una.
    _tipoEquipo(tmpl) {
        const st = String((tmpl && tmpl.subtype) || '');
        return /^Arma/.test(st) ? 'Arma' : st;
    },
    // ¿Puede ESTE portador ponerse ESTE equipo? Se consulta desde los filtros de elección, así que
    // un aliado que ya lleve algo de ese tipo simplemente no sale con reborde verde.
    _puedeEquiparse(portador, tmplEquipo) {
        const tipo = DSL._tipoEquipo(tmplEquipo);
        if (!tipo) return true;
        return !((portador && portador.equippedCards) || []).some(eq =>
            DSL._tipoEquipo(typeof getCardTemplate === 'function' ? getCardTemplate(eq.id) : null) === tipo);
    },

    _esEquipo(tmpl) {
        if (!tmpl || !Array.isArray(tmpl.abilities)) return false;
        const hay = (lista) => (lista || []).some(e =>
            (e.op === 'EQUIPAR' && !e.invertido) || hay(e.efectos));
        return tmpl.abilities.some(a => a.trigger === 'AL_EQUIPAR' || hay(a.efectos));
    },

    // Cola ÚNICA de cobros aparcados. La vacía quien llegue primero: el escaparate (para que el
    // "-1 FUR" salga a la vez que la carta se enseña) o _comprometer (si no hubo animación).
    async _drenarCobros(game) {
        if (!game || !game._cobrosPendientes) return;
        while (game._cobrosPendientes.length) {
            const f = game._cobrosPendientes.shift();
            try { await f(); } catch (err) { console.error(err); }
        }
    },

    // ── COSTES Y REQUISITOS VISIBLES EN LA PRESENTACIÓN ──────────────────────────
    // (Toto, 8-ago-2026) Una carta no se presenta sola: se presenta CON lo que ha
    // costado. Las cartas marcadas aquí se le pasan al cliente para que dibuje una
    // flecha desde cada una hacia la que se está presentando ("Coste" / "Req.
    // cumplido"), y las que vengan de la mano viajan al escaparate a su lado.
    //
    // `esCoste` hace además otra cosa importante: si hay una presentación ARMADA, el
    // efecto NO se ejecuta en su sitio de la lista, se aparca y se ejecuta DENTRO de
    // la presentación, en el instante en que la carta llega al escaparate. Así el
    // "-1 FUR" sale a la vez que la carta se enseña, y no cinco pasos después. Es lo
    // que sustituye al apaño de colocar el MODIFICAR_STAT detrás del BUSCAR: aquel
    // conseguía "no cobrar mientras se pueda cancelar" moviendo el efecto de sitio, y
    // el precio era que el flotante salía al final de toda la cadena.
    // Marca una ZONA en vez de una carta. Hace falta cuando lo que cumple el requisito no es una
    // carta sino un HUECO: 'Una buena razón' es legal porque el rival NO tiene Evento, así que la
    // flecha sale de su ranura vacía (Toto, 14-ago-2026).
    _marcarZona(game, zonaSel, tipo, etiqueta) {
        if (!game || !zonaSel) return;
        game._costesPresenta = game._costesPresenta || [];
        if (game._costesPresenta.some(x => x.zonaSel === zonaSel)) return;
        game._costesPresenta.push({ zonaSel, tipo, etiqueta, zona: 'zona' });
    },

    _marcarCoste(game, cartas, tipo, etiqueta) {
        if (!game || !cartas) return;
        const lista = Array.isArray(cartas) ? cartas : [cartas];
        game._costesPresenta = game._costesPresenta || [];
        for (const c of lista) {
            if (!c || !c.instanceId) continue;
            if (game._costesPresenta.some(x => x.id === c.instanceId)) continue;
            if (etiqueta) { game._costesPresenta.push({ id: c.instanceId, cardId: c.id, tipo: tipo, owner: c.owner, zona: c.location, etiqueta }); continue; }
            // `zona`: dónde está la carta EN ESTE INSTANTE. Es lo que decide si acompaña a la
            // presentación o si se queda con una flecha. No vale mirar el DOM (era lo que hacía
            // el cliente): una carta ya descartada sigue dibujada en la mano hasta el siguiente
            // render, así que la Manzanahoria de Wolfgang se clasificaba como "en el campo" y se
            // quedaba en la mano con una flecha saliendo de ella (Toto, 13-ago-2026).
            game._costesPresenta.push({ id: c.instanceId, cardId: c.id, tipo: tipo, owner: c.owner, zona: c.location });
        }
    },

    // Cuánto va a cambiar de verdad este MODIFICAR_STAT sobre ESTE objetivo. Vive aparte porque
    // lo necesitan dos sitios: el efecto en sí y la etiqueta de la flecha de tributo, que tiene
    // que decir la cantidad REAL de cada carta ("Tributa 1 FUR" / "Tributa 2 FUR") y no la
    // declarada -Flash de maná le cobra menos a Eris, y la flecha se dibuja antes de cobrar-.
    _deltaStat(e, sourceCard, target, game, ownerId, ctx) {
        let d = DSL._value(ownerId, game, e.delta, sourceCard, ctx || { self: sourceCard, objetivo: target });
        if (e.deltaCondicional) for (const dc of e.deltaCondicional) if (DSL._match(target, dc.filtro)) { d = dc.delta; break; }
        if (e.vaciar) d = -(target[e.stat] || 0); // "vacía este stat a 0" (Cortarrollos: todo el Furor del atacante)
        return d;
    },

    async _doEffect(e, sourceCard, target, game, ownerId, habilidad) {
        // `vars` en el contexto (Toto, 16-ago-2026): sin esto un `{REF:"vars.x"}` dentro de un
        // efecto normal no resolvía y llegaba undefined -curar {REF:"vars.dano"} dejaba la Vida en
        // NaN-. FIJAR_STAT ya se lo construía a mano por su cuenta; ahora lo tienen todos igual.
        const ctx = { self: sourceCard, objetivo: target,
                      vars: (DSL._vars && DSL._vars[sourceCard.instanceId]) || {} };
        if (e.guardaNombre && target) { DSL._vars = DSL._vars || {}; (DSL._vars[sourceCard.instanceId] = DSL._vars[sourceCard.instanceId] || {})[e.guardaNombre] = DSL._nombre(game, target); }
        if (e.op === 'MODIFICAR_STAT') {
            let d = DSL._deltaStat(e, sourceCard, target, game, ownerId, ctx);
            // Reacción de mano ante daño que NO viene de un ataque (Toto, 31-jul-2026: lo pilló
            // con Atomización). El daño de efecto se aplica por aquí y no por dealDamage, así que
            // una carta que reacciona a "un aliado va a recibir daño" no se enteraba. El motor
            // decide y devuelve a quién le toca ahora: si nadie reacciona no pasa absolutamente
            // nada, así que es inocuo para el resto de cartas.
            if (e.stat === 'currentHp' && d < 0 && typeof game.ofrecerReaccionDano === 'function') {
                const _nuevo = await game.ofrecerReaccionDano(target, sourceCard);
                if (_nuevo) target = _nuevo;
            }
            const antes = target[e.stat];
            // Orden de flotantes (betasteo de Toto, 31-jul-2026): en cambios ligados a
            // comprobarMuerte (daño/destrucción — MALDITO de Muñeca del mal, DAÑO VERDADERO...)
            // el flotante CUSTOM ("razón") sale ANTES del flotante del cambio de stat en sí:
            // antes salía después, lo que en combate leía "muere -> luego se dice por qué", al
            // revés de lo natural. Acotado a comprobarMuerte a propósito: los MODIFICAR_STAT de
            // Furor (Apuesta, Infundir desesperación...) no tienen ese problema y no se tocan.
            if (e.floating && e.comprobarMuerte && typeof showFloatingText === 'function') showFloatingText(target.instanceId, String(e.floating.texto).split('{delta}').join(Math.abs(d)), e.floating.estilo || 'ft-green', e.floating.offset !== undefined ? e.floating.offset : -20);
            // "DESTRUIDO/A" (Toto, 31-jul-2026): cuando el cambio es una destrucción directa sin
            // Retribución (vaciar+sinRetribucion sobre currentHp — Cañón de positrones, Kami,
            // Némesis, Gárgola), el flotante de "-N VIDA" es engañoso: la Retribución se da
            // precisamente cuando la Vida llega a 0, y aquí se está saltando ese cauce a
            // propósito. En su lugar, "DESTRUIDO"/"DESTRUIDA" (según target.gender, mismo
            // criterio que generoTexto en el cliente) — silent:true en modifyStat para que NO
            // muestre su "-N VIDA" automático, pero SÍ corra el resto (interceptores, oculto
            // revelado...). Muñeca del mal NO entra aquí: su víctima SÍ da Retribución
            // (comprobarMuerte sin sinRetribucion), así que sigue siendo una muerte normal.
            const _esDestruccion = e.vaciar && e.sinRetribucion && e.stat === 'currentHp';
            game.modifyStat(target, e.stat, d, e.offsetY || 0, e.fuente !== undefined ? e.fuente : sourceCard, _esDestruccion ? { silent: true } : null);
            if (_esDestruccion) game.floatingDestruido(target, e.offsetY || 0);
            // Furor y demás cambios sin comprobarMuerte: el flotante custom se queda en su
            // posición ORIGINAL (después del cambio de stat) — sin reordenar (ver nota arriba).
            if (e.floating && !e.comprobarMuerte && typeof showFloatingText === 'function') showFloatingText(target.instanceId, String(e.floating.texto).split('{delta}').join(Math.abs(d)), e.floating.estilo || 'ft-green', e.floating.offset !== undefined ? e.floating.offset : -20);
            if (e.log) game.logMsg(DSL._fill(e.log, { carta: DSL._nombre(game, sourceCard), objetivo: DSL._nombre(game, target), antes, despues: target[e.stat] }), e.logTipo || 'ability');
            // sinRetribucion (Cañón de positrones/Kami, 30-jul-2026): "destrucción" directa, no
            // muerte en combate — la vieja llamaba a checkDeath(target, false) a mano para que
            // la víctima NO diera Retribución. comprobarMuerte por defecto SÍ la da (checkDeath
            // por defecto triggerRetribution=true); este flag replica el caso sin ella.
            // siMuere (Atomización, 31-jul-2026): rama para "si este cambio lo mata", hermana
            // del siExito de ATACAR. La condición se evalúa ANTES de checkDeath —igual que la
            // Atomización vieja, que miraba currentHp<=0 antes de llamarlo— para que una carta
            // capaz de burlar la muerte (Incluso En El KG, que vuelve a la mano con la Vida
            // restaurada) no la borre a posteriori: el golpe FUE letal aunque no se consumara.
            const _fueLetal = !!e.siMuere && e.stat === 'currentHp' && target[e.stat] <= 0;
            if (e.comprobarMuerte) await game.checkDeath(target, !e.sinRetribucion);
            if (_fueLetal) {
                const rm = await DSL._runEffectList(e.siMuere, sourceCard, game, ownerId, [target], habilidad);
                if (rm && rm.ok === false) return false;
            }
            return true;
        }
        // NO_CONSUMIR (Atomización, 31-jul-2026; semántica aclarada por Toto el 7-ago-2026):
        // la Ayuda YA se ha consumido al empezar -va al descarte antes de correr los efectos-,
        // así que esto no evita el consumo: pide la VUELTA, del descarte a la mano. El nombre se
        // conserva para no tocar las cartas que ya lo declaran.
        // NO_CONSUMIR: marca ESTA Ayuda para que el boilerplate de
        // AL_CONSUMIR la deje en la mano en vez de mandarla al descarte. El motor ya soporta el
        // caso (executeAyuda/onPlay solo la sacan de la mano si el flujo dice que se gastó); esto
        // solo lo hace declarable. Ojo con el nombre: el texto de la carta dice "vuelve a la
        // mano", pero mecánicamente NUNCA sale de ella — no hay nada que devolver.
        // BONO_ATAQUE (Oni ancho, 31-jul-2026): modifica el Atq del atacante SOLO durante el
        // ataque en curso. Solo tiene sentido dentro de ANTES_DE_ATACAR, que es quien lleva la
        // contabilidad y lo deshace después (ver el compilador de ese trigger). Se lleva la
        // cuenta en _dslBonoAtaque en vez de dejar que cada carta se lo reste a mano: ese
        // "restar a mano" es justo el patrón que ya produjo el bug de doble resta en
        // Hiposaurio/Hawke/Guardia/Megalimo.
        if (e.op === 'BONO_ATAQUE') {
            const v = DSL._value(ownerId, game, e.valor, sourceCard, ctx) || 0;
            if (v) {
                sourceCard.currentAtk += v;
                sourceCard._dslBonoAtaque = (sourceCard._dslBonoAtaque || 0) + v;
            }
            if (e.floating && typeof showFloatingText === 'function') showFloatingText(sourceCard.instanceId, String(e.floating.texto).split('{delta}').join(Math.abs(v)), e.floating.estilo || 'ft-green', e.floating.offset !== undefined ? e.floating.offset : -20);
            if (e.log) game.logMsg(DSL._fill(e.log, { carta: DSL._nombre(game, sourceCard), objetivo: target ? DSL._nombre(game, target) : '' }), e.logTipo || 'combat');
            return true;
        }
        if (e.op === 'NO_CONSUMIR') {
            DSL._vars = DSL._vars || {};
            (DSL._vars[sourceCard.instanceId] = DSL._vars[sourceCard.instanceId] || {}).__noConsumir = true;
            // {jugador}: el log va en 3ª persona con dueño, como todo lo visible por ambos.
            if (e.log) game.logMsg(DSL._fill(e.log, { carta: DSL._nombre(game, sourceCard), objetivo: target ? DSL._nombre(game, target) : '',
                jugador: (typeof game.getDisplayName === 'function' ? game.getDisplayName(sourceCard.owner) : sourceCard.owner) }), e.logTipo || 'ability');
            return true;
        }
        if (e.op === 'CURAR') {
            if (e.completa) {
                // Restauración total directa (sin onBeforeHealed ni modifyStat)
                if (target.currentHp >= target.maxHp) return 'skip';
                target.currentHp = target.maxHp;
                if (e.log) game.logMsg(DSL._fill(e.log, { carta: DSL._nombre(game, sourceCard), objetivo: DSL._nombre(game, target) }), e.logTipo || 'ability');
                if (typeof showFloatingText === 'function') showFloatingText(target.instanceId, e.floating || 'CURADO', e.floatingStyle || 'ft-green', e.offsetFloating !== undefined ? e.offsetFloating : -30);
                return true;
            }
            let amount = DSL._value(ownerId, game, e.valor, sourceCard, ctx);
            // `maximo`: tope de la curación. Con `valor: {REF:"vars.dano"}` expresa "cúrate lo que
            // hiciste, hasta N" — necesario desde que el daño puede ser 0,5 y un `valor: 1` fijo
            // curaría de más en ese caso.
            if (typeof e.maximo === 'number' && typeof amount === 'number') amount = Math.min(amount, e.maximo);
            if (e.conBeforeHealed === false) {
                // Variante simple (grupal): sin passthrough ni tope manual (el motor capa la vida); salta ilesos.
                if (e.soloSiHerido && target.currentHp >= target.maxHp) return 'skip';
                // Flotante propio OPT-IN (Toto, 7-ago-2026): `modifyStat` ya pinta el "+N VIDA"
                // automático de cualquier cambio de Vida, así que este de aquí SOLO tiene sentido
                // si aporta algo distinto (una etiqueta como "CURADO"). Antes salía siempre -por
                // el `|| 'CURADO'`- y las cartas que declaraban "+1 VIDA" mostraban el número dos
                // veces seguidas, porque los flotantes van en COLA de 400 ms por carta.
                if (e.floating && typeof showFloatingText === 'function') showFloatingText(target.instanceId, e.floating, e.floatingStyle || 'ft-green', e.offsetFloating !== undefined ? e.offsetFloating : -40);
                game.modifyStat(target, 'currentHp', amount, e.offsetY !== undefined ? e.offsetY : 0, e.fuente !== undefined ? e.fuente : sourceCard);
                if (e.log) game.logMsg(DSL._fill(e.log, { carta: DSL._nombre(game, sourceCard), objetivo: DSL._nombre(game, target) }), 'ability');
                return true;
            }
            // Variante estándar (Ingeribles): passthrough onBeforeHealed + tope + fallo si vida completa.
            const tpl = DSL._tmpl(target.id);
            if (tpl && typeof tpl.onBeforeHealed === 'function') amount = tpl.onBeforeHealed(target, amount, sourceCard, game);
            const antes = target.currentHp;
            const missing = target.maxHp - target.currentHp;
            if (missing <= 0) {
                game.logError(DSL._fill(e.msgLleno || '{objetivo} ya tiene la Vida completa.', { objetivo: DSL._nombre(game, target) }));
                return false;
            }
            const heal = Math.min(amount, missing);
            if (typeof showFloatingText === 'function') showFloatingText(target.instanceId, e.floating || sourceCard.name.toUpperCase(), 'ft-ability', -40);
            game.modifyStat(target, 'currentHp', heal);
            if (e.log) game.logMsg(DSL._fill(e.log, Object.assign({}, (DSL._vars && DSL._vars[sourceCard.instanceId]) || {}, ctx, { carta: DSL._nombre(game, sourceCard), objetivo: DSL._nombre(game, target), antes, despues: target.currentHp })), 'ability');
            return true;
        }
        if (e.op === 'DAÑO') {
            const d = DSL._value(ownerId, game, e.valor, sourceCard, ctx);
            if (e.log) game.logMsg(DSL._fill(e.log, { carta: DSL._nombre(game, sourceCard), objetivo: DSL._nombre(game, target) }), 'ability');
            await game.dealDamage(sourceCard, target, d, e.directo !== false); // daño de efecto: directo por defecto
            await game.checkDeath(target);
            return true;
        }
        if (e.op === 'APLICAR_ESTADO') {
            // logTipo (Toto, 28-jul-2026, migración de Limo artificial): faltaba aquí, aunque
            // ya lo tenían MODIFICAR_STAT (arriba) y la variante de APLICAR_ESTADO que usa
            // _runReaccion — sin él, un log que quisiera salir como 'system' (Moneda: CARA/CRUZ)
            // se colaba siempre como 'ability'.
            if (e.log) game.logMsg(DSL._fill(e.log, { carta: DSL._nombre(game, sourceCard), objetivo: DSL._nombre(game, target) }), e.logTipo || 'ability');
            game.applyStatus(target, e.estado, e.duracion, e.fuente !== undefined ? e.fuente : sourceCard, habilidad || null);
            return true;
        }
        if (e.op === 'MODIFICAR_CONTADORES') {
            const d = DSL._value(ownerId, game, e.delta, sourceCard, ctx);
            // Ver la nota gemela del otro MODIFICAR_CONTADORES: la CARTA fuente (no su nombre)
            // para que el detalle pueda dar la referencia completa, y la habilidad aparte.
            // {instancia} en el id (Milkor MGL, 31-jul-2026): un equipo con usos contados necesita
            // SU propio contador en el portador, o dos copias del arma compartirían la cuenta.
            const _idCont = DSL._fill(e.contador, { instancia: sourceCard.instanceId });
            game.modifyCounters(target, _idCont, d, e.nombreContador || e.contador, e.fuente !== undefined ? e.fuente : sourceCard, e.icono || '⚙️', habilidad || null);
            // floating (Karlitos, 31-jul-2026): faltaba, a diferencia de casi todos los demás
            // ops — un contador que sube en la propia Pasiva de la carta se notaba en el
            // registro de "Afectado por:" pero no en el tablero en el momento en que ocurre.
            if (e.floating && typeof showFloatingText === 'function') showFloatingText(target.instanceId, e.floating.texto, e.floating.estilo || 'ft-ability', e.floating.offset !== undefined ? e.floating.offset : -40);
            if (e.log) game.logMsg(DSL._fill(e.log, { carta: DSL._nombre(game, sourceCard), objetivo: DSL._nombre(game, target) }), 'ability');
            return true;
        }
        if (e.op === 'ATACAR') {
            const startHp = target.currentHp;
            const bono = DSL._value(ownerId, game, e.bonoAtq, sourceCard, ctx) || 0;
            if (bono) sourceCard.currentAtk += bono;
            if (e.especial !== undefined) {
                // Ataque DIRECTO (Toto, 27/28-jul-2026): NO pasa por performAttack (ese es el
                // pipeline de ataque NORMAL — reacciones de moneda, etc.). Reproduce fielmente
                // lo que hacían a mano Hechicero/Karolina/Raiju/Ángel (especial:true) y también
                // Limo artificial/Investigador demente (especial:false — ataque normal en su
                // formato de daño, pero resuelto directo porque necesitan una moneda CONDICIONADA
                // al éxito, sin pasar por el pipeline completo de performAttack): comprueba la
                // esquiva de onBeforeDefend, calcula el daño (Atq-Def, con el suelo 0.5/1 de
                // siempre para Esbirro-vs-Personaje) y llama a dealDamage(..., especial)
                // directamente. dealDamage YA trae su propio pipeline (onBeforeTakeDamage,
                // guardaespaldas, reacciones de mano); lo único que hacían las cartas a mano
                // ADEMÁS de eso era la esquiva. `especial` decide solo la etiqueta que dealDamage
                // recibe (afecta a interceptores tipo onBeforeTakeDamage, p. ej. HUESO DURO), no
                // la fórmula de daño, que es la misma en los dos casos.
                // chequearEstado: algunas cartas SÍ comprobaban Confusión/Ceguera/Sueño propios
                // antes de golpear (checkAttackStatus, el mismo gate que performAttack usa
                // internamente para el ataque normal); otras (Hechicero, Lolita) nunca lo
                // hicieron. Opt-in para no cambiar a las que no lo pedían. Si falla, la carta se
                // agota igual que en el ataque normal.
                if (e.chequearEstado && typeof game.checkAttackStatus === 'function' && !(await game.checkAttackStatus(sourceCard, target))) {
                    sourceCard.exhausted = true;
                } else {
                    const defTpl = DSL._tmpl(target.id);
                    let dodged = false;
                    if (defTpl && typeof defTpl.onBeforeDefend === 'function') {
                        dodged = await defTpl.onBeforeDefend(target, sourceCard, game, habilidad || sourceCard.name, !!e.especial);
                    }
                    if (!dodged) {
                        // ignorarDefensa (Eris, TIRO FINAL): el daño es el Atq puro, sin restar
                        // Def. El suelo 0.5/1 sigue aplicando si el Atq es <= 0.
                        let dmg = e.ignorarDefensa ? sourceCard.currentAtk : sourceCard.currentAtk - target.currentDef;
                        if (dmg <= 0) dmg = (sourceCard.type === 'Esbirro' && target.type === 'Personaje') ? 0.5 : 1;
                        await game.dealDamage(sourceCard, target, dmg, !!e.especial);
                        await game.checkDeath(target);
                    }
                }
            } else {
                // Bug real de motor encontrado y corregido, no replicado (Agah, 30-jul-2026):
                // performAttack SIEMPRE pone game.abilityContext = null al terminar, asumiendo
                // que es el ÚNICO ataque de la acción en curso — cierto para cualquier Activa de
                // un solo golpe, falso para "N ataques normales" (Agah, Wolfgang, Kazuo, Zoe
                // calcinante...) que llaman a ATACAR varias veces en la misma lista de efectos.
                // Para Agah en concreto esto era observable: su propia Pasiva de coste-por-ataque
                // mira game.abilityContext para saber si el golpe viene de su Activa (sin coste
                // extra) o es un ataque suelto (cuesta 1 Furor); con el contexto ya a null tras
                // el primer golpe, el 2º se trataba como suelto — bloqueado en seco si el Furor
                // ya estaba a 0 tras pagar el coste de la Activa, o cobrado de más si sobraba
                // Furor. Se restaura el contexto tras cada performAttack para que el RESTO de la
                // lista de efectos (el 2º ATACAR) siga viendo la Activa en curso.
                const _ctxPrevio = game.abilityContext;
                await game.performAttack(sourceCard, target);
                game.abilityContext = _ctxPrevio;
            }
            if (bono) { if (typeof game.updatePassives === 'function') game.updatePassives(); else sourceCard.currentAtk -= bono; }
            const exito = target.currentHp < startHp && target.currentHp > 0; // dañó y sigue vivo
            if (exito && Array.isArray(e.siExito)) await DSL._runEffectList(e.siExito, sourceCard, game, ownerId, [target], habilidad);
            return true;
        }
        if (e.op === 'MONEDA') {
            // log (Muñeca del mal, 31-jul-2026): anuncio ANTES de lanzar la moneda (p. ej. "lanza
            // una maldición final..."), distinto de logCara/logCruz (que anuncian el resultado).
            if (e.log) game.logMsg(DSL._fill(e.log, { carta: DSL._nombre(game, sourceCard), objetivo: target ? DSL._nombre(game, target) : '' }), e.logTipo || 'ability');
            const res = await game.triggerCoinFlips(e.cantidad || 1, ownerId);
            const cruz = res && res[0] === 'tails'; // sin resultado (cancelado) => rama de cara, como las cartas originales
            const dnM = typeof game.getDisplayName === 'function' ? game.getDisplayName(ownerId) : ownerId;
            // objetivo (Muñeca del mal, 31-jul-2026): faltaba en el fill de logCara/logCruz.
            // objetivoG (Cogorza, 31-jul-2026): su código de género, para {objetivoG?masc|fem}.
            const FM = (t) => DSL._fill(t, { carta: DSL._nombre(game, sourceCard), jugador: dnM, objetivo: target ? DSL._nombre(game, target) : '', objetivoG: target ? target.gender : undefined });
            if (cruz) {
                if (e.logCruz) game.logMsg(FM(e.logCruz.msg), e.logCruz.tipo || 'combat');
                if (Array.isArray(e.cruz)) await DSL._runEffectList(e.cruz, sourceCard, game, ownerId, [target], habilidad);
            } else {
                if (e.logCara) game.logMsg(FM(e.logCara.msg), e.logCara.tipo || 'neutral');
                if (Array.isArray(e.cara)) await DSL._runEffectList(e.cara, sourceCard, game, ownerId, [target], habilidad);
            }
            return true;
        }
        if (e.op === 'ROBAR') {
            const n = DSL._value(ownerId, game, e.cantidad, sourceCard, ctx) || 1;
            const pid = e.jugador === 'RIVAL' ? (ownerId === 'p1' ? 'p2' : 'p1') : ownerId;
            if (e.log) game.logMsg(DSL._fill(e.log, { carta: DSL._nombre(game, sourceCard), jugador: (typeof game.getDisplayName === 'function' ? game.getDisplayName(pid) : pid), cantidad: n }), e.logTipo || 'ability');
            for (let i = 0; i < n; i++) {
                if (e.soloSiHayMazo && game.players[pid].deck.length === 0) continue; // sin rebarajar el descarte
                await game.drawCard(pid, e.sinAnimacion || false, e.velocidad);
            }
            return true;
        }
        if (e.op === 'RETRIBUCION') {
            // El jugador coge 1 retribución (Esfuerzo dividido: el rival, al expirar).
            const pid = e.jugador === 'RIVAL' ? (ownerId === 'p1' ? 'p2' : 'p1') : ownerId;
            if (typeof game.processRetribution === 'function') await game.processRetribution(pid);
            return true;
        }
        if (e.op === 'BUSCAR') {
            const pids = e.deQuien === 'AMBOS' ? ['p1', 'p2'] : [e.deQuien === 'RIVAL' ? (ownerId === 'p1' ? 'p2' : 'p1') : ownerId];
            let algunExito = false;
            for (const pid of pids) {
                const p = game.players[pid];
                // `en` admite una zona ('MAZO' / 'DESCARTES' / 'MANO') o un ARRAY de varias
                // (Karlitos: mazo Y descartes a la vez; Honsow: mano Y mazo). Con varias, cada
                // carta se saca de la zona en la que estuviera de verdad y solo se baraja si el
                // MAZO estaba entre ellas — que es justo lo que hacían a mano las imperativas.
                const _nz = (z) => z === 'MAZO' ? p.deck : z === 'MANO' ? p.hand : p.discard;
                const _stackDe = (z) => z === 'MAZO' ? `${pid}-deck-stack` : z === 'MANO' ? null : `${pid}-discard-stack`;
                const _zonasNombre = Array.isArray(e.en) ? e.en : [e.en || 'DESCARTES'];
                const zonas = _zonasNombre.map(_nz);
                const zona = zonas[0]; // zona "principal": la que se baraja y la que ve el visor de mazo
                const dn = typeof game.getDisplayName === 'function' ? game.getDisplayName(pid) : pid;
                const F = (txt) => DSL._fill(txt, { carta: DSL._nombre(game, sourceCard), jugador: dn });
                const _todas = zonas.reduce((acc, z) => acc.concat(z), []);
                let lista = _todas.filter(x => (e.filtros || []).every(f => DSL._match(x, f)) &&
                                             (!e.algunFiltro || e.algunFiltro.some(f => DSL._match(x, f))));
                if (e.plantillaSin) lista = lista.filter(x => { const t = getCardTemplate(x.id); return t && !e.plantillaSin.some(hk => typeof t[hk] === 'function'); });
                // destino CAMPO: un Personaje que NO cabría no se ofrece siquiera. Mismas dos
                // reglas que playCard (index.html): la vanguardia admite 4 cartas y como mucho 2
                // Personajes, y con la vanguardia a medias un 3er Personaje se RECHAZA (no baja a
                // retaguardia). Si la vanguardia está llena todo va atrás, y entonces el límite de
                // Personajes ya no pinta nada.
                if (e.destino === 'CAMPO') {
                    const _vanLlena = p.vanguard.length >= 4;
                    const _persEnVan = p.vanguard.filter(c => c.type === 'Personaje').length;
                    if (!_vanLlena && _persEnVan >= 2) lista = lista.filter(x => x.type !== 'Personaje');
                    if (_vanLlena && p.rearguard.length >= 4) lista = [];
                }
                let _sacadaDelMazo = false; // para barajarDespues.soloSiDelMazo
                // floatingExito (Toto, 7-ago-2026): flotante sobre la carta FUENTE en cuanto hay
                // elección, ANTES de la animación de entrada. Un `op: FLOTANTE` colocado detrás
                // del BUSCAR no vale: este await la animación, así que el anuncio salía cuando la
                // carta ya estaba puesta — al revés que el resto de Activas, donde primero se
                // anuncia y el efecto ocurre a la vez.
                // Colocación en el campo, extraída para que la pueda invocar TAMBIÉN la
                // presentación (que necesita hacerlo a mitad de su animación, para aterrizar).
                let _yaColocada = false;
                const _colocarEnCampo = (t) => {
                    const tpl = getCardTemplate(t.id);
                    t.currentHp = tpl.hp; t.currentDef = tpl.def; t.currentAtk = tpl.atk;
                    t.furor = 0; t.exhausted = false;
                    const _aVan = e.destino === 'CAMPO' && p.vanguard.length < 4;
                    t.location = _aVan ? 'vanguard' : 'rearguard';
                    (_aVan ? p.vanguard : p.rearguard).push(t);
                };
                const aMano = async (t) => {
                    _yaColocada = false;
                    // Coger la carta SÍ es mutar: si la presentación seguía armada (búsqueda en
                    // descartes, donde el compromiso es elegir y no abrir), este es su momento.
                    await DSL._comprometer(sourceCard, game);
                    if (e.floatingExito && typeof showFloatingText === 'function') {
                        showFloatingText(sourceCard.instanceId, F(e.floatingExito.texto), e.floatingExito.estilo || 'ft-ability',
                            e.floatingExito.offset !== undefined ? e.floatingExito.offset : -30);
                    }
                    // Se saca de la zona REAL en la que estuviera (con una sola zona esto es
                    // exactamente lo de antes).
                    let _zIdx = zonas.findIndex(z => z.some(x => x.instanceId === t.instanceId));
                    if (_zIdx === -1) _zIdx = 0;
                    if (_zonasNombre[_zIdx] === 'MAZO') _sacadaDelMazo = true;
                    const _zona = zonas[_zIdx];
                    const idx0 = _zona.findIndex(x => x.instanceId === t.instanceId);
                    if (idx0 !== -1) _zona.splice(idx0, 1);
                    // La carta sale de la pila ANTES de la animación y se repinta (Toto,
                    // 7-ago-2026): así el contador del mazo/descartes baja en cuanto empieza el
                    // viaje, no al final. Antes bajaba después de barajar, que es tardísimo y
                    // dejaba ver un número que ya no era cierto.
                    if (typeof game.render === 'function') game.render();
                    // Si alguien tiene ABIERTO el visor de esa misma pila, se le repinta ya: si
                    // no, se queda el hueco de la carta que acaba de salir (Toto, 7-ago-2026).
                    if (typeof game._refrescarVisorPila === 'function') {
                        game._refrescarVisorPila(pid, _zonasNombre[_zIdx] === 'MAZO' ? 'deck' : 'discard');
                    }
                    // PRESENTACIÓN: las 18 cartas que recuperan algo de una pila pasan TODAS por
                    // aquí, así que es un solo enganche y no 18 cambios.
                    if (typeof animarPresentacionCarta === 'function') {
                        const _zn = _zonasNombre[_zIdx];
                        const _origen = _zn === 'MAZO' ? `#${pid}-deck-stack`
                                      : _zn === 'MANO' ? `#${pid}-hand` : `#${pid}-discard-stack`;
                        const _destino = (!e.destino || e.destino === 'MANO') ? `#${pid}-hand`
                                       : e.destino === 'RETAGUARDIA' ? `#${pid}-rearguard`
                                       : e.destino === 'EQUIPADO' ? `.card[data-id="${sourceCard.instanceId}"]`
                                       : `#${pid}-vanguard`;   // CAMPO
                        // Volteo: solo si la carta era desconocida para QUIEN MIRA. Del MAZO lo es
                        // para los dos; de los DESCARTES no lo es para nadie (esa pila se ve
                        // entera); de una MANO, solo para quien no es su dueño.
                        const _yo = game.myPlayerId;
                        const _deDorso = _zn === 'MAZO' || (_zn === 'MANO' && game.gameMode === 'online' && _yo !== pid);
                        // Si la carta se queda EN UNA FILA, la colocación viaja dentro de la
                        // presentación: así el tramo final aterriza en el hueco real y las cartas
                        // que ya estaban se apartan deslizándose (Toto, 7-ago-2026).
                        const _aFila = e.destino === 'RETAGUARDIA' || e.destino === 'CAMPO';
                        // La MANO es una fila más (Toto, 13-ago-2026). Sin esto la carta se
                        // desvanecía sobre la zona y no aparecía hasta que terminaba TODA la
                        // cadena -Toto lo vio con la búsqueda de Goodman al morir-, en vez de
                        // entrar en su hueco mientras el resto de la mano se aparta deslizándose.
                        const _aMano = !e.destino || e.destino === 'MANO';
                        // ¿La mano de destino es visible para QUIEN MIRA? Si no lo es, la carta
                        // vuelve a voltearse en el último tramo y aterriza de dorso, como la
                        // pinta esa mano. `handExposedTo` es SEGUIMIENTO (Erasmo): con él, la
                        // mano rival se ve boca arriba y no hay nada que tapar.
                        const _manoVisible = game.gameMode !== 'online' || _yo === pid
                            || _yo === 'spectator' || (game.players[pid] && game.players[pid].handExposedTo === _yo);
                        const _opts = (_aFila || _aMano) ? {
                            ocultarAlLlegar: _aMano && !_manoVisible,
                            zonaSel: _destino,
                            colocar: () => {
                                if (_aMano) { t.location = 'hand'; p.hand.push(t); }
                                else _colocarEnCampo(t);
                                if (typeof game.render === 'function') game.render();
                                return t.instanceId;
                            },
                        } : null;
                        await animarPresentacionCarta(t.id, _origen, _destino, _deDorso, _opts);
                        if (_aFila || _aMano) { _yaColocada = true; }
                    }
                    if ((!e.destino || e.destino === 'MANO') && !_yaColocada) {
                        // Solo si la presentación no la colocó ya al aterrizar (animación
                        // desactivada, o sin cliente). Sin animateStackToHand: la presentación
                        // YA hace ese viaje (pila -> centro -> mano); encadenarlas mostraba la
                        // carta dos veces.
                        t.location = 'hand';
                        p.hand.push(t);
                    } else if (e.destino === 'EQUIPADO') {
                        // La carta encontrada se EQUIPA a la carta fuente (Honsow: "busca un arma
                        // y equípala"). Mismo vínculo que el op EQUIPAR con `invertido`, aquí
                        // aplicado a lo que acaba de salir del mazo/la mano.
                        if (!sourceCard.equippedCards) sourceCard.equippedCards = [];
                        sourceCard.equippedCards.push(t);
                        t.location = 'equipped';
                        t.equippedTo = sourceCard.instanceId;
                        if (typeof game.updatePassives === 'function') game.updatePassives();
                    } else if ((e.destino === 'RETAGUARDIA' || e.destino === 'CAMPO') && !_yaColocada) {
                        // Solo si la presentación NO la colocó ya al aterrizar (p. ej. porque la
                        // animación estaba desactivada). Las reglas -vanguardia si cabe, atrás si
                        // está llena- viven en _colocarEnCampo, que es quien usan los dos caminos.
                        _colocarEnCampo(t);
                        if (typeof game.render === 'function') game.render();
                    }
                    if (e.log) game.logMsg(DSL._fill(e.log, { carta: DSL._nombre(game, sourceCard), objetivo: DSL._nombre(game, t), jugador: dn }), e.logTipo || 'ability');
                };
                const baraja = async () => {
                    if (!e.barajarDespues) return;
                    // Solo se baraja el MAZO: si la búsqueda no lo tocaba (descartes/mano) no hay
                    // nada que revolver.
                    if (!_zonasNombre.includes('MAZO')) return;
                    // soloSiDelMazo (Honsow, 31-jul-2026): además, solo si la carta cogida SALIÓ
                    // del mazo. Su arma puede venir de la mano, y en ese caso el mazo ni se toca.
                    if (e.barajarDespues.soloSiDelMazo && !_sacadaDelMazo) return;
                    if (e.barajarDespues.log) game.logMsg(F(e.barajarDespues.log), 'system');
                    if (typeof animateShuffle === 'function') await animateShuffle(pid);
                    game.shuffle(p.deck);
                };
                // confirmarPorZona (Karlitos, 31-jul-2026): variante multi-zona que NUNCA mezcla
                // el mazo con otras zonas en un mismo modal, y nunca revela ni toca el mazo si el
                // jugador no elige mirarlo explícitamente. El flujo genérico de más abajo (una
                // sola pregunta sí/no + lista combinada) tiene dos problemas para este caso: (1)
                // mostraba las coincidencias de mazo Y descartes MEZCLADAS en el mismo modal
                // genérico, y (2) elegir "buscar" ya barajaba el mazo aunque la carta se hubiera
                // cogido de los descartes -el jugador aprendía implícitamente que tenía una copia
                // en el mazo sin haber decidido mirarlo-. Con este flag, la pregunta se convierte
                // en "¿en qué zona buscas?" (una opción por zona + "no buscar"); MAZO abre el
                // visor de mazo completo (y SÍ baraja, mire lo que mire, porque ya lo ha
                // inspeccionado); cualquier otra zona (descartes: el orden no importa) coge la
                // PRIMERA coincidencia sin modal y no toca el mazo para nada.
                if (e.confirmarPorZona && e.confirmar) {
                    const _labels = e.confirmar.porZona || {};
                    // QUÉ ZONAS SE OFRECEN (Toto, 7-ago-2026). No se tratan igual una pila que el
                    // jugador ve y una que no:
                    //   · MAZO se ofrece SIEMPRE, haya coincidencias o no. Ocultar el botón sería
                    //     contarle que su mazo no tiene nada — justo lo que no puede saber. Que
                    //     pueda mirar y no encontrar es parte del juego (y a mitad de partida uno
                    //     no se acuerda de lo que le queda dentro).
                    //   · Las demás (descartes) el jugador ya las ve enteras, así que un botón
                    //     que no puede dar nada solo estorba: se oculta, y no revela nada nuevo.
                    const _casa = (x) => (e.filtros || []).every(f => DSL._match(x, f)) &&
                                         (!e.algunFiltro || e.algunFiltro.some(f => DSL._match(x, f)));
                    const _ofrecidas = _zonasNombre.filter((zn, i) => zn === 'MAZO' || zonas[i].some(_casa));
                    if (!_ofrecidas.length) {
                        if (e.logNoValidas) game.logMsg(F(e.logNoValidas), 'system');
                        continue;
                    }
                    const elegida = await new Promise(resolve => {
                        game.openChoiceModal(F(e.confirmar.titulo), [
                            ..._ofrecidas.map(zn => ({ label: _labels[zn] || `BUSCAR EN ${zn}`, action: () => resolve(zn) })),
                            { label: e.confirmar.no || 'NO BUSCAR', action: () => resolve(null) },
                        ], pid);
                    });
                    if (!elegida) {
                        if (e.confirmar.logNo) game.logMsg(F(e.confirmar.logNo), 'system');
                        // Declinar la ZONA es declinar la búsqueda entera, así que honra
                        // `abortaSiCancelas` igual que cerrar el visor (Toto, 7-ago-2026): en una
                        // cadena "busca un arma -> equípala -> ataca", decir que no y seguir
                        // atacando sin arma no tiene sentido. Sin el flag se sigue como antes.
                        if (e.abortaSiCancelas) return false;
                        continue;
                    }
                    const zIdx = _zonasNombre.indexOf(elegida);
                    const poolZona = zonas[zIdx].filter(x => (e.filtros || []).every(f => DSL._match(x, f)) &&
                                                             (!e.algunFiltro || e.algunFiltro.some(f => DSL._match(x, f))));
                    if (e.logIntro) game.logMsg(F(e.logIntro), e.logIntroTipo || 'ability');
                    if (elegida === 'MAZO' && typeof game.openDeckSearchViewer === 'function') {
                        // Mismo criterio que arriba: elegir la zona MAZO ya compromete.
                        if (typeof game._dispararPresentacion === 'function') await game._dispararPresentacion();
                        // Con el mazo vacío de coincidencias el visor se abre IGUAL, y con el
                        // aviso puesto (Toto, 7-ago-2026): aquí se pasaba `null` siempre, así que
                        // el jugador veía su mazo sin nada en verde y sin una sola palabra que se
                        // lo explicara. Mismo texto que `visorVacio` usa en el camino de una zona.
                        // El aviso lo redacta el VISOR (garantía única, ver openDeckSearchViewer):
                        // aquí solo se le dice QUÉ se buscaba para que pueda nombrarlo. La coletilla
                        // del barajado sí es de este camino, así que se añade si toca.
                        const _nom = DSL._nombresBuscados(e);
                        const _aviso = poolZona.length ? null : DSL._avisoVacio(_nom, 'deck', !!e.barajarDespues);
                        const r = await game.openDeckSearchViewer(pid, poolZona, F(e.titulo || 'ELIGE UNA CARTA'), _aviso, e.cantidad || 1, 'deck', _nom, !!e.barajarDespues);
                        const elegidas = Array.isArray(r) ? r : (r ? [r] : []);
                        if (elegidas.length > 0) { for (const t of elegidas) await aMano(t); algunExito = true; }
                        else if (e.logSinEleccion) game.logMsg(F(e.logSinEleccion), 'system');
                        // Baraja SIEMPRE que se mire el mazo, haya coincidencia o no (fidelidad:
                        // ya se ha revuelto al inspeccionarlo) — a diferencia de `soloSiDelMazo`,
                        // que mira si la carta ESCOGIDA vino del mazo; aquí lo que importa es que
                        // el jugador ELIGIÓ mirar el mazo, coja algo o no.
                        if (e.barajarDespues) {
                            if (e.barajarDespues.log) game.logMsg(F(e.barajarDespues.log), 'system');
                            if (typeof animateShuffle === 'function') await animateShuffle(pid);
                            game.shuffle(p.deck);
                        }
                    } else {
                        // Zona ya visible para el jugador (mano, descartes): NO se toca el mazo ni
                        // para barajarlo ni para que aprenda nada de él.
                        // Con varias coincidencias DISTINTAS hay que dejar elegir (Honsow puede
                        // tener dos armas melé diferentes en la mano); con una sola, o con varias
                        // copias de la misma carta, se coge directamente -es lo que hacía Karlitos
                        // y no hay nada que decidir-.
                        const _distintas = new Set(poolZona.map(x => x.id)).size;
                        if (_distintas > 1) {
                            // La MANO usa su picker (oscurece todo menos ella); cualquier otra
                            // zona visible, el modal.
                            const r = (elegida === 'MANO' && typeof game.pickBoardTargets === 'function')
                                ? await game.pickBoardTargets(poolZona, e.cantidad || 1, F(e.titulo || 'ELIGE UNA CARTA') + ' (clic en tu mano)', sourceCard, pid, true, { mano: true })
                                : await game.openVisualSearchModal(F(e.titulo || 'ELIGE UNA CARTA'), poolZona, e.cantidad || 1, !!e.autoSeleccion, pid);
                            if (r && r.length > 0) { for (const x of r) await aMano(x); algunExito = true; }
                            else if (e.abortaSiCancelas) return false;
                        } else if (poolZona.length > 0) { await aMano(poolZona[0]); algunExito = true; }
                        else if (e.logNoEncontrada) game.logMsg(F(e.logNoEncontrada), 'system');
                    }
                    continue;
                }
                if (e.seleccion === 'PRIMERA') {
                    // Automática: la primera coincidencia por orden de la zona; sin modales
                    if (zona.length === 0) continue;
                    if (e.logIntro) game.logMsg(F(e.logIntro), e.logIntroTipo || 'ability');
                    if (lista.length > 0) { await aMano(lista[0]); algunExito = true; }
                    else if (e.logNoEncontrada) game.logMsg(F(e.logNoEncontrada), 'system');
                    await baraja();
                    continue;
                }
                const pregunta = () => new Promise(resolve => {
                    game.openChoiceModal(F(e.confirmar.titulo), [
                        { label: e.confirmar.si, action: () => resolve(true) },
                        { label: e.confirmar.no || 'IGNORAR', action: () => resolve(false) }
                    ], pid);
                });
                // NORMA (Toto, 7-ago-2026): buscar en una PILA -mazo o descartes- SIEMPRE usa su
                // visor completo, nunca el modal genérico de selección. Se ve la pila entera y
                // solo las elegibles llevan el reborde verde; si no hay ninguna, el visor se abre
                // igual con el aviso y se cierra clicando el fondo. Hasta hoy esto solo valía para
                // el MAZO, así que las búsquedas en descartes (Líquido mortal, Cápsula de
                // bio-regeneración, Nigromántica) caían al modal de "cartas disponibles", que solo
                // lista las válidas y esconde el resto de la pila.
                // Sigue sin aplicar a la MANO ni a las búsquedas MULTI-ZONA (`en` como array):
                // ahí no hay una sola pila que enseñar, y caen al modal visual a propósito.
                const _zonaVisor = e.en === 'MAZO' ? 'deck' : e.en === 'DESCARTES' ? 'discard' : null;
                const esVisorPila = !!_zonaVisor && typeof game.openDeckSearchViewer === 'function';
                const _nombrePila = _zonaVisor === 'discard' ? 'esta pila de descartes' : 'este mazo';
                const visorVacio = async (barajara) => {
                    if (!esVisorPila) return;
                    // Abrir el visor del MAZO compromete AUNQUE esté vacío de elegibles: has
                    // mirado la pila oculta y se va a barajar igual. Sin esto, una búsqueda sin
                    // resultados dejaba la carta jugada sin presentar y sin llegar al descarte
                    // hasta el final de la cadena (Toto, 8-ago-2026, con Rezo en grupo).
                    if (_zonaVisor === 'deck') await DSL._comprometer(sourceCard, game);
                    await game.openDeckSearchViewer(pid, [], F(e.titulo || 'ELIGE UNA CARTA'),
                        barajara ? `No hay cartas elegibles en ${_nombrePila}. Se barajará al cerrar el visor.` : `No hay cartas elegibles en ${_nombrePila}.`,
                        1, _zonaVisor);
                };
                let confirmado = false;
                if (e.preguntarSiempre && e.confirmar) {
                    // Flujo pedido por Toto (Feria del cómic): la pregunta va ANTES de
                    // mirar si hay cartas válidas; si aceptas y no hay, se avisa y se
                    // baraja igualmente (la búsqueda ya revolvió el mazo).
                    if (!(await pregunta())) { if (e.confirmar.logNo) game.logMsg(F(e.confirmar.logNo), 'system'); continue; }
                    confirmado = true;
                    if (lista.length === 0) {
                        // sinVacioTrasConfirmar: si aceptas pero no hay nada, no se abre
                        // visor ni se baraja (Goodman al morir con el mazo vacío: no hace nada).
                        if (e.sinVacioTrasConfirmar) continue;
                        await visorVacio(!!e.barajarDespues);
                        if (e.logNoValidas) game.logMsg(F(e.logNoValidas), 'system');
                        await baraja();
                        continue;
                    }
                }
                if (lista.length === 0) {
                    // El visor vacío solo sale si el jugador INICIÓ la búsqueda (sin
                    // confirmar: jugar la carta ya es iniciarla). Con confirmar, la
                    // pregunta se salta al no haber válidas y no se abre nada (p. ej.
                    // Llamada del deber no molesta en cada fin de turno sin Guardias).
                    if (!e.confirmar) await visorVacio(!!(e.barajarDespues && e.barajarDespues.inclusoSinValidas));
                    if (e.logNoValidas) game.logMsg(F(e.logNoValidas), 'system');
                    if (e.barajarDespues && e.barajarDespues.inclusoSinValidas) await baraja();
                    // abortaSiVacio (Honsow, 31-jul-2026): sin nada que encontrar, ABORTA la lista
                    // de efectos entera en vez de seguir. Sin esto, una Habilidad que encadena
                    // "busca un arma -> equípala -> ataca" seguiría atacando sin arma (la vieja
                    // hacía cancelAction y se iba). Hermano de `abortaSiCancelas`, que cubre el
                    // otro camino: había cartas válidas pero el jugador cerró el modal.
                    if (e.abortaSiVacio) return false;
                    continue;
                }
                if (e.logIntro) game.logMsg(F(e.logIntro), e.logIntroTipo || 'ability');
                if (e.floatingIntro && typeof showFloatingText === 'function') showFloatingText(sourceCard.instanceId, F(e.floatingIntro.texto), e.floatingIntro.estilo || 'ft-ability', e.floatingIntro.offset !== undefined ? e.floatingIntro.offset : -30);
                if (e.confirmar && !confirmado) {
                    if (!(await pregunta())) { if (e.confirmar.logNo) game.logMsg(F(e.confirmar.logNo), 'system'); continue; }
                }
                let elegidas;
                if (esVisorPila) {
                    // Abrir el visor del MAZO ya es el compromiso (pila oculta + barajado), así
                    // que la carta jugada se enseña AQUÍ y se espera: la cadena no sigue hasta
                    // que se ha visto. Con los DESCARTES no, que ahí aún se puede cancelar.
                    if (_zonaVisor === 'deck') await DSL._comprometer(sourceCard, game);
                    // maxCount = e.cantidad: single (1) devuelve una carta o null; multi (>1)
                    // devuelve un array (Inspiración: hasta 2, mín. 1).
                    const r = await game.openDeckSearchViewer(pid, lista, F(e.titulo || 'ELIGE UNA CARTA'), null, e.cantidad || 1, _zonaVisor);
                    elegidas = Array.isArray(r) ? r : (r ? [r] : []);
                } else {
                    elegidas = await game.openVisualSearchModal(F(e.titulo || 'ELIGE UNA CARTA'), lista, e.cantidad || 1, !!e.autoSeleccion, pid);
                }
                if (elegidas && elegidas.length > 0) { for (const t of elegidas) await aMano(t); algunExito = true; }
                else if (e.abortaSiCancelas) {
                    // Cancelar NO consume la carta... pero el mazo ya se ha visto, así que se
                    // baraja igual antes de salir (Toto, 7-ago-2026, razonándolo a partir de que
                    // el visor pase a ser cancelable): mirar el mazo lo revuelve, se coja algo o
                    // no. Antes este `return` se saltaba el barajado, con lo que cancelar dejaba
                    // el mazo inspeccionado Y en su orden — información gratis. Con los descartes
                    // no aplica: esa pila se puede mirar cuando se quiera y no se baraja.
                    await baraja();
                    return false;
                }
                else if (e.logSinEleccion) game.logMsg(F(e.logSinEleccion), 'system');
                await baraja(); // se baraja aunque no se cogiera nada (fidelidad: la búsqueda ya revolvió el mazo)
            }
            return algunExito ? true : 'skip';
        }
        if (e.op === 'DESCARTAR') {
            const p = game.players[ownerId];
            const idx = p.hand.findIndex(x => x.instanceId === target.instanceId);
            if (idx === -1) return 'skip';
            const d = p.hand.splice(idx, 1)[0];
            if (typeof game.resetCard === 'function') game.resetCard(d); // lavada antes de tocar los descartes
            d.location = 'discard';
            p.discard.push(d);
            if (e.log) game.logError(DSL._fill(e.log, { carta: DSL._nombre(game, sourceCard), objetivo: d.name })); // privado: solo el actor
            return true;
        }
        if (e.op === 'MARCAR') {
            // delta (Gólem multielemental, 31-jul-2026): incrementa un campo propio de la
            // carta en vez de fijarlo — mismo criterio que el `delta` ya añadido a MARCAR_JUGADOR.
            if (typeof e.delta === 'number') target[e.campo] = (target[e.campo] || 0) + e.delta;
            else target[e.campo] = e.valor;
            if (e.log) game.logMsg(DSL._fill(e.log, { carta: DSL._nombre(game, sourceCard), objetivo: DSL._nombre(game, target) }), e.logTipo || 'ability');
            return true;
        }
        if (e.op === 'FIJAR_STAT') {
            // Fija (no suma) un stat del objetivo; complementa el delta de MODIFICAR_STAT.
            // valor admite número o {REF:"vars.x"} (p. ej. la suma guardada por un ELEGIR).
            // Si el valor no resuelve (elección cancelada), se omite sin abortar la cadena.
            const vars = (DSL._vars && DSL._vars[sourceCard.instanceId]) || {};
            const v = DSL._value(ownerId, game, e.valor, sourceCard, { self: sourceCard, vars });
            if (v === undefined || v === null || Number.isNaN(v)) return 'skip';
            target[e.stat] = v;
            const relleno = Object.assign({}, vars, { carta: DSL._nombre(game, sourceCard), objetivo: DSL._nombre(game, target), valor: v });
            if (e.log) game.logMsg(DSL._fill(e.log, relleno), e.logTipo || 'ability');
            if (e.floating && typeof showFloatingText === 'function') showFloatingText(target.instanceId, DSL._fill(e.floating.texto, relleno), e.floating.estilo || 'ft-ability', e.floating.offset !== undefined ? e.floating.offset : -40);
            return true;
        }
        if (e.op === 'MARCAR_JUGADOR') {
            // delta (Matón, 31-jul-2026): incrementa un contador propio del jugador en vez de
            // fijar un valor — para contadores "por turno" que no viven en ninguna carta.
            if (typeof e.delta === 'number') game.players[ownerId][e.campo] = (game.players[ownerId][e.campo] || 0) + e.delta;
            else game.players[ownerId][e.campo] = e.valor !== undefined ? e.valor : true;
            if (e.log) game.logMsg(DSL._fill(e.log, { carta: DSL._nombre(game, sourceCard) }), e.logTipo || 'ability');
            return true;
        }
        if (e.op === 'ESQUIVAR') {
            // Solo tiene sentido dentro de ANTES_DE_DEFENDER, que es quien lee el flag y lo
            // convierte en el `return true` que el motor entiende como "esquivado" (Águila,
            // PSEUDO-PREVASIÓN, 31-jul-2026). Vive en `game` y no en la carta a propósito: es
            // transitorio de UNA resolución y exportGameState no serializa campos sueltos de
            // game, así que no ensucia el estado que compara el arnés.
            // sourceCard = quien defiende/esquiva · target = quien ataca.
            game._dslEsquiva = true;
            // sinAnimacion (Neo, 31-jul-2026): PARED FALSA no esquiva, se desvanece — el quiebro
            // lateral de animateDodge contaba otra cosa. El efecto de reglas es idéntico.
            if (!e.sinAnimacion && typeof animateDodge === 'function') { try { await animateDodge(target.instanceId, sourceCard.instanceId); } catch (err) {} }
            if (e.log) game.logMsg(DSL._fill(e.log, { carta: DSL._nombre(game, sourceCard), defensor: DSL._nombre(game, sourceCard), objetivo: DSL._nombre(game, target) }), e.logTipo || 'combat');
            return true;
        }
        // Los dos ops siguientes solo tienen sentido dentro de EQUIPO_ANTES_DE_ATACAR, que es
        // quien lee este transitorio y lo convierte en el `{dmgMod, newDefender}` que espera
        // performAttack. Mismo criterio que ESQUIVAR: vive en `game`, es de UNA resolución y
        // exportGameState no serializa campos sueltos de game, así que no ensucia el arnés.
        if (e.op === 'DAÑO_ATAQUE') {
            // Modificador de DAÑO del golpe en curso, no un cambio de Atq: el motor lo suma en
            // `dmg = atacante.Atq - defensor.Def + dmgModifier`.
            const v = DSL._value(ownerId, game, e.delta, sourceCard, ctx) || 0;
            game._dslEquipoAtaque = game._dslEquipoAtaque || {};
            game._dslEquipoAtaque.dmgMod = (game._dslEquipoAtaque.dmgMod || 0) + v;
            const _anc = e.enAtacante && game._dslEquipoAtacante ? game._dslEquipoAtacante : sourceCard;
            if (e.floating && typeof showFloatingText === 'function') showFloatingText(_anc.instanceId, DSL._fill(e.floating.texto, { valor: Math.abs(v) }), e.floating.estilo || (v >= 0 ? 'ft-green' : 'ft-red-stat'), e.floating.offset !== undefined ? e.floating.offset : -20);
            if (e.log) game.logMsg(DSL._fill(e.log, { carta: DSL._nombre(game, sourceCard), valor: Math.abs(v) }), e.logTipo || 'combat');
            return true;
        }
        if (e.op === 'REDIRIGIR_ATAQUE') {
            // El golpe cambia de destinatario (el objetivo de este efecto pasa a ser el defensor).
            if (!target) return 'skip';
            game._dslEquipoAtaque = game._dslEquipoAtaque || {};
            game._dslEquipoAtaque.newDefender = target;
            if (e.log) game.logMsg(DSL._fill(e.log, { carta: DSL._nombre(game, sourceCard), objetivo: DSL._nombre(game, target) }), e.logTipo || 'combat');
            return true;
        }
        // SECUESTRAR_STAT / DEVOLVER_STAT (Bancarrota, 31-jul-2026): guardan un stat "en el
        // bolsillo" y lo dejan a un valor fijo, y luego lo reponen. Es un par: sin el segundo, el
        // valor original se perdería para siempre. El campo donde se guarda es explícito
        // (`guardarEn`) y NO viaja en la plantilla, así que se ve en el estado exportado — por eso
        // se BORRA al devolver, para no dejar rastro una vez usado.
        if (e.op === 'SECUESTRAR_STAT') {
            if (target[e.guardarEn] === undefined) target[e.guardarEn] = target[e.stat];
            target[e.stat] = e.valor !== undefined ? e.valor : 0;
            return true;
        }
        if (e.op === 'DEVOLVER_STAT') {
            if (target[e.guardadoEn] !== undefined) {
                target[e.stat] = target[e.guardadoEn];
                delete target[e.guardadoEn];
            }
            return true;
        }
        // CUENTA_ATRAS (Toto, 5-ago-2026): el reloj propio de una carta. Baja UNA unidad de un
        // contador (o de un stat) y, si llega a 0, dispara efectos. Es el patrón compartido por
        // las tres cartas que llevaban su propia cuenta atrás a mano — Diego Antonio (Turnos de
        // Cólera), Meca EBA (su Furor como batería) y K.I.N.O. (Contadores de paciencia) —, cada
        // una con su copia del mismo bucle: bajar, mirar si es 0, matar.
        //
        // No se confunde con `cuentaAtras` de MARCAR_TEMPORAL: aquel cuenta la vida de una MARCA
        // puesta por OTRA carta (los equipos con temporizador) y lo gestionan los hooks genéricos
        // de marcas. Este cuenta algo que vive en la PROPIA carta y lo dispara ella, típicamente
        // desde FIN_TURNO.
        //
        //   contador: 'diego_timer'   -> baja un contador con nombre (el que ve el jugador)
        //   stat: 'furor'             -> ...o un stat, para las que usan su energía como reloj
        //   salvoSi: <condición>      -> este turno NO baja (PACIFISMO congela el reloj)
        //   consumirTrasSaltar: campo -> y la bandera que lo congeló se gasta al usarse
        //   alLlegarACero: [efectos]  -> lo que pasa al agotarse
        if (e.op === 'CUENTA_ATRAS') {
            if (e.salvoSi && DSL._cond(target, game, e.salvoSi)) {
                if (e.logSalto) game.logMsg(DSL._fill(e.logSalto, { carta: DSL._nombre(game, target) }), e.logSaltoTipo || 'ability');
                // La bandera es de UN turno: se consume al gastarla, no se queda encendida.
                if (e.consumirTrasSaltar) target[e.consumirTrasSaltar] = false;
                return true;
            }
            const _leer = () => e.stat ? (target[e.stat] || 0)
                : ((target.counters && target.counters[e.contador]) ? target.counters[e.contador].count : 0);
            if (_leer() <= 0) return 'skip'; // ya estaba agotado: nada que bajar
            if (e.stat) game.modifyStat(target, e.stat, -1, e.offsetY || 0, sourceCard);
            else game.modifyCounters(target, e.contador, -1, e.nombreContador, sourceCard, e.icono, habilidad || null);
            const quedan = _leer();
            if (e.log) game.logMsg(DSL._fill(e.log, { carta: DSL._nombre(game, target), quedan }), e.logTipo || 'ability');
            if (e.floating && typeof showFloatingText === 'function') {
                showFloatingText(target.instanceId, DSL._fill(e.floating.texto || e.floating, { quedan }), e.floating.estilo || 'ft-red-stat', e.floating.offset !== undefined ? e.floating.offset : 0);
            }
            if (quedan > 0) return true;
            if (e.logCero) game.logMsg(DSL._fill(e.logCero, { carta: DSL._nombre(game, target) }), e.logCeroTipo || 'ability');
            if (Array.isArray(e.alLlegarACero)) await DSL._runEffectList(e.alLlegarACero, sourceCard, game, ownerId, [target], habilidad);
            return true;
        }
        if (e.op === 'MARCAR_PARTIDA') {
            // Hermano de MARCAR_JUGADOR pero para campos de LA PARTIDA (game), no de un
            // jugador ni de una carta -p. ej. game.placedUnitThisTurn, el candado de "1 unidad
            // colocada por turno", que es global y no vive en players[x] (Matón, 31-jul-2026).
            game[e.campo] = e.valor !== undefined ? e.valor : true;
            if (e.log) game.logMsg(DSL._fill(e.log, { carta: DSL._nombre(game, sourceCard) }), e.logTipo || 'ability');
            return true;
        }
        if (e.op === 'FLOTANTE') {
            if (typeof showFloatingText === 'function') showFloatingText(target.instanceId, e.texto, e.estilo || 'ft-green', e.offset !== undefined ? e.offset : -20);
            // log (Karlitos, 31-jul-2026): le faltaba, a diferencia de casi todos los demás ops.
            // Un flotante suele venir acompañado de su línea de log, y sin esto había que meter
            // un efecto aparte solo para eso.
            if (e.log) game.logMsg(DSL._fill(e.log, { carta: DSL._nombre(game, sourceCard), objetivo: DSL._nombre(game, target) }), e.logTipo || 'ability');
            return true;
        }
        if (e.op === 'VOLVER_A_MANO') {
            // Devuelve la carta del campo a la mano (Incluso En El KG al morir). Replica
            // EXACTAMENTE la vieja: solo resetea currentHp; furor/estado no se tocan.
            const owner = target.owner;
            const pl = game.players[owner];
            if (typeof animateSpinToHand === 'function') { try { await animateSpinToHand(target.instanceId, owner); } catch (err) {} }
            pl.vanguard = pl.vanguard.filter(c => c.instanceId !== target.instanceId);
            pl.rearguard = pl.rearguard.filter(c => c.instanceId !== target.instanceId);
            target.location = 'hand';
            // reset (Poder Legado, 31-jul-2026): lavado completo con resetCard en vez de solo
            // restaurar la Vida. Importa aquí porque el portador vuelve a la mano CON un equipo
            // encima y con los stats bloqueados a 9: resetCard deshace ambas cosas (llama a
            // unequipAll, que manda el equipo a la basura). Sin él volvería a la mano evolucionado.
            if (e.reset && typeof game.resetCard === 'function') game.resetCard(target);
            else target.currentHp = getCardTemplate(target.id).hp;
            pl.hand.push(target);
            // La mano se acomoda con la carta ya dentro, igual que cualquier otra llegada
            // (§14.quater). Sin esto, la carta que vuelve del campo aparecía de golpe y las
            // demás daban un salto de un frame (Toto, 13-ago-2026).
            if (typeof game.render === 'function') game.render();
            if (e.log) game.logMsg(DSL._fill(e.log, { carta: DSL._nombre(game, sourceCard), objetivo: DSL._nombre(game, target) }), e.logTipo || 'ability');
            return true;
        }
        if (e.op === 'EQUIPAR') {
            // Anexa la PROPIA carta fuente al objetivo. soloAnexar: la mano/location los gestiona el motor de Ayudas (p. ej. Infusión)
            const p = game.players[sourceCard.owner];
            // invertido (Karlitos, APRENDIZ DE ARMAS, 31-jul-2026): al revés que el caso normal
            // -aquí el OBJETIVO es el equipo (un Arma elegida) y la carta FUENTE quien lo lleva-.
            // El caso de siempre es una Ayuda equipándose a sí misma a un aliado; este es un
            // Personaje que se calza un arma. No pasa por canEquip/requisitos a propósito: las
            // cartas que lo usan dicen literalmente "ignorando requisitos/condiciones".
            if (e.invertido) {
                if (!sourceCard.equippedCards) sourceCard.equippedCards = [];
                sourceCard.equippedCards.push(target);
                const hi = p.hand.findIndex(x => x.instanceId === target.instanceId);
                if (hi !== -1) p.hand.splice(hi, 1);
                target.location = 'equipped';
                target.equippedTo = sourceCard.instanceId;
                // "el [n] nace al salir de la mano" (Toto, 31-jul-2026): aquí el arma es TARGET,
                // no sourceCard -ver la nota de `invertido` arriba-.
                if (typeof game.assignCopyId === 'function') game.assignCopyId(target);
                if (typeof showFloatingText === 'function') (e.floats || []).forEach(f => showFloatingText(sourceCard.instanceId, f.texto, f.estilo || 'ft-green', f.offset !== undefined ? f.offset : -20));
                if (e.log) game.logMsg(DSL._fill(e.log, Object.assign({}, (DSL._vars && DSL._vars[sourceCard.instanceId]) || {}, { carta: DSL._nombre(game, sourceCard), objetivo: DSL._nombre(game, target) })), e.logTipo || 'ability');
                if (typeof game.updatePassives === 'function') game.updatePassives();
                return true;
            }
            if (!target.equippedCards) target.equippedCards = [];
            target.equippedCards.push(sourceCard);
            if (!e.soloAnexar) {
                const hi = p.hand.findIndex(x => x.instanceId === sourceCard.instanceId);
                if (hi !== -1) p.hand.splice(hi, 1);
                sourceCard.location = 'equipped';
                // Bug de motor real y preexistente, NO introducido por el DSL (la Súper Evolución
                // y la Poder Legado imperativas tampoco lo llamaban): el pipeline de jugar una
                // Ayuda con `onPlay` propio (motor, card.type==='Ayuda') nunca llamaba a
                // assignCopyId, a diferencia de Personaje/Esbirro/Evento y del otro pipeline
                // (AL_USAR_AYUDA -> executeAyuda). Con 2+ copias de la misma Ayuda equipable en
                // juego (AL_EQUIPAR: Furia berserker, Shichishito, Chaqueta metálica, Súper
                // Evolución, Poder Legado), "Afectado por:" nunca distinguía cuál -copyId se
                // quedaba en null para siempre-. Aquí es el único punto por el que pasan TODAS
                // ("el [n] nace al salir de la mano"), soloAnexar aparte (ese caso lo gestiona el
                // motor de Ayudas, que sí lo asigna).
                if (typeof game.assignCopyId === 'function') game.assignCopyId(sourceCard);
            }
            sourceCard.equippedTo = target.instanceId;
            if (typeof showFloatingText === 'function') (e.floats || []).forEach(f => showFloatingText(target.instanceId, f.texto, f.estilo || 'ft-green', f.offset !== undefined ? f.offset : -20));
            if (e.log) game.logMsg(DSL._fill(e.log, Object.assign({}, (DSL._vars && DSL._vars[sourceCard.instanceId]) || {}, { carta: DSL._nombre(game, sourceCard), objetivo: DSL._nombre(game, target) })), e.logTipo || 'ability');
            if (!e.soloAnexar && typeof game.updatePassives === 'function') game.updatePassives();
            // animacion: la de evolución la lanzaba a mano la Súper Evolución imperativa. Va tras
            // updatePassives para que la carta ya se pinte con sus stats nuevos.
            if (e.animacion === 'evolucion' && typeof animateEvolution === 'function') { try { await animateEvolution(target.instanceId); } catch (err) {} }
            return true;
        }
        if (e.op === 'DESEQUIPAR') {
            // Suelta la carta FUENTE (un equipo) de quien la lleve y la manda al descarte. Es el
            // final de vida de los equipos con temporizador o con usos contados (Súper Evolución,
            // Poder Legado, Milkor MGL): los tres lo hacían a mano, cada uno a su manera.
            // El portador se busca por `equippedTo` y no por el objetivo del efecto, porque al
            // caducar una marca el "target" es el portador pero al agotarse los usos no.
            const _host = (typeof game.findCard === 'function' && sourceCard.equippedTo) ? game.findCard(sourceCard.equippedTo) : null;
            const host = _host || target;
            if (host && host.equippedCards) host.equippedCards = host.equippedCards.filter(c => c.instanceId !== sourceCard.instanceId);
            // restaurarStats: devuelve al portador la Vida máxima de su PLANTILLA y lo cura del
            // todo. Hace falta porque maxHp -a diferencia de currentAtk/currentDef- no se
            // recalcula en cada updatePassives, así que nadie lo devolvería a su sitio solo.
            if (host && e.restaurarStats) {
                const t = getCardTemplate(host.id) || {};
                if (typeof t.hp === 'number') { host.maxHp = t.hp; host.currentHp = host.maxHp; }
                if (e.limpiarEstados) host.status = {};
            }
            if (host && host.counters && e.contador) delete host.counters[DSL._fill(e.contador, { instancia: sourceCard.instanceId })];
            sourceCard.equippedTo = null;
            sourceCard.location = 'discard';
            const pd = game.players[sourceCard.owner];
            if (!pd.discard) pd.discard = [];
            if (!pd.discard.some(c => c.instanceId === sourceCard.instanceId)) pd.discard.push(sourceCard);
            if (e.log) game.logMsg(DSL._fill(e.log, { carta: DSL._nombre(game, sourceCard), objetivo: host ? DSL._nombre(game, host) : '' }), e.logTipo || 'system');
            if (e.floating && host && typeof showFloatingText === 'function') showFloatingText(host.instanceId, e.floating.texto || e.floating, e.floating.estilo || 'ft-red-stat', e.floating.offset !== undefined ? e.floating.offset : -30);
            if (typeof game.updatePassives === 'function') game.updatePassives();
            return true;
        }
        if (e.op === 'ANEXAR') {
            // Vínculo self<->objetivo (Kazuo/Gladiador): DISTINTO de EQUIPAR (esa es una carta
            // de Ayuda anexándose a un aliado). Aquí es un aliado ya en el tablero anexado a
            // OTRO aliado (self), con la flecha morada genérica (attachedTo/attachments, ya
            // dibujada por el motor) y sin tocar hand/location de nadie. La validez del vínculo
            // y el bono continuo mientras dure viven en la condición `anexoValido` de
            // PASIVA_CONTINUA (Toto, 27-jul-2026).
            //
            // reverse (Frikazo, 31-jul-2026): FIJACIÓN ancla al REVÉS que Gladiador/Kazuo — el
            // objetivo (el Personaje protegido) es quien guarda `attachments` (así lo encuentra
            // el bucle de interceptores de index.html, que recorre `currentDefender.attachments`),
            // y self (Frikazo) guarda `attachedTo` + `reverseArrow` (solo visual: qué punta de
            // la flecha nace en cuál carta, no afecta a la lógica). También limpia el anexo
            // ANTERIOR de self si lo hubiera (FIJACIÓN es "Reusable": re-anexar a otro Personaje
            // debe soltar el vínculo viejo primero) — Gladiador/Kazuo nunca lo necesitaron por
            // ser de un solo uso (al colocarse), así que el op no lo hacía hasta ahora.
            if (e.reverse) {
                if (sourceCard.attachedTo) {
                    const oldHost = game.findCard(sourceCard.attachedTo);
                    if (oldHost && oldHost.attachments) oldHost.attachments = oldHost.attachments.filter(id => id !== sourceCard.instanceId);
                }
                if (!target.attachments) target.attachments = [];
                target.attachments.push(sourceCard.instanceId);
                sourceCard.attachedTo = target.instanceId;
                sourceCard.reverseArrow = true;
            } else {
                if (!sourceCard.attachments) sourceCard.attachments = [];
                sourceCard.attachments.push(target.instanceId);
                target.attachedTo = sourceCard.instanceId;
            }
            if (e.floating && typeof showFloatingText === 'function') showFloatingText(sourceCard.instanceId, e.floating.texto, e.floating.estilo || 'ft-green', e.floating.offset !== undefined ? e.floating.offset : -30);
            return true;
        }
        if (e.op === 'ELEGIR') {
            // Selección visual sobre mesa/mano; si el jugador no completa la elección, ABORTA (no consume la carta)
            const p = game.players[ownerId];
            const rivalP = game.players[ownerId === 'p1' ? 'p2' : 'p1'];
            let pool = e.de === 'ENEMIGOS' ? [...rivalP.vanguard, ...rivalP.rearguard]
                     : e.de === 'MANO' ? p.hand.filter(x => x.instanceId !== sourceCard.instanceId)
                     : [...p.vanguard, ...p.rearguard];
            pool = pool.filter(x => (e.filtros || []).every(f => DSL._match(x, f)) &&
                                    (!e.algunFiltro || e.algunFiltro.some(f => DSL._match(x, f))));
            pool = pool.filter(x => !((getCardTemplate(x.id) || {}).isAvatar)); // Kami: intocable
            // excluirSelf: la propia carta fuente ya está en el campo cuando ELEGIR corre en
            // AL_JUGAR (Kazuo/Gladiador eligiendo a quién anexar), así que el pool de ALIADOS
            // la incluiría por defecto si no se filtra explícitamente (Toto, 27-jul-2026).
            if (e.excluirSelf) pool = pool.filter(x => x.instanceId !== sourceCard.instanceId);
            if (e.sinMarcaTemporalPropia) pool = pool.filter(x => !(x.tempEffects && x.tempEffects.some(t => t.sourceId === sourceCard.id)));
            if (e.zona === 'VANGUARDIA') pool = pool.filter(x => x.location === 'vanguard');
            else if (e.zona === 'RETAGUARDIA') pool = pool.filter(x => x.location === 'rearguard');
            let n = e.cantidad || 1;
            if (e.hastaCantidad && pool.length < n) n = pool.length;
            // siNoElegido (Gárgola, 31-jul-2026): rama de efectos "de lo contrario" — corre si
            // NO hay pool válido O si el jugador declina la elección (en vez de abortar la
            // carta en silencio con opcional:true, o abortarla del todo sin opcional). Hacía
            // falta para "tributa 2 Furor de un aliado O Gárgola se destruye": ni pool vacío ni
            // decline tenían hasta ahora forma de disparar un efecto de verdad.
            if (!pool.length) {
                if (e.logSiVacio) game.logMsg(DSL._fill(e.logSiVacio, Object.assign({}, (DSL._vars && DSL._vars[sourceCard.instanceId]) || {}, { carta: DSL._nombre(game, sourceCard) })), e.logSiVacioTipo || 'ability');
                if (e.siNoElegido) { const r = await DSL._runEffectList(e.siNoElegido, sourceCard, game, ownerId, null, habilidad); return !(r && r.ok === false); }
                return 'skip';
            }
            // floatingAntes: flotante que suena UNA sola vez, con la elección ya hecha pero antes
            // de aplicar nada (Toto, 7-ago-2026). Hermano de `logAntes`. Hace falta porque los
            // `efectos` de un ELEGIR corren POR OBJETIVO: meter ahí un `op: FLOTANTE` para
            // anunciar la Habilidad lo repetía tantas veces como objetivos (AL-FÉNIX: cuatro
            // "AL-FÉNIX" apilados). Va sobre la carta FUENTE, que es quien actúa.
            const _floatAntes = () => {
                if (!e.floatingAntes || typeof showFloatingText !== 'function') return;
                showFloatingText(sourceCard.instanceId, DSL._fill(e.floatingAntes.texto, { carta: DSL._nombre(game, sourceCard) }),
                    e.floatingAntes.estilo || 'ft-ability', e.floatingAntes.offset !== undefined ? e.floatingAntes.offset : -30);
            };
            const _logAntes = (lista) => {
                // Sin _dispararCobro: resolver una elección NO compromete (puede haber otra
                // detrás, también cancelable). Ahora lo hace DSL._comprometer, ante la primera
                // mutación real. Ver el comentario de ese helper.
                _floatAntes();
                if (!e.logAntes) return;
                const els = lista.map(x => DSL._nombre(game, x)).join(' y ');
                game.logMsg(DSL._fill(e.logAntes, Object.assign({}, (DSL._vars && DSL._vars[sourceCard.instanceId]) || {}, { carta: DSL._nombre(game, sourceCard), elegidos: els })), e.logAntesTipo || 'ability');
            };
            // guardaSuma/guardaNombres: dejan en vars el agregado de los elegidos para
            // efectos posteriores (p. ej. FIJAR_STAT con {REF:"vars.x"}). Se limpian
            // ANTES de elegir para que una cancelación no herede valores de una
            // ejecución anterior de la misma carta.
            const _vs = () => { DSL._vars = DSL._vars || {}; return DSL._vars[sourceCard.instanceId] = DSL._vars[sourceCard.instanceId] || {}; };
            if (e.guardaSuma) delete _vs()[e.guardaSuma.en];
            if (e.guardaNombres) delete _vs()[e.guardaNombres];
            const _guarda = (lista) => {
                if (e.guardaSuma) _vs()[e.guardaSuma.en] = lista.reduce((acc, x) => acc + (Number(DSL._field(x, e.guardaSuma.campo)) || 0), 0);
                if (e.guardaNombres) _vs()[e.guardaNombres] = lista.map(x => DSL._nombre(game, x)).join(' y ');
                // guardaIdEnSelf: ancla el instanceId del elegido EN LA PROPIA CARTA
                // (viaja con exportGameState; lo leen AURA soloSelfId, las reglas de
                // Furor con objetivoSelfId y el PREVIEW_GLOBAL campoSelfId).
                if (e.guardaIdEnSelf && lista[0]) sourceCard[e.guardaIdEnSelf] = lista[0].instanceId;
                // guardaIdsEnSelf: como el anterior pero con TODOS los elegidos, como
                // array (Esfuerzo dividido: chosenAllies; lo leen AURA/_pool soloSelfLista).
                if (e.guardaIdsEnSelf) sourceCard[e.guardaIdsEnSelf] = lista.map(x => x.instanceId);
                // El portador ya se conoce: si esta carta se equipa, su presentación deja de
                // apuntar a la pila de descartes. Va ANTES del marcaje de coste porque el primer
                // efecto no-ELEGIR de la cadena ya dispara la presentación.
                DSL._presentaHaciaElPortador(game, sourceCard, lista[0]);
                if (e.esCoste || e.esRequisito) DSL._marcarCoste(game, lista, e.esRequisito ? 'requisito' : 'coste');
                if (e.esTributo) for (const x of lista) DSL._marcarCoste(game, [x], 'tributo', `Tributa ${Math.abs(e.esTributo)} FUR`);
            };
            const dn = typeof game.getDisplayName === 'function' ? game.getDisplayName(ownerId) : ownerId;
            // F incluye las vars propias de ESTA MISMA elección (p. ej. guardaEn: "maestro"
            // guardado un poco más abajo) para que logDespues pueda referenciarlas — antes
            // solo _logAntes las incluía (Toto, 27-jul-2026, migración de Kazuo/Gladiador).
            const F = (t) => DSL._fill(t, Object.assign({}, (DSL._vars && DSL._vars[sourceCard.instanceId]) || {}, { carta: DSL._nombre(game, sourceCard), jugador: dn }));
            // elegidoPor: "RIVAL" -> quien clica/decide es el rival del dueño de la
            // carta (p. ej. ACERTIJO en cruz). El pool sigue siendo relativo al
            // DUEÑO (de:"ENEMIGOS" = el rival, elija quien elija); solo cambia el
            // destinatario del modal/banner de "esperando a...".
            const chooserId = e.elegidoPor === 'RIVAL' ? (ownerId === 'p1' ? 'p2' : 'p1') : ownerId;
            if (pool.length < n) {
                if (e.siNoElegido) { const r = await DSL._runEffectList(e.siNoElegido, sourceCard, game, ownerId, null, habilidad); return !(r && r.ok === false); }
                return e.opcional ? 'skip' : false;
            }
            if (e.autoSiUnica && pool.length === n) {
                // Única opción posible: se toma sola, sin preguntar (como el pagador único del Té)
                if (e.guardaEn) { DSL._vars = DSL._vars || {}; const _vg = (DSL._vars[sourceCard.instanceId] = DSL._vars[sourceCard.instanceId] || {}); _vg[e.guardaEn] = DSL._nombre(game, pool[0]); _vg[e.guardaEn + 'G'] = pool[0].gender; }
                _guarda(pool);
                _logAntes(pool);
                const _animA = await DSL._animarLote(e.efectos, sourceCard, game, pool);
                for (const t of pool) {
                    const r = await DSL._runEffectList(e.efectos || [], sourceCard, game, ownerId, [t], habilidad, _animA ? { sinAnimacion: true } : null);
                    if (r && r.ok === false) return false;
                }
                if (e.logDespues) game.logMsg(F(e.logDespues), e.logDespuesTipo || 'ability');
                return true;
            }
            // Selección-en-tablero (estilo Bi-choque/Manzanahoria) para mesa; la MANO
            // sigue usando el modal visual. Norma de targeting en tablero (Toto,
            // 21-jul-2026): elegir una carta YA COLOCADA EN EL CAMPO siempre es
            // reborde verde en tablero, nunca el modal genérico — forzarModal debe
            // justificarse caso a caso. pickBoardTargets ya soporta un chooser
            // explícito (chooserId), así que elegidoPor:"RIVAL" también usa tablero.
            // cancelable: false (Toto, 21-jul-2026) en las cartas cuyo coste/moneda ya
            // se comprometió ANTES de llegar a esta elección concreta (ACERTIJO tras
            // la moneda, el 2º ELEGIR de PEM tras pagar el 1º) — auditado caso a caso,
            // no inferido automáticamente.
            // La MANO ya NO cae al modal genérico (Toto, 7-ago-2026): usa el MISMO picker que el
            // tablero con `mano: true`, que oscurece todo menos la mano y deja elegir clicando la
            // carta. Mismo lenguaje visual que elegir en campo, y sin el modal que sacaba las
            // cartas de su sitio. `forzarModal` sigue siendo la vía de escape, a justificar.
            if (!e.forzarModal && typeof game.pickBoardTargets === 'function') {
                const _esMano = e.de === 'MANO';
                // Sin coletilla en la MANO: su velo ya lleva cartel y pista de cancelación
                // (Toto, 7-ago-2026). En el tablero se mantiene, que ahí no hay cartel.
                const _texto = (e.cancelable === false || _esMano) ? '' : ' (clic en el tablero; X para cancelar)';
                // permitirParar / maxPorZona (AL-FÉNIX, 31-jul-2026): parada anticipada con botón
                // OK, y cupo por fila además del total. `hastaCantidad` NO servía para esto:
                // aquel ajusta el cupo a los objetivos disponibles, pero no deja al jugador
                // plantarse cuando quiera teniendo más objetivos a mano.
                const sel = await game.pickBoardTargets(pool, n, DSL._fill(e.titulo || 'Elige objetivo', { carta: DSL._nombre(game, sourceCard) }) + _texto, sourceCard, chooserId, e.cancelable !== false,
                    { permitirParar: !!e.permitirParar, maxPorZona: e.maxPorZona || null, mano: _esMano });
                if (!sel) {
                    if (e.logCancela && !e.opcional) game.logError(F(e.logCancela));
                    if (e.siNoElegido) { const r = await DSL._runEffectList(e.siNoElegido, sourceCard, game, ownerId, null, habilidad); return !(r && r.ok === false); }
                    return e.opcional ? 'skip' : false;
                }
                if (e.guardaEn && sel[0]) { DSL._vars = DSL._vars || {}; const _vg = (DSL._vars[sourceCard.instanceId] = DSL._vars[sourceCard.instanceId] || {}); _vg[e.guardaEn] = DSL._nombre(game, sel[0]); _vg[e.guardaEn + 'G'] = sel[0].gender; }
                _guarda(sel);
                _logAntes(sel);
                const _animB = await DSL._animarLote(e.efectos, sourceCard, game, sel);
                for (const t of sel) {
                    const r = await DSL._runEffectList(e.efectos || [], sourceCard, game, ownerId, [t], habilidad, _animB ? { sinAnimacion: true } : null);
                    if (r && r.ok === false) return false;
                }
                if (e.logDespues) game.logMsg(F(e.logDespues), e.logDespuesTipo || 'ability');
                return true;
            }
            if (e.confirmar) {
                const quiere = await new Promise(resolve => {
                    game.openChoiceModal(F(e.confirmar.titulo), [
                        { label: e.confirmar.si, action: () => resolve(true) },
                        { label: e.confirmar.no || 'CANCELAR', action: () => resolve(false) }
                    ], chooserId);
                });
                if (!quiere) return e.opcional ? 'skip' : false;
            }
            const sel = await game.openVisualSearchModal(F(e.titulo || 'ELIGE'), pool, n, e.autoSeleccion !== false, chooserId);
            if (!sel || sel.length < n) {
                if (e.logCancela && !e.opcional) game.logError(F(e.logCancela));
                if (e.siNoElegido) { const r = await DSL._runEffectList(e.siNoElegido, sourceCard, game, ownerId, null, habilidad); return !(r && r.ok === false); }
                return e.opcional ? 'skip' : false;
            }
            if (e.guardaEn && sel[0]) { DSL._vars = DSL._vars || {}; const _vg = (DSL._vars[sourceCard.instanceId] = DSL._vars[sourceCard.instanceId] || {}); _vg[e.guardaEn] = DSL._nombre(game, sel[0]); _vg[e.guardaEn + 'G'] = sel[0].gender; }
            _guarda(sel);
            _logAntes(sel);
            const _animC = await DSL._animarLote(e.efectos, sourceCard, game, sel);
            for (const t of sel) {
                const r = await DSL._runEffectList(e.efectos || [], sourceCard, game, ownerId, [t], habilidad, _animC ? { sinAnimacion: true } : null);
                if (r && r.ok === false) return false;
            }
            if (e.logDespues) game.logMsg(F(e.logDespues), e.logDespuesTipo || 'ability');
            return true;
        }
        if (e.op === 'DESTRUIR_EVENTO') {
            const pids = e.deQuien === 'AMBOS' ? ['p1', 'p2'] : [e.deQuien === 'RIVAL' ? (ownerId === 'p1' ? 'p2' : 'p1') : ownerId];
            let alguno = false;
            for (const pid of pids) {
                if (game.players[pid].activeEvent) { await game.destroyEvent(pid); alguno = true; }
            }
            return alguno ? true : 'skip';
        }
        if (e.op === 'MARCAR_TEMPORAL') {
            if (!target.tempEffects) target.tempEffects = [];
            const marca = { sourceId: sourceCard.id, sourceInstanceId: sourceCard.instanceId };
            // habilidad (Toto, 5-ago-2026): QUÉ Pasiva/Activa dejó la marca, para que el detalle
            // pueda decir "por SABIDURÍA" igual que ya hace con estados alterados y contadores.
            // El nombre llega hasta aquí por el mismo parámetro que ya usaba APLICAR_ESTADO; la
            // marca es lo único que sobrevive a la ejecución, así que tiene que viajar EN ELLA
            // (es serializable: un string, sin problema para exportGameState).
            if (habilidad) marca.habilidad = habilidad;
            if (e.conOwner) marca.ownerId = ownerId;
            if (e.hastaFinDeTurnoPropio) marca.hastaFinDeTurnoPropio = true; // se limpia al acabar el turno del dueño de la carta marcada
            // duracion (Poción revitalizante, 27-jul-2026): opt-in — solo las cartas que la
            // declaran ganan estos dos campos. El DSL solo ESTAMPA la marca (duration = N,
            // turnApplied = turno actual); decrementar la cuenta sigue siendo cosa del propio
            // onEndTurnTempEffect imperativo de la carta (no hay aún un trigger DSL genérico
            // para cuentas atrás de varios turnos — sería una arquitectura nueva, como
            // PASIVA_CONTINUA o REACCION, que no compensa para una sola carta).
            if (e.duracion !== undefined) { marca.duration = e.duracion; marca.turnApplied = game.turn; }
            // stats (Capitán Guardia Real, LIDERAZGO, 28-jul-2026): bono continuo de Atq/Def
            // mientras la marca dure, sin necesidad de un onUpdateTempEffect escrito a mano —
            // el compilador wire uno genérico más abajo (ver el guard "MARCAR_TEMPORAL" en
            // JSON.stringify(abs)) cuando ninguna otra cosa lo haya declarado ya.
            if (e.stats) marca.stats = e.stats;
            // vetoAtaqueNormal (Clarise, PESANTEZ MUTUA, 28-jul-2026): mientras la marca dure,
            // la carta marcada no puede hacer ataques NORMALES (sí Habilidades que no ataquen).
            // Simétrico de `stats`: aquel es un bono continuo, este un veto continuo. El
            // compilador wire el onBeforeAttackTempEffect genérico más abajo.
            if (e.vetoAtaqueNormal) marca.vetoAtaqueNormal = true;
            // hastaInicioTurnoLanzador: caduca al EMPEZAR el siguiente turno del jugador que la
            // puso (marca.ownerId, así que exige `conOwner`), o sea que cubre exactamente el
            // turno del rival. Distinto de `hastaFinDeTurnoPropio`, que mira al dueño de la
            // carta MARCADA y caduca al final de su turno.
            if (e.hastaInicioTurnoLanzador) marca.hastaInicioTurnoLanzador = true;
            // provocaAtaque (Achmay, 31-jul-2026): ver el onStartTurnTempEffect genérico más
            // abajo (guard "MARCAR_TEMPORAL" en JSON.stringify(abs)).
            if (e.provocaAtaque) marca.provocaAtaque = true;
            // cuentaAtras (equipos con temporizador, 31-jul-2026): la marca baja UNA unidad por
            // cada turno propio del dueño de la carta marcada y, al llegar a 0, dispara efectos.
            // Hasta ahora `duracion` solo ETIQUETABA la marca y decrementar era cosa del
            // onEndTurnTempEffect imperativo de cada carta (así lo hace todavía Poción
            // revitalizante); con tres cartas de equipo pidiendo lo mismo ya compensa el hook
            // genérico. En la marca solo viaja el FLAG y el contador: los efectos viven en la
            // plantilla (viajan en exportGameState y no son serializables), igual que
            // `tempEffectVetoLog` o `tempEffectText`.
            if (e.cuentaAtras) {
                marca.cuentaAtras = true;
                marca.duration = e.duracion !== undefined ? e.duracion : (e.cuentaAtras.turnos || 1);
                marca.turnApplied = game.turn;
                marca.cuentaTotal = marca.duration;
            }
            target.tempEffects.push(marca);
            if (e.floating && typeof showFloatingText === 'function') showFloatingText(target.instanceId, e.floating.texto || e.floating, e.floating.estilo || e.floatingStyle || 'ft-ability', (e.floating.offset !== undefined ? e.floating.offset : (e.offsetFloating !== undefined ? e.offsetFloating : -40)));
            if (e.log) game.logMsg(DSL._fill(e.log, { carta: DSL._nombre(game, sourceCard), objetivo: DSL._nombre(game, target) }), e.logTipo || 'ability');
            if (e.actualizaPasivas && typeof game.updatePassives === 'function') game.updatePassives();
            return true;
        }
        if (e.op === 'VER_MANO') {
            const quien = e.deQuien === 'PROPIO' ? ownerId : (ownerId === 'p1' ? 'p2' : 'p1');
            game.openHandViewer(quien, ownerId);
            return true;
        }
        if (e.op === 'LIMPIAR_ESTADOS') {
            const pid = e.deQuien === 'RIVAL' ? (ownerId === 'p1' ? 'p2' : 'p1') : ownerId;
            const p = game.players[pid];
            // soloObjetivo (Súper Evolución, 31-jul-2026): el op nació como efecto de GRUPO
            // (limpia a toda una fila), pero "elimina sus estados alterados" de un equipo va
            // sobre UNA carta. Sin esto habría que recurrir a MARCAR con un objeto literal,
            // que además compartiría referencia entre invocaciones.
            const _pool = e.soloObjetivo ? [target] : [...p.vanguard, ...p.rearguard];
            _pool.forEach(ally => {
                if (!ally.status) return;
                let limpiado = false;
                if (e.todos) {
                    if (Object.keys(ally.status).length > 0) { ally.status = {}; limpiado = true; }
                } else for (const k of (e.estados || [])) {
                    if (ally.status[k]) { delete ally.status[k]; limpiado = true; }
                }
                if (limpiado && e.floating && typeof showFloatingText === 'function') showFloatingText(ally.instanceId, e.floating, e.floatingStyle || 'ft-green', e.offsetFloating !== undefined ? e.offsetFloating : -20);
            });
            return true;
        }
        return true;
    },

    // ¿Sobre qué carta del TABLERO se ancla la animación de un efecto? La fuente, si está
    // en juego (Habilidades: Edrielle y su TORMENTA PERFECTA). Si la fuente es una Ayuda,
    // no sirve: se juega desde la mano y va directa al descarte, así que no tiene ninguna
    // carta en el tablero que animar — ahí canaliza QUIEN PAGA el coste, que el compilador
    // de AL_USAR_AYUDA deja anotado en __pagador. Devuelve null si no hay a qué anclarse
    // (la animación se salta sola y el efecto sigue su curso).
    _lanzador(sourceCard) {
        if (!sourceCard) return null;
        if (sourceCard.location === 'vanguard' || sourceCard.location === 'rearguard') return sourceCard.instanceId;
        const v = (DSL._vars || {})[sourceCard.instanceId];
        return (v && v.__pagador) || null;
    },

    // ELEGIR corre sus efectos UNA VEZ POR ELEGIDO (ver los tres bucles `for (const t of
    // sel)`), así que una animación declarada ahí dentro se recanalizaría en cada objetivo
    // — Granada de maná con 2 elegidos disparaba dos casteos seguidos. Esto la saca fuera
    // del bucle: se anima el LOTE entero de una vez y luego se le dice a _runEffectList que
    // no la repita. Devuelve el efecto animado (o null) para que la supresión sea PRECISA:
    // si la animación vive más adentro (otro ELEGIR, un siExito), aquí no se encuentra, no
    // se suprime nada y la anima quien corresponda.
    async _animarLote(efectos, sourceCard, game, lista) {
        const e = (efectos || []).find(x => x.animacion === 'DANO_VERDADERO');
        if (!e || !lista || !lista.length || typeof animateTrueDamage !== 'function') return null;
        // Aquí ya está decidido que HAY animación de efecto, así que este es el punto exacto en
        // el que la carta debe estar presentada: el casteo forma parte del efecto y va detrás
        // (§14). Ponerlo en la llamada, fuera, disparaba también cuando el lote no animaba nada
        // — y con Atomización eso significaba presentarla al elegir el pagador, cuando todavía
        // se puede cancelar (Toto, 8-ago-2026).
        await DSL._comprometer(sourceCard, game);
        await animateTrueDamage(DSL._lanzador(sourceCard), lista.map(t => t.instanceId));
        return e;
    },

    async _runEffectList(efectos, sourceCard, game, ownerId, fallbackTargets, habilidad, opts) {
        let anyApplied = false;
        for (const e of (efectos || [])) {
            if (e.if && !DSL._cond(sourceCard, game, e.if)) continue; // condición evaluada sobre la carta fuente
            if (e.op === 'ROBAR' || e.op === 'RETRIBUCION') { // afectan al jugador, no a cartas: una sola ejecución
                const r = await DSL._doEffect(e, sourceCard, null, game, ownerId, habilidad);
                if (r === true) anyApplied = true;
                continue;
            }
            const tspec = e.target;
            const targets = (!tspec || tspec === 'OBJETIVO') ? (Array.isArray(fallbackTargets) ? fallbackTargets : [fallbackTargets]) : DSL._pool(ownerId, game, tspec, sourceCard);
            if (!targets.length && e.logSiVacio) game.logMsg(DSL._fill(e.logSiVacio, Object.assign({}, (DSL._vars && DSL._vars[sourceCard.instanceId]) || {}, { carta: DSL._nombre(game, sourceCard) })), e.logSiVacioTipo || 'system');
            // guardaIdsEnSelf (Cogorza, 31-jul-2026): deja en la carta fuente los instanceId del
            // pool que este efecto ha resuelto, para que efectos POSTERIORES puedan volver a
            // alcanzar EXACTAMENTE a esos mismos (target:{selfLista} / AURA soloSelfLista) aunque
            // el campo cambie luego. Mismo nombre y semántica que el `guardaIdsEnSelf` que ELEGIR
            // ya tenía; aquí sirve para pools automáticos, sin elección del jugador. Cogorza lo
            // necesita porque su +2 DEF y su curación al expirar son "para los que bebieron", no
            // "para quien esté en vanguardia en ese momento".
            // Se EXCLUYE ELEGIR: ese op guarda los suyos por su cuenta (los ELEGIDOS, no el pool
            // ofrecido) y además suele correr sin `target`, así que aquí sus "targets" serían los
            // fallback -null en Eventos-, machacando el campo con basura (rompía Esfuerzo
            // dividido: chosenAllies). El filter(Boolean) protege ese mismo caso en general.
            if (e.guardaIdsEnSelf && e.op !== 'ELEGIR') sourceCard[e.guardaIdsEnSelf] = targets.filter(Boolean).map(t => t.instanceId);
            // Coste/Requisito: se anota QUIÉN lo paga o lo cumple para que la presentación
            // pueda dibujarlo. `_marcarCoste` es idempotente por id, así que un mismo aliado
            // marcado por dos vías no sale dos veces.
            if ((e.esCoste || e.esRequisito) && e.op !== 'ELEGIR') {
                const _vivos = targets.filter(Boolean);
                if (e.esRequisito) DSL._marcarCoste(game, _vivos, 'requisito');
                else if (e.op === 'MODIFICAR_STAT' && e.stat === 'furor') {
                    // Un tributo de Furor: la carta NO se pierde, solo paga. Etiqueta por
                    // objetivo, porque la cantidad puede ser distinta en cada uno.
                    for (const t of _vivos) {
                        const d = Math.abs(DSL._deltaStat(e, sourceCard, t, game, ownerId));
                        DSL._marcarCoste(game, [t], 'tributo', `Tributa ${d} FUR`);
                    }
                } else DSL._marcarCoste(game, _vivos, 'coste');
            }
            // El cobro se aparca hasta el escaparate (ver _marcarCoste). Sin presentación
            // armada -una Activa, un efecto de campo- se ejecuta aquí y ahora, como siempre.
            if (e.esCoste && game._presentacionArmada && e.op !== 'ELEGIR') {
                const _tg = targets.filter(Boolean);
                (game._cobrosPendientes = game._cobrosPendientes || []).push(async () => {
                    for (const t of _tg) await DSL._doEffect(e, sourceCard, t, game, ownerId, habilidad);
                });
                // Aparcar cambia DÓNDE se ejecuta el efecto, nunca SI se ejecuta. Sin este
                // _comprometer, un coste que fuera el último de su lista no lo drenaba nadie:
                // ni él (acaba de saltárselo) ni un efecto posterior (no lo hay). La carta se
                // quedaba además sin presentar, porque el disparo cuelga del mismo sitio.
                await DSL._comprometer(sourceCard, game);
                continue;
            }
            // Animación declarativa de efecto (Toto, 30-jul-2026). Va AQUÍ y no dentro de
            // _doEffect a propósito: aquí la lista de objetivos ya está resuelta ENTERA, así
            // que el "casteo" suena UNA sola vez y los impactos se reparten entre todos —
            // TORMENTA PERFECTA golpea a todo el campo enemigo y con un enganche por objetivo
            // se habría recanalizado en cada uno. Corre ANTES del daño para que los números
            // salgan como consecuencia del impacto, no antes que él.
            // La presentación va ANTES de la animación del efecto (Toto, 8-ago-2026): estaba
            // dentro de _doEffect, que corre DESPUÉS del bloque de animación de abajo, así que
            // con Atomización se veía el casteo primero -sin daño ni flotantes, porque aún no
            // había pasado nada- y la carta se presentaba después. §14: primero se presenta, y
            // recién entonces empieza el efecto, animación incluida.
            // Cualquier efecto que NO sea una elección ya cambia algo: punto de compromiso.
            if (e.op !== 'ELEGIR' && e.op !== 'BUSCAR') await DSL._comprometer(sourceCard, game);
            if (e.animacion === 'DANO_VERDADERO' && targets.length && !(opts && opts.sinAnimacion) && typeof animateTrueDamage === 'function') {
                await animateTrueDamage(DSL._lanzador(sourceCard), targets.map(t => t.instanceId));
            }
            // logResumen (Consagración, 7-ago-2026): UN log agregado para un efecto que se aplica
            // a TODO un grupo, en vez de silencio o un log por carta. Genérico -no es cosa de
            // CURAR- porque cualquier efecto de grupo puede querer lo mismo el día de mañana.
            // El delta se lee del `campo` ANTES/DESPUÉS de verdad (currentHp por defecto), nunca
            // del `valor` declarado: así el número que sale es el que de verdad ocurrió, aunque
            // algún día un interceptor lo cambie a un carga a medias (0.5) — y si en algún target
            // se queda en 0, ese no entra en la lista (pedido de Toto).
            const _resumen = e.logResumen ? [] : null;
            const _campoResumen = (e.logResumen && e.logResumen.campo) || 'currentHp';
            // CANDADO DE RECOLOCACIÓN (Toto, 14-ago-2026): si este efecto puede matar a VARIOS a
            // la vez, la retaguardia no sube hasta que hayan caído todos. Si no, los de atrás se
            // van metiendo en los huecos entre muerte y muerte -con Némesis, en los que ella
            // venía a ocupar-. Se echa aquí, en el bucle de objetivos, porque es EL punto por el
            // que pasa cualquier efecto de grupo; no hace falta tocar ninguna carta.
            const _puedeMatarVarios = targets.length > 1 && e.op === 'MODIFICAR_STAT'
                && e.stat === 'currentHp' && (e.vaciar || e.comprobarMuerte);
            const _correrObjetivos = async () => {
            for (const t of targets) {
                // ifObjetivo (Imp mayor, 31-jul-2026): condición evaluada sobre EL OBJETIVO en
                // vez de la carta fuente -complementa a `e.if`, que mira la fuente-. Hacía falta
                // para "drena 1 Furor SI el atacante tiene Furor" (TRAS_DEFENDER: la fuente es
                // quien defiende, el objetivo es quien ataca). `continue`, no abortar la lista:
                // un objetivo sin cumplir la condición simplemente se salta.
                if (e.ifObjetivo && !DSL._match(t, e.ifObjetivo)) continue;
                const _antesResumen = _resumen ? DSL._field(t, _campoResumen) : null;
                const r = await DSL._doEffect(e, sourceCard, t, game, ownerId, habilidad);
                if (r === false) return { ok: false };   // aborta el lote; lo propaga _rc, abajo
                if (r === true) anyApplied = true;
                if (_resumen && r === true) {
                    const delta = DSL._field(t, _campoResumen) - _antesResumen;
                    if (delta > 0) _resumen.push({ nombre: DSL._nombre(game, t), delta });
                }
            }
            return { ok: true };
            };
            const _rc = (_puedeMatarVarios && typeof game.sinRecolocarHasta === 'function')
                ? await game.sinRecolocarHasta(_correrObjetivos)
                : await _correrObjetivos();
            if (_rc && _rc.ok === false) return { ok: false, anyApplied };
            if (_resumen && _resumen.length) {
                const mismos = _resumen.every(x => x.delta === _resumen[0].delta);
                // "A, B y C" (NEO._enumerar hace lo mismo, pero vive en otro objeto del fichero).
                const _enum = (xs) => xs.length <= 1 ? (xs[0] || '') : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1];
                const lista = mismos ? _enum(_resumen.map(x => x.nombre))
                                      : _enum(_resumen.map(x => `${x.nombre} (+${x.delta})`));
                const msg = mismos ? (e.logResumen.msg || e.logResumen.msgVariado)
                                    : (e.logResumen.msgVariado || e.logResumen.msg);
                game.logMsg(DSL._fill(msg, { carta: DSL._nombre(game, sourceCard), delta: _resumen[0].delta, lista, n: _resumen.length }),
                    e.logResumen.tipo || 'ability');
            }
        }
        return { ok: true, anyApplied };
    },

    // --- REACCIONES DESDE LA MANO (trigger REACCION) ---
    // Intérprete de efectos EN CONTEXTO DE REACCIÓN. A diferencia de _runEffectList,
    // resuelve `quien` contra {atacante, defensor} del combate en curso (como
    // GLOBAL_TRAS_ATAQUE) y entiende los ops de protocolo que moldean el RESULTADO
    // que la reacción devuelve al motor (result): redirigir el ataque, cancelarlo,
    // drenar Furor tras él, fijar el daño, autoataque del atacante. Los ops
    // genéricos (MODIFICAR_STAT, BUSCAR, APLICAR_ESTADO…) se delegan a _doEffect con
    // el objetivo ya resuelto. `result` se muta in situ; result.abortar aborta la
    // reacción sin consumir la carta (p. ej. cancelar la elección de Pequeña traición).
    async _runReaccion(efectos, handCard, game, cx, result) {
        const reactor = handCard.owner;
        const RF = (txt, extra) => DSL._fill(txt, Object.assign({
            carta: handCard.name,
            atacante: DSL._nombre(game, cx.attacker), atacanteG: cx.attacker.gender,
            defensor: DSL._nombre(game, cx.defensor), defensorG: cx.defensor.gender,
            reactor: (typeof game.getDisplayName === 'function' ? game.getDisplayName(reactor) : reactor),
        }, extra || {}));
        for (const e of (efectos || [])) {
            if (result.abortar) return;
            if (e.if && !DSL._cond(handCard, game, e.if)) continue;
            const objetivo = e.quien === 'ATACANTE' ? cx.attacker
                           : e.quien === 'DEFENSOR' ? cx.defensor
                           : e.quien === 'SELF' ? handCard
                           : cx.defensor;
            if (e.op === 'REDIRIGIR') {
                const p = game.players[reactor];
                const pool = [...p.vanguard, ...p.rearguard].filter(c => c.instanceId !== cx.defensor.instanceId);
                if (!pool.length) continue; // sin objetivo al que redirigir (ya filtrado por el gate)
                let sel = null;
                if (typeof game.pickBoardTargets === 'function') {
                    const r = await game.pickBoardTargets(pool, 1, RF(e.titulo || 'ELIGE A LA NUEVA VÍCTIMA'), handCard, reactor, e.cancelable !== false);
                    sel = r && r[0];
                } else {
                    const r = await game.openVisualSearchModal(RF(e.titulo || 'ELIGE A LA NUEVA VÍCTIMA'), pool, 1, false, reactor);
                    sel = r && r[0];
                }
                if (!sel) { result.abortar = true; return; } // elección cancelada: la carta NO se consume
                result.newDefender = sel;
                if (e.log) game.logMsg(RF(e.log.msg, { objetivo: DSL._nombre(game, sel), objetivoG: sel.gender }), e.log.tipo || 'ability');
                if (e.floating && typeof showFloatingText === 'function') showFloatingText(sel.instanceId, e.floating.texto, e.floating.estilo || 'ft-purple', e.floating.offset !== undefined ? e.floating.offset : -30);
                continue;
            }
            if (e.op === 'CANCELAR_ATAQUE') { result.cancelAttack = true; continue; }
            if (e.op === 'MARCAR_DRENAJE') { result.drainFurorAfter = true; continue; }
            if (e.op === 'FIJAR_DAÑO') {
                if (e.reducir !== undefined) {
                    // Baja el daño de este golpe en N, con el mínimo de siempre (0.5 si
                    // Esbirro ataca a Personaje, si no 1). Frasco maldito: -2.
                    let nd = (result.newDmg !== undefined ? result.newDmg : 0) - e.reducir;
                    if (nd <= 0) nd = (cx.attacker.type === 'Esbirro' && cx.defensor.type === 'Personaje') ? 0.5 : 1;
                    result.newDmg = nd;
                } else {
                    result.newDmg = (e.valor !== undefined ? e.valor : 0);
                }
                continue;
            }
            if (e.op === 'ATACANTE_SE_AUTOATACA') {
                const a = cx.attacker;
                let dmg = a.currentAtk - a.currentDef;
                if (dmg <= 0) dmg = 1;
                if (e.log) game.logMsg(RF(e.log.msg), e.log.tipo || 'combat');
                await game.dealDamage(a, a, dmg, false);
                continue;
            }
            if (e.op === 'MONEDA') {
                const res = await game.triggerCoinFlips(e.cantidad || 1, reactor);
                const cruz = res && res[0] === 'tails';
                if (cruz) {
                    if (e.logCruz) game.logMsg(RF(e.logCruz.msg), e.logCruz.tipo || 'combat');
                    if (Array.isArray(e.cruz)) await DSL._runReaccion(e.cruz, handCard, game, cx, result);
                } else {
                    if (e.logCara) game.logMsg(RF(e.logCara.msg), e.logCara.tipo || 'combat');
                    if (Array.isArray(e.cara)) await DSL._runReaccion(e.cara, handCard, game, cx, result);
                }
                continue;
            }
            // Op genérico: se delega al ejecutor normal con el objetivo ya resuelto.
            const e2 = Object.assign({}, e); delete e2.quien;
            await DSL._doEffect(e2, handCard, objetivo, game, reactor, null);
        }
    },

    // Comprueba el gate `si` de una reacción (¿siquiera se ofrece el modal?).
    _reaccionGate(si, handCard, game, cx) {
        si = si || {};
        if (si.soloAtaqueNormal) { const esNormal = !game.abilityContext || game.abilityContext.isNormalAttack; if (!esNormal) return false; }
        if (si.soloDañoNormal && cx.isSpecial) return false;
        if (si.defensorEsPropio && cx.defensor.owner !== handCard.owner) return false;
        if (si.atacanteNoAvatar && (getCardTemplate(cx.attacker.id) || {}).isAvatar) return false;
        if (si.atacante && !DSL._cmp(DSL._field(cx.attacker, si.atacante.campo), si.atacante.op, si.atacante.valor)) return false;
        if (si.defensor && !DSL._cmp(DSL._field(cx.defensor, si.defensor.campo), si.defensor.op, si.defensor.valor)) return false;
        return true;
    },

    // Pregunta SÍ/NO al reactor (modal de reacción) y devuelve la promesa booleana.
    // Pasa el contexto de combate (atacante/defensor) para que el modal muestre ambas
    // cartas bajo el prompt (atacante → "Atacando a" → objetivo), con hover = detalle.
    _reaccionPrompt(prompt, handCard, game, cx) {
        return new Promise(resolve => {
            game.openChoiceModal(prompt, [
                { label: 'SÍ', action: () => resolve(true) },
                { label: 'NO REACCIONAR', action: () => resolve(false) },
            ], handCard.owner, cx ? { reaccion: { atacante: cx.attacker, defensor: cx.defensor, mano: handCard } } : null);
        });
    },

    validate(tmpl) {
        const errs = [];
        (tmpl.abilities || []).forEach((ab, i) => {
            if (!DSL.TRIGGERS.includes(ab.trigger)) errs.push(`abilities[${i}]: trigger desconocido '${ab.trigger}'`);
            const effs = [...(ab.then || []), ...(ab.else || []), ...(ab.efectos || [])];
            effs.forEach((e, j) => {
                if (e.if) return;
                if (!DSL.OPS_EFECTO.includes(e.op)) errs.push(`abilities[${i}] efecto[${j}]: op desconocida '${e.op}'`);
                if (e.target && typeof e.target === 'object' && e.target.quien !== undefined && !DSL.QUIEN.includes(e.target.quien)) errs.push(`abilities[${i}] efecto[${j}]: target.quien inválido`);
            });
            effs.forEach((e, j) => {
                [...(e.siExito || []), ...(e.cara || []), ...(e.cruz || [])].forEach((s, k) => { if (!s.if && !DSL.OPS_EFECTO.includes(s.op)) errs.push(`abilities[${i}] efecto[${j}] rama[${k}]: op desconocida '${s.op}'`); });
                if (e.if && e.op && !DSL.OPS_EFECTO.includes(e.op)) errs.push(`abilities[${i}] efecto[${j}]: op desconocida '${e.op}'`);
            });
            [...(ab.validarObjetivo || [])].forEach((v, j) => {
                if (v.op && !DSL.OPS_CMP.includes(v.op)) errs.push(`abilities[${i}] validarObjetivo[${j}]: op inválida '${v.op}'`);
            });
            [...(ab.requisitos || []), ...(ab.requisitosObjetivo || [])].forEach((r, j) => {
                if (r.op && !DSL.OPS_CMP.includes(r.op)) errs.push(`abilities[${i}] requisito[${j}]: op inválida '${r.op}'`);
            });
            if (ab.if && ab.if.op && !DSL.OPS_CMP.includes(ab.if.op)) errs.push(`abilities[${i}]: if.op inválida`);
        });
        if (errs.length) { console.error(`[DSL] Carta "${tmpl.name}" NO compilada:\n  - ` + errs.join('\n  - ')); return false; }
        return true;
    },

    compile(tmpl) {
        if (!DSL.validate(tmpl)) return false;
        const abs = tmpl.abilities || [];

        // Atribución por defecto de una habilidad de UNIDAD (Toto, 5-ago-2026). El "por
        // NOMBREHABILIDAD" del detalle depende de que el nombre llegue hasta el efecto, y varios
        // disparadores no lo pasaban: SABIDURÍA (AL_JUGAR) dejaba su bono sin firmar. Se hace en
        // el compilador y no carta a carta porque es la regla de siempre: la firma es la Pasiva
        // salvo que la habilidad declare otra en `nombre`. Solo para Personajes/Esbirros: en
        // Eventos y Ayudas la gramática OMITE el "por HABILIDAD" (basta la carta), así que ahí
        // devuelve null a propósito.
        const _esUnidad = tmpl.type === 'Personaje' || tmpl.type === 'Esbirro';
        const _habDeCarta = (a) => (a && a.nombre) || (_esUnidad ? (tmpl.passiveName || null) : null);

        const passives = abs.filter(a => a.trigger === 'PASIVA_CONTINUA');
        // SUELO_STAT / TECHO_STAT -> se declaran en la plantilla para que updatePassives los
        // aplique como CLAMP FINAL ("sus stats no pueden bajar/subir de tal valor, bajo ningún
        // concepto"), DESPUÉS de equipos/eventos/temporales y del tope 0-9. Aplicarlos dentro de
        // la pasiva no serviría: lo procesado después podría volver a saltarse el límite (así
        // era el bug con la Chaqueta metálica sobre Sadame -retornada- antes de este cambio).
        // SUELO_STAT usa la base de PLANTILLA (no baja de ahí); TECHO_STAT usa un valor FIJO
        // (`valor`, p. ej. "Def máxima 6" de Karolina, no ligado a su base).
        if (passives.length && !tmpl.sueloStats && !tmpl.techoStats) {
            const _suelos = [], _techos = [];
            let _nombreLimite = null;
            // El propio SUELO_STAT/TECHO_STAT puede llevar un `nombre` propio (Toto,
            // 27-jul-2026): hace falta cuando el resto de la ability (el REF que reaplica un
            // contador) se atribuye a OTRA habilidad distinta de la que pone el límite —
            // Karolina: el +Def lo da la Activa HOSTIA MÁGICA TERRIBLE, pero el techo de 6 SÍ
            // es de su Pasiva HUESO DURO. Si no se especifica, cae al nombre de la ability.
            const _recoge = (efs, nombreAb) => (efs || []).forEach(e => {
                if (e.if) { _recoge(e.then, nombreAb); _recoge(e.else, nombreAb); return; }
                if (e.op === 'SUELO_STAT' && e.stat) { _suelos.push(e.stat); _nombreLimite = _nombreLimite || e.nombre || nombreAb; }
                if (e.op === 'TECHO_STAT' && e.stat) { _techos.push({ stat: e.stat, valor: e.valor }); _nombreLimite = _nombreLimite || e.nombre || nombreAb; }
            });
            passives.forEach(ab => { _recoge(ab.then, ab.nombre); _recoge(ab.else, ab.nombre); });
            if (_suelos.length) tmpl.sueloStats = [...new Set(_suelos)];
            if (_techos.length) tmpl.techoStats = _techos;
            if (_suelos.length || _techos.length) tmpl.sueloNombre = _nombreLimite || tmpl.passiveName || 'PASIVA';
        }
        if (passives.length && typeof tmpl.onUpdatePassive !== 'function') {
            tmpl.onUpdatePassive = function (card, game) {
                // Las pasivas solo actúan con la carta EN MESA (mano/mazo/descartes quedan intactos).
                const pl = game.players && game.players[card.owner];
                if (!pl || ![...pl.vanguard, ...pl.rearguard].some(x => x.instanceId === card.instanceId)) return;
                passives.forEach((ab, i) => {
                    const efs = DSL._cond(card, game, ab.if) ? ab.then : (ab.else || []);
                    const d = DSL._passiveDeltas(card, game, efs);
                    // nombre real de la habilidad que produce ESTE Atq/Def (Toto, 27-jul-2026):
                    // no siempre es la Pasiva de la carta (passiveName) — Xidachane/Karolina
                    // reaplican aquí un bono que en realidad concedió su ACTIVA (FRUSTRACIÓN /
                    // HOSTIA MÁGICA TERRIBLE) al incrementar un contador propio; la pasiva en sí
                    // solo lleva la cuenta o pone un techo. Se calcula ANTES del guard de
                    // `silencioso` (más abajo) y se deja en la carta para que el registro
                    // genérico de Atq/Def (el _anota del bucle principal en updatePassives,
                    // index.html) lo use en vez de asumir siempre template.passiveName.
                    const _nombreReal = ab.nombre || tmpl.passiveName || 'PASIVA';
                    card._pasivaHabilidadReal = _nombreReal;
                    card.currentAtk += d.atk;
                    card.currentDef += d.def;
                    DSL._passiveExtras(card, game, efs, _nombreReal); // MARCAR (no son deltas)

                    // Vida Máx.: a diferencia de atk/def, maxHp NO se resetea cada pasada (persiste
                    // entre pasadas como cualquier stat normal), así que d.hp no es un delta a sumar
                    // sin más: es el valor TOTAL que la pasiva aporta EN ESTA pasada. Se compara con
                    // lo aportado en la pasada anterior (guardado en card[hpKey]) y solo se aplica la
                    // DIFERENCIA — igual que hacían a mano Fanático/Xidachane/Gladiador. Suelo de
                    // seguridad a 1 de Vida si la diferencia es negativa (mismo criterio que ellos).
                    let diffHp = 0;
                    {
                        // OJO: NO se puede condicionar este bloque a `if (d.hp)` — cuando el boost
                        // vuelve a 0 (la pasiva se desactiva del todo), d.hp también es 0, y aun así
                        // hay que aplicar el diff negativo para devolver la Vida Máx. Bug real
                        // encontrado y corregido con un probe: Fanático se quedaba con la Vida Máx.
                        // hinchada al perder todos sus aliados 'Monstruo'.
                        const hpKey = '_dslPasHp' + i;
                        const prevHp = card[hpKey] || 0;
                        diffHp = d.hp - prevHp;
                        if (diffHp !== 0) {
                            card.maxHp += diffHp;
                            if (diffHp > 0) {
                                // Ganar el bono sube AMBAS (es una Vida extra de verdad, no solo techo).
                                card.currentHp += diffHp;
                            } else {
                                // Perderlo baja SOLO la Vida Máx.; la actual únicamente se recorta si
                                // se sale del nuevo techo (Toto, 27-jul-2026, betasteo de Gladiador):
                                // restarla siempre era doblemente incorrecto — quitaba 1 de Vida a
                                // quien no estaba a tope, y el viejo suelo "no bajar de 1" CURABA a
                                // quien estuviera por debajo (0.5 -> 1). Con el recorte, quien está a
                                // tope pierde 1 (6/6 -> 5/5) y quien no, conserva su Vida (0.5/6 -> 0.5/5).
                                if (card.currentHp > card.maxHp) card.currentHp = card.maxHp;
                                // "Su Vida no puede llegar a 0 tras perderlo": red de seguridad para que
                                // el recorte nunca mate por sí solo (0.5 es el mínimo vivo del juego,
                                // por las medias Vidas de Esbirro contra Personaje).
                                if (card.currentHp <= 0 && card.maxHp > 0) card.currentHp = 0.5;
                            }
                            card[hpKey] = d.hp;
                        }
                        // "Afectado por:" (Toto, 27-jul-2026): el registro automático de
                        // updatePassives (_anota) solo diffea Atq/Def, no maxHp — se declara
                        // explícitamente el valor TOTAL actual (no el diff) para que la línea
                        // muestre siempre el bonus vigente, incluso en pasadas donde d.hp no cambió.
                        // Con d.hp=0 no hay nada que declarar (no hay línea "+0 VIDA MÁX.").
                        if (d.hp && typeof game.registrarStatMod === 'function') {
                            game.registrarStatMod(card, {
                                stat: 'VIDA MÁX.', delta: d.hp, fuente: _nombreReal, ref: 'esta carta',
                                habilidad: ab.silencioso ? null : _nombreReal, turnos: null,
                                srcId: card.instanceId, srcAltId: null, srcZone: null,
                            });
                        }
                    }

                    if (ab.silencioso) return; // sin log ni floating (p. ej. Karlos (KL), Spencer): solo aplica el delta
                    // Anuncio (estilo Karlos): al activarse o CAMBIAR de intensidad; 'desactivada'
                    // al volver a 0. Antes solo avisaba al SUBIR (mag > prev), así que una pasiva
                    // escalable que PIERDE fuerza sin llegar a 0 (Fanático al morir uno de sus
                    // aliados 'Monstruo' teniendo más de uno) cambiaba los stats en silencio —
                    // Toto lo notó betasteando. Ahora cualquier cambio de magnitud se anuncia,
                    // que es lo que hacía la Fanático vieja (avisaba de cualquier diff, ± incluido).
                    const mag = Math.abs(d.atk) + Math.abs(d.def) + Math.abs(d.hp);
                    const key = '_dslPas' + i;
                    const prev = card[key] || 0;
                    const nombre = _nombreReal;
                    if (mag !== prev && mag > 0) {
                        // Orden VIDA -> DEF -> ATQ, como en la cara de la carta y en "Afectado por:".
                        const partes = [];
                        if (d.hp) partes.push((d.hp > 0 ? '+' : '') + d.hp + ' de Vida Máx.');
                        if (d.def) partes.push((d.def > 0 ? '+' : '') + d.def + ' de Def');
                        if (d.atk) partes.push((d.atk > 0 ? '+' : '') + d.atk + ' de Atq');
                        // retrasoSiRecienJugada: espera N ms si la carta ACABA de entrar en juego,
                        // para que el anuncio no se pise con la animación de colocación (Kyle lo
                        // hacía a mano con un setTimeout de 450 ms; se conserva como flag).
                        const _emitir = () => {
                            game.logMsg(`¡Habilidad pasiva de ${DSL._nombre(game, card)}: ${nombre} tiene lugar! (${partes.join(', ')})`, 'ability');
                            if (typeof showFloatingText === 'function') {
                                showFloatingText(card.instanceId, nombre, 'ft-ability', -40);
                                if (d.hp) showFloatingText(card.instanceId, (d.hp > 0 ? '+' : '') + d.hp + ' VIDA MÁX.', d.hp > 0 ? 'ft-green' : 'ft-red-stat', -30);
                                if (d.def) showFloatingText(card.instanceId, (d.def > 0 ? '+' : '') + d.def + ' DEF', d.def > 0 ? 'ft-green' : 'ft-red-stat', -20);
                                if (d.atk) showFloatingText(card.instanceId, (d.atk > 0 ? '+' : '') + d.atk + ' ATQ', d.atk > 0 ? 'ft-green' : 'ft-red-stat', -10);
                            }
                        };
                        if (ab.retrasoSiRecienJugada && card.justPlayed) setTimeout(_emitir, ab.retrasoSiRecienJugada);
                        else _emitir();
                    } else if (prev > 0 && mag === 0) {
                        // Misma forma que el anuncio de activación de arriba (Toto, 27-jul-2026):
                        // "Habilidad pasiva de <carta>: <NOMBRE> ...". Antes era
                        // "<NOMBRE> (<carta>) desactivada", que con el nombre-con-dueño nuevo
                        // ("Fanático [1] de J1 (Ultra_K)") producía paréntesis anidados.
                        game.logMsg(`Habilidad pasiva de ${DSL._nombre(game, card)}: ${nombre} desactivada.`, 'system');
                    }
                    card[key] = mag;
                });
            };
        }

        const jugar = abs.find(a => a.trigger === 'JUGAR');
        if (jugar && typeof tmpl.canPlayCard !== 'function') {
            tmpl.canPlayCard = function (card, game, p) {
                for (const r of (jugar.requisitos || [])) {
                    let val;
                    if (r.count) {
                        const _rival = game.players[card.owner === 'p1' ? 'p2' : 'p1'];
                        let pool = r.count.de === 'ENEMIGOS' ? [..._rival.vanguard, ..._rival.rearguard] : [...p.vanguard, ...p.rearguard];
                        if (r.count.zona === 'VANGUARDIA') pool = [...p.vanguard];
                        else if (r.count.zona === 'RETAGUARDIA') pool = [...p.rearguard];
                        else if (r.count.zona === 'DESCARTES') pool = [...p.discard];
                        if (r.count.plantillaSin) pool = pool.filter(x => { const t = getCardTemplate(x.id); return t && !r.count.plantillaSin.some(hk => typeof t[hk] === 'function'); });
                        if (r.count.conAlgunEstado) pool = pool.filter(c => c.status && Object.keys(c.status).length > 0);
                        (r.count.filtros || []).forEach(f => { pool = pool.filter(c => DSL._match(c, f)); });
                        if (r.count.algunFiltro) pool = pool.filter(c => r.count.algunFiltro.some(f => DSL._match(c, f)));
                        if (r.count.algunEstado) pool = pool.filter(c => c.status && r.count.algunEstado.some(k => c.status[k]));
                        if (!r.count.permitirAvatar && r.count.zona !== 'DESCARTES') pool = pool.filter(x => !((getCardTemplate(x.id) || {}).isAvatar));
                        if (r.count.sinMarcaTemporalPropia) pool = pool.filter(x => !(x.tempEffects && x.tempEffects.some(t => t.sourceId === card.id)));
                        val = pool.length;
                    } else if (r.eventoActivo !== undefined) {
                        val = p.activeEvent ? 1 : 0;
                    // eventoActivoRival ('Una buena razón', 7-ago-2026): hermano del de arriba
                    // pero mirando el campo del RIVAL. Hasta ahora ninguna carta lo necesitaba.
                    } else if (r.eventoActivoRival !== undefined) {
                        val = game.players[card.owner === 'p1' ? 'p2' : 'p1'].activeEvent ? 1 : 0;
                    } else if (r.mano) {
                        val = p.hand.length;
                    } else if (r.manoRival) {
                        val = game.players[card.owner === 'p1' ? 'p2' : 'p1'].hand.length;
                    } else val = DSL._field(r.de === 'JUGADOR' ? game.players[card.owner] : card, r.campo);
                    if (!DSL._cmp(val, r.op, r.valor)) {
                        if (r.msg) game.logError(DSL._fill(r.msg, { carta: card.name }));
                        return false;
                    }
                }
                return true;
            };
        }

        // AL_JUGAR -> onPlay (Ayudas, sin await; Eventos, con await) Y onAfterPlayAsync
        // (Personajes/Esbirros: el motor NUNCA llama a onPlay para esos tipos, usa
        // onBeforePlayAsync/onAfterPlayAsync — Toto, 27-jul-2026, arquitectura de anexo
        // para Kazuo/Gladiador). Comparten el mismo cuerpo de efectos; cada compilador
        // solo se engancha al hook que su tipo de carta realmente usa (guardas typeof
        // independientes, como el resto de este compilador).
        // Efectos async (DAÑO) en AL_JUGAR: usar solo en Eventos.
        const alJugar = abs.find(a => a.trigger === 'AL_JUGAR');
        if (alJugar) {
            const _alJugarFn = async function (card, game) {
                // El relleno incluye las vars de la carta (p. ej. lo guardado por un
                // ELEGIR de ANTES_DE_JUGAR, como el deudor de Deuda con la mafia).
                const varsJ = (DSL._vars && DSL._vars[card.instanceId]) || {};
                if (alJugar.log) game.logMsg(DSL._fill(alJugar.log, Object.assign({}, varsJ, { carta: card.name, jugador: (typeof game.getDisplayName === 'function' ? game.getDisplayName(card.owner) : card.owner) })), alJugar.logTipo || 'ability');
                const res = await DSL._runEffectList(alJugar.efectos || [], card, game, card.owner, null, _habDeCarta(alJugar));
                // logSiAplicado (Ángel/Serafín, 27-jul-2026): mismo campo que ya tenía AL_CADUCAR,
                // ahora también en AL_JUGAR — anuncia solo si algún efecto (p. ej. un CURAR
                // soloSiHerido en grupo) de verdad hizo algo, como el `if (healed)` a mano.
                if (res && res.anyApplied && alJugar.logSiAplicado) game.logMsg(DSL._fill(alJugar.logSiAplicado.msg, { carta: card.name }), alJugar.logSiAplicado.tipo || 'ability');
                // Refresco inmediato (Kazuo/Gladiador lo hacían a mano tras anexar, para que
                // el Atq/Def/Vida suba sin esperar a la siguiente pasada natural). NO para
                // Eventos (Toto, 29-jul-2026): playCard YA llama a updatePassives() justo
                // después de onPlay para ese tipo — refrescar aquí también duplicaba la pasada
                // completa, y con ella cualquier detector de transición dentro de updatePassives
                // (el SILENCIADO/OCULTO nuevos, que comparan "antes" vs "después" de UNA pasada)
                // acababa disparando dos veces por el mismo cambio. Personaje/Esbirro
                // (onAfterPlayAsync) y Ayuda (onPlay sin await, sin refresco posterior
                // garantizado) sí lo necesitan.
                if (card.type !== 'Evento' && typeof game.updatePassives === 'function') game.updatePassives();
            };
            if (typeof tmpl.onPlay !== 'function') tmpl.onPlay = _alJugarFn;
            if (typeof tmpl.onAfterPlayAsync !== 'function') tmpl.onAfterPlayAsync = async function (card, game, p) { await _alJugarFn(card, game); };
        }

        const consumir = abs.find(a => a.trigger === 'AL_CONSUMIR');
        if (consumir && typeof tmpl.onPlay !== 'function') {
            tmpl.onPlay = async function (card, game) {
                const p = game.players[card.owner];
                // La marca de NO_CONSUMIR se limpia ANTES de correr: si esta misma copia se
                // quedó en la mano en un uso anterior (Atomización tras un remate), su marca
                // no puede sobrevivir a este uso y librarla del descarte por inercia.
                DSL._vars = DSL._vars || {};
                const _vc = (DSL._vars[card.instanceId] = DSL._vars[card.instanceId] || {});
                delete _vc.__noConsumir;
                if (consumir.log) game.logMsg(DSL._fill(consumir.log, { carta: card.name, jugador: (typeof game.getDisplayName === 'function' ? game.getDisplayName(card.owner) : card.owner) }), consumir.logTipo || 'ability');
                // LA AYUDA SE CONSUME PRIMERO (Toto, 7-ago-2026). Antes iba al descarte al FINAL
                // de la cadena, así que la pila no se poblaba hasta que todo terminaba -y la
                // animación de presentación aterrizaba sobre un montón que aún no existía-.
                // Toto aclaró la semántica real: una Ayuda SÍ se consume al usarse; lo de
                // Atomización es una IDA Y VUELTA (se gasta y, si mata, vuelve del descarte a la
                // mano), no un "nunca se gastó". Con eso el orden natural es este.
                const _alDescarte = () => {
                    const hi = p.hand.findIndex(x => x.instanceId === card.instanceId);
                    if (hi === -1) return;
                    p.hand.splice(hi, 1);
                    if (typeof game.resetCard === 'function') game.resetCard(card);
                    p.discard.push(card);
                    card.location = 'discard';
                    if (typeof game.render === 'function') game.render();
                };
                // §14: la carta sale de la mano EN EL PUNTO DE COMPROMISO, que es cuando se
                // presenta — no al empezar la cadena. Se le entrega el movimiento a la
                // presentación para que ocurran juntos; si por lo que sea no llega a
                // presentarse, el cierre de abajo lo hace igualmente.
                // Una Ayuda que se EQUIPA no va al descarte: la coloca EQUIPAR, sacándola de la
                // mano. Adelantarle el descarte le rompe ese splice (ver DSL._esEquipo).
                const _equipa = DSL._esEquipo(typeof getCardTemplate === 'function' ? getCardTemplate(card.id) : null);
                if (_equipa) { /* la coloca EQUIPAR */ }
                else if (game._presentacionArmada) game._presentacionArmada.colocar = _alDescarte;
                else _alDescarte();
                // La VUELTA hace el viaje completo otra vez, en sentido inverso (§14): sale del
                // descarte, se presenta en el centro y aterriza en la mano. Es un evento que los
                // dos jugadores deben VER, no una línea de log (Toto, 8-ago-2026).
                const _volverAMano = async () => {
                    const di = p.discard.findIndex(x => x.instanceId === card.instanceId);
                    if (di === -1) return;
                    if (typeof animarPresentacionCarta === 'function') {
                        await animarPresentacionCarta(card.id, `#${card.owner}-discard-stack`, `#${card.owner}-hand`, false, {
                            colocar: () => {
                                const i = p.discard.findIndex(x => x.instanceId === card.instanceId);
                                if (i !== -1) p.discard.splice(i, 1);   // la pila BAJA al salir
                                card.location = 'hand';
                                p.hand.push(card);
                                if (typeof game.render === 'function') game.render();
                            },
                        });
                        return;
                    }
                    p.discard.splice(di, 1);
                    card.location = 'hand';
                    p.hand.push(card);
                    if (typeof game.render === 'function') game.render();
                };
                // Marca "esta Ayuda se está jugando AHORA": la lee _fuenteFlotante para no
                // nombrarla en sus propios flotantes (ver allí). Se limpia al terminar.
                game._ayudaEnCurso = card.instanceId;
                const res = await DSL._runEffectList(consumir.efectos || [], card, game, card.owner, null);
                game._ayudaEnCurso = null;
                // Elección cancelada: no ha pasado nada, así que la Ayuda vuelve a la mano.
                if (res && res.ok === false) { game._ayudaEnCurso = null; await _volverAMano(); game.cancelAction(); if (typeof game.render === 'function') game.render(); return; }
                // PUNTO DE COMPROMISO (§14), el mismo que al final de ANTES_DE_JUGAR: la cadena
                // cancelable ha terminado y la Ayuda se consume, así que se presenta pase lo que
                // pase. Sin esto, una cadena que sea ELEGIR/BUSCAR de principio a fin no tiene
                // ningún efecto que llame a _comprometer y la carta va al descarte sin pasar por
                // el escaparate — le pasaba a Líquido mortal y a Cápsula de bio-regeneración.
                // Va ANTES de _alDescarte porque la presentación lleva ese mismo `colocar`
                // dentro: si se descarta primero, el escaparate ya no tiene de dónde salir.
                await DSL._comprometer(card, game);
                // NO_CONSUMIR: la vuelta del viaje de ida (Atomización tras rematar).
                if (!_equipa) _alDescarte();   // no-op si la presentación ya la movió
                // Las anotaciones de `guardaIdsEnSelf` (quién pagaba, a quién se eligió) son
                // andamio de ESTA jugada: no deben viajar con la carta al descarte ni salir en
                // exportGameState. Se limpian AQUÍ, al terminar — no al descartar, porque el
                // descarte ocurre en el punto de compromiso y los efectos posteriores (el cobro
                // al pagador anotado) todavía las necesitan.
                Object.keys(card).forEach(k => { if (/^(pagoPagador|rezoPagadores|necroLector|kamiSacrificio|chosenAllies)$/.test(k)) delete card[k]; });
                if (_vc.__noConsumir) await _volverAMano();
                delete _vc.__noConsumir;
                game.cancelAction();
                if (typeof game.render === 'function') game.render();
            };
        }

        const equipar = abs.find(a => a.trigger === 'AL_EQUIPAR');
        if (equipar && typeof tmpl.onPlay !== 'function') {
            tmpl.onPlay = async function (card, game) {
                const res = await DSL._runEffectList(equipar.efectos || [], card, game, card.owner, null);
                if (res && res.ok === false) { game.cancelAction(); return; } // cancelado: la carta sigue en mano
                // Mismo punto de compromiso que en las otras dos cadenas. Hoy ninguna carta de
                // AL_EQUIPAR lo necesita -todas acaban en un op EQUIPAR, que ya dispara-, pero
                // la garantía es estructural aquí y solo una comprobación en la auditoría si se
                // deja fuera. Es idempotente: si ya se disparó, no hace nada.
                await DSL._comprometer(card, game);
                game.cancelAction();
                if (typeof game.render === 'function') game.render();
            };
        }

        const usar = abs.find(a => a.trigger === 'AL_USAR_AYUDA');

        // mientrasEquipado (campo hermano de efectos, declarable en AL_EQUIPAR -equipos con
        // flujo onPlay directo, p. ej. Furia berserker- o en AL_USAR_AYUDA -equipos con flujo
        // de selección de objetivo, p. ej. Espada V, que no necesita AL_EQUIPAR en absoluto-)
        // -> onEquipUpdate: buff continuo y SILENCIOSO (sin floating/log — el aviso visual ya
        // salió UNA VEZ en el EQUIPAR) mientras la carta siga anexada. El motor resetea
        // currentAtk/currentDef a la plantilla en cada updatePassives y llama a este hook para
        // reaplicar el delta; de ahí que sea pura suma, no un efecto de una vez.
        const _fuenteBuff = (equipar && equipar.mientrasEquipado) ? equipar : (usar && usar.mientrasEquipado) ? usar : null;
        if (_fuenteBuff && typeof tmpl.onEquipUpdate !== 'function') {
            tmpl.onEquipUpdate = function (equipCard, hostCard, game) {
                const m = _fuenteBuff.mientrasEquipado;
                // La VIDA MÁX. la DECLARA el equipo, no la deduce el motor (Toto, 31-jul-2026).
                // El registro automático de "Afectado por:" funciona por diferencias antes/después
                // de cada pasada, y eso sirve para currentAtk/currentDef porque se resetean a la
                // plantilla en cada una; `maxHp` NO se resetea, así que el diff solo la vería en la
                // pasada en que cambia y la línea desaparecería acto seguido. Por eso el bono de
                // Vida se anota explícitamente aquí, en cada pasada (registrarStatMod dedupe por
                // stat+origen+habilidad, así que no se acumula).
                const _anotaVida = () => {
                    const t = getCardTemplate(hostCard.id) || {};
                    if (typeof t.hp !== 'number' || hostCard.maxHp === t.hp) return;
                    if (typeof game.registrarStatMod !== 'function') return;
                    game.registrarStatMod(hostCard, {
                        stat: 'VIDA MÁX.', delta: hostCard.maxHp - t.hp,
                        fuente: equipCard.name,
                        ref: typeof game.refCarta === 'function' ? game.refCarta(equipCard) : equipCard.name,
                        habilidad: null, turnos: null,
                        srcId: equipCard.instanceId, srcAltId: hostCard.instanceId, srcZone: null,
                    });
                };
                // superStats (Súper Evolución, 31-jul-2026): el bono NO es un delta fijo, sino la
                // diferencia entre los `superStats` de la PLANTILLA DEL PORTADOR y su base — cada
                // portador evoluciona a los suyos, así que `{atk:N, def:N}` no puede expresarlo.
                if (m.superStats) {
                    const t = getCardTemplate(hostCard.id) || {};
                    if (!t.superStats) return;
                    hostCard.currentAtk += (t.superStats.atk - t.atk);
                    hostCard.currentDef += (t.superStats.def - t.def);
                    // maxHp no se recalcula en cada updatePassives (a diferencia de atk/def), así
                    // que se fija una vez y de paso se cura -el "restaurando Vida" del texto-.
                    // Idempotente: en las pasadas siguientes ya coincide y no vuelve a curar.
                    if (hostCard.maxHp !== t.superStats.hp) {
                        hostCard.maxHp = t.superStats.hp;
                        hostCard.currentHp = hostCard.maxHp;
                    }
                    _anotaVida();
                    return;
                }
                // fijar (Poder Legado, 31-jul-2026): stats BLOQUEADOS a un valor, no sumados.
                // `ignorarTopes` levanta el ignoreStatCaps del motor para que ningún techo los
                // baje después (la carta dice "inamovible").
                if (m.fijar) {
                    if (m.fijar.atk !== undefined) hostCard.currentAtk = m.fijar.atk;
                    if (m.fijar.def !== undefined) hostCard.currentDef = m.fijar.def;
                    if (m.fijar.hp !== undefined) { hostCard.maxHp = m.fijar.hp; hostCard.currentHp = m.fijar.hp; }
                    if (m.ignorarTopes) hostCard.ignoreStatCaps = true;
                    _anotaVida();
                    return;
                }
                if (m.atk) hostCard.currentAtk += m.atk;
                if (m.def) hostCard.currentDef += m.def;
                // Inmunidad a estados alterados mientras lo lleve puesto (Hagoromo). Se reimpone
                // en CADA pasada, como los stats, porque updatePassives la apaga antes de correr
                // las pasivas: así se cae sola al desequipar, sin tener que acordarse de limpiarla.
                if (m.inmuneAEstados) hostCard.inmuneAEstados = true;
            };
        }

        // `efectoEquipadoTexto` (Milkor MGL, 31-jul-2026): línea de "Afectado por:" para un equipo
        // cuyo efecto NO son números. Las líneas automáticas nacen del registro de stats, así que
        // un arma que no toca Atq/Def -solo cambia lo que pasa al atacar- no aparecía por ningún
        // lado en el detalle de quien la lleva, aunque le esté cambiando el comportamiento: y es
        // otra carta afectándole, que es justo lo que esa sección debe contar (Toto). El contador
        // de disparos no lo sustituye: dice CUÁNTAS balas quedan, no QUÉ hace el arma.
        // El 3er parámetro del hook es la carta equipada cuando lo llama el bloque de equipos del
        // detalle, y una marca temporal cuando lo llama el de tempEffects: se distinguen por
        // `equippedTo`, que solo tiene la primera.
        if (tmpl.efectoEquipadoTexto && typeof tmpl.onGetPreviewEffects !== 'function') {
            tmpl.onGetPreviewEffects = function (card, game, eq) {
                if (!eq || !eq.equippedTo) return [];
                const ref = typeof game.refCarta === 'function' ? game.refCarta(eq) : tmpl.name;
                return [`${DSL._fill(tmpl.efectoEquipadoTexto, { genero: card.gender })}, fuente: ${ref}`];
            };
        }

        if (usar && typeof tmpl.onValidateTarget !== 'function') {
            // El motor usa este hook (en silencio) para decidir qué cartas llevan reborde de objetivo válido,
            // y (con voz) para explicar el rechazo al clicar. Se deriva de los requisitos + viabilidad de efectos.
            tmpl.onValidateTarget = function (card, target, game, isSilent) {
                if ((getCardTemplate(target.id) || {}).isAvatar) { if (typeof isSilent === 'undefined' || !isSilent) game.logError(`${target.name} es un AVATAR y no puede ser objetivo de nada.`); return false; }
                for (const r of (usar.requisitosObjetivo || [])) {
                    const bv = r.valorCampo ? DSL._field(target, r.valorCampo) : DSL._value(card.owner, game, r.valor, card, { self: card, objetivo: target });
                    if (!(r.o ? DSL._match(target, r) : (r.dePlantilla ? DSL._cmp((getCardTemplate(target.id) || {})[r.campo], r.op, bv) : DSL._cmp(DSL._field(target, r.campo), r.op, bv)))) {
                        if (!isSilent && r.msg) game.logError(DSL._fill(r.msg, { objetivo: DSL._nombre(game, target) }));
                        return false;
                    }
                }
                for (const e of (usar.efectos || [])) {
                    if (e.op === 'CURAR' && e.conBeforeHealed !== false && target.currentHp >= target.maxHp) {
                        // Bug de motor (betasteo de Toto, compartido por ambas bases): esta
                        // heurística de "ya está lleno" no contaba con cartas que pueden
                        // REBASAR su Vida máxima al curarse (SOBRECURACION/onBeforeHealed,
                        // p. ej. Limo primario), así que las rechazaba como objetivo aunque
                        // el runtime de CURAR sí sabe expandir el máximo. Se deja pasar aquí
                        // y que decida CURAR (que llama a onBeforeHealed antes de su propio
                        // chequeo, ya con el máximo actualizado).
                        const _puedeSobrecurar = typeof (getCardTemplate(target.id) || {}).onBeforeHealed === 'function';
                        if (!_puedeSobrecurar) {
                            if (!isSilent) game.logError(DSL._fill(e.msgLleno || '{objetivo} ya tiene la Vida completa.', { objetivo: DSL._nombre(game, target) }));
                            return false;
                        }
                    }
                }
                return true;
            };
        }
        if (usar && typeof tmpl.onExecuteAyuda !== 'function') {
            tmpl.onExecuteAyuda = async function (card, target, game) {
                for (const r of (usar.requisitosObjetivo || [])) {
                    const bv = r.valorCampo ? DSL._field(target, r.valorCampo) : DSL._value(card.owner, game, r.valor, card, { self: card, objetivo: target });
                    if (!(r.o ? DSL._match(target, r) : (r.dePlantilla ? DSL._cmp((getCardTemplate(target.id) || {})[r.campo], r.op, bv) : DSL._cmp(DSL._field(target, r.campo), r.op, bv)))) {
                        if (r.msg) game.logError(DSL._fill(r.msg, { objetivo: DSL._nombre(game, target) }));
                        return false;
                    }
                }
                // Anotamos QUIÉN PAGA para que las animaciones de efecto puedan anclarse en
                // una carta del tablero: la Ayuda en sí no tiene ninguna (ver DSL._lanzador).
                DSL._vars = DSL._vars || {};
                (DSL._vars[card.instanceId] = DSL._vars[card.instanceId] || {}).__pagador = target.instanceId;
                const res = await DSL._runEffectList(usar.efectos, card, game, card.owner, [target]);
                return res.ok;
            };
        }

        // ACTIVA -> canActivateAbility + onExecuteAbility + (onValidateTarget) + onTargetsReady
        const activa = abs.find(a => a.trigger === 'ACTIVA');
        if (activa && typeof tmpl.onExecuteAbility !== 'function') {
            const costeFuror = (activa.coste && typeof activa.coste.furor === 'number') ? activa.coste.furor
                             : (typeof tmpl.activeCost === 'number' ? tmpl.activeCost : 0);
            const cant = (activa.target && activa.target.cantidad) || 1;
            const tt = activa.target && activa.target.quien === 'ALIADO' ? 'ally' : 'enemy';
            if (typeof tmpl.canActivateAbility !== 'function') {
                tmpl.canActivateAbility = function (card, game) {
                    if (costeFuror > 0 && card.furor < costeFuror) { game.logError(`Falta Furor (${costeFuror}).`); return false; }
                    for (const r of (activa.requisitos || [])) {
                        const val = r.count ? DSL._count(card.owner, game, r.count, card) : DSL._field(card, r.campo);
                        if (!DSL._cmp(val, r.op, r.valor)) { if (r.msg) game.logError(DSL._fill(r.msg, { carta: card.name })); return false; }
                    }
                    return true;
                };
            }
            if (activa.ataqueNormal) tmpl.abilityUsesAttack = true; // el motor veta la activación temprano si un interceptor lo pide

            // Cuerpo compartido por ambos caminos (con y sin selección de objetivo):
            // paga coste, floating del nombre, corre los efectos y CIERRA LA ACCIÓN.
            // Fix (betasteo previo al catch): las dos únicas Activas DSL que existían
            // (BOMBAZO, PUÑALADA) usan ATACAR, que se cierra a sí misma vía
            // performAttack (agota, renderiza, sincroniza) — enmascaraba que ESTE
            // cierre genérico nunca se ejecutaba. Cualquier Activa sin ATACAR se
            // habría quedado sin agotar la carta ni soltar el candado de acción.
            // El guard `!card.exhausted` evita duplicar el cierre cuando sí atacó.
            // costeDiferido (Kami, SACRIFICIO EQUIVALENTE, 31-jul-2026): cobra el coste DESPUÉS
            // de que los efectos se resuelvan con éxito, no antes. Es para Activas cuya primera
            // acción es una CADENA de elecciones: mientras el jugador sigue eligiendo no ha
            // cambiado nada en el tablero, así que debe poder cancelar en cualquier punto de la
            // cadena y que no ocurra NADA -ni Furor gastado, ni carta agotada- (norma de UX de
            // Toto, ver [[norma-targeting-en-tablero]]). El flotante del NOMBRE de la Activa
            // tampoco se pinta aquí en ese modo: saldría antes de la primera elección, y estas
            // cartas lo quieren junto a su efecto de verdad, así que lo declaran ellas con un op
            // FLOTANTE en el punto que les toque.
            // NORMA DEL COSTE (Toto, 7-ago-2026): el Furor y el anuncio de una Activa NO se
            // aplican hasta que algo deja de poder deshacerse. Y NO es una opción por carta -eso
            // era `costeDiferido`, que había que acordarse de poner-: se DEDUCE. Si el primer
            // efecto es una elección que el jugador puede cancelar, hay ventana para arrepentirse
            // y el cobro espera; si no la hay, ese primer efecto ya es irreversible y se cobra al
            // instante. Con lo cual una Activa instantánea se comporta EXACTAMENTE igual que
            // antes (mismo orden de flotantes) y las que abren un modal dejan de cobrar por
            // adelantado, sin tocarlas una a una. El flag sigue existiendo como override
            // explícito para el caso raro que la heurística no vea.
            const _p0 = (activa.efectos || [])[0];
            const _hayVentanaCancelable = !!_p0 && (_p0.op === 'ELEGIR' || _p0.op === 'BUSCAR') && _p0.cancelable !== false;
            const _diferir = activa.costeDiferido !== undefined ? !!activa.costeDiferido : _hayVentanaCancelable;
            const _cobrarActiva = (card, game) => {
                // source 'avatar_passive': un Avatar (Kami) es inmune a TODA resta de stats en
                // modifyStat salvo con esa fuente — inmunidad pensada contra efectos AJENOS, no
                // contra el coste que la propia carta declara. Sin esto, SACRIFICIO EQUIVALENTE
                // (1F) salía gratis. Ya era así en la base vieja; nunca se notó porque su Activa
                // no llegaba nunca a completarse (ver el bug del gate de targeting, más abajo).
                // Kami es hoy el único Avatar, así que el cambio no alcanza a ninguna otra carta.
                if (costeFuror > 0) game.modifyStat(card, 'furor', -costeFuror, 0, 'avatar_passive');
                if (typeof showFloatingText === 'function') {
                    // SIEMPRE, difiera o no (Toto, 7-ago-2026): el anuncio viaja pegado al cobro,
                    // y el cobro ya cae en el instante irreversible en los dos casos. Este `if`
                    // existía cuando diferir significaba "al final de todo" y el nombre habría
                    // salido tras los efectos; entonces había que apagarlo y declararlo a mano
                    // carta por carta. Ya no: el automático funciona en ambos caminos.
                    showFloatingText(card.instanceId, card.activeName, 'ft-ability', -30);
                    (activa.floatingExtra || []).forEach(fe => showFloatingText(card.instanceId, fe.texto, fe.estilo || 'ft-green', fe.offset !== undefined ? fe.offset : -10));
                }
                if (activa.log) game.logMsg(DSL._fill(activa.log, { carta: card.name }), activa.logTipo || 'ability');
            };
            const _ejecutarActiva = async (card, game, targets) => {
                if (!_diferir) _cobrarActiva(card, game);
                // Cobro ARMADO, no aplazado al final (Toto, 7-ago-2026). Antes "diferir"
                // significaba "cobrar después de TODOS los efectos", y eso arrastraba el anuncio
                // de la Habilidad con él: el nombre salía después de los cuatro ataques de
                // AL-FÉNIX, así que había que silenciarlo y declararlo a mano en cada carta.
                // Ahora se deja aquí un gatillo que dispara la PRIMERA elección al resolverse
                // -que es exactamente el instante en que se deja de poder cancelar-, así que
                // cobro y anuncio caen en su sitio SOLOS, sin que ninguna carta declare nada.
                if (_diferir) DSL._cobroPendiente = { id: card.instanceId, fn: () => _cobrarActiva(card, game) };
                const _res = await DSL._runEffectList(activa.efectos, card, game, card.owner, targets, activa.nombre || tmpl.activeName || null);
                // ¿Sigue sin cobrarse? Entonces no llegó a pasar nada irreversible.
                const _sinCobrar = !!(DSL._cobroPendiente && DSL._cobroPendiente.id === card.instanceId);
                if (_diferir && _res && _res.ok === false && _sinCobrar) {
                    DSL._cobroPendiente = null;
                    // Cancelado a mitad de la cadena de elecciones: no se cobra nada y la carta
                    // NO gasta su acción — solo se suelta el candado y se deshace la selección.
                    game.isActionLocked = false;
                    game.cancelAction();
                    if (typeof game.render === 'function') game.render();
                    return;
                }
                // Pendiente todavía = la Activa no tenía ninguna elección por medio (o ninguna
                // llegó a resolverse pero sí hubo efectos): se cobra aquí, al cerrar.
                if (DSL._cobroPendiente && DSL._cobroPendiente.id === card.instanceId) {
                    const _cp = DSL._cobroPendiente; DSL._cobroPendiente = null; _cp.fn();
                }
                if (!card.exhausted) {
                    // sinAgotar (Achmay, PÉGAME PERRA, 31-jul-2026): "Esta habilidad no gasta
                    // la acción de Achmay" — cierra la acción igual (candado, sync, render)
                    // pero SIN marcar la carta como agotada.
                    if (!activa.sinAgotar) card.exhausted = true;
                    game.isActionLocked = false;
                    game.cancelAction();
                    game.updatePassives();
                    if (typeof game.render === 'function') game.render();
                    game.forceSync();
                }
            };

            tmpl.onExecuteAbility = function (card, game) {
                if (activa.sinObjetivo) {
                    // Sin fase de selección: la propia carta es el "objetivo" implícito
                    // (autobuffs, monedas con elección interna vía ELEGIR, fichas...).
                    game.selectedCard = card;
                    game.isActionLocked = true;
                    game.inputState = 'EXECUTING';
                    game.render();
                    // CONTABILIZADA (Toto, 7-ago-2026): esta promesa NO se espera -es el patrón
                    // de siempre para no bloquear la tubería de red- así que, sin registrarla, el
                    // poller de reconexión no sabe que la Habilidad sigue trabajando y vuelca el
                    // estado a medias. Es el mismo agujero que ya se tapó en playCard, pero por
                    // el camino de las Activas: `onExecuteAbility` SÍ se espera arriba, solo que
                    // aquí devuelve al instante y el trabajo real se queda flotando en el .then.
                    // Karlitos lo destapó: el rival veía el anuncio de la Activa pero nunca el
                    // arma equipada ni salir de su mano.
                    const _pr = _ejecutarActiva(card, game, [card]).then(() => game.forceSync());
                    if (typeof game._seguirCorrutina === 'function') game._seguirCorrutina(_pr);
                    return;
                }
                game.selectedCard = card;
                game.inputState = 'SELECT_ABILITY_TARGETS';
                const cx = { targets: [], maxTargets: cant, name: activa.nombre || tmpl.activeName, targetType: tt };
                if (activa.ataqueNormal) cx.isNormalAttack = true;
                game.abilityContext = cx;
                game.render();
            };
            if (Array.isArray(activa.validarObjetivo) && typeof tmpl.onValidateTarget !== 'function') {
                tmpl.onValidateTarget = function (card, target, game, isSilent) {
                    for (const v of activa.validarObjetivo) {
                        if (!DSL._cmp(DSL._field(target, v.campo), v.op, v.valor)) {
                            if (!isSilent && v.msg) game.logError(v.msg);
                            return false;
                        }
                    }
                    return true;
                };
            }
            if (typeof tmpl.onTargetsReady !== 'function') {
                tmpl.onTargetsReady = async function (card, game) {
                    await _ejecutarActiva(card, game, game.abilityContext.targets);
                };
            }
        }

        // ANTES_DE_ATACAR / TRAS_ATACAR -> onBeforeAttack / onAfterAttack: los ganchos de la
        // carta QUE ATACA (no confundir con los GLOBAL_*, que son de ámbito Evento/tablero).
        // Se compilan JUNTOS porque comparten los dos mismos ganchos del motor y porque
        // TRAS_ATACAR con soloSiDaño necesita que el ANTES tome la foto de la Vida enemiga.
        //
        // Orden real dentro de performAttack (comprobado, importa): updatePassives ->
        // onBeforeAttack -> dealDamage -> onAfterAttack -> updatePassives. O sea que un bono
        // aplicado en el ANTES sí llega vivo al cálculo de daño, y el recompute final limpia
        // solo. Aun así se deshace explícitamente, porque la ruta de ataque DIRECTO
        // (ATACAR especial, sin performAttack) no garantiza ese recompute final.
        const antesAtacar = abs.find(a => a.trigger === 'ANTES_DE_ATACAR');
        const trasAtacar = abs.find(a => a.trigger === 'TRAS_ATACAR');
        if ((antesAtacar || trasAtacar) && typeof tmpl.onBeforeAttack !== 'function' && typeof tmpl.onAfterAttack !== 'function') {
            const _nombreHab = (a) => a.nombre || tmpl.passiveName || null;
            // Misma heurística de "¿es un ataque normal?" que ya usaban a mano Oni ancho y
            // Clarise: sin abilityContext es un ataque suelto; con él, solo cuenta si la
            // Activa se declaró como ataque normal.
            const _esNormal = (game) => !game.abilityContext || game.abilityContext.isNormalAttack;

            tmpl.onBeforeAttack = async function (attacker, defender, game) {
                attacker._dslBonoAtaque = 0;
                if (trasAtacar && (trasAtacar.soloSiDaño || typeof trasAtacar.siDanoMinimo === 'number')) attacker._dslHpEnemigoAntes = defender ? defender.currentHp : undefined;
                if (!antesAtacar) return true;
                // requiereObjetivo (Ayudante perturbada, 31-jul-2026): performDirectAttack
                // llama a onBeforeAttack con defender=null (ataque directo al jugador rival,
                // sin carta objetivo) — cartas cuya habilidad necesita un objetivo real (p. ej.
                // una moneda ligada a "durante ESE ataque") deben saltarse sin más, dejando que
                // el ataque directo proceda normal (return true, no un veto).
                if (antesAtacar.requiereObjetivo && !defender) return true;
                if (antesAtacar.soloAtaqueNormal && !_esNormal(game)) return true;
                if (antesAtacar.si && !DSL._cond(attacker, game, antesAtacar.si)) return true;
                if (antesAtacar.log) game.logMsg(DSL._fill(antesAtacar.log, { carta: attacker.name, objetivo: defender ? DSL._nombre(game, defender) : '' }), antesAtacar.logTipo || 'ability');
                const r = await DSL._runEffectList(antesAtacar.efectos || [], attacker, game, attacker.owner, [defender], _nombreHab(antesAtacar));
                return !(r && r.ok === false); // ok:false -> el ataque NO procede (veto)
            };

            tmpl.onAfterAttack = async function (attacker, defender, game) {
                if (attacker._dslBonoAtaque) {
                    // Recompute completo en vez de restar a mano: mismo criterio que bonoAtq en
                    // el op ATACAR, para no repetir el bug de doble resta.
                    attacker._dslBonoAtaque = 0;
                    if (typeof game.updatePassives === 'function') game.updatePassives();
                    else attacker.currentAtk -= 0;
                }
                delete attacker._dslBonoAtaque;
                const hpAntes = attacker._dslHpEnemigoAntes;
                delete attacker._dslHpEnemigoAntes;
                if (!trasAtacar) return;
                if (trasAtacar.soloAtaqueNormal && !_esNormal(game)) return;
                if (trasAtacar.soloSiDaño) {
                    if (hpAntes === undefined || !defender || !(hpAntes - defender.currentHp > 0)) return;
                }
                // siDanoMinimo (Valafar, CHUPAALMAS, 31-jul-2026): umbral EXACTO, no solo
                // "dañó algo" -el suelo de daño (0.5 Esbirro-vs-Personaje) puede no llegar al
                // mínimo que la carta exige ("...que quite >= 1 Vida")-.
                if (typeof trasAtacar.siDanoMinimo === 'number') {
                    if (hpAntes === undefined || !defender || !((hpAntes - defender.currentHp) >= trasAtacar.siDanoMinimo)) return;
                }
                // siObjetivo: condición sobre el DEFENSOR (el `if` genérico de los efectos se
                // evalúa contra la carta FUENTE, que aquí es el atacante). Gul guerrero solo
                // anuncia y drena si al enemigo le queda Furor que quitar.
                if (trasAtacar.siObjetivo && !(defender && DSL._match(defender, trasAtacar.siObjetivo))) return;
                if (trasAtacar.si && !DSL._cond(attacker, game, trasAtacar.si)) return;
                // El daño REALMENTE infligido, como var (Toto, 16-ago-2026). Hacía falta porque el
                // mínimo NO es 1: un Esbirro que golpea a un Personaje hace 0,5 (index.html), y hay
                // cartas cuyo efecto debe escalarse con lo que de verdad hizo, no con un 1 fijo.
                if (hpAntes !== undefined && defender) {
                    DSL._vars = DSL._vars || {};
                    (DSL._vars[attacker.instanceId] = DSL._vars[attacker.instanceId] || {}).dano = hpAntes - defender.currentHp;
                }
                if (trasAtacar.log) game.logMsg(DSL._fill(trasAtacar.log, { carta: attacker.name, objetivo: defender ? DSL._nombre(game, defender) : '' }), trasAtacar.logTipo || 'ability');
                await DSL._runEffectList(trasAtacar.efectos || [], attacker, game, attacker.owner, [defender], _nombreHab(trasAtacar));
            };
        }

        // TRAS_DEFENDER -> onAfterDefend: el gancho de la carta QUE DEFIENDE, para efectos
        // que son CONSECUENCIA de haber sido atacada (Imp mayor, 31-jul-2026: "cada vez que
        // sea atacado, el atacante pierde 1 Furor"). A propósito NO reutiliza
        // GLOBAL_ANTES_DE_ATAQUE con un hipotético soloDefensor:"SELF": ese trigger solo se
        // dispara vía collectAttackInterceptors, que SOLO llama performAttack (el ataque
        // normal) -un ataque ESPECIAL, ruta directa del op ATACAR, no pasa por ahí, así que
        // no habría drenado Furor, un hueco real de cobertura-. onAfterDefend en cambio lo
        // llama dealDamage siempre que el golpe conecta (dmg>0, prácticamente garantizado por
        // el suelo 0.5/1), sea cual sea la ruta (normal o especial).
        //
        // Timing (betasteo de Toto, 31-jul-2026): dealDamage llama a onAfterDefend DESPUÉS de
        // animateAttack/animateSpecialAttack (la animación completa, atacante ya de vuelta en
        // su sitio) Y después de aplicar el daño — es justo el momento en que un efecto "tras
        // el ataque" debe manifestarse visualmente. El primer intento de esta carta usaba
        // ANTES_DE_DEFENDER (onBeforeDefend), que corre ANTES de dealDamage por completo -de
        // ahí que el flotante de "-1 FUR" saliera nada más empezar la animación, en vez de al
        // volver el atacante a su sitio-. Regla general para el futuro: un efecto que la
        // carta describe como consecuencia de ser atacada va en TRAS_DEFENDER, no en
        // ANTES_DE_DEFENDER -ese último solo es para esquiva de verdad, que por definición
        // debe decidirse ANTES del daño-.
        const trasDefender = abs.find(a => a.trigger === 'TRAS_DEFENDER');
        if (trasDefender && typeof tmpl.onAfterDefend !== 'function') {
            tmpl.onAfterDefend = async function (defender, attacker, dmg, isSpecial, game) {
                // soloAtaqueNormal (Achmay, YOLOLO, 31-jul-2026): a diferencia de
                // ANTES_DE_ATACAR/TRAS_ATACAR (que infieren "normal" de abilityContext, sin
                // acceso al isSpecial real), onAfterDefend YA recibe el isSpecial genuino de
                // dealDamage -no hace falta ninguna heurística-.
                if (trasDefender.soloAtaqueNormal && isSpecial) return;
                // si (Gólem multielemental, 31-jul-2026): condición sobre el DEFENSOR (mismo
                // campo que ya soportan ANTES_DE_ATACAR/TRAS_ATACAR) — faltaba aquí.
                if (trasDefender.si && !DSL._cond(defender, game, trasDefender.si)) return;
                if (trasDefender.log) game.logMsg(DSL._fill(trasDefender.log, { carta: defender.name, objetivo: DSL._nombre(game, attacker) }), trasDefender.logTipo || 'ability');
                await DSL._runEffectList(trasDefender.efectos || [], defender, game, defender.owner, [attacker], trasDefender.nombre || tmpl.passiveName || null);
            };
        }

        // ANTES_DE_DEFENDER -> onBeforeDefend: para ESQUIVA de verdad (a diferencia de
        // TRAS_DEFENDER, esto SÍ debe decidirse antes del daño). Restaurada el 31-jul-2026 por
        // petición de Toto cuando se quedó sin usuario, precisamente porque Águila
        // (PSEUDO-PREVASIÓN) era su usuario natural — migrada ya (31-jul-2026), que es lo que
        // trajo las tres piezas de abajo.
        //
        // Dos formas de decidir la esquiva:
        //   · `esquiva: true` en la Habilidad -> esquiva SIEMPRE (incondicional).
        //   · el op `ESQUIVAR` dentro de los efectos -> esquiva solo si ese op llega a correr,
        //     así que puede colgar de una MONEDA, un `if`, lo que sea (Águila: 50%).
        const antesDefender = abs.find(a => a.trigger === 'ANTES_DE_DEFENDER');
        if (antesDefender && typeof tmpl.onBeforeDefend !== 'function') {
            tmpl.onBeforeDefend = async function (defender, attacker, game, abilityName, isSpecial) {
                // soloAtaqueNormal: igual que en TRAS_DEFENDER, aquí el isSpecial que llega es el
                // GENUINO (lo pasan los 9 puntos del motor que llaman a onBeforeDefend), sin
                // heurística de abilityContext.
                if (antesDefender.soloAtaqueNormal && isSpecial) return false;
                // salvoIncontrarrestable: el atacante con `uncounterable` (Aniceto, SAPIENCIA
                // MÁGICA: "no se pueden contrarrestar sus ataques...") atraviesa la esquiva. Se
                // comprueba `uncounterable` directamente y no DSL._vetoAtaqueAplica, que además
                // exime a `treatAttacksAsSpecial`: ese caso ya lo cubre soloAtaqueNormal (esos
                // ataques llegan con isSpecial=true) y colaría un log equivocado.
                // `defensor` = nombre COMPLETO de quien defiende (norma de 3ª persona con
                // dueño); `carta` se queda como el nombre a secas, por coherencia con el resto
                // de triggers.
                const _fillD = { carta: defender.name, defensor: DSL._nombre(game, defender), objetivo: DSL._nombre(game, attacker) };
                if (antesDefender.salvoIncontrarrestable && (DSL._tmpl(attacker.id) || {}).uncounterable) {
                    if (antesDefender.logIncontrarrestable) game.logMsg(DSL._fill(antesDefender.logIncontrarrestable, _fillD), 'system');
                    return false;
                }
                // si (31-jul-2026): mismo campo que ya soportan los otros tres triggers
                // hermanos (ANTES_DE_ATACAR/TRAS_ATACAR/TRAS_DEFENDER); faltaba aquí también.
                if (antesDefender.si && !DSL._cond(defender, game, antesDefender.si)) return false;
                if (antesDefender.log) game.logMsg(DSL._fill(antesDefender.log, _fillD), antesDefender.logTipo || 'ability');
                game._dslEsquiva = false; // lo levanta el op ESQUIVAR si llega a correr
                await DSL._runEffectList(antesDefender.efectos || [], defender, game, defender.owner, [attacker], antesDefender.nombre || tmpl.passiveName || null);
                const _esq = !!game._dslEsquiva;
                delete game._dslEsquiva; // transitorio: no vive en exportGameState, no ensucia el arnés
                return _esq || !!antesDefender.esquiva;
            };
        }

        // INTERCEPTOR_ATAQUE -> onInterceptAttack (Frikazo, 31-jul-2026): el motor ya recorre
        // GENÉRICAMENTE currentDefender.attachments buscando esta función (index.html,
        // "Interceptores de Daño Pasivos") — hoy solo Frikazo la usa, pero el bucle ya soporta
        // varias. Sin prompt/moneda/condición: si la carta está anexada (con `reverse` en
        // ANEXAR), SIEMPRE intercepta el golpe en lugar de su anfitrión. Función SÍNCRONA
        // (el motor no espera una Promise aquí).
        const interceptor = abs.find(a => a.trigger === 'INTERCEPTOR_ATAQUE');
        if (interceptor && typeof tmpl.onInterceptAttack !== 'function') {
            tmpl.onInterceptAttack = function (interceptorCard, attacker, defender, game) {
                if (interceptor.log) game.logMsg(DSL._fill(interceptor.log, { carta: interceptorCard.name, defensor: DSL._nombre(game, defender) }), interceptor.logTipo || 'ability');
                if (interceptor.floating && typeof showFloatingText === 'function') showFloatingText(interceptorCard.instanceId, interceptor.floating.texto, interceptor.floating.estilo || 'ft-purple', interceptor.floating.offset !== undefined ? interceptor.floating.offset : -30);
                return interceptorCard;
            };
        }

        // PUEDE_ATACAR -> canAttackNormally: consulta de veto de ataque normal por
        // condición (p. ej. Muro parlante: solo puede atacar con Atq > 0).
        const puedeAtacar = abs.find(a => a.trigger === 'PUEDE_ATACAR');
        if (puedeAtacar && typeof tmpl.canAttackNormally !== 'function') {
            tmpl.canAttackNormally = function (card, game) {
                if (puedeAtacar.si && !DSL._cond(card, game, puedeAtacar.si)) {
                    if (puedeAtacar.msg) game.logError(DSL._fill(puedeAtacar.msg, { carta: card.name }));
                    return false;
                }
                return true;
            };
        }

        // EQUIPO_ANTES_DE_DEFENDER -> onEquipBeforeDefend: interceptor que corre cuando atacan a
        // QUIEN LLEVA este equipo (Poder Legado drena Furor al agresor). Es el hermano de
        // ANTES_DE_DEFENDER, pero el hook del motor es otro: aquel lo declara la carta que
        // defiende, y este el equipo que lleva puesto. `sourceCard` es el EQUIPO, `target` el
        // atacante, y el portador queda accesible como {defensor} en los textos.
        const eqDefender = abs.find(a => a.trigger === 'EQUIPO_ANTES_DE_DEFENDER');
        if (eqDefender && typeof tmpl.onEquipBeforeDefend !== 'function') {
            tmpl.onEquipBeforeDefend = async function (equipCard, defender, attacker, game) {
                if (eqDefender.si && !DSL._cond(defender, game, eqDefender.si)) return;
                if (eqDefender.log) game.logMsg(DSL._fill(eqDefender.log, { carta: equipCard.name, defensor: DSL._nombre(game, defender), objetivo: DSL._nombre(game, attacker) }), eqDefender.logTipo || 'ability');
                await DSL._runEffectList(eqDefender.efectos || [], equipCard, game, equipCard.owner, [attacker], eqDefender.nombre || null);
            };
        }

        // EQUIPO_ANTES_DE_ATACAR -> onEquipBeforeAttack: gemelo del anterior, para cuando ATACA
        // quien lleva el equipo (Milkor MGL). A diferencia del resto de triggers, el motor espera
        // un VALOR DE VUELTA -{dmgMod, newDefender}- que se recoge del transitorio que llenan los
        // ops DAÑO_ATAQUE y REDIRIGIR_ATAQUE. `sourceCard` es el EQUIPO y `target` el defensor;
        // el atacante (el portador) queda accesible para anclar flotantes.
        const eqAtacar = abs.find(a => a.trigger === 'EQUIPO_ANTES_DE_ATACAR');
        if (eqAtacar && typeof tmpl.onEquipBeforeAttack !== 'function') {
            tmpl.onEquipBeforeAttack = async function (equipCard, attacker, defender, game) {
                // soloAtaqueNormal: misma heurística que el resto de interceptores del proyecto.
                if (eqAtacar.soloAtaqueNormal && game.abilityContext && !game.abilityContext.isNormalAttack) return null;
                if (eqAtacar.si && !DSL._cond(equipCard, game, eqAtacar.si)) return null;
                game._dslEquipoAtaque = {};
                game._dslEquipoAtacante = attacker; // para `enAtacante` en los flotantes
                if (eqAtacar.log) game.logMsg(DSL._fill(eqAtacar.log, { carta: equipCard.name, atacante: DSL._nombre(game, attacker), objetivo: DSL._nombre(game, defender) }), eqAtacar.logTipo || 'ability');
                await DSL._runEffectList(eqAtacar.efectos || [], equipCard, game, equipCard.owner, [defender], eqAtacar.nombre || null);
                const r = game._dslEquipoAtaque;
                game._dslEquipoAtaque = null;
                game._dslEquipoAtacante = null;
                return (r && (r.dmgMod || r.newDefender)) ? r : null;
            };
        }

        // SOBRECURACION -> onBeforeHealed: permite rebasar la Vida máxima al curarse,
        // hasta un tope. El hook ya vive en la primitiva CURAR ("variante estándar");
        // esto solo lo declara para pasivas de expansión de Vida (Limo primario).
        const sobrecuracion = abs.find(a => a.trigger === 'SOBRECURACION');
        if (sobrecuracion && typeof tmpl.onBeforeHealed !== 'function') {
            tmpl.onBeforeHealed = function (card, amount, source, game) {
                const newTotal = card.currentHp + amount;
                if (newTotal > card.maxHp) {
                    const newMax = Math.min(sobrecuracion.max || 9, newTotal);
                    if (newMax > card.maxHp) {
                        const diff = newMax - card.maxHp;
                        card.maxHp = newMax;
                        const relleno = { carta: card.name, pasiva: tmpl.passiveName || sobrecuracion.nombre || 'SOBRECURACIÓN', max: newMax };
                        game.logMsg(DSL._fill(sobrecuracion.log || '¡{pasiva}! {carta} expande su Vida a {max}.', relleno), 'ability');
                        if (typeof showFloatingText === 'function') {
                            showFloatingText(card.instanceId, relleno.pasiva, 'ft-ability', -40);
                            showFloatingText(card.instanceId, `+${diff} VIDA MÁX.`, 'ft-green', -20);
                        }
                    }
                }
                return amount;
            };
        }

        // REACCION -> onHandReactionToAttack / onHandReactionToDamage.
        // Reacciones desde la mano (Cortarrollos, Inspiración, Pequeña traición,
        // Jugada arriesgada, Escudo mágico). El motor de combate ya recorre la mano
        // del defensor y llama a estos hooks (bucle de performAttack y de dealDamage);
        // aquí solo producimos las funciones con el contrato de retorno correcto.
        //  · sobre: 'ATAQUE'  -> onHandReactionToAttack(handCard, attacker, defender, game)
        //       return { used, newDefender?, drainFurorAfter?, cancelAttack? }
        //  · sobre: 'DAÑO'    -> onHandReactionToDamage(handCard, defender, attacker, dmg, isSpecial, game, p)
        //       return { used, newDmg }
        // El gate `si` decide si se ofrece el modal; el `prompt` es la pregunta SÍ/NO
        // (interactiva, solo la ve el reactor: 2ª persona correcta). El `log` de uso
        // y los efectos van en 3ª persona con {reactor}/{atacante}/{defensor} y género.
        const reaccion = abs.find(a => a.trigger === 'REACCION');
        if (reaccion) {
            const correr = async function (handCard, game, cx, result) {
                if (!DSL._reaccionGate(reaccion.si, handCard, game, cx)) return false;
                // Pre-chequeo de REDIRIGIR: sin aliado distinto al defensor, la carta
                // ni se ofrece (como la vieja: validTargets.length === 0 -> {used:false}).
                if ((reaccion.efectos || []).some(e => e.op === 'REDIRIGIR')) {
                    const p = game.players[handCard.owner];
                    const hay = [...p.vanguard, ...p.rearguard].some(c => c.instanceId !== cx.defensor.instanceId);
                    if (!hay) return false;
                }
                const quiere = await DSL._reaccionPrompt(
                    DSL._fill(reaccion.prompt || '¿Reaccionar?', {
                        carta: handCard.name,
                        atacante: DSL._nombre(game, cx.attacker), atacanteG: cx.attacker.gender,
                        defensor: DSL._nombre(game, cx.defensor), defensorG: cx.defensor.gender,
                    }), handCard, game, cx);
                if (!quiere) return false;
                if (reaccion.log) game.logMsg(DSL._fill(reaccion.log.msg, {
                    carta: handCard.name,
                    atacante: DSL._nombre(game, cx.attacker), atacanteG: cx.attacker.gender,
                    defensor: DSL._nombre(game, cx.defensor), defensorG: cx.defensor.gender,
                    reactor: (typeof game.getDisplayName === 'function' ? game.getDisplayName(handCard.owner) : handCard.owner),
                }), reaccion.log.tipo || 'ability');
                await DSL._runReaccion(reaccion.efectos, handCard, game, cx, result);
                return !result.abortar;
            };
            if (reaccion.sobre === 'DAÑO' && typeof tmpl.onHandReactionToDamage !== 'function') {
                tmpl.onHandReactionToDamage = async function (handCard, defender, attacker, dmg, isSpecial, game, p) {
                    const cx = { attacker, defensor: defender, isSpecial };
                    const result = { used: true, newDmg: dmg };
                    const ok = await correr(handCard, game, cx, result);
                    if (!ok) return { used: false, newDmg: dmg };
                    return result;
                };
            } else if (typeof tmpl.onHandReactionToAttack !== 'function') {
                tmpl.onHandReactionToAttack = async function (handCard, attacker, defender, game) {
                    const cx = { attacker, defensor: defender };
                    const result = { used: true };
                    const ok = await correr(handCard, game, cx, result);
                    if (!ok) return { used: false };
                    return result;
                };
            }
            // Las reacciones no se juegan como una Ayuda normal: se quedan en la mano.
            if (typeof tmpl.canPlayCard !== 'function') {
                tmpl.canPlayCard = function (card, game) {
                    if (reaccion.avisoNoJugable) game.logMsg(DSL._fill(reaccion.avisoNoJugable, { carta: card.name }), 'system');
                    return false;
                };
            }
        }

        // AL_MORIR -> onDeath(card, game). El motor lo llama en checkDeath con hp<=0. Si
        // la habilidad declara `gestionada: true`, onDeath devuelve true y el motor SUPRIME
        // la muerte normal (sin descarte/animación/log "ha sido destruido"), solo da la
        // Retribución: así Incluso En El KG vuelve a la mano (op VOLVER_A_MANO). Sin
        // gestionada, devuelve false y la muerte procede normal tras los efectos (Goodman
        // busca en el mazo si le queda Furor y luego muere). `si` es el gate opcional.
        const alMorir = abs.find(a => a.trigger === 'AL_MORIR');
        if (alMorir && typeof tmpl.onDeath !== 'function') {
            tmpl.onDeath = async function (card, game) {
                if (alMorir.si && !DSL._cond(card, game, alMorir.si)) return false;
                const relleno = { carta: DSL._nombre(game, card), nombre: card.name, pasiva: tmpl.passiveName || alMorir.nombre || '' };
                if (alMorir.log) game.logMsg(DSL._fill(alMorir.log.msg, relleno), alMorir.log.tipo || 'ability');
                if (alMorir.floating && typeof showFloatingText === 'function') {
                    showFloatingText(card.instanceId, DSL._fill(alMorir.floating.texto || relleno.pasiva, relleno), alMorir.floating.estilo || 'ft-ability', alMorir.floating.offset !== undefined ? alMorir.floating.offset : -30);
                }
                await DSL._runEffectList(alMorir.efectos || [], card, game, card.owner, [card], _habDeCarta(alMorir));
                return !!alMorir.gestionada;
            };
        }

        // AL_MORIR_ALIADO -> onAllyDeath(card, deadCard, game). El motor lo llama (en
        // checkDeath) para el Evento activo de AMBOS jugadores cada vez que muere una
        // carta; la habilidad decide con `si` si le concierne. Uso típico: un Evento
        // que se autodestruye si muere una carta clave (Esfuerzo dividido: un elegido).
        const alMorirAliado = abs.find(a => a.trigger === 'AL_MORIR_ALIADO');
        if (alMorirAliado && typeof tmpl.onAllyDeath !== 'function') {
            tmpl.onAllyDeath = async function (card, deadCard, game) {
                const si = alMorirAliado.si || {};
                if (si.deadCardEnSelfLista && !(Array.isArray(card[si.deadCardEnSelfLista]) && card[si.deadCardEnSelfLista].includes(deadCard.instanceId))) return;
                if (si.deadCardNombre && deadCard.name !== si.deadCardNombre) return;
                if (si.deadCardDe === 'PROPIO' && deadCard.owner !== card.owner) return;
                if (si.deadCardDe === 'RIVAL' && deadCard.owner === card.owner) return;
                if (alMorirAliado.log) game.logMsg(DSL._fill(alMorirAliado.log.msg, { carta: card.name, muerto: DSL._nombre(game, deadCard) }), alMorirAliado.log.tipo || 'ability');
                await DSL._runEffectList(alMorirAliado.efectos || [], card, game, card.owner, null, _habDeCarta(alMorirAliado));
                if (alMorirAliado.destruirseEvento) await game.destroyEvent(card.owner);
            };
        }

        // AL_DESTRUIR -> onDestroy(card, game, playerId). El motor lo llama en
        // destroyEvent (destrucción PREMATURA de un Evento, p. ej. por Giro de guion),
        // ANTES de mandarlo al descarte: sirve para deshacer efectos persistentes que
        // no se auto-limpian (Esfuerzo dividido quita Oculto/agotamiento a sus elegidos).
        const alDestruir = abs.find(a => a.trigger === 'AL_DESTRUIR');
        if (alDestruir && typeof tmpl.onDestroy !== 'function') {
            tmpl.onDestroy = async function (card, game, playerId) {
                if (alDestruir.log) game.logMsg(DSL._fill(alDestruir.log.msg, { carta: card.name, jugador: (typeof game.getDisplayName === 'function' ? game.getDisplayName(playerId) : playerId) }), alDestruir.log.tipo || 'system');
                await DSL._runEffectList(alDestruir.efectos || [], card, game, playerId, null);
            };
        }

        // GLOBAL_TRAS_ATAQUE -> onGlobalAfterAttack (eventos activos): reacciona a CUALQUIER ataque resuelto.
        const trasAtaque = abs.find(a => a.trigger === 'GLOBAL_TRAS_ATAQUE');
        if (trasAtaque && typeof tmpl.onGlobalAfterAttack !== 'function') {
            tmpl.onGlobalAfterAttack = async function (ev, attacker, defender, dmg, game) {
                const si = trasAtaque.si || {};
                if (si.atacante === 'PROPIO' && attacker.owner !== ev.owner) return;
                if (si.atacante === 'RIVAL' && attacker.owner === ev.owner) return;
                if (si.soloAtaqueNormal) { const esNormal = !game.abilityContext || game.abilityContext.isNormalAttack; if (!esNormal) return; }
                if (typeof si.dañoMinimo === 'number' && !(dmg >= si.dañoMinimo)) return;
                if (si.defensor && !DSL._cmp(DSL._field(defender, si.defensor.campo), si.defensor.op, si.defensor.valor)) return;
                if (si.atacanteCond && !DSL._cmp(DSL._field(attacker, si.atacanteCond.campo), si.atacanteCond.op, si.atacanteCond.valor)) return;
                if (trasAtaque.log) game.logMsg(String(trasAtaque.log.msg).replace('{defensor}', defender.name).replace('{atacante}', attacker.name), trasAtaque.log.tipo || 'ability');
                for (const e of (trasAtaque.efectos || [])) {
                    const t = (e.target && e.target.quien === 'ATACANTE') ? attacker : (e.target && e.target.quien === 'DEFENSOR') ? defender : defender;
                    const e2 = Object.assign({}, e); delete e2.target;
                    await DSL._doEffect(e2, ev, t, game, ev.owner);
                }
            };
        }

        // GLOBAL_MODIFICAR_FUROR -> onGlobalBeforeGainFuror (cadena): modifica la ganancia de Furor de cualquier carta.
        const modFuror = abs.find(a => a.trigger === 'GLOBAL_MODIFICAR_FUROR');
        if (modFuror && typeof tmpl.onGlobalBeforeGainFuror !== 'function') {
            tmpl.onGlobalBeforeGainFuror = function (ev, targetCard, amount, game, source) {
                if ((getCardTemplate(targetCard.id) || {}).isAvatar) return amount; // Kami: los Eventos no le tocan el Furor
                for (const r of (modFuror.reglas || [])) {
                    const si = r.si || {};
                    if (si.origen && source !== si.origen) continue;
                    if (si.objetivoSelfId && targetCard.instanceId !== ev[si.objetivoSelfId]) continue; // solo la carta anclada (p. ej. el deudor)
                    if (si.objetivoDe === 'PROPIO' && targetCard.owner !== ev.owner) continue;
                    if (si.objetivoDe === 'RIVAL' && targetCard.owner === ev.owner) continue;
                    if (si.algunaEtiqueta && !(targetCard.tags && si.algunaEtiqueta.some(t => targetCard.tags.includes(t)))) continue;
                    if (si.campoObjetivo && !DSL._cmp(DSL._field(targetCard, si.campoObjetivo.campo), si.campoObjetivo.op, si.campoObjetivo.valor)) continue;
                    if (si.campoSelf && !DSL._cmp(DSL._field(ev, si.campoSelf.campo), si.campoSelf.op, si.campoSelf.valor)) continue;
                    if (r.log) game.logMsg(String(r.log.msg).replace('{objetivo}', targetCard.name), r.log.tipo || 'ability');
                    if (r.floating && typeof showFloatingText === 'function') showFloatingText(targetCard.instanceId, r.floating.texto, r.floating.estilo || 'ft-red-stat', r.floating.offset !== undefined ? r.floating.offset : -30);
                    if (r.accion && typeof r.accion.fijar === 'number') return r.accion.fijar;
                    if (r.accion && typeof r.accion.sumar === 'number') return amount + r.accion.sumar;
                    if (r.accion && typeof r.accion.multiplicar === 'number') return amount * r.accion.multiplicar; // Dáedra (31-jul-2026): doble Furor
                }
                return amount;
            };
            if (typeof tmpl.onGlobalGetPreviewEffects !== 'function') {
                tmpl.onGlobalGetPreviewEffects = function (ev, targetCard, game) {
                    const _tt = getCardTemplate(targetCard.id) || {};
                    if (targetCard.owner !== ev.owner && _tt.immuneToEnemyEvents) return [];
                    const out = [];
                    for (const r of (modFuror.reglas || [])) {
                        if (!r.preview) continue;
                        const si = r.si || {};
                        if (si.objetivoSelfId && targetCard.instanceId !== ev[si.objetivoSelfId]) continue;
                        if (si.objetivoDe === 'PROPIO' && targetCard.owner !== ev.owner) continue;
                        if (si.objetivoDe === 'RIVAL' && targetCard.owner === ev.owner) continue;
                        if (si.algunaEtiqueta && !(targetCard.tags && si.algunaEtiqueta.some(t => targetCard.tags.includes(t)))) continue;
                        if (si.campoObjetivo && !DSL._cmp(DSL._field(targetCard, si.campoObjetivo.campo), si.campoObjetivo.op, si.campoObjetivo.valor)) continue;
                        if (si.campoSelf && !DSL._cmp(DSL._field(ev, si.campoSelf.campo), si.campoSelf.op, si.campoSelf.valor)) continue;
                        // Sintaxis estándar de "Afectado por:" (ver refCarta/lineaEfecto en index.html):
                        // el origen es un Evento -> sin "por HABILIDAD", y refCarta ya antepone "evento ".
                        out.push(`${r.preview}, fuente: ${typeof game.refCarta === 'function' ? game.refCarta(ev) : ev.name}`);
                    }
                    return out;
                };
            }
            // Ancla visual: las flechas del detalle apuntan a la píldora de Furor
            // cuando alguna regla de Furor de este evento aplica a la carta (el
            // motor consulta este hook al recolectar influencias; con AURA de
            // silencio a la vez, la flecha se desdobla a ambas badges).
            if (typeof tmpl.onGlobalGetPreviewBadges !== 'function') {
                tmpl.onGlobalGetPreviewBadges = function (ev, targetCard, game) {
                    const _tt = getCardTemplate(targetCard.id) || {};
                    if (targetCard.owner !== ev.owner && _tt.immuneToEnemyEvents) return [];
                    for (const r of (modFuror.reglas || [])) {
                        // Sin exigir r.preview: reglas solo-de-acción (como el corte de
                        // Furor de Deuda con la mafia) también anclan su flecha. si.origen
                        // no se evalúa aquí (es condición de runtime, no estática).
                        const si = r.si || {};
                        if (si.objetivoSelfId && targetCard.instanceId !== ev[si.objetivoSelfId]) continue;
                        if (si.objetivoDe === 'PROPIO' && targetCard.owner !== ev.owner) continue;
                        if (si.objetivoDe === 'RIVAL' && targetCard.owner === ev.owner) continue;
                        if (si.algunaEtiqueta && !(targetCard.tags && si.algunaEtiqueta.some(t => targetCard.tags.includes(t)))) continue;
                        if (si.campoObjetivo && !DSL._cmp(DSL._field(targetCard, si.campoObjetivo.campo), si.campoObjetivo.op, si.campoObjetivo.valor)) continue;
                        if (si.campoSelf && !DSL._cmp(DSL._field(ev, si.campoSelf.campo), si.campoSelf.op, si.campoSelf.valor)) continue;
                        return ['furor'];
                    }
                    return [];
                };
            }
        }

        // GLOBAL_INICIO_TURNO -> onGlobalStartTurn (eventos): al empezar un turno, ANTES de la fase de Furor.
        const inicioTurno = abs.find(a => a.trigger === 'GLOBAL_INICIO_TURNO');
        if (inicioTurno && typeof tmpl.onGlobalStartTurn !== 'function') {
            tmpl.onGlobalStartTurn = async function (ev, playerId, game) {
                if (inicioTurno.turnoDe === 'RIVAL' && playerId === ev.owner) return;
                if (inicioTurno.turnoDe === 'PROPIO' && playerId !== ev.owner) return;
                if (inicioTurno.log) game.logMsg(String(inicioTurno.log.msg).replace('{jugador}', typeof game.getDisplayName === 'function' ? game.getDisplayName(playerId) : playerId), inicioTurno.log.tipo || 'ability');
                const m = inicioTurno.moneda;
                if (!m) return;
                const res = await game.triggerCoinFlips(1, playerId);
                const rama = (res && res[0] === 'tails') ? m.cruz : m.cara; // sin resultado => rama de cara
                if (!rama) return;
                if (rama.log) game.logMsg(rama.log.msg, rama.log.tipo || 'neutral');
                (rama.marcar || []).forEach(mk => {
                    if (typeof mk.sumar === 'number') ev[mk.campo] = (ev[mk.campo] || 0) + mk.sumar;
                    else ev[mk.campo] = mk.valor;
                });
                if (Array.isArray(rama.efectos)) await DSL._runEffectList(rama.efectos, ev, game, ev.owner, null);
            };
        }

        // GLOBAL_ANTES_DE_ATAQUE -> onGlobalBeforeAttack: intercepta cualquier ataque; devuelve
        // permitir/bloquear. NO es solo para Eventos: collectAttackInterceptors (§11, index.html)
        // recorre TAMBIÉN las cartas del tablero, así que una Pasiva normal puede engancharse
        // aquí igual que un Evento (descubierto el 30-jul-2026 al revisar Agah).
        const antesAtaque = abs.find(a => a.trigger === 'GLOBAL_ANTES_DE_ATAQUE');
        if (antesAtaque && typeof tmpl.onGlobalBeforeAttack !== 'function') {
            tmpl.onGlobalBeforeAttack = async function (ev, attacker, defender, game) {
                if ((getCardTemplate(attacker.id) || {}).isAvatar || (defender && (getCardTemplate(defender.id) || {}).isAvatar)) return true; // Kami: ni monedas ni vetos de Eventos
                if (antesAtaque.soloAtacante === 'PROPIO' && attacker.owner !== ev.owner) return true;
                if (antesAtaque.soloAtacante === 'RIVAL' && attacker.owner === ev.owner) return true;
                // SELF (Agah, 30-jul-2026): a diferencia de PROPIO/RIVAL (miran el DUEÑO), esto
                // exige que la ATACANTE sea esta misma instancia — para una Pasiva de una carta
                // normal que solo debe reaccionar a SUS PROPIOS ataques, no a los de cualquier
                // aliado suyo.
                if (antesAtaque.soloAtacante === 'SELF' && attacker.instanceId !== ev.instanceId) return true;
                // soloAtaqueDirecto (Agah): la Pasiva de coste-por-ataque NO se aplica cuando el
                // ataque viene de una Activa (game.abilityContext presente) — DEVASTACIÓN AGAH ya
                // tiene su propio coste en Furor; replica el `if (!game.abilityContext)` a mano
                // de la vieja.
                if (antesAtaque.soloAtaqueDirecto && game.abilityContext) return true;
                if (antesAtaque.exentoPlantilla) {
                    const at = DSL._tmpl(attacker.id);
                    if (at && at[antesAtaque.exentoPlantilla]) return true; // p. ej. Simon con immuneToApagon
                }
                // unaVez: candado en la PROPIA carta de evento (viaja con el estado exportado).
                // Repetición: aviso privado al actor y BLOQUEAR (salvo resultado: 'PERMITIR').
                if (antesAtaque.unaVez) {
                    const u = antesAtaque.unaVez;
                    if (ev[u.campoSelf]) {
                        if (u.logRepite) game.logError(u.logRepite);
                        return u.resultado === 'PERMITIR';
                    }
                    ev[u.campoSelf] = true; // se marca ANTES de los efectos, como la versión imperativa
                }
                if (antesAtaque.log) game.logMsg(String(antesAtaque.log.msg).replace('{atacante}', attacker.name), antesAtaque.log.tipo || 'system');
                // efectos: corren con el ATACANTE como objetivo implícito (p. ej. el
                // ELEGIR + FIJAR_STAT del ataque combinado de Plan de equipo).
                if (Array.isArray(antesAtaque.efectos)) {
                    await DSL._runEffectList(antesAtaque.efectos, ev, game, ev.owner, [attacker]);
                }
                const m = antesAtaque.moneda;
                if (!m) return true;
                const res = await game.triggerCoinFlips(1, attacker.owner);
                if (res && res[0] === 'tails') {
                    const r = m.cruz || {};
                    if (r.log) game.logMsg(String(r.log.msg).replace('{atacante}', attacker.name), r.log.tipo || 'neutral');
                    if (r.agotarAtacante) attacker.exhausted = true;
                    return r.resultado === 'PERMITIR';
                }
                if (res && res[0] === 'heads') {
                    const r = m.cara || {};
                    if (r.log) game.logMsg(String(r.log.msg).replace('{atacante}', attacker.name), r.log.tipo || 'ability');
                    return r.resultado !== 'BLOQUEAR';
                }
                return m.sinResultado === 'PERMITIR'; // moneda cancelada
            };
            // Consulta SIN efectos (§11b), separada de la ejecución: ¿está vetado
            // INICIAR un ataque? El motor la usa al clicar la carta atacante o al
            // activar una Habilidad con ataque, ANTES de elegir objetivo. El marcado
            // del candado y los efectos siguen viviendo en onGlobalBeforeAttack.
            if (antesAtaque.unaVez && typeof tmpl.onVetoAttackStart !== 'function') {
                tmpl.onVetoAttackStart = function (ev, attacker, game) {
                    if (antesAtaque.soloAtacante === 'PROPIO' && attacker.owner !== ev.owner) return null;
                    if (antesAtaque.soloAtacante === 'RIVAL' && attacker.owner === ev.owner) return null;
                    if ((getCardTemplate(attacker.id) || {}).isAvatar) return null;
                    if (antesAtaque.exentoPlantilla) {
                        const at = DSL._tmpl(attacker.id);
                        if (at && at[antesAtaque.exentoPlantilla]) return null;
                    }
                    if (ev[antesAtaque.unaVez.campoSelf]) return antesAtaque.unaVez.logRepite || 'No puedes iniciar otro ataque.';
                    return null;
                };
            }
        }

        const caducar = abs.find(a => a.trigger === 'AL_CADUCAR');
        if (caducar && typeof tmpl.onExpire !== 'function') {
            tmpl.onExpire = async function (ev, game, playerId) {
                if (caducar.log) game.logMsg(DSL._fill(caducar.log, { jugador: (typeof game.getDisplayName === 'function' ? game.getDisplayName(playerId) : playerId), carta: ev.name }), caducar.logTipo || 'ability');
                const res = await DSL._runEffectList(caducar.efectos, ev, game, playerId, null);
                if (res.anyApplied && caducar.logSiAplicado) game.logMsg(caducar.logSiAplicado.msg, caducar.logSiAplicado.tipo || 'ability');
            };
        }
        // GLOBAL_ANTES_DE_CAMBIO_STAT -> onGlobalBeforeStatChange: interceptor de CUALQUIER
        // cambio de stat del tablero mientras el Evento esté en juego (Bancarrota congela el
        // Furor). No confundir con GLOBAL_MODIFICAR_FUROR, que solo mira la GANANCIA de la fase
        // de Furor: este pasa por modifyStat, o sea por todas las subidas y bajadas, vengan de
        // donde vengan. Devuelve la cantidad ya modificada; `fijar: 0` la anula del todo.
        const globalStat = abs.find(a => a.trigger === 'GLOBAL_ANTES_DE_CAMBIO_STAT');
        if (globalStat && typeof tmpl.onGlobalBeforeStatChange !== 'function') {
            tmpl.onGlobalBeforeStatChange = function (ev, target, stat, amount, source, game) {
                const _tt = getCardTemplate(target.id) || {};
                // Kami es intocable SIEMPRE (Toto, 5-ago-2026): a diferencia de
                // `immuneToEnemyEvents` -que solo protege del Evento RIVAL-, el "Inmune a TODO"
                // de un Avatar no depende de quién lo lanzó, ni siquiera de su propio dueño.
                if (_tt.isAvatar) return amount;
                // Mismo veto que las líneas del detalle (ver onGlobalGetPreviewEffects): un
                // enemigo inmune a Eventos no se entera de este interceptor (Eris).
                if (target.owner !== ev.owner && _tt.immuneToEnemyEvents) return amount;
                for (const r of (globalStat.reglas || [])) {
                    if (r.stat && r.stat !== stat) continue;
                    if (r.quien === 'ALIADO' && target.owner !== ev.owner) continue;
                    if (r.quien === 'ENEMIGO' && target.owner === ev.owner) continue;
                    if (r.filtros && !r.filtros.every(f => DSL._match(target, f))) continue;
                    if (r.fijar !== undefined) return r.fijar;
                    if (r.delta !== undefined) return amount + r.delta;
                }
                return amount;
            };
            // Ancla visual de la flecha del detalle (Toto, 5-ago-2026): sin esto, cualquier carta
            // afectada por este interceptor apunta al CENTRO de la carta en vez de a la píldora
            // del stat en cuestión — mismo hueco que ya se cubrió para GLOBAL_MODIFICAR_FUROR
            // (ver onGlobalGetPreviewBadges más abajo), pero ese vive en OTRO trigger y Bancarrota
            // usa este. Reutiliza EXACTAMENTE la lógica de onGlobalBeforeStatChange -probando con
            // una cantidad de sondeo- para no duplicar la inmunidad ni las reglas por triplicado.
            if (typeof tmpl.onGlobalGetPreviewBadges !== 'function') {
                tmpl.onGlobalGetPreviewBadges = function (ev, target, game) {
                    if (tmpl.onGlobalBeforeStatChange(ev, target, 'furor', 1, null, game) !== 1) return ['furor'];
                    return [];
                };
            }
        }

        const previewG = abs.find(a => a.trigger === 'PREVIEW_GLOBAL');
        if (previewG) {
            const _prevHook = tmpl.onGlobalGetPreviewEffects; // combinamos, no cedemos (el auto-preview de furor podía hacer sombra)
            // Líneas de influencia continua de un Evento sobre cartas: alimentan 'Afectado por' y las flechas.
            tmpl.onGlobalGetPreviewEffects = function (ev, target, game) {
                const tplT = getCardTemplate(target.id) || {};
                if (target.owner !== ev.owner && tplT.immuneToEnemyEvents) return []; // p. ej. Kami
                const dn = typeof game.getDisplayName === 'function' ? game.getDisplayName(ev.owner) : ev.owner;
                const out = [];
                if ((getCardTemplate(target.id) || {}).isAvatar) { if (typeof _prevHook === 'function') return _prevHook(ev, target, game) || []; return []; } // Kami: sin líneas de Eventos
                for (const l of (previewG.lineas || [])) {
                    if (l.quien === 'ALIADO' && target.owner !== ev.owner) continue;
                    if (l.quien === 'ENEMIGO' && target.owner === ev.owner) continue;
                    if (l.soloTipos && !l.soloTipos.includes(target.type)) continue;
                    if (l.zona === 'VANGUARDIA' && target.location !== 'vanguard') continue; // p. ej. retirarse solo aplica a quien está EN vanguardia
                    if (l.zona === 'RETAGUARDIA' && target.location !== 'rearguard') continue;
                    if (l.algunaEtiqueta && !(target.tags && l.algunaEtiqueta.some(t => target.tags.includes(t)))) continue;
                    if (l.filtros && !l.filtros.every(f => DSL._match(target, f))) continue;
                    if (l.exentoPlantilla && tplT[l.exentoPlantilla]) continue;
                    if (l.campoSelfId && ev[l.campoSelfId] !== target.instanceId) continue;
                    if (l.campoSelfLista && !(Array.isArray(ev[l.campoSelfLista]) && ev[l.campoSelfLista].includes(target.instanceId))) continue;
                    // valorCampo (Bancarrota, 31-jul-2026): mete en {valor} un campo de la carta
                    // AFECTADA, para líneas que dependen de cada una ("originalmente 3"). Antes
                    // el texto solo podía interpolar el género, que es igual para todas.
                    const _rell = { genero: target.gender };
                    if (l.valorCampo) _rell.valor = (target[l.valorCampo] !== undefined ? target[l.valorCampo] : 0);
                    out.push(`${DSL._fill(l.texto, _rell)}, fuente: ${typeof game.refCarta === 'function' ? game.refCarta(ev) : ev.name}`);
                }
                if (typeof _prevHook === 'function') out.push(...(_prevHook(ev, target, game) || []));
                return out;
            };
        }

        if (JSON.stringify(abs).includes('"MARCAR_TEMPORAL"')) {
            if (typeof tmpl.onEndTurnTempEffect !== 'function') {
                // Las marcas con hastaFinDeTurnoPropio caducan al terminar el turno del dueño de la carta marcada
                tmpl.onEndTurnTempEffect = function (card, eff, game, activePid) {
                    return !(eff.hastaFinDeTurnoPropio && card.owner === activePid);
                };
            }
            // stats (Capitán Guardia Real, LIDERAZGO, 28-jul-2026): reaplica el bono de
            // Atq/Def de cualquier marca que lo declare (ver `stats` en MARCAR_TEMPORAL) sin
            // que la carta necesite su propio onUpdateTempEffect a mano.
            if (typeof tmpl.onUpdateTempEffect !== 'function') {
                tmpl.onUpdateTempEffect = function (card, eff, game) {
                    if (!eff.stats) return;
                    if (eff.stats.atk) card.currentAtk += eff.stats.atk;
                    if (eff.stats.def) card.currentDef += eff.stats.def;
                };
            }
            // vetoAtaqueNormal (Clarise, PESANTEZ MUTUA, 28-jul-2026): la carta marcada no puede
            // hacer ataques NORMALES mientras la marca dure. La heurística de "¿es normal?" es
            // la misma que usaba la Clarise imperativa: sin abilityContext es un ataque normal
            // directo del tablero; con él, cuenta como normal si la Habilidad se declaró
            // `ataqueNormal` (isNormalAttack) — así una Activa de ataque ESPECIAL (CHIRIBITA,
            // LUZ VIRTUOSA) sí puede usarse, que es justo lo que dice el texto de la carta.
            // El mensaje sale de `tempEffectVetoLog` en la plantilla, mismo sitio que el
            // `tempEffectText` del preview (la marca guarda solo el flag: los textos no viajan
            // en el estado exportado).
            if (typeof tmpl.onBeforeAttackTempEffect !== 'function') {
                tmpl.onBeforeAttackTempEffect = async function (attacker, eff, defender, game) {
                    if (!eff.vetoAtaqueNormal || !DSL._vetoAtaqueAplica(attacker)) return true;
                    const esNormal = !game.abilityContext || game.abilityContext.isNormalAttack;
                    if (!esNormal) return true;
                    if (tmpl.tempEffectVetoLog) game.logMsg(DSL._fill(tmpl.tempEffectVetoLog, { objetivo: DSL._nombre(game, attacker), genero: attacker.gender }), 'ability');
                    return false;
                };
            }
            // Veto TEMPRANO (§11b): el aviso sale al CLICAR la carta, no tras pedir objetivo y
            // agotarla en balde (betasteo de Toto, 28-jul-2026). Devuelve el texto del aviso, y
            // el motor (getAttackStartVeto) lo saca por logError. Aquí no hay abilityContext
            // todavía —se está iniciando un ataque normal desde el tablero— así que basta con
            // comprobar si el veto alcanza a esta carta.
            if (typeof tmpl.onVetoAttackStartTempEffect !== 'function') {
                tmpl.onVetoAttackStartTempEffect = function (attacker, eff, game) {
                    if (!eff.vetoAtaqueNormal || !DSL._vetoAtaqueAplica(attacker)) return null;
                    return tmpl.tempEffectVetoLog
                        ? DSL._fill(tmpl.tempEffectVetoLog, { objetivo: DSL._nombre(game, attacker), genero: attacker.gender })
                        : null;
                };
            }
            // hastaInicioTurnoLanzador: caduca al empezar el turno de quien puso la marca.
            // provocaAtaque (Achmay, PÉGAME PERRA, 31-jul-2026): al empezar el turno de la
            // CARTA MARCADA (no del lanzador), la marca los deja a mano forcedAttackTarget
            // -campo genérico del motor, ya leído en la fase de inicio de turno bajo el
            // comentario "ATAQUES FORZADOS"- apuntando a `sourceInstanceId` (la propia
            // Achmay) y se autoconsume (return false, una sola vez).
            // Los efectos de `cuentaAtras` no pueden viajar en la marca, así que se recuperan de
            // la propia declaración recorriendo `abs`. Con más de un MARCAR_TEMPORAL con cuenta
            // atrás en la misma carta se coge el primero: ninguna de las que lo usan tiene dos, y
            // distinguirlos exigiría marcarlas con un id que sí tendría que viajar en el estado.
            const _cuentaAtras = (() => {
                let hallado = null;
                const rec = (n) => {
                    if (!n || hallado) return;
                    if (Array.isArray(n)) { n.forEach(rec); return; }
                    if (typeof n !== 'object') return;
                    if (n.op === 'MARCAR_TEMPORAL' && n.cuentaAtras) { hallado = n.cuentaAtras; return; }
                    Object.values(n).forEach(rec);
                };
                rec(abs);
                return hallado;
            })();
            if (typeof tmpl.onStartTurnTempEffect !== 'function') {
                tmpl.onStartTurnTempEffect = async function (card, eff, game, activePid) {
                    if (eff.provocaAtaque && card.owner === activePid) {
                        card.forcedAttackTarget = eff.sourceInstanceId;
                        return false;
                    }
                    // Cuenta atrás por turnos PROPIOS del portador. El turno en que se colocó no
                    // cuenta (mismo criterio que la Poder Legado imperativa: `turnApplied`),
                    // porque si no un equipo jugado en tu turno gastaría un tick al instante.
                    if (eff.cuentaAtras && _cuentaAtras && card.owner === activePid) {
                        if (eff.turnApplied === game.turn) return true;
                        eff.duration = (eff.duration || 0) - 1;
                        const _n = (eff.cuentaTotal || 0) - eff.duration;
                        const _rell = { objetivo: DSL._nombre(game, card), n: _n, total: eff.cuentaTotal, restantes: eff.duration };
                        if (eff.duration > 0) {
                            // Sigue viva: solo el aviso de progreso.
                            if (_cuentaAtras.contador && typeof game.modifyCounters === 'function') {
                                const _src = (typeof game.findCard === 'function' && eff.sourceInstanceId) ? game.findCard(eff.sourceInstanceId) : null;
                                game.modifyCounters(card, _cuentaAtras.contador.id, 1, _cuentaAtras.contador.nombre, _src || tmpl.name, _cuentaAtras.contador.icono || '⏳');
                            }
                            if (_cuentaAtras.floating && typeof showFloatingText === 'function') showFloatingText(card.instanceId, DSL._fill(_cuentaAtras.floating.texto, _rell), _cuentaAtras.floating.estilo || 'ft-ability', _cuentaAtras.floating.offset !== undefined ? _cuentaAtras.floating.offset : -20);
                            return true;
                        }
                        // Agotada: los efectos corren con la carta EQUIPO como fuente (es quien se
                        // desequipa y quien nombra el log) y el PORTADOR como objetivo.
                        if (_cuentaAtras.log) game.logMsg(DSL._fill(_cuentaAtras.log, _rell), _cuentaAtras.logTipo || 'system');
                        if (_cuentaAtras.floatingFinal && typeof showFloatingText === 'function') showFloatingText(card.instanceId, DSL._fill(_cuentaAtras.floatingFinal.texto, _rell), _cuentaAtras.floatingFinal.estilo || 'ft-red-stat', _cuentaAtras.floatingFinal.offset !== undefined ? _cuentaAtras.floatingFinal.offset : -30);
                        const _src = (typeof game.findCard === 'function' && eff.sourceInstanceId) ? game.findCard(eff.sourceInstanceId) : null;
                        if (_cuentaAtras.contador && card.counters) delete card.counters[_cuentaAtras.contador.id];
                        if (_src) await DSL._runEffectList(_cuentaAtras.alCaducar || [], _src, game, _src.owner, [card]);
                        return false; // el motor retira la marca
                    }
                    if (!(eff.hastaInicioTurnoLanzador && eff.ownerId === activePid)) return true;
                    if (tmpl.tempEffectExpiraLog) game.logMsg(DSL._fill(tmpl.tempEffectExpiraLog, { objetivo: DSL._nombre(game, card), genero: card.gender }), 'system');
                    return false;
                };
            }
            if (tmpl.tempEffectText && typeof tmpl.onGetPreviewEffects !== 'function') {
                tmpl.onGetPreviewEffects = function (card, game, eff) {
                    if (!eff) return [];
                    // La carta origen (Ayuda/Evento que dejó la marca) puede estar ya en descartes:
                    // se busca por instanceId y, si no aparece, queda su nombre como respaldo.
                    const src = (eff.sourceInstanceId && typeof game.findCard === 'function') ? game.findCard(eff.sourceInstanceId) : null;
                    const ref = src && typeof game.refCarta === 'function' ? game.refCarta(src) : tmpl.name;
                    return [`${DSL._fill(tmpl.tempEffectText, { genero: card.gender })}, fuente: ${ref}`];
                };
            }
        }

        // ANTES_DE_JUGAR -> onBeforePlayAsync: efectos previos a la colocación
        // (p. ej. el ELEGIR del deudor de Deuda con la mafia). Si un efecto no
        // opcional se cancela, la carta NO se coloca (sigue en la mano).
        const antesJugar = abs.find(a => a.trigger === 'ANTES_DE_JUGAR');
        // `pausaEnEscaparate`: lo que esta carta hace antes de colocarse tiene ANIMACIÓN que
        // merece verse (destruir cartas del campo), así que la presentación se queda parada en
        // el centro mientras ocurre. Se sube a la plantilla para que el cliente no tenga que
        // bucear en las abilities. Solo la piden Némesis (su vanguardia) y Giro de guion (los
        // Eventos): un coste de Furor no tiene nada que esperar.
        if (antesJugar && antesJugar.pausaEnEscaparate) tmpl.pausaEnEscaparate = true;
        if (antesJugar && typeof tmpl.onBeforePlayAsync !== 'function') {
            tmpl.onBeforePlayAsync = async function (card, game, p) {
                // log (Némesis, 31-jul-2026): faltaba, a diferencia de AL_JUGAR/INICIO_TURNO/
                // FIN_TURNO, que ya lo tienen — necesario para anunciar un coste de colocación
                // ANTES de que la carta se coloque (p. ej. "aniquila su propia vanguardia").
                if (antesJugar.log) game.logMsg(DSL._fill(antesJugar.log, { carta: card.name }), antesJugar.logTipo || 'ability');
                const res = await DSL._runEffectList(antesJugar.efectos || [], card, game, card.owner, null, _habDeCarta(antesJugar));
                const ok = !(res && res.ok === false);
                // PUNTO DE COMPROMISO (§14). La presentación queda ARMADA al empezar a jugar la
                // carta y la dispara el primer efecto que ya no se pueda cancelar. Pero una
                // cadena que es ELEGIR de principio a fin no tiene ninguno: el ELEGIR se salta
                // _comprometer a propósito -mientras eliges, aún puedes arrepentirte- y si la
                // lista se acaba ahí no queda nadie que lo llame. Publicidad mental y
                // Exhibicionismo eran justo eso (su ELEGIR solo APUNTA a quién, y el efecto real
                // es un AURA continua, que no es un efecto de la lista): se colocaban sin
                // presentarse (Toto, 15-ago-2026).
                // Aquí la cadena cancelable ya terminó y la carta se va a colocar, así que es el
                // punto de compromiso pase lo que pase. _comprometer es idempotente -lo primero
                // que hace _dispararPresentacion es vaciar _presentacionArmada-, así que si un
                // efecto anterior ya lo disparó, esto no hace nada.
                if (ok) await DSL._comprometer(card, game);
                return ok;
            };
        }

        // AURA -> onUpdatePassive (eventos y cartas en mesa): marca campos de forma
        // CONTINUA en las cartas que cumplan los filtros (updatePassives limpia y
        // reaplica en cada pasada). Fiel a las auras imperativas que sustituye:
        // sin exención de Avatar (la Feria imperativa silenciaba también a Kami).
        // ESPEJO -> onUpdatePassive: la carta "clon" copia en vivo stats de otra carta
        // (la referenciada por un campo propio, p. ej. parentId) y se desvanece si esa
        // carta ya no está en el campo. Reutilizable por cualquier ficha-clon.
        const espejo = abs.find(a => a.trigger === 'ESPEJO');
        if (espejo && typeof tmpl.onUpdatePassive !== 'function') {
            tmpl.onUpdatePassive = function (card, game) {
                if (espejo.furorCero) { card.maxFuror = 0; card.furor = 0; }
                const pid = card[espejo.de];
                if (!pid) return;
                const parent = game.findCard(pid);
                if (parent && (parent.location === 'vanguard' || parent.location === 'rearguard')) {
                    (espejo.copiar || []).forEach(s => { card[s] = parent[s]; });
                } else if (espejo.muerteSiSinPadre) {
                    card.currentHp = 0;
                    game.checkDeath(card, false); // muerte súbita, sin retribución (fire-and-forget, como la vieja)
                }
            };
        }

        const auras = abs.filter(a => a.trigger === 'AURA');
        if (auras.length && typeof tmpl.onUpdatePassive !== 'function') {
            tmpl.onUpdatePassive = function (ev, game, p) {
                const propio = game.players[ev.owner];
                const rival = game.players[ev.owner === 'p1' ? 'p2' : 'p1'];
                for (const a of auras) {
                    const lados = a.quien === 'ENEMIGO' ? [rival] : a.quien === 'CUALQUIERA' ? [propio, rival] : [propio];
                    for (const lado of lados) {
                        [...lado.vanguard, ...lado.rearguard].forEach(c => {
                            if (a.soloSelfId && c.instanceId !== ev[a.soloSelfId]) return;
                            // soloSelfLista: solo las cartas cuyo instanceId está en la lista
                            // guardada en el Evento (Esfuerzo dividido: chosenAllies).
                            if (a.soloSelfLista && !(Array.isArray(ev[a.soloSelfLista]) && ev[a.soloSelfLista].includes(c.instanceId))) return;
                            if (a.algunaEtiqueta && !(c.tags && a.algunaEtiqueta.some(t => c.tags.includes(t)))) return;
                            if (a.sinAlgunaEtiqueta && c.tags && a.sinAlgunaEtiqueta.some(t => c.tags.includes(t))) return;
                            if (a.filtros && !a.filtros.every(f => DSL._match(c, f))) return;
                            (Array.isArray(a.marcar) ? a.marcar : (a.marcar ? [a.marcar] : [])).forEach(m => { c[m.campo] = m.valor !== undefined ? m.valor : true; });
                            // stats (Cogorza, 31-jul-2026): bono continuo de Atq/Def a las cartas
                            // que el aura alcanza, además de los campos que marca. Seguro e
                            // idempotente porque updatePassives resetea currentAtk/currentDef a la
                            // base de plantilla en CADA pasada antes de llamar aquí (mismo motivo
                            // por el que `stats` de MARCAR_TEMPORAL puede sumar a pelo).
                            if (a.stats) {
                                if (a.stats.atk) c.currentAtk += a.stats.atk;
                                if (a.stats.def) c.currentDef += a.stats.def;
                            }
                        });
                    }
                }
            };
        }

        const alEntrar = abs.find(a => a.trigger === 'AL_ENTRAR');
        if (alEntrar && typeof tmpl.onUpdatePassive !== 'function') {
            // Reacciona a cartas que ENTRAN en juego (justPlayed) mientras esta carta está activa/en mesa.
            // Corre dentro de updatePassives: efectos síncronos, con marcador anti-repetición por carta entrante.
            tmpl.onUpdatePassive = function (card, game, p) {
                const marca = alEntrar.marcador || ('_dslEntra_' + tmpl.id);
                const si = alEntrar.si || {};
                const propio = game.players[card.owner];
                const rival = game.players[card.owner === 'p1' ? 'p2' : 'p1'];
                const lados = si.quien === 'ENEMIGO' ? [rival] : si.quien === 'CUALQUIERA' ? [propio, rival] : [p || propio];
                for (const lado of lados) {
                    [...lado.vanguard, ...lado.rearguard].forEach(c => {
                        if (!c.justPlayed || c[marca]) return;
                        if ((getCardTemplate(c.id) || {}).isAvatar) return; // Kami: inmune también a auras de entrada
                        if (si.algunaEtiqueta && !(c.tags && si.algunaEtiqueta.some(t => c.tags.includes(t)))) return;
                        if (si.filtros && !si.filtros.every(f => DSL._match(c, f))) return;
                        c[marca] = true;
                        for (const e of (alEntrar.efectos || [])) DSL._doEffectSync(e, card, c, game, card.owner);
                    });
                }
            };
        }

        const inicioTurnoCarta = abs.find(a => a.trigger === 'INICIO_TURNO');
        if (inicioTurnoCarta && typeof tmpl.onStartTurn !== 'function') {
            tmpl.onStartTurn = async function (card, game) {
                if (inicioTurnoCarta.soloTurnoPropio !== false && card.owner !== game.activePlayerId) return;
                // si (Karlitos, 31-jul-2026): condición sobre la propia carta, igual que en los
                // triggers de ataque/defensa. Faltaba aquí, así que una Pasiva de inicio de turno
                // no podía apagarse a sí misma (Karlitos: dejar de entrenar una vez entrenado).
                if (inicioTurnoCarta.si && !DSL._cond(card, game, inicioTurnoCarta.si)) return;
                const pid = card.owner;
                if (inicioTurnoCarta.log) game.logMsg(DSL._fill(inicioTurnoCarta.log, { carta: card.name, jugador: (typeof game.getDisplayName === 'function' ? game.getDisplayName(pid) : pid) }), inicioTurnoCarta.logTipo || 'ability');
                // El nombre de la Pasiva se propaga como `habilidad`, igual que hacen ACTIVA,
                // TRAS_DEFENDER y compañía: es lo que pone el "por PRÁCTICA CONSTANTE" en la
                // línea del detalle. INICIO_TURNO era el único que pasaba null (Toto, 31-jul-2026).
                await DSL._runEffectList(inicioTurnoCarta.efectos, card, game, pid, null, inicioTurnoCarta.nombre || tmpl.passiveName || null);
            };
        }

        const finTurno = abs.find(a => a.trigger === 'FIN_TURNO');
        if (finTurno && typeof tmpl.onEndTurn !== 'function') {
            tmpl.onEndTurn = async function (card, game, playerId) {
                if (finTurno.soloTurnoPropio !== false && card.owner !== game.activePlayerId) return;
                const pid = playerId || card.owner;
                if (finTurno.log) game.logMsg(DSL._fill(finTurno.log, { carta: card.name, jugador: (typeof game.getDisplayName === 'function' ? game.getDisplayName(pid) : pid) }), finTurno.logTipo || 'ability');
                await DSL._runEffectList(finTurno.efectos, card, game, pid, null, _habDeCarta(finTurno));
            };
        }

        return true;
    }
};

// Compilar todas las cartas declarativas al cargar.
(function () {
    let n = 0, bad = 0;
    CARD_DB.forEach(t => { if (t && Array.isArray(t.abilities)) { DSL.compile(t) ? n++ : bad++; } });
    if (typeof console !== 'undefined') console.log(`[DSL] Cartas declarativas compiladas: ${n}` + (bad ? ` · con errores: ${bad}` : ''));
})();