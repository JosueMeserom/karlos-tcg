// archivo: cartas.js

const CARD_DB = [
    { 
        id: 1, name: "Karlos", hp: 6, def: 6, atk: 5, type: "Personaje", subtype: "Ser vivo", tags: ['Mercenario', 'Usuario de VP'], gender: 'M', rarity: "A", 
        text: "P: Si Vida <= 3, +2 Atq. A: BI-CHOQUE (1F) Ataca a 2 enemigos con Atq-1.", 
        passiveName: "MEGADRENALINA", activeName: "BI-CHOQUE", series: 1,
        
        // HOOK 1: La Pasiva
        onUpdatePassive: function(card, game) {
            const isActive = card.currentHp <= 3;
            
            if (isActive && !card.passiveActive) {
                game.logMsg(`¡Habilidad pasiva de ${game.getCardNameWithOwner(card)}: ${card.passiveName} tiene lugar! (+2 de Atq por tener Vida <= 3)`, 'ability');
                showFloatingText(card.instanceId, card.passiveName, "ft-ability", -40); 
                showFloatingText(card.instanceId, "+2 ATQ", "ft-green", -20);
                card.passiveActive = true;
            } else if (!isActive && card.passiveActive) {
                game.logMsg(`${card.passiveName} (${game.getCardNameWithOwner(card)}) desactivada.`, 'system');
                card.passiveActive = false;
            }
            
            if (isActive) {
                card.currentAtk += 2;
            }
        },

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
                game.logError("No hay suficientes enemigos válidos para Bi-choque.");
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
                        dodged = await defTemplate.onBeforeDefend(target, attacker, game, game.abilityContext.name);
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

        onGetPreviewEffects: function(card, game) {
            if (card.passiveActive) {
                return [`+2 ATQ, fuente: esta carta (Habilidad pasiva: ${this.passiveName})`];
            }
            return [];
        },
    },
    {
        id: 2, name: "Zoe", hp: 2, def: 2, atk: 7, type: "Personaje", subtype: "Ser vivo", tags: ['Usuaria de VP'], gender: 'F', rarity: "A",
        text: "SISAR (1 de Furor): Tu rival descarta una Ayuda. Moneda: Cara = Ataque con Atq-3 sin pasiva.", 
        passiveName: "JUSTICIERA ARDIENTE", activeName: "SISAR", activeCost: 1, series: 1,

        // HOOK 1: Pasiva de Defensa
        onUpdatePassive: function(card, game) {
            const hasDoT = card.status && card.status.dot && card.status.dot.duration > 0;
            if (hasDoT && !card.zoeDefBuffActive) {
                game.logMsg(`¡Habilidad pasiva de ${game.getCardNameWithOwner(card)}: ${card.passiveName} tiene lugar! (+2 DEF)`, 'ability');
                showFloatingText(card.instanceId, card.passiveName, "ft-ability", -40);
                showFloatingText(card.instanceId, "+2 DEF", "ft-green", -20);
                card.currentDef += 2;
                card.zoeDefBuffActive = true;
            } else if (!hasDoT && card.zoeDefBuffActive) {
                card.currentDef -= 2;
                card.zoeDefBuffActive = false;
            }
        },

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

        // HOOK 4: Empezar SISAR (Verifica mano rival)
        // ZOE REPARADA: Todo el proceso se unifica en onExecuteAbility
        onExecuteAbility: async function(card, game) {
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            const enemyP = game.players[enemyId];
            
            game.modifyStat(card, 'furor', -1); // Ajusta el coste a 1 o el que tenga
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);
            
            if (enemyP.hand.length === 0) {
                game.logMsg(`La mano del rival está vacía. ${card.activeName} no tiene efecto.`, 'system');
            } else {
                game.logMsg(`¡Zoe usa ${card.activeName} y revisa la mano del rival!`, 'ability');
                
                // IMPORTANTE: NO usamos forceReveal. El modal ya nos dibuja las cartas.
                // Pasamos 'card.owner' al final para que el rival vea el cartel de "Esperando a que J1 busque..."
                const chosen = await game.openVisualSearchModal(`SISAR: Elige 1 carta para descartar`, enemyP.hand, 1, true, card.owner);

                if (chosen && chosen.length > 0) {
                    const targetCard = chosen[0];
                    const handIdx = enemyP.hand.findIndex(c => c.instanceId === targetCard.instanceId);
                    if (handIdx !== -1) {
                        enemyP.hand.splice(handIdx, 1);
                        if (!enemyP.discard) enemyP.discard = [];
                        enemyP.discard.push(targetCard);
                        targetCard.location = 'discard';
                        game.logMsg(`${game.getCardNameWithOwner(card)} ha descartado ${targetCard.name} de la mano del rival.`, 'ability');
                    }
                }
            }
            
            game.updatePassives();
            game.render();

            // HOOK 5: Retomar SISAR tras el descarte (Integrado aquí para que no rompa la ejecución)
            const results = await game.triggerCoinFlips(1, card.owner);
            if (!results) {
                game.isActionLocked = false;
                game.cancelAction(); 
                return;
            }

            if (results[0] === 'heads') {
                game.logMsg("Moneda: CARA - Elige objetivo para ataque debilitado.", 'ability');
                game.selectedCard = card;
                game.inputState = 'SELECT_ABILITY_TARGETS'; 
                game.abilityContext = { targets: [], maxTargets: 1, name: 'SISAR', targetType: 'enemy', isNormalAttack: true };
                game.isActionLocked = true; 
            } else {
                game.logMsg("Moneda: CRUZ - Habilidad termina.", 'neutral');
                card.exhausted = true;
                game.isActionLocked = false; 
                game.cancelAction();
            }
            game.render();
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
                dodged = await defTemplate.onBeforeDefend(defender, attacker, game, game.abilityContext ? game.abilityContext.name : null);
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
        
        onGetPreviewEffects: function(card, game) {
            if (card.zoeDefBuffActive) {
                return [`+2 DEF, fuente: esta carta (Habilidad pasiva: ${this.passiveName})`];
            }
            return [];
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
        text: "P: Mientras tenga 4 o más de vida, su Def y su Atq aumentan en 2. A: REPARACIÓN MOLECULAR (1F): Cura 2 de Vida a un aliado.", 
        passiveName: "ENTEREZA DEL INGENUO", activeName: "REPARACIÓN MOLECULAR", series: 1,

        // HOOK 1: La Pasiva con temporizador inteligente
        onUpdatePassive: function(card, game) {
            const isActive = card.currentHp >= 4;
            
            if (isActive && !card.passiveActive) {
                // Función para disparar los efectos visuales
                const triggerVisuals = () => {
                    game.logMsg(`¡Habilidad pasiva de ${game.getCardNameWithOwner(card)}: ${card.passiveName} activa! (+2 ATQ y +2 DEF)`, 'ability');
                    showFloatingText(card.instanceId, card.passiveName, "ft-ability"); 
                };

                // Si la carta acaba de ser jugada, esperamos 450ms (lo que tarda la animación de entrar)
                if (card.justPlayed) {
                    setTimeout(triggerVisuals, 450);
                } else {
                    triggerVisuals();
                }
                card.passiveActive = true;
            } else if (!isActive && card.passiveActive) {
                game.logMsg(`${card.passiveName} (${game.getCardNameWithOwner(card)}) desactivada.`, 'system');
                card.passiveActive = false;
            }
            
            if (isActive) {
                card.currentAtk += 2;
                card.currentDef += 2;
            }
        },

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
        onGetPreviewEffects: function(card, game) {
            if (card.passiveActive) {
                return [
                    `+2 ATQ, fuente: esta carta (Habilidad pasiva: ${this.passiveName})`,
                    `+2 DEF, fuente: esta carta (Habilidad pasiva: ${this.passiveName})`
                ];
            }
            return [];
        },
    },
    { 
        id: 4, name: "Eris", hp: 4, def: 3, atk: 5, type: "Personaje", subtype: "Ser vivo", tags: ['Policía', 'Usuaria de magia'], gender: 'F', rarity: "A", 
        text: "Inmune a Eventos enemigos. A: TIRO FINAL (2F) Ignora Defensa.", 
        activeName: "TIRO FINAL", activeCost: 2, passiveName: "VIGOR DE INVENCIÓN", series: 1,
        immuneToEnemyEvents: true,
        immuneToEnemyAids: true,

        // HOOK 1: Coste de 2 de Furor y Objetivos
        canActivateAbility: function(card, game) {
            if (card.furor < 2) { game.logError("Falta Furor (2)."); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            if (game.players[enemyId].vanguard.length === 0) {
                game.logError("No hay enemigos en la Vanguardia para TIRO FINAL."); 
                return false;
            }
            return true;
        },

        // HOOK 2: Iniciar Habilidad
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 1, name: 'TIRO FINAL', targetType: 'enemy', isNormalAttack: true };
            game.logError("Elige un enemigo para el Tiro Final.");
            game.render();
        },

        // HOOK 3: Ejecutar Tiro Final (Ignora Defensa)
        onTargetsReady: async function(card, game) {
            const attacker = card;
            const defender = game.abilityContext.targets[0];
            
            game.modifyStat(attacker, 'furor', -2);
            showFloatingText(attacker.instanceId, attacker.activeName, "ft-ability", -30);
            game.inputState = 'EXECUTING';
            game.render();

            game.logMsg(`¡${game.getCardNameWithOwner(attacker)} usa ${attacker.activeName}! (Ignora Defensa)`, 'ability');

            // --- NUEVO FILTRO DE ESTADOS ALTERADOS ---
            const canAttack = await game.checkAttackStatus(attacker, defender);
            if (!canAttack) {
                attacker.exhausted = true;
                game.isActionLocked = false;
                game.cancelAction();
                game.updatePassives();
                game.render();
                return;
            }
            // -----------------------------------------

            // Chequeo de defensa (Águila ya sabe que no puede esquivar el TIRO_FINAL)
            let dodged = false;
            const defTemplate = getCardTemplate(defender.id);
            if (typeof defTemplate.onBeforeDefend === 'function') {
                dodged = await defTemplate.onBeforeDefend(defender, attacker, game, game.abilityContext.name);
            }
            if (dodged) {
                attacker.exhausted = true;
                game.isActionLocked = false;
                game.cancelAction();
                game.render();
                return;
            }

            // ¡Daño directo sin restar defensa!
            const dmg = attacker.currentAtk; 

            // Tiro Final es un ataque especial, por lo que ponemos 'true'
            await game.dealDamage(attacker, defender, dmg, true);

            await game.sleep(600);

            attacker.exhausted = true;
            await game.checkDeath(defender);

            game.isActionLocked = false;
            game.cancelAction();
            game.updatePassives();
            game.render();
        },

        // HOOK 4: Inmunidad a efectos mágicos/eventos/ayudas
        onBeforeAffectedByEnemyEffect: function(card, effectCard, game) {
            game.logMsg(`¡Habilidad pasiva de ${game.getCardNameWithOwner(card)}: ${card.passiveName} tiene lugar! (Es inmune a ${effectCard.name})`, 'ability');
            showFloatingText(card.instanceId, card.passiveName, "ft-ability", -30);
            return false; // False = no le afecta el efecto
        }
    },
    { 
        id: 5, name: "Águila", hp: 5, def: 3, atk: 6, type: "Personaje", subtype: 'Ser vivo', tags: ['Guardia Real', 'Usuario de VP'], gender: 'M', rarity: "A", 
        text: "P: Evasión 50% ante ataques normales. A: ESPÍA (2F). Elige tipo, mira mano rival. Quita Furor igual a cartas de ese tipo.", 
        passiveName: "PSEUDO-PREVASIÓN", activeName: "ESPÍA", activeCost: 2, series: 1,

        // HOOK 1: Defensa ante ataques o habilidades (La Esquiva)
        onBeforeDefend: async function(defender, attacker, game, abilityName) {            
            const attackerTemplate = getCardTemplate(attacker.id);
            if (attackerTemplate.uncounterable) {
                game.logMsg(`${attacker.name} ignora las defensas evasivas gracias a su pasiva.`, 'system');
                return false; // El ataque no se puede contrarrestar/esquivar
            }

            game.logMsg(`¡Habilidad pasiva de ${game.getCardNameWithOwner(defender)}: ${defender.passiveName} tiene lugar! (Esquiva)`, 'ability');
            showFloatingText(defender.instanceId, defender.passiveName, "ft-ability", -30);
            
            const results = await game.triggerCoinFlips(1, defender.owner);
            if (results && results[0] === 'heads') {
                await animateDodge(attacker.instanceId, defender.instanceId);
                game.logMsg(`¡${game.getCardNameWithOwner(defender)} ESQUIVÓ el ataque de ${attacker.name}!`, 'combat');
                return true; // True = esquivó con éxito
            }
            return false; // False = se come el golpe
        },

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
        text: "P: Cobrecura max 6. Gana +1 Furor extra de cartas. A: ZOMBIFICAR (1F): Anexa aliado 'Ser vivo'. Regenera 2 HP fin de turno, no puede recibir Ayudas de curación. Puede deshacer anexos.", 
        passiveName: "RAÍCES NINJA", activeName: "ZOMBIFICAR", series: 1,
        uncopyable: true, // Zombificar usa arrays exclusivos de anexo

        onBeforeHealed: function(card, amount, source, game) {
            if (source && source.type === 'Ayuda') {
                if (card.currentHp + amount > card.maxHp) {
                    const newMax = Math.min(6, card.currentHp + amount);
                    if (newMax > card.maxHp) {
                        const diff = newMax - card.maxHp;
                        card.maxHp = newMax;
                        showFloatingText(card.instanceId, `+${diff} VIDA MÁX.`, "ft-green", -20);
                        game.logMsg(`${card.name} expande su Vida máxima a ${newMax} (RAÍCES NINJA)`, 'ability');
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
                game.logMsg(`${card.name} deshace todos sus anexos.`, "ability");
                card.attachments.forEach(allyId => {
                    const ally = game.findCard(allyId);
                    if (ally) {
                        ally.attachedTo = null;
                        delete ally.reverseArrow; // <--- LIMPIEZA: Le quitamos la marca al soltarlo
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
        text: "P: Sus ataques y Habilidades son imparables. A: LUZ VIRTUOSA (3F): Ataque especial. Moneda -> Cara: Confunde 2T / Cruz: Ciega 2T.", 
        passiveName: "SAPIENCIA MÁGICA", activeName: "LUZ VIRTUOSA", activeCost: 3, series: 1,
        uncounterable: true, // ¡La magia que avisa a Águila!

        canActivateAbility: function(card, game) {
            if (card.furor < 3) { game.logMsg("Falta Furor (3).", 'system'); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            if (game.players[enemyId].vanguard.length === 0) {
                game.logError("No hay enemigos en la Vanguardia."); 
                return false;
            }
            return true;
        },

        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 1, name: 'LUZ VIRTUOSA', targetType: 'enemy' };
            game.logMsg("Elige objetivo enemigo para LUZ VIRTUOSA.", 'system');
            game.render();
        },

        onTargetsReady: async function(card, game) {
            const attacker = card;
            const defender = game.abilityContext.targets[0];
            
            game.modifyStat(attacker, 'furor', -3);
            showFloatingText(attacker.instanceId, attacker.activeName, "ft-ability", -30);
            game.inputState = 'EXECUTING';
            game.render();

            game.logMsg(`¡${game.getCardNameWithOwner(attacker)} usa ${attacker.activeName}!`, 'ability');

            // 1. Chequeamos Confusión/Ceguera en Aniceto mismo antes de lanzar su rayo
            const canAttack = await game.checkAttackStatus(attacker, defender);
            if (!canAttack) {
                attacker.exhausted = true;
                game.isActionLocked = false;
                game.cancelAction();
                game.updatePassives();
                game.render();
                return;
            }

            // 2. Ejecutar Daño (Ignora esquivas gracias a uncounterable)
            let dmg = attacker.currentAtk - defender.currentDef;
            if (dmg <= 0) {
                if (attacker.type === 'Esbirro' && defender.type === 'Personaje') dmg = 0.5;
                else dmg = 1;
            }

            // Luz Virtuosa es un ataque especial, por lo que ponemos 'true'
            await game.dealDamage(attacker, defender, dmg, true);
            await game.sleep(600);
            
            // 3. Aplicar Estado Alterado si sobrevivió
            if (defender.currentHp > 0) {
                const results = await game.triggerCoinFlips(1, attacker.owner);
                if (results) {
                    if (results[0] === 'heads') {
                        game.logMsg(`Moneda: CARA - ¡Luz Virtuosa Confunde a ${defender.name}!`, 'ability');
                        game.applyStatus(defender, 'confusion', 2, attacker);
                    } else {
                        game.logMsg(`Moneda: CRUZ - ¡Luz Virtuosa Ciega a ${defender.name}!`, 'ability');
                        game.applyStatus(defender, 'ceguera', 2, attacker);
                    }
                }
            }

            attacker.exhausted = true;
            await game.checkDeath(defender);

            game.isActionLocked = false;
            game.cancelAction();
            game.updatePassives();
            game.render();
        }
    },
    { 
        id: 8, name: "Spencer", hp: 4, def: 4, atk: 4, type: "Personaje", subtype: "Máquina", tags: ['Con conciencia'], gender: 'M', rarity: "A", 
        text: "P: Al final del turno, si Vida <= 3, cura 1. Puede usar su Activa aunque haya atacado. A: CAMBIO DE PAJARITA (1F): +3 a una stat (Vida, Def, Atq) y -1 a las otras. Vida no baja de 1 por esto. No gasta acción.", 
        passiveName: "BATERÍA AUTÓNOMA", activeName: "CAMBIO DE PAJARITA", activeCost: 1, series: 1,
        uncopyable: true, // Requiere el modificador único "PajaritaStance"
        
        abilityWhileExhausted: true,

        // HOOK 1: Curación a final de turno con límite inteligente
        onEndTurn: function(card, game) {
            // 1. Calculamos cuál es su Vida máxima actual según la pajarita
            let effectiveMaxHp = 4; // Base
            if (card.pajaritaStance === 'VIDA') effectiveMaxHp = 7;
            else if (card.pajaritaStance === 'DEFENSA' || card.pajaritaStance === 'ATAQUE') effectiveMaxHp = 3;

            // 2. Se cura SOLO si tiene 3 o menos, y NUNCA supera su máximo real
            if (card.currentHp > 0 && card.currentHp <= 3 && card.currentHp < effectiveMaxHp) {
                game.logMsg(`¡${card.passiveName} de ${game.getCardNameWithOwner(card)} se activa! (Cura 1 de Vida)`, 'ability');
                showFloatingText(card.instanceId, "BATERÍA AUTÓNOMA", "ft-ability", -40);
                
                let amount = 1;
                const template = getCardTemplate(card.id);
                if (typeof template.onBeforeHealed === 'function') amount = template.onBeforeHealed(card, amount, card, game);
                
                game.modifyStat(card, 'currentHp', amount);
            }
        },

        // HOOK 2: Pasiva dinámica para Ataque y Defensa
        onUpdatePassive: function(card, game) {
            if (!card.pajaritaStance) return;

            if (card.pajaritaStance === 'DEFENSA') {
                card.currentDef += 3;
                card.currentAtk -= 1;
            } else if (card.pajaritaStance === 'ATAQUE') {
                card.currentDef -= 1;
                card.currentAtk += 3;
            } else if (card.pajaritaStance === 'VIDA') {
                card.currentDef -= 1;
                card.currentAtk -= 1;
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
                game.logMsg(`${card.name} cambia a postura: ${stance}.`, 'ability');

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

        // HOOK 4: Información súper detallada en el panel lateral
        onGetPreviewEffects: function(card, game) {
            if (card.pajaritaStance === 'VIDA') return [`Pajarita actual: VIDA (+3 VIDA, -1 DEF, -1 ATQ) (fuente: esta carta)`];
            if (card.pajaritaStance === 'DEFENSA') return [`Pajarita actual: DEFENSA (-1 VIDA, +3 DEF, -1 ATQ) (fuente: esta carta)`];
            if (card.pajaritaStance === 'ATAQUE') return [`Pajarita actual: ATAQUE (-1 VIDA, -1 DEF, +3 ATQ) (fuente: esta carta)`];
            return [];
        }
    },
    { 
        id: 9, name: "Mill", hp: 4, def: 5, atk: 6, type: "Personaje", subtype: "Ser vivo", tags: ['Traje protector', 'científico', 'Usuario de VP'], gender: 'M', rarity: "A", 
        text: "P: Si no ataca, gana Oculto en turno rival. El daño lo revela. A: MOTOCICLETA (3F). Cambia a Mill y 1 aliado de Vanguardia por 2 de Retaguardia.", 
        passiveName: "CAMUFLAJE ÓPTICO", activeName: "MOTOCICLETA", activeCost: 3, series: 1,

        // HOOK 1: Resetear tracker y limpiar su propio sigilo
        onStartTurn: function(card, game) {
            card.hasAttackedThisTurn = false;
            // El sigilo dura durante el turno del rival. Al empezar mi turno, se desvanece.
            if (card.owner === game.activePlayerId && card.stealth) {
                card.stealth = false;
                game.logMsg(`${card.name} apaga su Camuflaje Óptico.`, 'system');
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
            game.logMsg(`${card.name} y ${vanAlly.name} suben a la Motocicleta e intercambian posición con ${r1.name} y ${r2.name}.`, 'ability');
            
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
                return [`OCULTO: Inmune a ataques normales (fuente: esta carta).`];
            }
            return [];
        }
    },
    { 
        id: 10, name: "Hawke", hp: 4, def: 4, atk: 6, type: "Personaje", subtype: "Ser vivo", tags: ['Poder heredado'], gender: 'M', rarity: "A", 
        text: "P: En Vanguardia, al final de tu turno puedes aplicar Daño por tiempo (1T) a 1 enemigo de vanguardia. A: PUÑO DE NEUTRONES (1F): Ataque normal con +2 Atq durante el golpe.", 
        passiveName: "RADIACIÓN", activeName: "PUÑO DE NEUTRONES", activeCost: 1, series: 1,

        // HOOK 1: Pasiva interactiva de Final de Turno con MODAL VISUAL
        onEndTurn: async function(card, game) {
            if (card.location !== 'vanguard' || card.owner !== game.activePlayerId) return;
            
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            // Filtramos para ignorar a los Avatares (como Kami) que son intocables
            const enemyVanguard = game.players[enemyId].vanguard.filter(c => !getCardTemplate(c.id).isAvatar);
            
            if (enemyVanguard.length === 0) return;

            // Modal visual: exactCount = 1, y permitimos cancelar para saltar la pasiva
            const chosen = await game.openVisualSearchModal('RADIACIÓN: ELIGE A QUIÉN IRRADIAR', enemyVanguard, 1, true, card.owner);
            
            if (chosen && chosen.length > 0) {
                const enemy = chosen[0];
                game.logMsg(`¡${card.passiveName} de ${card.name} irradia a ${game.getCardNameWithOwner(enemy)}!`, 'ability');
                game.applyStatus(enemy, 'dot', 1, card);
                await game.sleep(500); 
            } else {
                game.logMsg(`${card.name} decide no irradiar a nadie este turno.`, 'system');
            }
        },

        // HOOK 2: Validar Habilidad Activa (Mensajes privados)
        canActivateAbility: function(card, game) {
            if (card.furor < 1) { game.logError("Falta Furor (1)."); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            if (game.players[enemyId].vanguard.length === 0) {
                game.logError("No hay enemigos en Vanguardia para golpear."); 
                return false;
            }
            return true;
        },

        // HOOK 3: Seleccionar objetivo (Instrucción privada)
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 1, name: 'PUÑO DE NEUTRONES', targetType: 'enemy', isNormalAttack: true };
            game.logError("Elige objetivo enemigo para PUÑO DE NEUTRONES.");
            game.render();
        },

        // HOOK 4: Ejecutar el ataque "normal" dopado
        onTargetsReady: async function(card, game) {
            const target = game.abilityContext.targets[0];
            
            game.modifyStat(card, 'furor', -1);
            game.logMsg(`¡${card.name} prepara su PUÑO DE NEUTRONES! (+2 ATQ en este golpe)`, 'ability');
            
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -40);
            showFloatingText(card.instanceId, "+2 ATQ", "ft-green", -20);
            
            card.currentAtk += 2;
            
            await game.performAttack(card, target);
            
            card.currentAtk -= 2; 
            showFloatingText(card.instanceId, "-2 ATQ", "ft-red-stat", -20);
        }
    },
    { 
        id: 11, name: "Garret", hp: 4, def: 8, atk: 9, type: "Personaje", subtype: "Ser vivo", tags: ['Usuario de magia'], gender: 'M', rarity: "S", 
        text: "P: Requiere tributar 4 Furor de Sadame, Aniceto o Hawke. Al colocar: Busca Escudo mágico. Gana 2 Furor/turno. Inmune al daño especial. A: ANDANADA METEÓRICA (3F): Ataque especial a 2 enemigos.", 
        passiveName: "DESBORDE DE MANÁ", activeName: "ANDANADA METEÓRICA", activeCost: 3, series: 1,

        // HOOK 1: Tributo previo a la colocación (Ordenado y arreglado)
        onBeforePlayAsync: async function(card, game, p) {
            // Filtramos y ORDENAMOS por ID: Sadame, Aniceto, Hawke
            const validTributes = [...p.vanguard, ...p.rearguard].filter(c => 
                (c.name === 'Sadame' || c.name === 'Aniceto' || c.name === 'Hawke') && c.furor >= 4
            ).sort((a, b) => {
                const order = { 'Sadame': 1, 'Aniceto': 2, 'Hawke': 3 };
                return order[a.name] - order[b.name];
            });
            
            if (validTributes.length === 0) {
                game.logError(`Necesitas a Sadame, Aniceto o Hawke con al menos 4 de Furor en el campo para colocar a ${card.name}.`);
                return false;
            }

            const chosen = await game.openVisualSearchModal('TRIBUTO PARA GARRET (-4 FUROR)', validTributes, 1, true, card.owner);
            if (chosen && chosen.length > 0) {
                card.tributeSourceId = chosen[0].instanceId;
                return true;
            }
            return false;
        },

        // HOOK 2: Búsqueda del Escudo Mágico tras colocarse
        onAfterPlayAsync: async function(card, game, p) {
            const hasInDiscard = p.discard && p.discard.some(c => c.id === 26);
            
            await new Promise(resolve => {
                const choices = [];
                choices.push({
                    label: 'BUSCAR EN EL MAZO',
                    action: async () => {
                        const idx = p.deck.findIndex(c => c.id === 26);
                        if (idx !== -1) {
                            const target = p.deck[idx]; // <--- Obtenemos la carta primero
                            
                            // AHORA SÍ: Pasamos target.id para que la animación no salga boca abajo
                            await animateStackToHand(`${p.id}-deck-stack`, p.id, target.id);
                            
                            p.deck.splice(idx, 1);
                            target.location = 'hand';
                            p.hand.push(target);
                            game.logMsg(`${card.name} añade Escudo mágico del mazo a la mano.`, 'ability');
                        } else {
                            game.logMsg(`No se encontró ningún Escudo mágico en el mazo.`, 'system');
                        }
                        
                        game.logMsg("Barajando el mazo...", 'system');
                        await animateShuffle(p.id);
                        game.shuffle(p.deck);
                        game.render();
                        resolve();
                    }
                });

                if (hasInDiscard) {
                    choices.push({
                        label: 'BUSCAR EN DESCARTES',
                        action: async () => {
                            const idx = p.discard.findIndex(c => c.id === 26);
                            if (idx !== -1) {
                                const target = p.discard[idx];
                                
                                // AHORA SÍ: Pasamos target.id para que se vea la cara en la animación
                                await animateStackToHand(`${p.id}-discard-stack`, p.id, target.id);
                                
                                p.discard.splice(idx, 1);
                                target.location = 'hand';
                                p.hand.push(target);
                                game.logMsg(`${card.name} recupera Escudo mágico de los descartes.`, 'ability');
                                game.render();
                            }
                            resolve();
                        }
                    });
                }

                choices.push({
                    label: 'NO BUSCAR NADA',
                    action: () => resolve()
                });

                game.openChoiceModal('DESBORDE DE MANÁ: BÚSQUEDA', choices);
            });
        },

        // HOOK 3: Ganar 2 de Furor en vez de 1 SÓLO en la fase de Furor
        onBeforeGainFuror: function(card, amount, source, game) {
            if (source === 'fase_furor') {
                game.logMsg(`¡${card.passiveName} otorga +1 Furor adicional a Garret!`, 'ability');
                return amount + 1;
            }
            return amount;
        },

        // HOOK 4: Habilidad Activa (Andanada Meteórica)
        canActivateAbility: function(card, game) {
            if (card.furor < 3) { game.logMsg("Falta Furor (3).", 'system'); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            const validTargets = game.players[enemyId].vanguard.filter(c => !c.stealth);
            if (validTargets.length < 2) {
                game.logError("No hay suficientes enemigos válidos (mínimo 2) para Andanada Meteórica.");
                return false; 
            }
            return true;
        },

        // HOOK 5: Inmune al daño Especial
        onBeforeTakeDamage: async function(card, attacker, dmg, isSpecial, game) {
            if (isSpecial) {
                game.logMsg(`${game.getCardNameWithOwner(card)} es inmune al daño especial (Desborde de Maná).`, 'ability');
                return 0; // Reduce el daño a 0
            }
            return dmg;
        },

        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 2, name: 'ANDANADA METEÓRICA', targetType: 'enemy' };
            game.logError("Elige al PRIMER enemigo.");
            game.render();
        },

        onValidateTarget: function(card, target, game, isSilent = false) {
            if (target.location !== 'vanguard') {
                if (!isSilent) game.logError("El objetivo debe estar en la vanguardia.");
                return false;
            }
            if (target.stealth) {
                if (!isSilent) game.logError(`¡${target.name} está Oculto y no puede ser objetivo!`);
                return false;
            }
            if (game.abilityContext.targets.some(t => t.instanceId === target.instanceId)) {
                if (!isSilent) game.logError("No puedes atacar al mismo enemigo dos veces.");
                return false;
            }
            return true;
        },

        onTargetsReady: async function(card, game) {
            const attacker = card;
            game.modifyStat(attacker, 'furor', -3);
            showFloatingText(attacker.instanceId, attacker.activeName, "ft-ability", -30);
            game.inputState = 'EXECUTING';
            game.render();

            await game.sleep(800);
            const targets = game.abilityContext.targets;

            const attackerEl = document.querySelector(`.card[data-id="${attacker.instanceId}"]`);
            if (attackerEl) { attackerEl.removeAttribute('style'); void attackerEl.offsetWidth; }

            for (let i = 0; i < targets.length; i++) {
                const target = targets[i];
                const canAttack = await game.checkAttackStatus(attacker, target);
                if (!canAttack) {
                    if (attacker.currentHp <= 0) break; 
                    continue; 
                }
                if (attackerEl) { attackerEl.removeAttribute('style'); void attackerEl.offsetWidth; }

                if (target.currentHp > 0) {
                    let dodged = false;
                    const defTemplate = getCardTemplate(target.id);
                    if (typeof defTemplate.onBeforeDefend === 'function') {
                        dodged = await defTemplate.onBeforeDefend(target, attacker, game, game.abilityContext.name);
                    }
                    if (dodged) continue;

                    let dmg = attacker.currentAtk - target.currentDef;
                    if (dmg <= 0) dmg = 1;

                    // ¡Reutilizamos el nuevo sistema de daño!
                    await game.dealDamage(attacker, target, dmg, true);

                    await game.sleep(500);
                    await game.checkDeath(target);
                }
            }

            attacker.exhausted = true;
            game.isActionLocked = false; 
            game.cancelAction();
            game.updatePassives();
            game.render();
        }
    },
    { 
        id: 12, name: "Manzanahoria", type: "Ayuda", subtype: "Ingerible", tags: ["Consumible"], rarity: "C", text: "Cura 2 de Vida a un aliado.", cost: 0,
        abilities: [
            { trigger: "JUGAR", requisitos: [ { count: { quien: "ALIADO" }, op: ">=", valor: 1, msg: "No tienes aliados en mesa para usar {carta}." } ] },
            { trigger: "AL_USAR_AYUDA",
              requisitosObjetivo: [ { campo: "attachedTo", op: "falsy", msg: "{objetivo} está Zombificado y rechaza la Ayuda." } ],
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
        text: "Retorno a mano al morir en vez de perder Retribución.", passiveName: "INCLUSO EN EL JUEGO DE CARTAS", series: 1,
        // NUEVO HOOK: Maneja su propia muerte
        onDeath: async function(card, game) {
            game.logMsg(`¡Habilidad pasiva de ${game.getCardNameWithOwner(card)}: ${card.passiveName} tiene lugar! (Vuelve a la mano)`, 'ability');
            showFloatingText(card.instanceId, card.passiveName, "ft-ability");
            try { await animateSpinToHand(card.instanceId, card.owner); } catch (err) {}
            
            const p = game.players[card.owner];
            p.vanguard = p.vanguard.filter(c => c.instanceId !== card.instanceId);
            p.rearguard = p.rearguard.filter(c => c.instanceId !== card.instanceId);
            
            card.location = 'hand';
            card.currentHp = getCardTemplate(card.id).hp;
            p.hand.push(card);
            return true; // Indica al motor que la muerte ha sido gestionada
        }
    },
    { id: 15, name: "Mini-tigre", hp: 3, def: 3, atk: 2, type: "Esbirro", subtype: "Ser vivo", tags: ["Animal salvaje"], gender: 'N', rarity: "C", text: "-", series: 1 },
    {
        id: 16, name: "Oso con armadura", hp: 3, def: 5, atk: 2, type: "Esbirro", subtype: "Ser vivo", tags: ['Traje protector', 'Animal salvaje'], rarity: "B",
        cost: 0, series: 1,
        text: ""
    },
    { 
        id: 17, name: "Gólem multielemental", hp: 4, def: 4, atk: 3, type: "Esbirro", subtype: "Ser mágico", tags: ['Invocación', 'Gólem'], rarity: "B", 
        text: "P: Requiere tributar 1 Furor de aliado. CAMBIO DE COLOR: Su Def aumenta en +1 permanente al ser atacado (máx 3).", 
        passiveName: "CAMBIO DE COLOR", cost: 0, series: 1,

        onBeforePlayAsync: async function(card, game, p) {
            const validTributes = [...p.vanguard, ...p.rearguard].filter(c => c.furor >= 1);
            if (validTributes.length === 0) {
                game.logError("Necesitas un aliado con al menos 1 de Furor en el campo.");
                return false;
            }
            
            const chosen = await game.openVisualSearchModal('TRIBUTO PARA EL GÓLEM (-1 FUROR)', validTributes, 1, true, card.owner);
            if (chosen && chosen.length > 0) {
                card.tributeSourceId = chosen[0].instanceId;
                card.tributeCost = 1; 
                card.defBoosts = 0; 
                return true;
            }
            return false;
        },
        onBeforeDefend: async function(defender, attacker, game, abilityName) {
            if (defender.defBoosts === undefined) defender.defBoosts = 0;
            if (defender.defBoosts < 3) {
                defender.defBoosts++;
                defender.def += 1; 
                game.logMsg(`¡${defender.passiveName} se activa! (+1 Defensa permanente, lleva ${defender.defBoosts}/3).`, 'ability');
                showFloatingText(defender.instanceId, defender.passiveName, "ft-ability", -40);
                showFloatingText(defender.instanceId, "+1 DEF BASE", "ft-green", -20);
                game.render();
                await game.sleep(400);
            }
            return false; 
        }
    },
    { id: 18, name: "Robot de seguridad SP", hp: 4, def: 1, atk: 2, type: "Esbirro", subtype: "Máquina", tags: ["Controlable"], gender: 'N', rarity: "C", text: "-", series: 1 },
    {
        id: 19, name: "Limo artificial", hp: 2, def: 2, atk: 1, type: "Esbirro", subtype: "Ser vivo", tags: ['Creación artificial'], rarity: "C",
        text: "A: ABRAZO PEGAJOSO (1F): Ataque normal. Si tiene éxito, lanza moneda: Cara = Confunde al enemigo 2 turnos.", 
        activeName: "ABRAZO PEGAJOSO", activeCost: 1, series: 1,
        
        canActivateAbility: function(card, game) {
            if (card.furor < 1) { game.logMsg("Falta Furor (1).", 'system'); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            if (game.players[enemyId].vanguard.length === 0) { game.logError("No hay enemigos."); return false; }
            return true;
        },
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 1, name: 'ABRAZO PEGAJOSO', targetType: 'enemy', isNormalAttack: true };
            game.logMsg("Elige objetivo para ABRAZO PEGAJOSO.", 'system');
            game.render();
        },
        onTargetsReady: async function(card, game) {
            const target = game.abilityContext.targets[0];
            game.modifyStat(card, 'furor', -1);
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);
            await game.sleep(400);

            let dodged = false;
            const defTemplate = getCardTemplate(target.id);
            if (typeof defTemplate.onBeforeDefend === 'function') dodged = await defTemplate.onBeforeDefend(target, card, game, card.activeName);

            if (!dodged) {
                let dmg = card.currentAtk - target.currentDef;
                if (dmg <= 0) dmg = target.type === 'Personaje' ? 0.5 : 1;
                const startHp = target.currentHp;
                await game.dealDamage(card, target, dmg, false);
                
                if (target.currentHp < startHp && target.currentHp > 0) {
                    await game.sleep(300);
                    const results = await game.triggerCoinFlips(1, card.owner);
                    if (results && results[0] === 'heads') {
                        game.logMsg(`> Moneda: CARA - ¡Confunde a ${target.name}!`, 'system');
                        game.applyStatus(target, 'confusion', 2, card);
                    } else {
                        game.logMsg(`> Moneda: CRUZ`, 'system');
                    }
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
        id: 20, name: "Guardia", hp: 2, def: 3, atk: 3, type: "Esbirro", subtype: "Ser vivo", tags: ["Traje protector"], gender: 'M', rarity: "C",
        text: "A: FUEGO A DISCRECIÓN (1F). 50% +2 Atq / 50% Fallo.", activeName: "FUEGO A DISCRECIÓN", series: 1, activeCost: 1,
        
        canActivateAbility: function(card, game) {
            if (card.furor < 1) { game.logError("Falta Furor (1)."); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            
            // --- FILTRO DE SIGILO: Como es un Ataque Normal, los Ocultos no cuentan ---
            const validEnemies = game.players[enemyId].vanguard.filter(c => !c.stealth);
            if (validEnemies.length === 0) {
                game.logError("No hay enemigos válidos (sin Ocultarse) en la Vanguardia enemiga."); 
                return false;
            }
            return true;
        },
        
        onExecuteAbility: async function(card, game) {
            game.modifyStat(card, 'furor', -1, 0, card);
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);

            game.isActionLocked = true;
            game.logMsg(`${game.getCardNameWithOwner(card)} activa ${card.activeName}.`, 'ability');

            const results = await game.triggerCoinFlips(1, card.owner);
            if (!results) {
                game.isActionLocked = false;
                game.cancelAction(); 
                return;
            }

            if (results[0] === 'heads') {
                game.logMsg("Moneda: CARA - ¡Ataque potenciado!", 'ability');
                
                // SISTEMA MODERNO DE HABILIDAD (Igual que Wolfgang)
                game.selectedCard = card;
                game.inputState = 'SELECT_ABILITY_TARGETS';
                game.abilityContext = { 
                    targets: [], 
                    maxTargets: 1, 
                    name: 'FUEGO A DISCRECIÓN', 
                    targetType: 'enemy', 
                    cannotCancel: true, // <--- CANDADO ACTIVADO
                    isNormalAttack: true 
                };
            } else {
                game.logMsg("Moneda: CRUZ - El ataque falla.", 'neutral');
                card.exhausted = true;
                game.isActionLocked = false; 
                game.cancelAction();
            }
            game.render();
        },
        onValidateTarget: function(card, target, game, isSilent) {
            if (target.owner === card.owner || target.location !== 'vanguard') return false;
            if (target.stealth) {
                if (!isSilent) game.logError("No puedes seleccionar a un objetivo Oculto.");
                return false;
            }
            return true;
        },
        onTargetsReady: async function(card, game) {
            const target = game.abilityContext.targets[0];
            game.inputState = 'EXECUTING';
            game.render();
            await game.sleep(400);

            if (card.currentHp <= 0 || (card.location !== 'vanguard' && card.location !== 'rearguard')) {
                game.cancelAction();
                return;
            }
            
            const realTarget = game.findCard(target.instanceId);
            if (realTarget && (realTarget.location === 'vanguard' || realTarget.location === 'rearguard') && realTarget.currentHp > 0) {
                // Aplicamos el bufo, disparamos y le quitamos el bufo inmediatamente
                card.currentAtk += 2; 
                await game.performAttack(card, realTarget);
                card.currentAtk -= 2; 
            }
            
            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.updatePassives();
            game.render();
        }
    },
    {
        id: 21, name: "K.I.N.O.", hp: 6, def: 7, atk: 6, type: "Personaje", subtype: "Máquina", tags: ['Con conciencia', 'De Mill'], rarity: "C", gender: "N/A",
        text: "P: POCA PACIENCIA: En Vanguardia, +2 Contadores (se pierden en retaguardia). Fin de turno tuyo: -1 Contador. A 0, fuerza intercambio o muere.", 
        passiveName: "POCA PACIENCIA", series: 1,

        onUpdatePassive: function(card, game) {
            if (card.lastLocation !== card.location) {
                if (card.location === 'vanguard') {
                    game.modifyCounters(card, 'kino_paciencia', 2, 'Contadores', 'esta carta (POCA PACIENCIA)', '⚙️');
                    game.logMsg(`¡${card.name} entra a vanguardia y gana 2 Contadores!`, 'ability');
                } else if (card.location === 'rearguard') {
                    if (card.counters && card.counters['kino_paciencia']) {
                        game.modifyCounters(card, 'kino_paciencia', -card.counters['kino_paciencia'].count);
                    }
                    game.logMsg(`¡${card.name} se retira y pierde sus Contadores!`, 'ability');
                }
                card.lastLocation = card.location;
            }
        },
        onEndTurn: async function(card, game) {
            if (card.location !== 'vanguard' || card.owner !== game.activePlayerId) return;
            if (!card.counters || !card.counters['kino_paciencia']) return; 
            
            game.modifyCounters(card, 'kino_paciencia', -1, 'Contadores', 'esta carta (POCA PACIENCIA)', '⚙️');
            const countLeft = card.counters && card.counters['kino_paciencia'] ? card.counters['kino_paciencia'].count : 0;
            game.logMsg(`¡${card.passiveName}! ${card.name} pierde 1 Contador (quedan ${countLeft}).`, 'ability');
            showFloatingText(card.instanceId, "-1 CONTADOR", "ft-red-stat");
            game.render();
            await game.sleep(600);

            if (countLeft === 0) {
                game.logMsg(`¡A ${card.name} se le ha agotado la paciencia!`, 'ability');
                const p = game.players[card.owner];
                const rearguardAllies = p.rearguard;
                
                if (rearguardAllies.length > 0) {
                    const chosen = await game.openVisualSearchModal('POCA PACIENCIA (FORZAR INTERCAMBIO)', rearguardAllies, 1, true, card.owner);
                    if (chosen && chosen.length > 0) {
                        const ally = chosen[0];
                        const vIdx = p.vanguard.findIndex(c => c.instanceId === card.instanceId);
                        const rIdx = p.rearguard.findIndex(c => c.instanceId === ally.instanceId);
                        p.vanguard.splice(vIdx, 1, ally);
                        p.rearguard.splice(rIdx, 1, card);
                        card.location = 'rearguard';
                        ally.location = 'vanguard';
                        game.logMsg(`${card.name} fuerza un intercambio con ${ally.name}.`, 'ability');
                        game.render();
                    }
                } else {
                    game.logMsg(`No hay aliados en retaguardia. ¡${card.name} se auto-destruye!`, 'ability');
                    showFloatingText(card.instanceId, "DESTRUIDO", "ft-red-stat");
                    card.currentHp = 0;
                    await game.checkDeath(card, false); 
                }
            }
        }
    },
    { 
        id: 22, name: "Té helado", type: "Ayuda", subtype: "Ingerible", tags: ["Consumible"], rarity: "B", text: "Coste: 1 Furor de aliado. Cura 4 Vida al aliado que elijas.", cost: 0,
        canPlayCard: function(card, game, p) {
            if (p.vanguard.length === 0 && p.rearguard.length === 0) {
                game.logError(`No tienes aliados en mesa para usar ${card.name}.`);
                return false;
            }
            const hasFuror = [...p.vanguard, ...p.rearguard].some(c => c.furor >= 1);
            if (!hasFuror) {
                game.logError(`Necesitas un aliado con al menos 1 de Furor para pagar ${card.name}.`);
                return false;
            }
            return true;
        },
       onValidateTarget: function(card, target, game, isSilent) {
            if (target.attachedTo) {
                if (!isSilent) game.logError(`${game.getCardNameWithOwner(target)} está Zombificado y rechaza la Ayuda.`);
                return false;
            }
            if (target.currentHp >= target.maxHp) {
                if (!isSilent) game.logError(`${game.getCardNameWithOwner(target)} ya tiene la Vida completa.`);
                return false;
            }
            return true;
        },
       onExecuteAyuda: async function(card, target, game) {
            if (target.attachedTo) { 
                game.logMsg(`${game.getCardNameWithOwner(target)} está Zombificado y rechaza la Ayuda.`, 'system'); 
                return false; 
            }

            const p = game.players[game.activePlayerId];
            const validPayers = [...p.vanguard, ...p.rearguard].filter(c => c.furor >= 1);
            
            if (validPayers.length === 0) return false; 

            let payer = null;
            if (validPayers.length === 1) {
                payer = validPayers[0];
            } else {
                const chosen = await game.openVisualSearchModal('¿QUIÉN PAGA EL TÉ HELADO? (-1 FUROR)', validPayers, 1, true, card.owner);
                if (chosen && chosen.length > 0) payer = chosen[0];
            }

            if (!payer) { game.cancelAction(); return false; }

            game.modifyStat(payer, 'furor', -1);

            let amount = 4;
            const template = getCardTemplate(target.id);
            if (typeof template.onBeforeHealed === 'function') amount = template.onBeforeHealed(target, amount, card, game);
            
            const oldHp = target.currentHp;
            const missing = target.maxHp - target.currentHp;
            if (missing > 0) {
                const heal = Math.min(amount, missing);
                showFloatingText(target.instanceId, "TÉ HELADO", "ft-ability", -40);
                game.modifyStat(target, 'currentHp', heal);
                game.logMsg(`${card.name} usa 1 Furor de ${payer.name} y cura a ${game.getCardNameWithOwner(target)} (${oldHp} -> ${target.currentHp}).`, 'ability');
                return true;
            } else {
                game.logMsg(`${game.getCardNameWithOwner(target)} ya tiene la Vida completa.`, 'system');
                return false;
            }
        }
    },
    {
        id: 23, name: "Tortilla de patatas", type: "Ayuda", subtype: "Ingerible", tags: ["Consumible"], rarity: "B",
        text: "Añade 2 de Furor a un aliado que no haya actuado; al hacerlo, agótalo.", cost: 0, series: 1,
        canPlayCard: function(card, game, p) {
            const validTargets = [...p.vanguard, ...p.rearguard].filter(c => !c.exhausted);
            if (validTargets.length === 0) {
                game.logError("No hay aliados sin agotar."); return false;
            }
            return true;
        },
        onValidateTarget: function(card, target, game, isSilent = false) {
            if (target.owner !== card.owner) return false;
            if (target.exhausted) { if (!isSilent) game.logError("Ese aliado ya ha gastado su acción."); return false; }
            return true;
        },
        onExecuteAyuda: function(card, target, game) {
            game.modifyStat(target, 'furor', 2, 0, card);
            target.exhausted = true; 
            game.logMsg(`${card.name} añade 2 de Furor a ${target.name} y consume su acción.`, 'ability');
            return true;
        }
    },
    {
        id: 24, name: "Goodman", hp: 2, def: 2, atk: 1, type: "Personaje", subtype: "Ser vivo", tags: ["Científico"], gender: 'M', rarity: "B",
        text: "P: INFORMACIÓN VALIOSA: Sólo si tiene al menos 1 de Furor; cuando muere, busca carta en el mazo.",
        passiveName: "INFORMACIÓN VALIOSA", series: 1,
        onDeath: async function(card, game) {
            if (card.furor >= 1) {
                const p = game.players[card.owner];
                const wantSearch = await new Promise(resolve => {
                    game.openChoiceModal('INFORMACIÓN VALIOSA', [
                        { label: 'BUSCAR CARTA EN EL MAZO', action: () => resolve(true) },
                        { label: 'NO BUSCAR', action: () => resolve(false) }
                    ], card.owner);
                });

                if (wantSearch) {
                    game.logMsg(`¡${card.passiveName} se activa! ${card.name} busca una carta.`, 'ability');
                    showFloatingText(card.instanceId, "INFORMACIÓN VALIOSA", "ft-ability", -30);

                    if (p.deck.length === 0) return false;

                    const uniqueDeck = [];
                    const seen = new Set();
                    for (let c of p.deck) {
                        if (!seen.has(c.id)) { seen.add(c.id); uniqueDeck.push(c); }
                    }

                    const chosenCard = await game.openVisualSearchModal('BUSCAR EN EL MAZO', uniqueDeck, 1, false, card.owner);
                    if (chosenCard && chosenCard.length > 0) {
                        const targetInfo = chosenCard[0];
                        const idx = p.deck.findIndex(c => c.id === targetInfo.id);
                        if (idx !== -1) {
                            const target = p.deck[idx];
                            await animateStackToHand(`${p.id}-deck-stack`, p.id, target.id);
                            p.deck.splice(idx, 1);
                            target.location = 'hand';
                            p.hand.push(target);
                            game.logMsg(`Añades ${target.name} a la mano desde el mazo.`, 'ability');
                        }
                    }
                    
                    game.logMsg("Barajando el mazo...", 'system');
                    if (typeof animateShuffle === 'function') await animateShuffle(p.id);
                    game.shuffle(p.deck);
                    game.render();
                } else {
                    game.logMsg(`${card.name} muere, pero decides no buscar información.`, 'system');
                }
            }
            return false;
        }
    },
    {
        id: 25, name: "Agah", hp: 6, def: 7, atk: 7, type: "Personaje", subtype: "Ser vivo", tags: ["Mercenario", "Usuario de magia"], gender: 'M', rarity: "B",
        text: "P: Sus ataques normales cuestan 1 Furor. Inmune al daño de ataques especiales. A: DEVASTACIÓN AGAH (2F): 2 ataques normales al mismo enemigo.",
        passiveName: "ENERGÍA DEMONÍACA", activeName: "DEVASTACIÓN AGAH", activeCost: 2, series: 1,

        canAttackNormally: function(card, game) { return card.furor >= 1; },
        onBeforeAttack: async function(attacker, defender, game) {
            if (!game.abilityContext) {
                if (attacker.furor < 1) return false;
                game.modifyStat(attacker, 'furor', -1);
            }
            return true;
        },
        onBeforeTakeDamage: async function(card, attacker, dmg, isSpecial, game) {
            if (isSpecial) {
                showFloatingText(card.instanceId, "INMUNE AL DAÑO", "ft-ability", -30);
                return 0; 
            }
            return dmg;
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
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 1, name: 'DEVASTACIÓN AGAH', targetType: 'enemy', isNormalAttack: true };
            game.render();
        },
        onTargetsReady: async function(card, game) {
            const attacker = card;
            const targetRef = game.abilityContext.targets[0];
            game.modifyStat(attacker, 'furor', -2);
            showFloatingText(attacker.instanceId, attacker.activeName, "ft-ability", -30);
            game.inputState = 'EXECUTING';
            game.render();
            await game.sleep(800);

            for (let i = 1; i <= 2; i++) {
                // 1. ¿Sigue Agah vivo y en el campo antes del golpe?
                if (attacker.currentHp <= 0 || (attacker.location !== 'vanguard' && attacker.location !== 'rearguard')) break; 
                
                // 2. Refrescamos el objetivo
                const currentTarget = game.findCard(targetRef.instanceId);

                // 3. ¿Sigue el objetivo vivo Y en el campo?
                if (currentTarget && (currentTarget.location === 'vanguard' || currentTarget.location === 'rearguard') && currentTarget.currentHp > 0) {
                    game.logMsg(`¡DEVASTACIÓN AGAH! Golpe ${i}...`, 'ability');
                    
                    await game.performAttack(attacker, currentTarget);
                    await game.sleep(400);
                } else {
                    break; // El objetivo murió o desapareció, cancelamos el segundo
                }
            }
            attacker.exhausted = true;
            game.isActionLocked = false; 
            game.cancelAction();
            game.updatePassives();
            game.render();
        }
    },
    {
        id: 26, name: "Escudo mágico", type: "Ayuda", subtype: "Técnica", tags: ["Consumible"], rarity: "C", 
        text: "Reacción: Se activa automáticamente si un aliado con al menos 1 de Furor recibe un ataque. Gasta 1 de su Furor para evitar el daño (pero no los otros efectos).", cost: 0, series: 1,
        canPlayCard: function(card, game, p) {
            game.logMsg("El Escudo mágico es una carta de reacción. Déjala en tu mano.", 'system');
            return false;
        },
        onHandReactionToDamage: async function(handCard, defender, attacker, dmg, isSpecial, game, p) {
            if (defender.owner === handCard.owner && defender.furor >= 1) {
                const reactor = handCard.owner === 'p1' ? 'JUGADOR 1' : 'JUGADOR 2';
                const active = game.activePlayerId === 'p1' ? 'JUGADOR 1' : 'JUGADOR 2';

                const used = await new Promise(resolve => {
                    const modalTitle = `REACCIÓN DE ${reactor}\n\n¡${attacker.name.toUpperCase()} va a atacar a ${defender.name.toUpperCase()}! ¿Usar Escudo mágico (-1 FUROR)?`;
                    
                    game.openChoiceModal(modalTitle, [
                        { label: `SÍ: PROTEGER A ${defender.name.toUpperCase()} (-1 FUROR)`, action: () => resolve(true) },
                        { label: 'NO REACCIONAR', action: () => resolve(false) }
                    ], handCard.owner);
                });

                if (used) {
                    game.modifyStat(defender, 'furor', -1);
                    game.logMsg(`¡${reactor} usa ${handCard.name} para proteger a ${game.getCardNameWithOwner(defender)}!`, 'ability');
                    showFloatingText(defender.instanceId, "ESCUDO", "ft-ability", -30);
                    return { used: true, newDmg: 0 };
                }
            }
            return { used: false, newDmg: dmg };
        }
    },
    { 
        id: 27, name: "Atomización", type: "Ayuda", subtype: "Técnica", tags: ["Consumible"], rarity: "B", text: "Elige un aliado no agotado. Gasta su acción para quitar 2 de Vida a un enemigo (ignora Def). Si lo mata, vuelve a la mano.", cost: 0,
        canPlayCard: function(card, game, p) {
            const enemyId = game.activePlayerId === 'p1' ? 'p2' : 'p1';
            const enemyP = game.players[enemyId];
            
            const hasAlly = [...p.vanguard, ...p.rearguard].some(c => !c.exhausted && (c.type === 'Personaje' || c.type === 'Esbirro'));
            if (!hasAlly) {
                game.logError("No tienes aliados activos para gastar su acción.");
                return false;
            }
            
            const hasEnemy = [...enemyP.vanguard, ...enemyP.rearguard].some(c => {
                const template = getCardTemplate(c.id);
                return !template.immuneToEnemyAids; 
            });
            if (!hasEnemy) {
                game.logError("No hay enemigos válidos para Atomización.");
                return false;
            }
            return true;
        },
        onPlay: function(card, game) {
            game.validateAndConfirmAbility(card, () => {
                game.inputState = 'SELECT_ATOM_ALLY';
                game.logMsg(`Selecciona un aliado activo para gastar su acción.`, 'system');
                game.isActionLocked = false; // <--- AÑADIDO: Te permite cancelar la carta con la [X] si cambias de idea
                game.render();
            });
        },
        onExecuteAyuda: async function(card, target, game) {
            const ally = game.atomizationAlly;
            ally.exhausted = true;
            game.logMsg(`${game.getCardNameWithOwner(ally)} usa Atomización contra ${game.getCardNameWithOwner(target)}.`, 'combat');
            
            const el = document.querySelector(`.card[data-id="${target.instanceId}"]`);
            if (el) el.classList.add('shaking');
            await game.sleep(400);
            if (el) el.classList.remove('shaking');

            game.modifyStat(target, 'currentHp', -2);
            
            if (target.currentHp <= 0) {
                game.logMsg("Enemigo destruido. Atomización vuelve a tu mano.", 'ability');
                await game.checkDeath(target);
                // No se descarta, vuelve a la mano (ya gestionado por el motor al devolver true aquí y no borrar de mano)
                return false; // El motor no la descartará automáticamente
            } else {
                await game.checkDeath(target);
                return true; // El motor la descartará
            }
        }
    },
    {
        id: 28, name: "Líquido mortal", type: "Ayuda", subtype: "Ingerible", tags: ["Consumible"], rarity: "B",
        text: "Efecto: Elige de tu pila de descarte un 'Ser vivo' que no requiera coste ni condiciones extra para colocarse y devuélvelo a tu mano.", cost: 0, series: 1,
        
        canPlayCard: function(card, game, p) {
            // Filtramos Seres Vivos que no tengan el hook "onBeforePlayAsync" (lo que descarta a Garret, Gólem, etc)
            const validCards = p.discard.filter(c => c.subtype === 'Ser vivo' && !getCardTemplate(c.id).onBeforePlayAsync);
            if (validCards.length === 0) {
                game.logError("No tienes 'Seres vivos' válidos en tu pila de descartes.");
                return false;
            }
            return true;
        },
        onPlay: async function(card, game) {
            const p = game.players[card.owner];
            const validCards = p.discard.filter(c => c.subtype === 'Ser vivo' && !getCardTemplate(c.id).onBeforePlayAsync);
            
            const chosen = await game.openVisualSearchModal('RECUPERAR SER VIVO', validCards);
            if (chosen) {
                const idx = p.discard.findIndex(c => c.instanceId === chosen.instanceId);
                if (idx !== -1) {
                    const recovered = p.discard.splice(idx, 1)[0];
                    await animateStackToHand(`${card.owner}-discard-stack`, card.owner, recovered.id);
                    recovered.location = 'hand';
                    p.hand.push(recovered);
                    game.logMsg(`${card.name} recupera a ${recovered.name} de los descartes.`, 'ability');
                }
                
                // Descartar la propia Ayuda (Líquido Mortal)
                const handIdx = p.hand.findIndex(c => c.instanceId === card.instanceId);
                if (handIdx !== -1) {
                    p.hand.splice(handIdx, 1);
                    p.discard.push(card);
                    card.location = 'discard';
                }
            }
            game.cancelAction();
            game.render();
        }
    },
    {
        id: 29, name: "Lupa", type: "Ayuda", subtype: "Tecnología", tags: ["Consumible"], rarity: "A",
        text: "Efecto: Echa un vistazo a la mano de tu rival.", cost: 0, series: 1,
        
        canPlayCard: function(card, game, p) {
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            if (game.players[enemyId].hand.length === 0) {
                game.logError("El rival no tiene cartas en la mano.");
                return false;
            }
            return true;
        },
        onPlay: function(card, game) {
            const p = game.players[card.owner];
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            
            game.logMsg(`${card.name} revela la mano enemiga.`, 'ability');
            game.openHandViewer(enemyId, card.owner);
            
            const handIdx = p.hand.findIndex(c => c.instanceId === card.instanceId);
            if (handIdx !== -1) {
                p.hand.splice(handIdx, 1);
                p.discard.push(card);
                card.location = 'discard';
            }
            game.cancelAction();
        }
    },
    { 
        id: 30, name: "Infundir desesperación", type: "Evento", rarity: "A", text: "Enemigos no ganan Furor al inicio del turno. 3 turnos. Al expirar: da 3 Furor a enemigos de vanguardia.", cost: 1, duration: 3,
        abilities: [
            { trigger: "AL_CADUCAR", log: "Efecto de expiración de Infundir desesperación: Enemigos en vanguardia ganan 3 de Furor.",
              efectos: [ { op: "MODIFICAR_STAT", stat: "furor", delta: 3, target: { quien: "ENEMIGO", zona: "vanguardia", modo: "TODOS" },
                           floating: { texto: "+3 FUROR", estilo: "ft-green", offset: -20 } } ] }
        ]
    },
    {
        name: "Entrenamiento arduo", type: "Evento", rarity: "A", cost: 0, duration: 3, series: 1,
        text: "Requiere: Zoe en el campo. Oculta y agota a Zoe. Si Zoe muere, se destruye. Expira: 3 turnos. Al expirar, cura a Zoe, busca a Zoe (calcinante) y la evoluciona.", 
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
                game.logMsg("¡Entrenamiento arduo completado! Restableciendo Vida de Zoe...", 'ability');
                zoe.currentHp = zoe.maxHp;
                
                let calcinante = p.hand.find(c => c.name === 'Zoe (calcinante)');
                let fromZone = 'hand';
                
                if (!calcinante) {
                    const deckIdx = p.deck.findIndex(c => c.name === 'Zoe (calcinante)');
                    if (deckIdx !== -1) {
                        calcinante = p.deck.splice(deckIdx, 1)[0];
                        fromZone = 'deck';
                        await animateShuffle(playerId);
                        game.shuffle(p.deck);
                    }
                }
                
                if (calcinante) {
                    game.logMsg(`¡Zoe evoluciona a ${calcinante.name}!`, 'ability');
                    showFloatingText(zoe.instanceId, "¡EVOLUCIÓN!", "ft-purple", -40);
                    
                    const baseZoe = getCardTemplate(zoe.id);
                    calcinante.currentAtk += (zoe.currentAtk - baseZoe.atk);
                    calcinante.currentDef += (zoe.currentDef - baseZoe.def);
                    calcinante.maxHp += (zoe.maxHp - baseZoe.hp);
                    calcinante.currentHp = calcinante.maxHp;
                    calcinante.furor = zoe.furor;
                    calcinante.status = { ...zoe.status };
                    
                    calcinante.location = zoe.location;
                    if (zoe.location === 'vanguard') {
                        const idx = p.vanguard.findIndex(c => c.instanceId === zoe.instanceId);
                        p.vanguard[idx] = calcinante;
                    } else {
                        const idx = p.rearguard.findIndex(c => c.instanceId === zoe.instanceId);
                        p.rearguard[idx] = calcinante;
                    }
                    
                    game.render(); 
                    try { await animateEvolution(calcinante.instanceId); } catch(e) {}
                    
                    zoe.location = 'discard';
                    p.discard.push(zoe);
                    if (fromZone === 'hand') p.hand = p.hand.filter(c => c.instanceId !== calcinante.instanceId);
                }
            }
        }
    },
    {
        name: "Zoe (calcinante)", hp: 3, def: 5, atk: 9, type: "Personaje", subtype: "Ser vivo", tags: ['Usuaria de VP'], gender: 'F', rarity: "S",
        text: "P: Sólo se coloca por Entrenamiento arduo. DoT la cura y da +2 DEF. Aplica DoT (2T) a sí misma y al rival tras combatir. A: AL-FÉNIX (4F): Ataca a máx 3 en Van. y 1 en Ret.", 
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
        
        onUpdatePassive: function(card, game) {
            const hasDoT = card.status && card.status.dot && card.status.dot.duration > 0;
            if (hasDoT && !card.zoeDefBuffActive) {
                showFloatingText(card.instanceId, card.passiveName, "ft-ability", -40);
                showFloatingText(card.instanceId, "+2 DEF", "ft-green", -20);
                card.currentDef += 2;
                card.zoeDefBuffActive = true;
            } else if (!hasDoT && card.zoeDefBuffActive) {
                card.currentDef -= 2;
                card.zoeDefBuffActive = false;
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
        
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            // Activamos canStopEarly para que salga el botón "OK" en la interfaz
            game.abilityContext = { targets: [], maxTargets: 4, canStopEarly: true, name: 'AL-FÉNIX', targetType: 'enemy', vanCount: 0, rearCount: 0 };
            game.logError("AL-FÉNIX: Elige hasta 3 en Van. y 1 en Ret. Pulsa 'OK' cuando termines.");
            game.render();
        },
        
        onValidateTarget: function(card, target, game, isSilent = false) {
            const ctx = game.abilityContext;
            if (ctx.targets.some(t => t.instanceId === target.instanceId)) {
                if (!isSilent) game.logError("Ya seleccionaste a este enemigo.");
                return false;
            }
            
            // Calculamos cuántos hay YA en el array real de objetivos elegidos
            const currentVan = ctx.targets.filter(t => t.location === 'vanguard').length;
            const currentRear = ctx.targets.filter(t => t.location === 'rearguard').length;

            if (target.location === 'vanguard') {
                if (currentVan >= 3) {
                    if (!isSilent) game.logError("Límite de 3 enemigos en vanguardia alcanzado.");
                    return false;
                }
            } else if (target.location === 'rearguard') {
                if (currentRear >= 1) {
                    if (!isSilent) game.logError("Límite de 1 enemigo en retaguardia alcanzado.");
                    return false;
                }
            }
            return true;
        },

        // Le dice al motor si debe esperar a que elijas más cartas, o si debe lanzar el ataque automático
        hasMoreValidTargets: function(card, game) {
            const ctx = game.abilityContext;
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            const enemyP = game.players[enemyId];
            
            // Calculamos cuántos hemos elegido ya realmente
            const currentVan = ctx.targets.filter(t => t.location === 'vanguard').length;
            const currentRear = ctx.targets.filter(t => t.location === 'rearguard').length;

            // Enemigos que AÚN no hemos seleccionado (y que NO están Ocultos)
            const unselectedVan = enemyP.vanguard.filter(c => !c.stealth && !ctx.targets.some(t => t.instanceId === c.instanceId)).length;
            const unselectedRear = enemyP.rearguard.filter(c => !c.stealth && !ctx.targets.some(t => t.instanceId === c.instanceId)).length;
            
            // Comprobamos si podemos seguir eligiendo (no hemos llegado al límite y hay objetivos)
            const canPickVan = currentVan < 3 && unselectedVan > 0;
            const canPickRear = currentRear < 1 && unselectedRear > 0;
            
            return canPickVan || canPickRear;
        },
        
        onTargetsReady: async function(card, game) {
            const attacker = card;
            const targets = game.abilityContext.targets;
            
            game.inputState = 'EXECUTING';
            game.render();
            await game.sleep(800);
            
            for (let i = 0; i < targets.length; i++) {
                // 1. ¿Sigue Wolfgang viva y en el campo antes de la dentellada?
                if (attacker.currentHp <= 0 || (attacker.location !== 'vanguard' && attacker.location !== 'rearguard')) break;
                
                // 2. Refrescamos el objetivo
                const currentTarget = game.findCard(targets[i].instanceId);
                
                // 3. ¿Sigue el objetivo vivo Y en el campo?
                if (currentTarget && (currentTarget.location === 'vanguard' || currentTarget.location === 'rearguard') && currentTarget.currentHp > 0) {
                    game.logMsg(`¡Wolfgang ataca (Golpe ${i+1})!`, 'ability');
                    
                    await game.performAttack(attacker, currentTarget);
                    await game.sleep(400);
                } else {
                    game.logMsg(`El objetivo ${i+1} ya está muerto o fuera de alcance.`, 'system');
                }
            }
            
            attacker.exhausted = true;
            game.isActionLocked = false; 
            game.cancelAction();
            game.updatePassives();
            game.render();
        }
    },
    {
        name: "Necronomicón", type: "Ayuda", subtype: "Mágico", tags: ["Consumible"], rarity: "B",
        text: "Efecto: Consume 2 Furor y la acción de un aliado. Revive un 'Ser vivo' o 'No-muerto' sin coste extra del descarte.", cost: 0, series: 1,
        
        canPlayCard: function(card, game, p) {
            const validPayers = [...p.vanguard, ...p.rearguard].filter(c => c.furor >= 2 && !c.exhausted);
            if (validPayers.length === 0) {
                game.logError("Necesitas un aliado sin agotar y con al menos 2 de Furor.");
                return false;
            }

            const currentVanCount = p.vanguard.length;
            const currentVP = p.vanguard.filter(c => c.type === 'Personaje').length;
            
            let validTargets = p.discard.filter(c => (c.subtype === 'Ser vivo' || c.subtype === 'No-muerto') && !getCardTemplate(c.id).onBeforePlayAsync && (c.type === 'Personaje' || c.type === 'Esbirro'));
            
            if (currentVanCount < 4 && currentVP >= 2) {
                validTargets = validTargets.filter(c => c.type !== 'Personaje'); 
            }

            if (validTargets.length === 0) {
                game.logError("No hay objetivos válidos en el descarte. (Requiere 'Ser vivo' o 'No-muerto'. Al tener 2 Personajes en Vanguardia, los Personajes del descarte se ignoran).");
                return false;
            }
            return true;
        },
        onPlay: async function(card, game) {
            const p = game.players[card.owner];
            const validPayers = [...p.vanguard, ...p.rearguard].filter(c => c.furor >= 2 && !c.exhausted);
            
            const payer = await new Promise(resolve => {
                const choices = validPayers.map(c => ({
                    label: `USAR A ${c.name.toUpperCase()} (-2 FUROR, AGOTAR)`,
                    action: () => resolve(c)
                }));
                choices.push({ label: 'CANCELAR CARTA', action: () => resolve(null) });
                game.openChoiceModal('¿QUIÉN USA EL NECRONOMICÓN?', choices);
            });

            if (!payer) { game.cancelAction(); return; }

            // LÓGICA ESTRICTA DE VANGUARDIA (Máx 4 cartas, Máx 2 Personajes)
            const currentVanCount = p.vanguard.length;
            const currentVP = p.vanguard.filter(c => c.type === 'Personaje').length;
            
            let validTargets = p.discard.filter(c => (c.subtype === 'Ser vivo' || c.subtype === 'No-muerto') && !getCardTemplate(c.id).onBeforePlayAsync && (c.type === 'Personaje' || c.type === 'Esbirro'));
            
            if (currentVanCount < 4 && currentVP >= 2) {
                validTargets = validTargets.filter(c => c.type !== 'Personaje'); 
            }

            if (validTargets.length === 0) {
                game.logError("No hay cartas válidas en el descarte que cumplan las reglas de posicionamiento.");
                game.cancelAction();
                return;
            }

            // Ojo al "false" al final, impide cancelar el modal tras pagar
            const chosen = await game.openVisualSearchModal('REVIVIR CARTA (Auto-posicionamiento)', validTargets, 1, false);
            if (!chosen) { game.cancelAction(); return; }

            game.modifyStat(payer, 'furor', -2);
            payer.exhausted = true;
            game.logMsg(`${payer.name} lee el Necronomicón y se agota...`, 'ability');

            const idx = p.discard.findIndex(c => c.instanceId === chosen.instanceId);
            const recovered = p.discard.splice(idx, 1)[0];
            
            const placeChoice = p.vanguard.length < 4 ? 'vanguard' : 'rearguard';
            const placeText = placeChoice === 'vanguard' ? 'vanguardia' : 'retaguardia'; // <--- TRADUCCIÓN
            
            recovered.location = placeChoice;
            if (placeChoice === 'vanguard') p.vanguard.push(recovered);
            else p.rearguard.push(recovered);
            
            const template = getCardTemplate(recovered.id);
            recovered.currentHp = template.hp;
            recovered.currentDef = template.def;
            recovered.currentAtk = template.atk;
            recovered.furor = 0;
            recovered.exhausted = false;
            
            game.logMsg(`¡${recovered.name} vuelve a la vida automáticamente en tu ${placeText}!`, 'ability'); // <--- TRADUCCIÓN

            const handIdx = p.hand.findIndex(c => c.instanceId === card.instanceId);
            if (handIdx !== -1) {
                p.hand.splice(handIdx, 1);
                p.discard.push(card);
                card.location = 'discard';
            }
            
            game.cancelAction();
            game.render();
            try { await animateResurrect(card.owner, recovered.instanceId); } catch(e){}
        }
    },
    {
        name: "Wolfgang", hp: 5, def: 3, atk: 3, type: "Personaje", subtype: "Ser mágico", tags: ["Invocación", "Bestia animal"], gender: "F", rarity: "B",
        text: "P: Requiere Aniceto en mesa o descartar Manzanahoria. Al colocar: +1 Def y Atq a vanguardia aliada. A: TENTAR A LA SUERTE (1F): 3 monedas. Ataca 1 vez por cada Cara.",
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

            if (hasAniceto && manzanahoria) {
                return await new Promise(resolve => {
                    game.openChoiceModal('INVOCAR A WOLFGANG', [
                        { label: 'USAR PRESENCIA DE ANICETO', action: () => resolve(true) },
                        { label: 'DESCARTAR MANZANAHORIA', action: () => {
                            const mIdx = p.hand.findIndex(c => c.instanceId === manzanahoria.instanceId);
                            p.hand.splice(mIdx, 1);
                            p.discard.push(manzanahoria);
                            manzanahoria.location = 'discard';
                            resolve(true);
                        }}
                    ]);
                });
            } else if (manzanahoria) {
                const mIdx = p.hand.findIndex(c => c.instanceId === manzanahoria.instanceId);
                p.hand.splice(mIdx, 1);
                p.discard.push(manzanahoria);
                manzanahoria.location = 'discard';
                game.logMsg(`${game.getDisplayName(card.owner)} descarta Manzanahoria para invocar a Wolfgang.`, 'system');
                return true;
            }
            return true;
        },
        onAfterPlayAsync: async function(card, game, p) {
            game.logMsg(`¡${card.passiveName}! Wolfgang inspira a la vanguardia de ${game.getDisplayName(card.owner)}.`, 'ability');
            p.vanguard.forEach(c => {
                if (c.instanceId !== card.instanceId) {
                    c.currentDef += 1;
                    c.currentAtk += 1;
                    showFloatingText(c.instanceId, card.passiveName, "ft-ability", -40);
                    showFloatingText(c.instanceId, "+1 ATQ", "ft-green", -20);
                    showFloatingText(c.instanceId, "+1 DEF", "ft-green", 0);
                }
            });
        },
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
                if (typeof defTemplate.onBeforeDefend === 'function') dodged = await defTemplate.onBeforeDefend(target, attacker, game, game.abilityContext.name);
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
        
        onBeforeHealed: function(card, amount, source, game) {
            const newTotal = card.currentHp + amount;
            if (newTotal > card.maxHp) {
                const newMax = Math.min(9, newTotal);
                if (newMax > card.maxHp) {
                    const diff = newMax - card.maxHp;
                    card.maxHp = newMax;
                    game.logMsg(`¡${card.passiveName}! El Limo primario expande su Vida a ${newMax}.`, 'ability');
                    showFloatingText(card.instanceId, card.passiveName, "ft-ability", -40);
                    showFloatingText(card.instanceId, `+${diff} VIDA MÁX.`, "ft-green", -20);
                }
            }
            return amount;
        }
    },
    {
        name: "Sadame (retornada)", hp: 4, def: 4, atk: 7, type: "Personaje", subtype: "No-muerto", tags: ["Usuaria de magia"], gender: "F", rarity: "S",
        text: "P: ÚLTIMA MISIÓN: Requiere Sadame en tu campo y Erasmo en el tuyo o del rival. Sustituye a Sadame. Stats no bajan de base. Restablece Vida al inicio. A: VUELVE A LA VIDA (3F): Revive 2 Personajes/Esbirros, dando igual sus condiciones o costes.",
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
                game.logMsg(`¡Sadame ve a Erasmo y se convierte en ${card.name}!`, 'ability');
                showFloatingText(sadame.instanceId, "TRANSFORMACIÓN", "ft-purple", -40);
                
                card.location = sadame.location;
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

                try { await animateEvolution(card.instanceId); } catch(e) {}
                
                return false; // Devolvemos false para que el motor no la intente colocar otra vez de forma normal
            }
            return false;
        },
        onUpdatePassive: function(card, game) {
            const base = getCardTemplate(card.id);
            if (card.currentDef < base.def) card.currentDef = base.def;
            if (card.currentAtk < base.atk) card.currentAtk = base.atk;
        },
        onStartTurn: function(card, game) {
            if (card.owner === game.activePlayerId && card.currentHp < card.maxHp) {
                card.currentHp = card.maxHp;
                game.logMsg(`¡${card.passiveName}! ${card.name} restaura toda su Vida.`, 'ability');
                showFloatingText(card.instanceId, "RESTAURADA", "ft-green", -30);
            }
        },
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
                
                const chosen = await game.openVisualSearchModal(`REVIVIR CARTA (${i+1}/2)`, validTargets, 1, false);
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
                
                game.logMsg(`¡${recovered.name} vuelve a la vida automáticamente en tu ${placeText}!`, 'ability'); 
                
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
        text: "P: SEGUIMIENTO: Tu rival debe tener su mano siempre visible. Además, puedes mirar la primera carta de su mazo (usando el botón). A: DOMINIO (2F): Elige a un enemigo cualquiera; ese enemigo realiza un ataque normal a cualquier objetivo en el campo (aliado o enemigo).",
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
            
            game.logMsg(`¡${card.name} toma el control de ${puppet.name} y le obliga a atacar a ${victim.name}!`, 'ability');
            
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
        text: "P: REPULSIÓN ABSOLUTA: Requiere 'Una buena razón' activa (tuya o rival). Al recibir ataque normal, usa 1 Furor para esquivar el ataque y sus efectos. A: ESTORNUDO DEVASTADOR (2F): Intercambia un enemigo de vanguardia por uno de retaguardia (si respeta reglas). Si no hay retaguardia enemiga, lo devuelve a su mano.",
        passiveName: "REPULSIÓN ABSOLUTA", activeName: "ESTORNUDO DEVASTADOR", activeCost: 2,

        onBeforePlayAsync: async function(card, game, p) {
            const p1Event = game.players.p1.activeEvent;
            const p2Event = game.players.p2.activeEvent;
            const eventActive = (p1Event && p1Event.name === "Una buena razón") || (p2Event && p2Event.name === "Una buena razón");
            if (!eventActive) {
                game.logMsg(`No puedes colocar a ${card.name} si 'Una buena razón' no está en juego.`, 'system');
                return false;
            }
            return true;
        },
        
        onBeforeDefend: async function(defender, attacker, game, abilityName) {
            if (!abilityName && defender.furor >= 1) {
                const pName = defender.owner === 'p1' ? 'JUGADOR 1' : 'JUGADOR 2';
                const used = await new Promise(resolve => {
                    game.openChoiceModal(`REPULSIÓN ABSOLUTA (${pName})\n\n¿Gastar 1 Furor para repeler el ataque de ${attacker.name}?`, [
                        { label: 'SÍ (-1 FUROR)', action: () => resolve(true) },
                        { label: 'NO', action: () => resolve(false) }
                    ]);
                });
                if (used) {
                    game.modifyStat(defender, 'furor', -1);
                    game.logMsg(`¡${defender.passiveName}! ${defender.name} repele el ataque de ${attacker.name}.`, 'ability');
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
                game.logMsg(`¡ESTORNUDO DEVASTADOR! El vendaval lanza a ${target.name} de vuelta a la mano rival.`, 'ability');
                try { await animateSpinToHand(target.instanceId, enemyId); } catch(e){}
                enemyP.vanguard = enemyP.vanguard.filter(c => c.instanceId !== target.instanceId);
                game.unequipAll(target); // Desequipa lo que tenga el objetivo
                target.location = 'hand';
                target.currentHp = getCardTemplate(target.id).hp;
                target.status = {};
                enemyP.hand.push(target);
            } else {
                const swapTarget = game.abilityContext.targets[1];
                game.logMsg(`¡ESTORNUDO DEVASTADOR atrapa a ${target.name} y ${swapTarget.name} en un tornado y los intercambia!`, 'ability');
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
        text: "P: CÓLERA INFINITA: Requiere 'Una buena razón'. Al colocar: +1 Furor y 3 Contadores (pierde 1/turno en Van; a 0 muere). No puede retirarse normal. Al recibir ataque normal, invierte el cálculo: Diego no recibe daño y daña al atacante. A: PACIFISMO (3F): Este turno no baja su contador.",
        passiveName: "CÓLERA INFINITA", activeName: "PACIFISMO", activeCost: 3,
        uncopyable: true, // Requiere los contadores exclusivos de Diego
        
        cannotRetreat: true, // Flag leído por index.html para bloquear la retirada manual
        
        onBeforePlayAsync: async function(card, game, p) {
            const eventActive = (game.players.p1.activeEvent?.name === "Una buena razón") || (game.players.p2.activeEvent?.name === "Una buena razón");
            if (!eventActive) {
                game.logMsg(`No puedes colocar a ${card.name} sin el evento 'Una buena razón' en juego.`, 'system');
                return false;
            }
            return true;
        },
        onAfterPlayAsync: async function(card, game, p) {
            game.modifyStat(card, 'furor', 1);
            game.modifyCounters(card, 'diego_timer', 3, 'Turnos de Cólera', 'CÓLERA INFINITA', '⏳');
            game.logMsg(`¡${card.passiveName}! ${card.name} entra con 3 contadores de Cólera.`, 'ability');
        },
        onBeforeTakeDamage: async function(defender, attacker, dmg, isSpecial, game) {
            if (!isSpecial) {
                showFloatingText(defender.instanceId, "INVERSIÓN", "ft-ability", -30);
                game.logMsg(`¡${defender.passiveName}! ${defender.name} invierte el ataque normal de ${attacker.name}.`, 'ability');
                
                let counterDmg = defender.currentAtk - attacker.currentDef;
                if (counterDmg <= 0) counterDmg = (defender.type === 'Esbirro' && attacker.type === 'Personaje') ? 0.5 : 1;
                
                // Retraso de 400ms para sincronizar el daño visual con el choque de las cartas
                setTimeout(() => {
                    game.modifyStat(attacker, 'currentHp', -counterDmg);
                    game.logMsg(`> ${attacker.name} recibe ${counterDmg} de daño por su propia imprudencia.`, 'combat');
                    setTimeout(() => game.checkDeath(attacker), 100);
                }, 400);

                return 0; // Diego Antonio sale ileso del cálculo bruto
            }
            return dmg;
        },
        onEndTurn: async function(card, game) {
            if (card.location === 'vanguard' && card.owner === game.activePlayerId) {
                if (card.pacifismoActive) {
                    game.logMsg(`¡PACIFISMO! ${card.name} no pierde contador de Cólera este turno.`, 'ability');
                    card.pacifismoActive = false;
                } else if (card.counters && card.counters['diego_timer']) {
                    game.modifyCounters(card, 'diego_timer', -1, 'Turnos de Cólera', 'CÓLERA INFINITA', '⏳');
                    const left = card.counters['diego_timer'].count;
                    if (left <= 0) {
                        game.logMsg(`¡El tiempo de ${card.name} se ha agotado!`, 'ability');
                        card.currentHp = 0;
                        await game.checkDeath(card, false);
                    }
                }
            }
        },
        canActivateAbility: function(card, game) {
            if (card.furor < 3) { game.logMsg("Falta Furor (3).", 'system'); return false; }
            return true;
        },
        onExecuteAbility: function(card, game) {
            game.modifyStat(card, 'furor', -3);
            card.pacifismoActive = true;
            showFloatingText(card.instanceId, "PACIFISMO", "ft-ability", -30);
            game.logMsg(`${card.name} activa PACIFISMO. Su contador se congela este turno.`, 'ability');
            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.render();
        }
    },
    {
        name: "Silhouette", hp: 7, def: 1, atk: 1, type: "Personaje", subtype: "Ser vivo", tags: ["Draconiana", "otaku", "usuaria de VP"], gender: "F", rarity: "S", series: 1,
        text: "P: REINA DEL COSPLAY: Requiere 'Una buena razón'. Al inicio de tu turno, cura 2 Vida. A: PONTE TRAJE (1F): Elige cualquier aliado o enemigo en el campo. Copias sus stats base (Atq y Def).",
        passiveName: "REINA DEL COSPLAY", activeName: "PONTE TRAJE", activeCost: 1,
        
        onBeforePlayAsync: async function(card, game, p) {
            const eventActive = (game.players.p1.activeEvent?.name === "Una buena razón") || (game.players.p2.activeEvent?.name === "Una buena razón");
            if (!eventActive) {
                game.logMsg(`No puedes colocar a ${card.name} sin el evento 'Una buena razón' en juego.`, 'system');
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
                    game.logMsg(`¡${card.passiveName}! ${card.name} se cura ${heal} Vida.`, 'ability');
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

            game.logMsg(`¡${card.name} copia los stats base de ${target.name}! (ATQ: ${card.copiedBaseAtk}, DEF: ${card.copiedBaseDef})`, 'ability');
            
            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.render();
        }
    },
    {
        name: "Cañón de positrones", type: "Ayuda", subtype: "Técnica", tags: ["Consumible"], rarity: "A", series: 2, cost: 0,
        text: "Debes tener en tu campo a un Personaje cuyo nombre contenga 'Karlos' y consumir 2 de su Furor. Destruye a un enemigo de la vanguardia o retaguardia rival.",
        canPlayCard: function(card, game, p) {
            const hasKarlos = [...p.vanguard, ...p.rearguard].some(c => c.name.includes("Karlos") && c.furor >= 2);
            if (!hasKarlos) { game.logError("Necesitas un 'Karlos' con al menos 2 de Furor."); return false; }
            const enemyId = p.id === 'p1' ? 'p2' : 'p1';
            if (game.players[enemyId].vanguard.length === 0 && game.players[enemyId].rearguard.length === 0) {
                game.logError("No hay enemigos a los que destruir."); return false;
            }
            return true;
        },
        onPlay: async function(card, game) {
            const p = game.players[card.owner];
            const validKarlos = [...p.vanguard, ...p.rearguard].filter(c => c.name.includes("Karlos") && c.furor >= 2);
            
            const chosen = await game.openVisualSearchModal('¿QUIÉN DISPARA EL CAÑÓN? (-2 FUROR)', validKarlos, 1, true, card.owner);
            if (!chosen || chosen.length === 0) { game.cancelAction(); return; }
            const payer = chosen[0];

            game.modifyStat(payer, 'furor', -2);
            showFloatingText(payer.instanceId, "CAÑÓN DE POSITRONES", "ft-ability", -30);

            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 1, name: 'CAÑÓN DE POSITRONES', targetType: 'enemy' };
            game.isActionLocked = true; 
            game.logError("Elige al enemigo que será aniquilado.");
            game.render();
        },
        onTargetsReady: async function(card, game) {
            const target = game.abilityContext.targets[0];
            const p = game.players[card.owner];
            
            game.logMsg(`¡BZZZZT! El Cañón de positrones impacta de lleno en ${target.name}.`, 'ability');
            const el = document.querySelector(`.card[data-id="${target.instanceId}"]`);
            if (el) el.classList.add('shaking');
            await game.sleep(500);
            
            target.currentHp = 0;
            await game.checkDeath(target, false);

            const handIdx = p.hand.findIndex(c => c.instanceId === card.instanceId);
            if (handIdx !== -1) { p.hand.splice(handIdx, 1); p.discard.push(card); card.location = 'discard'; }
            
            game.isActionLocked = false;
            game.cancelAction();
            game.render();
        }
    },
    {
        name: "Furia berserker", type: "Ayuda", subtype: "Técnica", tags: ["Equipable"], rarity: "B", series: 1, cost: 0,
        text: "Debes tener a un aliado 'Draconiano/a' y consumir 2 de su Furor. Anéxala a dicho aliado: +3 Atq mientras esté equipada.",
        canPlayCard: function(card, game, p) {
            const validAllies = [...p.vanguard, ...p.rearguard].filter(c => (c.tags.includes("Draconiana") || c.tags.includes("Draconiano")) && c.furor >= 2);
            if (validAllies.length === 0) { game.logError("Necesitas un aliado Draconiano/a con al menos 2 de Furor."); return false; }
            return true;
        },
        onPlay: async function(card, game) {
            const p = game.players[card.owner];
            const validAllies = [...p.vanguard, ...p.rearguard].filter(c => (c.tags.includes("Draconiana") || c.tags.includes("Draconiano")) && c.furor >= 2);
            
            const chosen = await game.openVisualSearchModal('¿QUIÉN ENTRA EN FURIA? (-2 FUROR)', validAllies, 1, true, card.owner);
            if (!chosen || chosen.length === 0) { game.cancelAction(); return; }
            const target = chosen[0];

            game.modifyStat(target, 'furor', -2);
            
            if (!target.equippedCards) target.equippedCards = [];
            target.equippedCards.push(card);
            
            const handIdx = p.hand.findIndex(c => c.instanceId === card.instanceId);
            if (handIdx !== -1) p.hand.splice(handIdx, 1);
            card.location = 'equipped';
            card.equippedTo = target.instanceId;

            showFloatingText(target.instanceId, "FURIA BERSERKER", "ft-ability", -40);
            showFloatingText(target.instanceId, "+3 ATQ (EQUIPADO)", "ft-green", -20);
            game.logMsg(`${target.name} se equipa con Furia berserker (+3 ATQ).`, 'ability');

            game.updatePassives();
            game.cancelAction();
            game.render();
        },
        
        // Hook llamado por el motor automáticamente desde updatePassives
        onEquipUpdate: function(equipCard, target, game) {
            target.currentAtk += 3;
        },
        onGetPreviewEffects: function(card, game) {
            if (card.type === 'Personaje' || card.type === 'Esbirro') return ["+3 ATQ (fuente: Furia berserker equipada)"];
            return [];
        }
    },
    {
        name: "Pago por adelantado", type: "Ayuda", subtype: "Técnica", tags: ["Consumible"], rarity: "C", series: 1, cost: 0,
        text: "Consume 2 de Furor de cualquier aliado. Busca en tu mazo un 'Mercenario', añádelo a tu mano y baraja.",
        canPlayCard: function(card, game, p) {
            const hasPayer = [...p.vanguard, ...p.rearguard].some(c => c.furor >= 2);
            if (!hasPayer) { game.logError("Necesitas un aliado con al menos 2 de Furor."); return false; }
            return true;
        },
        onPlay: async function(card, game) {
            const p = game.players[card.owner];
            const validPayers = [...p.vanguard, ...p.rearguard].filter(c => c.furor >= 2);
            
            const chosen = await game.openVisualSearchModal('¿QUIÉN PAGA POR ADELANTADO? (-2 FUROR)', validPayers, 1, true, card.owner);
            if (!chosen || chosen.length === 0) { game.cancelAction(); return; }
            const payer = chosen[0];

            game.modifyStat(payer, 'furor', -2);
            
            const mercenarios = p.deck.filter(c => c.tags && c.tags.includes("Mercenario") && (c.type === 'Personaje' || c.type === 'Esbirro'));
            
            if (mercenarios.length > 0) {
            const chosenMerc = await game.openVisualSearchModal('BUSCAR MERCENARIO EN EL MAZO', mercenarios, 1, false, card.owner);
                if (chosenMerc) {
                    const idx = p.deck.findIndex(c => c.instanceId === chosenMerc[0].instanceId);
                    const target = p.deck.splice(idx, 1)[0];
                    await animateStackToHand(`${p.id}-deck-stack`, p.id, target.id);
                    target.location = 'hand';
                    p.hand.push(target);
                    game.logMsg(`Contratas a ${target.name} desde tu mazo.`, 'ability');
                }
            } else {
                game.logMsg("No quedan Mercenarios en tu mazo. ¡El pago se ha perdido!", 'system');
            }

            game.logMsg("Barajando el mazo...", 'system');
            await animateShuffle(p.id);
            game.shuffle(p.deck);

            const handIdx = p.hand.findIndex(c => c.instanceId === card.instanceId);
            if (handIdx !== -1) { p.hand.splice(handIdx, 1); p.discard.push(card); card.location = 'discard'; }
            
            game.cancelAction();
            game.render();
        }
    },
    {
        name: "Cápsula de bio-regeneración", type: "Ayuda", subtype: "Tecnología", tags: ["Consumible"], rarity: "B", series: 2, cost: 0,
        text: "Sólo si tu vanguardia está llena. Elige de tu descarte un 'Ser vivo' sin condiciones de colocación y colócalo en retaguardia.",
        canPlayCard: function(card, game, p) {
            if (p.vanguard.length < 4) { game.logError("Tu vanguardia debe estar llena (4 cartas)."); return false; }
            if (p.rearguard.length >= 4) { game.logMsg("Tu retaguardia está llena.", 'system'); return false; }
            
            const validCards = p.discard.filter(c => c.subtype === 'Ser vivo' && !getCardTemplate(c.id).onBeforePlayAsync);
            if (validCards.length === 0) { game.logError("No hay 'Seres vivos' aptos en tu pila de descartes."); return false; }
            
            return true;
        },
        onPlay: async function(card, game) {
            const p = game.players[card.owner];
            const validCards = p.discard.filter(c => c.subtype === 'Ser vivo' && !getCardTemplate(c.id).onBeforePlayAsync);
            
            const chosen = await game.openVisualSearchModal('REGENERAR EN RETAGUARDIA', validCards);
            if (chosen) {
                const idx = p.discard.findIndex(c => c.instanceId === chosen.instanceId);
                const recovered = p.discard.splice(idx, 1)[0];
                
                recovered.location = 'rearguard';
                p.rearguard.push(recovered);
                
                const template = getCardTemplate(recovered.id);
                recovered.currentHp = template.hp;
                recovered.currentDef = template.def;
                recovered.currentAtk = template.atk;
                recovered.furor = 0;
                recovered.exhausted = false;
                
                game.logMsg(`¡La Cápsula bio-regenera a ${recovered.name} en la retaguardia!`, 'ability');

                const handIdx = p.hand.findIndex(c => c.instanceId === card.instanceId);
                if (handIdx !== -1) { p.hand.splice(handIdx, 1); p.discard.push(card); card.location = 'discard'; }
                
                // RENDERIZAMOS PARA QUE EXISTA EN EL DOM, LUEGO ANIMAMOS
                game.render();
                try { await animateResurrect(card.owner, recovered.instanceId); } catch(e){}
            }
            game.cancelAction();
            game.render();
        }
    },
    {
        name: "De compras", type: "Evento", rarity: "B", series: 1, cost: 1, duration: 2,
        text: "Al final de tu turno, revela cartas del mazo hasta hallar un 'Ayuda - Ingerible', 'Arma' o 'Vestimenta'. Añádela a la mano y baraja. Si no, sólo baraja. 2 turnos.",
        onEndTurn: async function(card, game, playerId) {
            if (card.owner !== game.activePlayerId) return; // Solo pasa en tu turno
            const p = game.players[playerId];
            if (p.deck.length === 0) return;

            game.logMsg(`¡Evento activo: ${card.name}! Buscando un chollo...`, 'ability');
            
            let foundIdx = -1;
            for (let i = 0; i < p.deck.length; i++) {
                const c = p.deck[i];
                if (c.type === 'Ayuda' && (c.subtype === 'Ingerible' || c.subtype === 'Arma' || c.subtype === 'Vestimenta')) {
                    foundIdx = i;
                    break;
                }
            }

            if (foundIdx !== -1) {
                const target = p.deck.splice(foundIdx, 1)[0];
                await animateStackToHand(`${p.id}-deck-stack`, p.id, target.id);
                target.location = 'hand';
                p.hand.push(target);
                game.logMsg(`Has comprado: ${target.name}.`, 'ability');
            } else {
                game.logMsg("Has mirado toda la tienda y no quedaba nada de eso.", 'system');
            }

            game.logMsg("Barajando el mazo...", 'system');
            await animateShuffle(p.id);
            game.shuffle(p.deck);
            game.render();
        },
        onExpire: function(card, game, playerId) {
            game.logMsg("Termina tu día De compras.", 'system');
        }
    },
    {
        name: "Esfuerzo dividido", type: "Evento", rarity: "A", series: 1, cost: 1, duration: 4,
        text: "Requiere 3 aliados en vanguardia. Escoge 2: no pueden atacar ni usar activas y ganan Oculto. Si uno muere, se destruye el evento. Expira (4T): rival roba 1 retribución.",
        canPlayCard: function(card, game, p) {
            if (p.vanguard.length < 3) { game.logMsg("Necesitas al menos 3 aliados en la vanguardia.", 'system'); return false; }
            return true;
        },
        onPlay: async function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 2, name: 'ESFUERZO DIVIDIDO', targetType: 'ally' };
            game.isActionLocked = true; 
            game.logError("Escoge los 2 aliados que dividirán su esfuerzo.");
            game.render();
        },
        onValidateTarget: function(card, target, game, isSilent = false) {
            if (target.location !== 'vanguard') return false; 
            if (game.abilityContext.targets.some(t => t.instanceId === target.instanceId)) return false;
            return true;
        },
        onTargetsReady: async function(card, game) {
            const t1 = game.abilityContext.targets[0];
            const t2 = game.abilityContext.targets[1];
            card.chosenAllies = [t1.instanceId, t2.instanceId];
            
            game.logMsg(`¡${t1.name} y ${t2.name} se ocultan para dividir el esfuerzo!`, 'ability');
            game.isActionLocked = false;
            game.cancelAction(); 
            game.updatePassives();
            game.render();
        },
        onUpdatePassive: function(card, game, p) {
            if (!card.chosenAllies) return;
            card.chosenAllies.forEach(id => {
                const ally = game.findCard(id);
                if (ally && ally.location === 'vanguard') {
                    ally.stealth = true;
                    ally.exhausted = true; 
                }
            });
        },
        onAllyDeath: async function(card, deadCard, game) {
            if (card.chosenAllies && card.chosenAllies.includes(deadCard.instanceId)) {
                game.logMsg(`Uno de los eslabones ha caído. ${card.name} se destruye.`, 'ability');
                await game.destroyEvent(card.owner); // Usa el nuevo sistema global
            }
        },
        onDestroy: async function(card, game, playerId) { // Limpieza si Giro de Guion lo destruye
            if (card.chosenAllies) {
                card.chosenAllies.forEach(id => {
                    const ally = game.findCard(id);
                    if (ally) { ally.stealth = false; ally.exhausted = false; }
                });
            }
        },
        onExpire: async function(card, game, playerId) {
            const enemyId = playerId === 'p1' ? 'p2' : 'p1';
            if (card.chosenAllies) {
                card.chosenAllies.forEach(id => {
                    const ally = game.findCard(id);
                    if (ally) { ally.stealth = false; ally.exhausted = false; }
                });
            }
            game.logMsg(`Esfuerzo dividido expira naturalmente. ¡El rival coge 1 Retribución!`, 'ability');
            await game.processRetribution(enemyId); 
        }
    },
    {
        name: "Dobla la ropa", type: "Ayuda", subtype: "Técnica", tags: ["Consumible"], rarity: "C", series: 1, cost: 0,
        text: "Descarta 3 cartas de tu mano y roba 3 del mazo.",
        canPlayCard: function(card, game, p) {
            if (p.hand.length < 4) { 
                game.logError("Necesitas al menos otras 3 cartas en tu mano para usarla."); return false;
            }
            return true;
        },
        onPlay: async function(card, game) {
            const p = game.players[card.owner];
            const handWithoutThis = p.hand.filter(c => c.instanceId !== card.instanceId);
            
            const chosen = await game.openVisualSearchModal('ELIGE 3 CARTAS PARA DESCARTAR', handWithoutThis, 3, true);
            if (chosen && chosen.length === 3) {
                chosen.forEach(c => {
                    const idx = p.hand.findIndex(x => x.instanceId === c.instanceId);
                    if (idx !== -1) {
                        const discarded = p.hand.splice(idx, 1)[0];
                        
                        // LIMPIEZA: Lavamos la carta antes de que toque la pila de descartes
                        if (typeof game.resetCard === 'function') game.resetCard(discarded);
                        
                        discarded.location = 'discard';
                        p.discard.push(discarded);
                        game.logError(`Descartas ${discarded.name}.`);
                    }
                });
                
                const handIdx = p.hand.findIndex(c => c.instanceId === card.instanceId);
                if (handIdx !== -1) { 
                    const selfCard = p.hand.splice(handIdx, 1)[0]; 
                    if (typeof game.resetCard === 'function') game.resetCard(selfCard); // Nos lavamos a nosotros mismos
                    p.discard.push(selfCard); 
                    selfCard.location = 'discard'; 
                }
                
                game.logMsg(`${card.name} activada: Robas 3 cartas.`, 'ability');
                for (let i = 0; i < 3; i++) await game.drawCard(card.owner);
            } else {
                game.logError("No has seleccionado 3 cartas. Se cancela.");
            }
            
            game.cancelAction();
            game.render();
        }
    },
    {
        name: "PEM", type: "Ayuda", subtype: "Técnica", tags: ["Consumible"], rarity: "C", cost: 0, series: 1,
        text: "Consume 1 Furor de un aliado. Elige un enemigo 'Máquina'. No podrá atacar, usar Habilidades ni retirarse en su próximo turno.",
        canPlayCard: function(card, game, p) {
            const hasPayer = [...p.vanguard, ...p.rearguard].some(c => c.furor >= 1);
            if (!hasPayer) { game.logError("Necesitas un aliado con 1 de Furor."); return false; }
            const enemyId = p.id === 'p1' ? 'p2' : 'p1';
            const hasTarget = [...game.players[enemyId].vanguard, ...game.players[enemyId].rearguard].some(c => c.subtype === 'Máquina');
            if (!hasTarget) { game.logError("El rival no tiene 'Máquinas'."); return false; }
            return true;
        },
        onPlay: async function(card, game) {
            const p = game.players[card.owner];
            const validPayers = [...p.vanguard, ...p.rearguard].filter(c => c.furor >= 1);
            
            const chosen = await game.openVisualSearchModal('¿QUIÉN DISPARA EL PEM? (-1 FUROR)', validPayers, 1, true, card.owner);
            if (!chosen || chosen.length === 0) { game.cancelAction(); return; }
            const payer = chosen[0];
            
            game.modifyStat(payer, 'furor', -1);
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 1, name: 'PEM', targetType: 'enemy' };
            game.isActionLocked = true;
            game.logError("Elige al enemigo 'Máquina' para paralizarlo.");
            game.render();
        },
        onValidateTarget: function(card, target, game, isSilent) {
            if (target.subtype !== 'Máquina') { if (!isSilent) game.logError("Debe ser una Máquina."); return false; }
            if (getCardTemplate(target.id).isAvatar) return false;
            return true;
        },
        onTargetsReady: async function(card, game) {
            const target = game.abilityContext.targets[0];
            
            // APLICAMOS EL EFECTO TEMPORAL
            if (!target.tempEffects) target.tempEffects = [];
            target.tempEffects.push({ sourceId: card.id });

            showFloatingText(target.instanceId, "PARALIZADO", "ft-ability", -30);
            game.logMsg(`¡El PEM fríe los circuitos de ${target.name}! Se saltará su próximo turno.`, 'ability');
            
            const p = game.players[card.owner];
            const handIdx = p.hand.findIndex(c => c.instanceId === card.instanceId);
            if (handIdx !== -1) { p.hand.splice(handIdx, 1); p.discard.push(card); card.location = 'discard'; }
            
            game.isActionLocked = false;
            game.cancelAction();
            game.render();
        },
        onStartTurnTempEffect: function(target, effect, game, currentTurnPlayerId) {
            if (currentTurnPlayerId === target.owner) {
                target.exhausted = true; // ¡Lo agotamos automáticamente!
                game.logMsg(`¡${target.name} sufre los efectos del PEM y no podrá actuar este turno!`, 'system');
                return false; 
            }
            return true; 
        }
    },
    {
        name: "Rebobinar", type: "Ayuda", subtype: "Técnica", tags: ["Consumible"], rarity: "C", cost: 0, series: 1,
        text: "Consume 3 Furor de un aliado agotado. Ese aliado refresca su acción. Sólo 1 vez por aliado cada turno.",
        canPlayCard: function(card, game, p) {
            const validTargets = [...p.vanguard, ...p.rearguard].filter(c => c.exhausted && c.furor >= 3 && !(c.tempEffects && c.tempEffects.some(e => e.sourceId === card.id)));
            if (validTargets.length === 0) { game.logError("No hay aliados válidos que no hayan sido rebobinados ya."); return false; }
            return true;
        },
        onPlay: async function(card, game) {
            const p = game.players[card.owner];
            const validTargets = [...p.vanguard, ...p.rearguard].filter(c => c.exhausted && c.furor >= 3 && !(c.tempEffects && c.tempEffects.some(e => e.sourceId === card.id)));
            
            const chosen = await game.openVisualSearchModal('¿A QUIÉN QUIERES REBOBINAR? (-3 FUROR)', validTargets, 1, true, card.owner);
            if (!chosen || chosen.length === 0) { game.cancelAction(); return; }
            const target = chosen[0];
            
            game.modifyStat(target, 'furor', -3);
            target.exhausted = false;

            if (!target.tempEffects) target.tempEffects = [];
            target.tempEffects.push({ sourceId: card.id });
            
            showFloatingText(target.instanceId, "REBOBINAR", "ft-ability", -30);
            game.logMsg(`¡${target.name} rebobina su tiempo y recupera su acción!`, 'ability');
            
            const handIdx = p.hand.findIndex(c => c.instanceId === card.instanceId);
            if (handIdx !== -1) { p.hand.splice(handIdx, 1); p.discard.push(card); card.location = 'discard'; }
            
            game.cancelAction();
            game.render();
        },
        onStartTurnTempEffect: function(target, effect, game, currentTurnPlayerId) {
            return false; // Al empezar CUALQUIER turno, se borra el candado
        }
    },
    {
        name: "Giro de guion", type: "Evento", rarity: "B", cost: 0, duration: 3, series: 1,
        canReplaceEvent: true, // Permite bypass de la regla de 1 evento máximo
        text: "Requiere que tengas un Evento activo. Destruye los Eventos de ambos jugadores y colócala. Expira (3T): descarta esta carta.",
        canPlayCard: function(card, game, p) {
            if (!p.activeEvent) { game.logMsg("Debes tener ya una carta de Evento en juego para hacer el Giro de guion.", 'system'); return false; }
            return true;
        },
        onPlay: async function(card, game) {
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            game.logMsg("¡Giro de guion! ¡El tablero cambia drásticamente!", 'ability');
            if (game.players[enemyId].activeEvent) {
                await game.destroyEvent(enemyId);
            }
        },
        onExpire: function(card, game, playerId) {
            game.logMsg("El Giro de guion concluye.", 'system');
        }
    },
    {
        name: "Overclock", type: "Ayuda", subtype: "Tecnología", tags: ["Consumible"], rarity: "C", cost: 0, series: 1,
        text: "Elige un aliado 'Máquina'. Aumenta su Def y Atq en 2 hasta el inicio de tu próximo turno.",
        canPlayCard: function(card, game, p) {
            const valid = [...p.vanguard, ...p.rearguard].filter(c => c.subtype === 'Máquina');
            if (valid.length === 0) { game.logError("No tienes 'Máquinas'."); return false; }
            return true;
        },
        onPlay: async function(card, game) {
            const p = game.players[card.owner];
            const valid = [...p.vanguard, ...p.rearguard].filter(c => c.subtype === 'Máquina');
            
            const chosen = await game.openVisualSearchModal('¿A QUIÉN APLICAS OVERCLOCK?', valid, 1, true, card.owner);
            if (!chosen || chosen.length === 0) { game.cancelAction(); return; }
            const target = chosen[0];
            
            if (!target.tempEffects) target.tempEffects = [];
            target.tempEffects.push({ sourceId: card.id, ownerId: card.owner });

            showFloatingText(target.instanceId, "OVERCLOCK", "ft-ability", -40);
            showFloatingText(target.instanceId, "+2 ATQ / +2 DEF", "ft-green", -20);
            game.logMsg(`¡${target.name} recibe Overclock! (+2 Atq, +2 Def).`, 'ability');
            
            const handIdx = p.hand.findIndex(c => c.instanceId === card.instanceId);
            if (handIdx !== -1) { p.hand.splice(handIdx, 1); p.discard.push(card); card.location = 'discard'; }
            
            game.updatePassives();
            game.cancelAction();
            game.render();
        },
        onUpdateTempEffect: function(target, effect, game) {
            target.currentAtk += 2;
            target.currentDef += 2;
        },
        onStartTurnTempEffect: function(target, effect, game, currentTurnPlayerId) {
            if (currentTurnPlayerId === effect.ownerId) {
                game.logMsg(`El Overclock de ${target.name} se ha apagado.`, 'system');
                return false; 
            }
            return true;
        },
        onGetPreviewEffects: function(card, game) {
            if (card.type === 'Personaje' || card.type === 'Esbirro') return ["+2 ATQ, +2 DEF (fuente: Overclock)"];
            return [];
        }
    },
    {
        name: "Shichishito", type: "Ayuda", subtype: "Arma legendaria", tags: ["Equipable", "melé"], rarity: "A", cost: 0, series: 1,
        text: "Anéxala a un Personaje en tu vanguardia cuyo nombre contenga 'Karlos'. +2 Def y +2 Atq. No puedes volver a usar esta carta en la partida.",
        canPlayCard: function(card, game, p) {
            if (p.hasUsedShichishito) { game.logError("Ya has usado Shichishito en esta partida."); return false; }
            const valid = p.vanguard.filter(c => c.type === 'Personaje' && c.name.includes("Karlos"));
            if (valid.length === 0) { game.logError("Necesitas a Karlos en la vanguardia."); return false; }
            return true;
        },
        onPlay: async function(card, game) {
            const p = game.players[card.owner];
            const valid = p.vanguard.filter(c => c.type === 'Personaje' && c.name.includes("Karlos"));
            
            const chosen = await game.openVisualSearchModal('¿QUIÉN EMPUÑA LA SHICHISHITO?', valid, 1, true, card.owner);
            if (!chosen || chosen.length === 0) { game.cancelAction(); return; }
            const target = chosen[0];
            
            p.hasUsedShichishito = true;
            if (!target.equippedCards) target.equippedCards = [];
            target.equippedCards.push(card);
            
            const handIdx = p.hand.findIndex(c => c.instanceId === card.instanceId);
            if (handIdx !== -1) p.hand.splice(handIdx, 1);
            card.location = 'equipped';
            card.equippedTo = target.instanceId;
            
            showFloatingText(target.instanceId, "SHICHISHITO", "ft-ability", -40);
            showFloatingText(target.instanceId, "+2 ATQ / +2 DEF", "ft-green", -20);
            game.logMsg(`${target.name} empuña la legendaria arma Shichishito.`, 'ability');
            
            game.updatePassives();
            game.cancelAction();
            game.render();
        },
        onEquipUpdate: function(equipCard, target, game) {
            target.currentAtk += 2;
            target.currentDef += 2;
        },
        onGetPreviewEffects: function(card, game) {
            if (card.type === 'Personaje' || card.type === 'Esbirro') return ["+2 ATQ, +2 DEF (fuente: Shichishito equipada)"];
            return [];
        }
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
        canActivateAbility: function(card, game) {
            if (card.furor < 1) { game.logMsg("Falta Furor (1).", 'system'); return false; }
            const p = game.players[card.owner];
            const otherVanguard = p.vanguard.filter(c => c.instanceId !== card.instanceId);
            if (otherVanguard.length === 0) { game.logError("Necesitas otro aliado en la vanguardia para el sacrificio."); return false; }
            
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            const enemyP = game.players[enemyId];
            const validEnemies = [...enemyP.vanguard, ...enemyP.rearguard].filter(c => !getCardTemplate(c.id).isAvatar);
            if (validEnemies.length === 0) { game.logError("No hay enemigos a los que aniquilar."); return false; }
            return true;
        },
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 2, name: 'SACRIFICIO EQUIVALENTE', targetType: 'ally' };
            game.isActionLocked = true;
            game.logMsg("PASO 1: Elige un aliado de TU vanguardia para sacrificar.", 'system');
            game.render();
        },
        onValidateTarget: function(card, target, game, isSilent) {
            const ctx = game.abilityContext;
            if (ctx.targets.length === 0) {
                if (target.owner !== card.owner) return false;
                if (target.location !== 'vanguard') { if (!isSilent) game.logMsg("Debe ser de la vanguardia."); return false; }
                if (target.instanceId === card.instanceId) { if (!isSilent) game.logMsg("Kami no se puede sacrificar a sí misma."); return false; }
                return true;
            } else if (ctx.targets.length === 1) {
                if (target.owner === card.owner) { if (!isSilent) game.logMsg("Ahora debes elegir a un ENEMIGO."); return false; }
                if (getCardTemplate(target.id).isAvatar) return false; 
                return true;
            }
            return false;
        },
        onTargetsReady: async function(card, game) {
            const ally = game.abilityContext.targets[0];
            const enemy = game.abilityContext.targets[1];
            game.modifyStat(card, 'furor', -1);
            
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);
            game.logMsg(`¡Kami sacrifica a ${ally.name} para aniquilar por completo a ${enemy.name}!`, 'ability');
            
            const el1 = document.querySelector(`.card[data-id="${ally.instanceId}"]`);
            const el2 = document.querySelector(`.card[data-id="${enemy.instanceId}"]`);
            if (el1) el1.classList.add('shaking');
            if (el2) el2.classList.add('shaking');
            
            await game.sleep(600);
            ally.currentHp = 0;
            enemy.currentHp = 0;
            
            // Como es "Destrucción" directa y no daño, evitamos que roben retribución poniendo false
            await game.checkDeath(ally, false);
            await game.checkDeath(enemy, false);
            
            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.updatePassives();
            game.render();
        }
    },
    {
        name: "Apagón", type: "Evento", rarity: "C", cost: 1, duration: 2, series: 1, 
        text: "Ambos jugadores echan una moneda cada vez que intenten un ataque normal o especial. Cruz: el ataque falla y el atacante gasta su acción del turno. 2T. Al expirar: se destruye.",
        abilities: [
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
                game.logMsg(`${target.name} sale del humo creado por Simon.`, 'system');
                return false; 
            }
            return true;
        }
    },
    {
        name: "Cogorza", type: "Evento", cost: 1, rarity: "C", series: 1,
        text: "Al colocar esta carta, aumenta en 2 la Def de cada aliado en tu vanguardia durante 2 turnos. Echa una moneda por cada aliado en tu vanguardia. Si sale cruz, el aliado correspondiente queda Confuso durante 2 turnos. 2 turnos de duración. Al expirar la duración, descarta esta carta y cura 1 de Vida de cada aliado en tu vanguardia que fuera afectado por esta carta.",
        duration: 2,
        onPlay: async function(card, game) {
            const p = game.players[card.owner];
            card.affectedAllies = []; // Guardamos a quién le hemos dado de beber
            
            // Usamos un bucle for clásico para respetar los tiempos de la moneda
            for (let i = 0; i < p.vanguard.length; i++) {
                const ally = p.vanguard[i];
                if (getCardTemplate(ally.id).isAvatar) continue; // Los dioses no beben
                
                card.affectedAllies.push(ally.instanceId);
                showFloatingText(ally.instanceId, "+2 DEF", "ft-green", -20);
                
                game.logMsg(`Echando moneda de la Cogorza para ${ally.name}...`, 'system');
                const flip = await game.triggerCoinFlips(1, card.owner);
                
                if (flip[0] === 'tails') {
                    game.logMsg(`¡CRUZ! ${ally.name} se emborracha y queda Confuso.`, 'ability');
                    game.applyStatus(ally, 'confusion', 2, card.name);
                } else {
                    game.logMsg(`¡CARA! ${ally.name} aguanta bien la bebida.`, 'neutral');
                }
            }
            game.updatePassives();
        },
        onUpdatePassive: function(card, game, p) {
            if (!card.affectedAllies) return;
            // El buff de +2 DEF solo se aplica mientras el evento siga vivo y a los afectados originales
            p.vanguard.forEach(ally => {
                if (card.affectedAllies.includes(ally.instanceId)) {
                    ally.currentDef += 2;
                }
            });
        },
        onExpire: async function(card, game, playerId) {
            const p = game.players[playerId];
            if (!card.affectedAllies) return;
            
            for (const ally of p.vanguard) {
                if (card.affectedAllies.includes(ally.instanceId)) {
                    const template = getCardTemplate(ally.id);
                    if (ally.currentHp < template.hp) {
                        game.modifyStat(ally, 'currentHp', 1, -20, card.name);
                        game.logMsg(`${ally.name} se recupera de la resaca y cura 1 de Vida.`, 'healing');
                    }
                }
            }
        }
    },
    {
        name: "Infusión de maná", type: "Ayuda", subtype: "Técnica", cost: 1, rarity: "B", series: 1,
        text: "Equipable. Consume 2 de Furor de un aliado para anexarla. Mientras la tenga equipada, todos sus ataques normales son tratados como ataques especiales.",
        canPlayCard: function(card, game, player) {
            const valid = [...player.vanguard, ...player.rearguard].some(c => c.furor >= 2 && !getCardTemplate(c.id).isAvatar);
            if (!valid) game.logError("No tienes ningún aliado con 2 o más de Furor para pagar el coste.");
            return valid;
        },
        // ... (resto del código)
        onValidateTarget: function(card, target, game, isSilent) {
            if (target.owner !== card.owner) return false;
            if (getCardTemplate(target.id).isAvatar) return false;
            if (target.furor < 2) {
                if (!isSilent) game.logError("El objetivo debe tener al menos 2 de Furor.");
                return false;
            }
            return true;
        },
        onPlay: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_AYUDA_TARGET';
            game.logError("Elige a un aliado con 2+ Furor para equipar la Infusión.");
            game.render();
        },
        onValidateTarget: function(card, target, game, isSilent) {
            if (target.owner !== card.owner) return false;
            if (getCardTemplate(target.id).isAvatar) return false;
            if (target.furor < 2) {
                if (!isSilent) game.logMsg("El objetivo debe tener al menos 2 de Furor.");
                return false;
            }
            return true;
        },
        onExecuteAyuda: async function(card, target, game) {
            game.modifyStat(target, 'furor', -2);
            showFloatingText(target.instanceId, "-2 FUR", "ft-red-stat", -20);
            game.logMsg(`¡${target.name} canaliza maná puro y se equipa con ${card.name}!`, 'ability');
            
            if (!target.equippedCards) target.equippedCards = [];
            target.equippedCards.push(card);
            card.equippedTo = target.instanceId;
            return true;
        },
        onEquipUpdate: function(equipCard, hostCard, game) {
            // Gracias al cambio en index.html, esta bandera hace el trabajo sucio
            hostCard.treatAttacksAsSpecial = true; 
        }
    },
    {
        name: "Caza del tesoro", type: "Evento", cost: 2, rarity: "B", series: 1,
        text: "2 turnos de duración. Al expirar, busca en tu mazo una carta 'Ayuda - Arma', 'Ayuda - Arma legendaria' o 'Ayuda - Vestimenta', añádela a tu mano y baraja el mazo. Tu rival puede hacer lo mismo.",
        duration: 2,
        onPlay: async function(card, game) {
            game.logMsg(`¡${game.getDisplayName(card.owner)} ha iniciado una Caza del tesoro!`, 'system');
        },
        onExpire: async function(card, game, playerId) {
            game.logMsg(`¡La Caza del tesoro ha concluido!`, 'ability');
            
            for (let pid of ['p1', 'p2']) {
                const p = game.players[pid];
                const validCards = p.deck.filter(c => c.type === 'Ayuda' && (c.subtype === 'Arma' || c.subtype === 'Arma legendaria' || c.subtype === 'Vestimenta'));
                
                if (validCards.length > 0) {
                    const wantSearch = await new Promise(resolve => {
                        game.openChoiceModal(`${game.getDisplayName(pid)}: ¿BUSCAR RECOMPENSA?`, [
                            { label: 'SÍ, BUSCAR EN EL MAZO', action: () => resolve(true) },
                            { label: 'NO BUSCAR', action: () => resolve(false) }
                        ], pid);
                    });

                    if (wantSearch) {
                        const chosen = await game.openVisualSearchModal(`${game.getDisplayName(pid)}: Elige tu recompensa`, validCards, 1, true, pid);
                        if (chosen && chosen.length > 0) {
                            const c = chosen[0];
                            const idx = p.deck.findIndex(x => x.instanceId === c.instanceId);
                            if (idx !== -1) {
                                p.deck.splice(idx, 1);
                                c.location = 'hand';
                                p.hand.push(c);
                                game.logMsg(`${game.getDisplayName(pid)} ha encontrado un tesoro y lo añade a su mano.`, 'system');
                            }
                        } else {
                            game.logMsg(`${game.getDisplayName(pid)} no cogió nada.`, 'system');
                        }
                        
                        game.logMsg("Barajando el mazo...", 'system');
                        if (typeof animateShuffle === 'function') await animateShuffle(pid);
                        game.shuffle(p.deck);
                    } else {
                        game.logMsg(`${game.getDisplayName(pid)} decide no buscar recompensa.`, 'system');
                    }
                } else {
                    game.logMsg(`${game.getDisplayName(pid)} no tiene equipamiento en su mazo.`, 'system');
                }
            }
        }
    },
    {
        name: "Espada V", type: "Ayuda", subtype: "Arma", cost: 1, rarity: "B", series: 1,
        text: "Equipable, melé. Anexa a un Personaje aliado llamado 'Karlos' o 'Agah'. +2 Atq. Sólo puedes usar esta carta una vez por partida.",
        canPlayCard: function(card, game, player) {
            // El flag espadaV_Used impide jugar OTRA Espada V en la misma partida
            if (player.espadaV_Used) {
                game.logError("Ya has empuñado la Espada V en esta partida.");
                return false;
            }
            const valid = [...player.vanguard, ...player.rearguard].some(c => (c.name.includes("Karlos") || c.name.includes("Agah")) && !getCardTemplate(c.id).isAvatar);
            if (!valid) game.logError("No hay ningún Karlos ni Agah aliado en el campo.");
            return valid;
        },
        onPlay: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_AYUDA_TARGET';
            game.logError("Elige a Karlos o Agah para empuñar la Espada V.");
            game.render();
        },
        onValidateTarget: function(card, target, game, isSilent) {
            if (target.owner !== card.owner) return false;
            if (!target.name.includes("Karlos") && !target.name.includes("Agah")) {
                if (!isSilent) game.logMsg("Solo puede equiparse a Karlos o Agah.");
                return false;
            }
            return true;
        },
        onExecuteAyuda: async function(card, target, game) {
            const p = game.players[card.owner];
            p.espadaV_Used = true; // Candado para toda la partida
            
            game.logMsg(`¡${target.name} empuña la mítica ${card.name}!`, 'ability');
            
            if (!target.equippedCards) target.equippedCards = [];
            target.equippedCards.push(card);
            card.equippedTo = target.instanceId;
            return true;
        },
        onEquipUpdate: function(equipCard, hostCard, game) {
            hostCard.currentAtk += 2;
        }
    },
    {
        name: "Kazuo", hp: 3, def: 5, atk: 5, type: "Personaje", subtype: "Ser vivo", tags: ["Samurái"], gender: "M", rarity: "A", cost: 4, series: 1,
        text: "P: BÚSQUEDA DE MAESTRO: Sólo colocable si tienes otro aliado en campo. Al colocarlo, anéxale un aliado del campo (+2 Atq mientras dure la unión). A: TSUBAMEGAESHI (2F): Realiza 3 ataques normales (máx 2 al mismo objetivo). No puedes atacar directo con los sobrantes.",
        passiveName: "BÚSQUEDA DE MAESTRO", activeName: "TSUBAMEGAESHI", activeCost: 2,
        onBeforePlayAsync: async function(card, game, p) {
            const allies = [...p.vanguard, ...p.rearguard].filter(c => !getCardTemplate(c.id).isAvatar);
            if (allies.length === 0) {
                game.logError("Kazuo necesita a un maestro en el campo para ser colocado.");
                return false;
            }
            return true;
        },
        onAfterPlayAsync: async function(card, game, p) {
            const allies = [...p.vanguard, ...p.rearguard].filter(c => c.instanceId !== card.instanceId && !getCardTemplate(c.id).isAvatar);
            if (allies.length > 0) {
                const chosen = await game.openVisualSearchModal(`${card.name}: Elige a tu maestro/a`, allies, 1, true, card.owner);
                if (chosen && chosen.length > 0) {
                    const maestro = chosen[0];
                    
                    // --- TEXTO DINÁMICO SEGÚN GÉNERO ---
                    const maestroTitle = maestro.gender === 'F' ? 'maestra' : 'maestro';
                    const pronoun = maestro.gender === 'F' ? 'ella' : 'él';
                    game.logMsg(`¡Kazuo reconoce a ${maestro.name} como su ${maestroTitle} y luchará por ${pronoun}!`, 'ability');
                    
                    // --- SISTEMA DE ANEXO REAL (Vínculo morado) ---
                    if (!card.attachments) card.attachments = [];
                    card.attachments.push(maestro.instanceId);
                    maestro.attachedTo = card.instanceId;
                    
                    // Renderizamos para que el ATQ suba y la línea aparezca de inmediato
                    game.updatePassives();
                    game.render();
                }
            }
        },
        onUpdatePassive: function(card, game) {
            if (card.attachments && card.attachments.length > 0) {
                // Comprobamos que el maestro sigue vivo y en el tablero
                const maestroId = card.attachments[0];
                const maestro = game.findCard(maestroId);
                
                if (maestro && (maestro.location === 'vanguard' || maestro.location === 'rearguard') && maestro.attachedTo === card.instanceId) {
                    card.currentAtk += 2;
                } else {
                    // Si el maestro murió o fue devuelto a la mano, se rompe el vínculo de ATQ
                    card.attachments = [];
                }
            }
        },
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
                    game.logMsg(`Corte ${i+1} a ${currentTarget.name}...`, 'combat');
                    
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
        text: "A: MULTIPLICACIÓN DE CUERPO (4F): Crea un 'Clon de Unmei' (Esbirro) en el campo. Copia el ATQ y DEF de Unmei en todo momento. Si Unmei muere, el clon también (sin dar retribución). El clon tiene Vida propia pero no puede ganar Furor.",
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
            
            game.logMsg(`¡${card.name} traza unos sellos con las manos y se multiplica!`, 'ability');
            
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
        text: "Este clon copia el ATQ y DEF de Unmei en todo momento. Tiene su propia Vida, pero no puede ganar Furor ni usar habilidades. Si el Unmei original muere o abandona el campo, este clon se desvanece instantáneamente.",
        onUpdatePassive: function(card, game) {
            // El clon tiene el Furor capado a 0 siempre
            card.maxFuror = 0; 
            card.furor = 0;
            
            if (card.parentId) {
                const parent = game.findCard(card.parentId);
                // Si el padre sigue vivo y coleando en el campo de batalla
                if (parent && (parent.location === 'vanguard' || parent.location === 'rearguard')) {
                    // Copiamos sus stats de combate en tiempo real
                    card.currentAtk = parent.currentAtk;
                    card.currentDef = parent.currentDef;
                } else {
                    // Si el padre muere o vuelve a la mano, el clon sufre muerte súbita
                    card.currentHp = 0;
                    game.checkDeath(card, false); // Muerte sin retribución
                }
            }
        }
    },
    {
        name: "Flash de maná", type: "Ayuda", subtype: "Mágico", rarity: "B", cost: 1, series: 1,
        text: "Consumible. Consume 2 Furor de un aliado (1 si es Eris). Ciega a todos los enemigos de la vanguardia durante 2 turnos.",
        canPlayCard: function(card, game, player) {
            const valid = [...player.vanguard, ...player.rearguard].some(c => c.furor >= (c.name.includes("Eris") ? 1 : 2) && !getCardTemplate(c.id).isAvatar);
            if (!valid) game.logError("No tienes aliados con suficiente Furor para pagar (2, o 1 si es Eris).");
            return valid;
        },
        onPlay: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_AYUDA_TARGET';
            game.logError("Elige a un aliado para canalizar el Flash de maná.");
            game.render();
        },
        onValidateTarget: function(card, target, game, isSilent) {
            if (target.owner !== card.owner || getCardTemplate(target.id).isAvatar) return false;
            const cost = target.name.includes("Eris") ? 1 : 2;
            if (target.furor < cost) {
                if (!isSilent) game.logError(`Este aliado necesita al menos ${cost} de Furor.`);
                return false;
            }
            return true;
        },
        onExecuteAyuda: async function(card, target, game) {
            const cost = target.name.includes("Eris") ? 1 : 2;
            game.modifyStat(target, 'furor', -cost);
            showFloatingText(target.instanceId, `-${cost} FUR`, "ft-red-stat", -20);
            game.logMsg(`¡${target.name} desata un Flash de maná cegador!`, 'ability');

            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            let hit = false;
            game.players[enemyId].vanguard.forEach(c => {
                if (!getCardTemplate(c.id).isAvatar) {
                    game.applyStatus(c, 'ceguera', 2, card.name);
                    hit = true;
                }
            });
            if (!hit) game.logMsg("No había enemigos válidos en la vanguardia.", 'system');
            return true; 
        }
    },
    {
        name: "Granada de maná", type: "Ayuda", subtype: "Mágico", rarity: "C", cost: 1, series: 1,
        text: "Consumible, a distancia. Consume 2 Furor de un aliado (1 si es Eris). Quita 1 de Vida a dos enemigos de la vanguardia, independientemente de su Def.",
        canPlayCard: function(card, game, player) {
            const valid = [...player.vanguard, ...player.rearguard].some(c => c.furor >= (c.name.includes("Eris") ? 1 : 2) && !getCardTemplate(c.id).isAvatar);
            if (!valid) game.logError("No tienes aliados con suficiente Furor.");
            return valid;
        },
        onPlay: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_AYUDA_TARGET';
            game.logError("Elige a un aliado para lanzar la Granada de maná.");
            game.render();
        },
        onValidateTarget: function(card, target, game, isSilent) {
            if (target.owner !== card.owner || getCardTemplate(target.id).isAvatar) return false;
            const cost = target.name.includes("Eris") ? 1 : 2;
            if (target.furor < cost) {
                if (!isSilent) game.logError(`Este aliado necesita al menos ${cost} de Furor.`);
                return false;
            }
            return true;
        },
        onExecuteAyuda: async function(card, target, game) {
            const cost = target.name.includes("Eris") ? 1 : 2;
            game.modifyStat(target, 'furor', -cost);
            showFloatingText(target.instanceId, `-${cost} FUR`, "ft-red-stat", -20);
            
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            const validEnemies = game.players[enemyId].vanguard.filter(c => !getCardTemplate(c.id).isAvatar);
            
            if (validEnemies.length === 0) {
                game.logMsg(`¡${target.name} lanza la ${card.name}, pero no hay objetivos en vanguardia!`, 'ability');
                return true;
            }
            
            const chosen = await game.openVisualSearchModal(`Elige hasta 2 enemigos para la ${card.name}`, validEnemies, 2, true, card.owner);
            game.logMsg(`¡${target.name} hace explotar la ${card.name}!`, 'ability');
            
            if (chosen && chosen.length > 0) {
                for (let c of chosen) {
                    const realEnemy = game.findCard(c.instanceId);
                    if (realEnemy && realEnemy.currentHp > 0) {
                        game.modifyStat(realEnemy, 'currentHp', -1);
                        showFloatingText(realEnemy.instanceId, "DAÑO VERDADERO", "ft-purple", -30);
                        await game.checkDeath(realEnemy);
                    }
                }
            }
            return true; 
        }
    },
    {
        name: "Hexagrama", type: "Ayuda", subtype: "Mágico", tags: ["Consumible"], rarity: "B", cost: 1, series: 1,
        text: "Debes tributar 1 de Furor de cualquiera de tus aliados para usar esta carta. Busca en tu mazo cualquier carta con etiqueta 'Invocación' y añádela a tu mano. Baraja tu mazo.",
        canPlayCard: function(card, game, player) {
            const valid = [...player.vanguard, ...player.rearguard].some(c => c.furor >= 1 && !getCardTemplate(c.id).isAvatar);
            if (!valid) {
                game.logError("No tienes aliados con al menos 1 de Furor para tributar.");
                return false;
            }
            return true;
        },
        onPlay: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_AYUDA_TARGET';
            game.logError("Elige a tu aliado para tributar 1 Furor.");
            game.render();
        },
        onValidateTarget: function(card, target, game, isSilent) {
            if (target.owner !== card.owner || getCardTemplate(target.id).isAvatar) {
                if (!isSilent) game.logError("Debes elegir a uno de tus aliados.");
                return false;
            }
            if (target.furor < 1) {
                if (!isSilent) game.logError("Este aliado necesita al menos 1 de Furor para tributar.");
                return false;
            }
            return true;
        },
        onExecuteAyuda: async function(card, target, game) {
            // 1. Tributamos 1 Furor
            game.modifyStat(target, 'furor', -1);
            showFloatingText(target.instanceId, "-1 FUR", "ft-red-stat", -20);
            
            const p = game.players[card.owner];
            // Buscamos sin importar mayúsculas o tildes
            const invocaciones = p.deck.filter(c => c.tags && c.tags.some(t => t.toLowerCase() === 'invocación' || t.toLowerCase() === 'invocacion'));
            
            if (invocaciones.length === 0) {
                game.logMsg(`¡El Hexagrama fracasa! No quedan cartas de 'Invocación' en tu mazo.`, 'system');
            } else {
                game.logMsg(`El Hexagrama brilla y te permite buscar en tu mazo...`, 'ability');
                
                // 2. Buscamos y robamos
                const chosen = await game.openVisualSearchModal(`HEXAGRAMA: Busca 1 Invocación`, invocaciones, 1, false, card.owner);
                
                if (chosen && chosen.length > 0) {
                    const found = chosen[0];
                    const idx = p.deck.findIndex(c => c.instanceId === found.instanceId);
                    if (idx !== -1) {
                        p.deck.splice(idx, 1);
                        if (typeof animateStackToHand === 'function') await animateStackToHand(`${card.owner}-deck-stack`, card.owner, found.id);
                        found.location = 'hand';
                        p.hand.push(found);
                        game.logMsg(`Añades ${found.name} a tu mano.`, 'ability');
                    }
                }
            }
            
            // 3. Barajamos siempre
            game.logMsg("Barajando el mazo...", 'system');
            if (typeof animateShuffle === 'function') await animateShuffle(card.owner);
            game.shuffle(p.deck);
            game.render();
            
            return true;
        }
    },
    {
        name: "Elemental sanador", hp: 3, def: 2, atk: 1, type: "Esbirro", subtype: "Ser mágico", rarity: "C", cost: 1, series: 1,
        text: "A: RECIEDAD (1F): Elimina todos los estados alterados que sufran tus aliados.",
        activeName: "RECIEDAD", activeCost: 1,
        canActivateAbility: function(card, game) {
            if (card.furor < 1) { game.logError("Falta Furor (1)."); return false; }
            return true;
        },
        onExecuteAbility: async function(card, game) {
            game.modifyStat(card, 'furor', -1);
            showFloatingText(card.instanceId, "RECIEDAD", "ft-ability", -30);
            game.logMsg(`¡El ${card.name} emite una luz purificadora que limpia a tus aliados!`, 'ability');
            
            const p = game.players[card.owner];
            [...p.vanguard, ...p.rearguard].forEach(ally => {
                if (ally.status) {
                    let cleaned = false;
                    if (ally.status.dot) { delete ally.status.dot; cleaned = true; }
                    if (ally.status.confusion) { delete ally.status.confusion; cleaned = true; }
                    if (ally.status.ceguera) { delete ally.status.ceguera; cleaned = true; }
                    if (ally.status.sueno) { delete ally.status.sueno; cleaned = true; }
                    if (cleaned) {
                        showFloatingText(ally.instanceId, "LIMPIO", "ft-green", -20);
                    }
                }
            });
            
            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.updatePassives();
            game.render();
        }
    },
    {
        name: "Valafar", hp: 4, def: 5, atk: 8, type: "Personaje", subtype: "Ser vivo", tags: ["Belfegor"], gender: "M", rarity: "S", cost: 1, series: 1,
        text: "P: CHUPAALMAS: Sólo colocable si un aliado tributa 4 Furor. Se cura 1 de Vida al hacer un ataque normal con éxito que quite >= 1 Vida. A: COMA (4F): Ataque especial a 2 enemigos de vanguardia. Les infunde Sueño 2 turnos.",
        passiveName: "CHUPAALMAS", activeName: "COMA", activeCost: 4,
        onBeforePlayAsync: async function(card, game, p) {
            const validAllies = [...p.vanguard, ...p.rearguard].filter(c => c.furor >= 4 && !getCardTemplate(c.id).isAvatar);
            if (validAllies.length === 0) {
                game.logError(`Necesitas un aliado con al menos 4 de Furor para invocar a ${card.name}.`);
                return false;
            }
            const chosen = await game.openVisualSearchModal(`${card.name}: Elige aliado para tributar 4 Furor`, validAllies, 1, true, card.owner);
            if (chosen && chosen.length > 0) {
                card.tributeSourceId = chosen[0].instanceId;
                return true;
            }
            return false;
        },
        onBeforeAttack: async function(attacker, defender, game) {
            attacker._enemyHpBefore = defender.currentHp;
            return true;
        },
        onAfterAttack: async function(attacker, defender, game) {
            if (attacker._enemyHpBefore !== undefined) {
                const dmgDealt = attacker._enemyHpBefore - defender.currentHp;
                if (dmgDealt >= 1 && attacker.currentHp < attacker.maxHp) {
                    game.modifyStat(attacker, 'currentHp', 1, -20, 'chupaalmas');
                    game.logMsg(`¡CHUPAALMAS! ${attacker.name} devora la energía vital y se cura 1 de Vida.`, 'healing');
                }
                delete attacker._enemyHpBefore;
            }
        },
        canActivateAbility: function(card, game) {
            if (card.furor < 4) { game.logError("Falta Furor (4)."); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            if (game.players[enemyId].vanguard.length === 0) {
                game.logError("No hay enemigos en vanguardia."); return false;
            }
            return true;
        },
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 2, name: 'COMA', targetType: 'enemy', canStopEarly: true };
            game.isActionLocked = true;
            game.logError("Selecciona hasta 2 enemigos de la vanguardia para inducirles el COMA.");
            game.render();
        },
        onValidateTarget: function(card, target, game, isSilent) {
            const ctx = game.abilityContext;
            if (target.owner === card.owner || target.location !== 'vanguard' || getCardTemplate(target.id).isAvatar) return false;
            if (ctx.targets.some(t => t.instanceId === target.instanceId)) return false;
            return true;
        },
        onTargetsReady: async function(card, game) {
            const targets = game.abilityContext.targets;
            if (targets.length === 0) { game.isActionLocked = false; game.cancelAction(); return; }
            
            game.modifyStat(card, 'furor', -4);
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);
            game.logMsg(`¡Valafar desata COMA sobre los enemigos!`, 'ability');
            
            for (let t of targets) {
                const enemy = game.findCard(t.instanceId);
                if (enemy && enemy.currentHp > 0) {
                    let dmg = card.currentAtk - enemy.currentDef;
                    if (dmg <= 0) dmg = (card.type === 'Esbirro' && enemy.type === 'Personaje') ? 0.5 : 1;
                    
                    await game.dealDamage(card, enemy, dmg, true); // true = isSpecial
                    if (enemy.currentHp > 0) {
                        game.applyStatus(enemy, 'sueno', 2, card.name);
                        game.logMsg(`${enemy.name} cae en un profundo Sueño.`, 'ability');
                    }
                    await game.checkDeath(enemy);
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
        name: "Serafín", hp: 5, def: 4, atk: 8, type: "Esbirro", subtype: "Ser mágico", rarity: "S", cost: 1, series: 1,
        text: "P: MARAVILLA: Sólo colocable si tributas 4 Furor. Máximo 1 Serafín aliado en campo. Al colocarlo, cura 2 Vida a tu vanguardia. A: CASTIGO (4F): Ataque especial a 3 enemigos de la vanguardia.",
        passiveName: "MARAVILLA", activeName: "CASTIGO", activeCost: 4,
        onBeforePlayAsync: async function(card, game, p) {
            const validAllies = [...p.vanguard, ...p.rearguard].filter(c => c.furor >= 4 && !getCardTemplate(c.id).isAvatar);
            if (validAllies.length === 0) {
                game.logError(`Necesitas un aliado con al menos 4 de Furor para invocar al ${card.name}.`);
                return false;
            }
            const chosen = await game.openVisualSearchModal(`${card.name}: Elige aliado para tributar 4 Furor`, validAllies, 1, true, card.owner);
            if (chosen && chosen.length > 0) {
                card.tributeSourceId = chosen[0].instanceId;
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
        canActivateAbility: function(card, game) {
            if (card.furor < 4) { game.logError("Falta Furor (4)."); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            if (game.players[enemyId].vanguard.length === 0) {
                game.logError("No hay enemigos en vanguardia."); return false;
            }
            return true;
        },
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 3, name: 'CASTIGO', targetType: 'enemy', canStopEarly: true };
            game.isActionLocked = true;
            game.logError("Selecciona hasta 3 enemigos de la vanguardia para el CASTIGO divino.");
            game.render();
        },
        onValidateTarget: function(card, target, game, isSilent) {
            const ctx = game.abilityContext;
            if (target.owner === card.owner || target.location !== 'vanguard' || getCardTemplate(target.id).isAvatar) return false;
            if (ctx.targets.some(t => t.instanceId === target.instanceId)) return false;
            return true;
        },
        onTargetsReady: async function(card, game) {
            const targets = game.abilityContext.targets;
            if (targets.length === 0) { game.isActionLocked = false; game.cancelAction(); return; }
            
            game.modifyStat(card, 'furor', -4);
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);
            game.logMsg(`¡Serafín imparte su CASTIGO divino!`, 'ability');
            
            for (let t of targets) {
                const enemy = game.findCard(t.instanceId);
                if (enemy && enemy.currentHp > 0) {
                    let dmg = card.currentAtk - enemy.currentDef;
                    if (dmg <= 0) dmg = (card.type === 'Esbirro' && enemy.type === 'Personaje') ? 0.5 : 1;
                    
                    await game.dealDamage(card, enemy, dmg, true); 
                    await game.checkDeath(enemy);
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
        name: "Edrielle", hp: 3, def: 3, atk: 5, type: "Personaje", subtype: "Ser mágico", tags: ["Invocación", "diosa"], gender: "F", rarity: "B", cost: 1, series: 1,
        text: "P: BELLEZA INCOMPARABLE: Requiere tributo de 4 Furor de aliado. Oculta permanentemente. Si es tu único aliado al inicio de tu turno, lanza moneda: Cruz = pierde Oculto este turno. A: TORMENTA PERFECTA (4F): Quita 2 de Vida (daño verdadero) a TODOS los enemigos.",
        passiveName: "BELLEZA INCOMPARABLE", activeName: "TORMENTA PERFECTA", activeCost: 4,
        
        onBeforePlayAsync: async function(card, game, p) {
            const valid = [...p.vanguard, ...p.rearguard].filter(c => c.furor >= 4 && !getCardTemplate(c.id).isAvatar);
            if (valid.length === 0) { game.logError("Necesitas un aliado con 4 de Furor para invocar a Edrielle."); return false; }
            
            const chosen = await game.openVisualSearchModal('TRIBUTO PARA EDRIELLE (-4 FUROR)', valid, 1, true, card.owner);
            if (chosen && chosen.length > 0) {
                game.modifyStat(chosen[0], 'furor', -4);
                return true;
            }
            return false;
        },
        
        onStartTurn: async function(card, game) {
            // Comprueba si es el turno de su dueño
            if (card.owner !== game.activePlayerId) return;
            
            const p = game.players[card.owner];
            const totalAllies = p.vanguard.length + p.rearguard.length;
            
            // Si está sola ante el peligro
            if (totalAllies === 1) {
                game.logMsg(`¡${card.name} está sola en el campo! Su escondite flaquea...`, 'system');
                const results = await game.triggerCoinFlips(1, card.owner);
                
                if (results && results[0] === 'tails') {
                    game.logMsg(`Moneda: CRUZ - ¡${card.name} queda expuesta a plena vista!`, 'ability');
                    showFloatingText(card.instanceId, "EXPUESTA", "ft-red-stat", -30);
                    card.edrielleExposed = true; // Marca que anula el sigilo
                } else {
                    game.logMsg(`Moneda: CARA - ¡${card.name} logra mantenerse oculta en las sombras!`, 'neutral');
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

        canActivateAbility: function(card, game) {
            if (card.furor < 4) { game.logError("Falta Furor (4)."); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            if (game.players[enemyId].vanguard.length === 0 && game.players[enemyId].rearguard.length === 0) {
                game.logError("No hay enemigos en el campo."); return false;
            }
            return true;
        },
        
        onExecuteAbility: async function(card, game) {
            game.modifyStat(card, 'furor', -4);
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);
            game.logMsg(`¡${card.name} desata una TORMENTA PERFECTA sobre todo el campo enemigo!`, 'ability');
            
            game.inputState = 'EXECUTING';
            game.isActionLocked = true;
            game.render();
            await game.sleep(600);

            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            const enemies = [...game.players[enemyId].vanguard, ...game.players[enemyId].rearguard].filter(c => !getCardTemplate(c.id).isAvatar);
            
            for (let enemy of enemies) {
                if (enemy.currentHp > 0) {
                    game.modifyStat(enemy, 'currentHp', -2);
                    showFloatingText(enemy.instanceId, "DAÑO VERDADERO", "ft-purple", -30);
                    await game.checkDeath(enemy);
                }
            }
            
            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.render();
        }
    },
    {
        name: "Némesis", hp: 7, def: 7, atk: 8, type: "Personaje", subtype: "Ser vivo", tags: ["Diosa"], gender: "F", rarity: "S", cost: 2, series: 1,
        text: "P: NACIMIENTO DE DIVINIDAD: Requiere vanguardia llena. Destruye a todos tus aliados de vanguardia antes de colocarla. Una vez por turno, puedes destruir un aliado para curarla 1 Vida. A: OBLITERACIÓN (3F): Ataque especial que ignora completamente la Def del enemigo.",
        passiveName: "NACIMIENTO DE DIVINIDAD", activeName: "OBLITERACIÓN", activeCost: 3,
        
        onBeforePlayAsync: async function(card, game, p) {
            if (p.vanguard.length < 4) {
                game.logError("Necesitas tener la vanguardia llena (4 aliados) para colocar a Némesis.");
                return false;
            }
            game.logMsg(`¡Némesis desciende y aniquila a toda su propia vanguardia como tributo!`, 'ability');
            
            const toDestroy = [...p.vanguard].filter(c => !getCardTemplate(c.id).isAvatar);
            const idsToAnimate = toDestroy.map(c => c.instanceId);
            
            if (typeof animateMassiveSacrifice === 'function') {
                await animateMassiveSacrifice(idsToAnimate);
            }
            
            await Promise.all(toDestroy.map(async (ally) => {
                ally.currentHp = 0;
                await game.checkDeath(ally, false, true); 
            }));
            
            return true;
        },
        
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
                game.logMsg(`¡Némesis consume a ${target.name} para curarse!`, 'ability');
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
            game.logMsg(`¡Némesis OBLITERA a ${target.name} ignorando su defensa!`, 'ability');
            
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
        text: "Reacción. Usa justo antes de que un aliado reciba un ataque normal. Baja en 2 el Atq del atacante hasta el inicio de tu próximo turno.",
        canPlayCard: function() { return false; }, // Es pura reacción
        onHandReactionToDamage: async function(handCard, defender, attacker, dmg, isSpecial, game, p) {
            // Solo salta si el ataque es normal y va contra el dueño del frasco
            if (!isSpecial && defender.owner === handCard.owner && !getCardTemplate(attacker.id).isAvatar) {
                const reactor = handCard.owner === 'p1' ? 'JUGADOR 1' : 'JUGADOR 2';
                const used = await new Promise(resolve => {
                    game.openChoiceModal(`REACCIÓN DE ${reactor}\n\n¿Usar Frasco maldito contra ${attacker.name}?`, [
                        { label: 'SÍ (Baja 2 ATQ temporalmente)', action: () => resolve(true) },
                        { label: 'NO REACCIONAR', action: () => resolve(false) }
                    ], handCard.owner);
                });
                
                if (used) {
                    game.logMsg(`¡${reactor} lanza un Frasco maldito a ${attacker.name}!`, 'ability');
                    showFloatingText(attacker.instanceId, "-2 ATQ (Frasco)", "ft-red-stat", -20);
                    
                    if (!attacker.tempEffects) attacker.tempEffects = [];
                    attacker.tempEffects.push({ sourceId: handCard.id, ownerId: handCard.owner });
                    
                    // Simulamos la reducción matemática para este golpe actual
                    let newDmg = dmg - 2;
                    if (newDmg <= 0) newDmg = (attacker.type === 'Esbirro' && defender.type === 'Personaje') ? 0.5 : 1;
                    
                    return { used: true, newDmg: newDmg };
                }
            }
            return { used: false, newDmg: dmg };
        },
        onUpdateTempEffect: function(target, effect, game) {
            target.currentAtk -= 2;
        },
        onStartTurnTempEffect: function(target, effect, game, currentTurnPlayerId) {
            // Expira al INICIO del próximo turno del dueño del frasco
            if (currentTurnPlayerId === effect.ownerId) {
                game.logMsg(`El efecto del Frasco maldito sobre ${target.name} desaparece.`, 'system');
                return false; 
            }
            return true;
        }
    },
    {
        name: "Poción revitalizante", type: "Ayuda", subtype: "Mágico", tags: ["Consumible"], rarity: "C", cost: 1, series: 1,
        text: "+1 Def y +1 Atq a un aliado durante 3 turnos (baja la cuenta al final de tu turno). No acumulable en el mismo aliado.",
        canPlayCard: function(card, game, p) {
            const valid = [...p.vanguard, ...p.rearguard].filter(c => !(c.tempEffects && c.tempEffects.some(e => e.sourceId === card.id)));
            if (valid.length === 0) { game.logError("Todos tus aliados ya tienen los efectos de la poción activos."); return false; }
            return true;
        },
        onPlay: async function(card, game) {
            const p = game.players[card.owner];
            const valid = [...p.vanguard, ...p.rearguard].filter(c => !(c.tempEffects && c.tempEffects.some(e => e.sourceId === card.id)));
            
            const chosen = await game.openVisualSearchModal('ELIGE A QUIÉN REVITALIZAR', valid, 1, true, card.owner);
            if (!chosen || chosen.length === 0) { game.cancelAction(); return; }
            const target = chosen[0];
            
            if (!target.tempEffects) target.tempEffects = [];
            
            // GUARDAMOS EL DUEÑO Y EL TURNO ACTUAL
            target.tempEffects.push({ sourceId: card.id, ownerId: card.owner, duration: 3, turnApplied: game.turn });
            
            showFloatingText(target.instanceId, "REVITALIZANTE", "ft-ability", -40);
            showFloatingText(target.instanceId, "+1 ATQ / +1 DEF", "ft-green", -20);
            game.logMsg(`¡${target.name} bebe la Poción revitalizante! (+1 Atq, +1 Def por 3 turnos).`, 'ability');
            
            const handIdx = p.hand.findIndex(c => c.instanceId === card.instanceId);
            if (handIdx !== -1) { 
                const selfCard = p.hand.splice(handIdx, 1)[0];
                if (typeof game.resetCard === 'function') game.resetCard(selfCard);
                p.discard.push(selfCard); 
                selfCard.location = 'discard'; 
            }
            
            game.updatePassives();
            game.cancelAction();
            game.render();
        },
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
                    game.logMsg(`Los efectos de la Poción revitalizante sobre ${target.name} se han desvanecido.`, 'system');
                    return false; // Se elimina el efecto
                }
            }
            return true;
        },
        onGetPreviewEffects: function(card, game, effect) {
            if (card.type === 'Personaje' || card.type === 'Esbirro') {
                // Leemos la duración directamente del efecto que nos pasa el motor
                const turnos = effect ? effect.duration : '?';
                return [`+1 ATQ, +1 DEF (fuente: Poción revitalizante, ${turnos} turnos restantes)`];
            }
            return [];
        }
    },
    {
        name: "Plan de equipo", type: "Evento", rarity: "C", cost: 1, duration: 1, series: 1,
        text: "Sólo jugable si no has atacado este turno y tienes >= 2 aliados. Mientras dure, sólo puedes atacar 1 vez. El Atq del atacante será la suma del Atq de 2 aliados que elijas.",
        canPlayCard: function(card, game, p) {
            const hasAttacked = [...p.vanguard, ...p.rearguard].some(c => c.hasAttackedThisTurn);
            if (hasAttacked) { game.logError("Ya has atacado este turno."); return false; }
            if (p.vanguard.length + p.rearguard.length < 2) { game.logError("Necesitas al menos 2 aliados en campo."); return false; }
            return true;
        },
        onPlay: async function(card, game) {
            const p = game.players[card.owner];
            p.planDeEquipoActive = true;
            p.planDeEquipoUsed = false;
            game.logMsg("¡Plan de equipo activado! ¡Tus aliados sincronizan sus fuerzas!", 'ability');
        },
        onGlobalBeforeAttack: async function(eventCard, attacker, defender, game) {
            if (attacker.owner === eventCard.owner) {
                const p = game.players[attacker.owner];
                if (!p.planDeEquipoActive) return true; // Fail-safe
                
                if (p.planDeEquipoUsed) {
                    game.logError("Con 'Plan de equipo' sólo puedes atacar una vez este turno.");
                    return false; // Impide nuevos ataques
                }
                
                p.planDeEquipoUsed = true;
                const allies = [...p.vanguard, ...p.rearguard];
                
                const chosen = await game.openVisualSearchModal('PLAN DE EQUIPO: ELIGE 2 ALIADOS PARA SUMAR SU ATQ', allies, 2, false, attacker.owner);
                if (chosen && chosen.length === 2) {
                    const sum = chosen[0].currentAtk + chosen[1].currentAtk;
                    // Dopamos el stat directamente en la base, updatePassives lo limpiará después del ataque
                    attacker.currentAtk = sum; 
                    game.logMsg(`¡${chosen[0].name} y ${chosen[1].name} unen fuerzas! El ATQ de ${attacker.name} sube a ${sum}.`, 'ability');
                    showFloatingText(attacker.instanceId, `ATQ = ${sum}`, "ft-ability", -40);
                }
                return true;
            }
            return true;
        },
        onExpire: function(card, game, playerId) {
            const p = game.players[playerId];
            delete p.planDeEquipoActive;
            delete p.planDeEquipoUsed;
        }
    },
    {
        name: "Jarabe amargo", type: "Ayuda", subtype: "Ingerible", tags: ["Consumible"], rarity: "C", cost: 1, series: 1,
        text: "Elimina el Sueño, la Confusión y la Ceguera de todos tus aliados.",
        canPlayCard: function(card, game, p) {
            const valid = [...p.vanguard, ...p.rearguard].some(c => c.status && (c.status.sueno || c.status.confusion || c.status.ceguera));
            if (!valid) { game.logError("Tus aliados no sufren ningún estado curable por el jarabe."); return false; }
            return true;
        },
        onPlay: async function(card, game) {
            const p = game.players[card.owner];
            game.logMsg(`¡El olor del Jarabe amargo despierta y limpia a tus aliados!`, 'ability');
            
            [...p.vanguard, ...p.rearguard].forEach(ally => {
                if (ally.status) {
                    let cleaned = false;
                    if (ally.status.confusion) { delete ally.status.confusion; cleaned = true; }
                    if (ally.status.ceguera) { delete ally.status.ceguera; cleaned = true; }
                    if (ally.status.sueno) { delete ally.status.sueno; cleaned = true; }
                    if (cleaned) showFloatingText(ally.instanceId, "LIMPIO", "ft-green", -20);
                }
            });
            
            const handIdx = p.hand.findIndex(c => c.instanceId === card.instanceId);
            if (handIdx !== -1) { p.hand.splice(handIdx, 1); p.discard.push(card); card.location = 'discard'; }
            
            game.cancelAction();
            game.render();
        }
    },
    {
        name: "Salsa de curry", type: "Ayuda", subtype: "Ingerible", tags: ["Consumible"], rarity: "C", cost: 1, series: 1,
        text: "Requiere tributar 1 Furor de un aliado. Cura TODOS los estados alterados (incluyendo DoT) de todos tus aliados.",
        canPlayCard: function(card, game, p) {
            const hasFuror = [...p.vanguard, ...p.rearguard].some(c => c.furor >= 1);
            if (!hasFuror) { game.logError("Necesitas un aliado con 1 Furor para pagar la Salsa."); return false; }
            
            const valid = [...p.vanguard, ...p.rearguard].some(c => c.status && Object.keys(c.status).length > 0);
            if (!valid) { game.logError("Ninguno de tus aliados sufre estados alterados."); return false; }
            return true;
        },
        onPlay: async function(card, game) {
            const p = game.players[card.owner];
            const validPayers = [...p.vanguard, ...p.rearguard].filter(c => c.furor >= 1);
            
            const chosen = await game.openVisualSearchModal('¿QUIÉN PAGA LA SALSA? (-1 FUROR)', validPayers, 1, true, card.owner);
            if (!chosen || chosen.length === 0) { game.cancelAction(); return; }
            
            game.modifyStat(chosen[0], 'furor', -1);
            game.logMsg(`¡La poderosa Salsa de curry purifica el campo aliado!`, 'ability');
            
            [...p.vanguard, ...p.rearguard].forEach(ally => {
                if (ally.status && Object.keys(ally.status).length > 0) {
                    ally.status = {}; // Borrado radical de TODO (DoT, Confusión, Sueño...)
                    showFloatingText(ally.instanceId, "PURIFICADO", "ft-green", -20);
                }
            });
            
            const handIdx = p.hand.findIndex(c => c.instanceId === card.instanceId);
            if (handIdx !== -1) { p.hand.splice(handIdx, 1); p.discard.push(card); card.location = 'discard'; }
            
            game.cancelAction();
            game.render();
        }
    },
    {
        name: "Barritas energéticas", type: "Ayuda", subtype: "Ingerible", tags: ["Consumible"], rarity: "C", cost: 1, series: 1,
        text: "Cura 1 de Vida a dos aliados.",
        canPlayCard: function(card, game, p) {
            const injured = [...p.vanguard, ...p.rearguard].filter(c => c.currentHp < c.maxHp);
            if (injured.length < 2) { game.logError("Necesitas al menos 2 aliados dañados para usar las Barritas."); return false; }
            return true;
        },
        onPlay: async function(card, game) {
            const p = game.players[card.owner];
            const injured = [...p.vanguard, ...p.rearguard].filter(c => c.currentHp < c.maxHp);
            
            const chosen = await game.openVisualSearchModal('BARRITAS: ELIGE 2 ALIADOS PARA CURAR', injured, 2, true, card.owner);
            if (!chosen || chosen.length < 2) { game.cancelAction(); return; }
            
            game.logMsg(`¡${chosen[0].name} y ${chosen[1].name} comen Barritas energéticas!`, 'healing');
            for (let c of chosen) {
                let amount = 1;
                const template = getCardTemplate(c.id);
                if (typeof template.onBeforeHealed === 'function') amount = template.onBeforeHealed(c, amount, card, game);
                
                game.modifyStat(c, 'currentHp', amount);
                showFloatingText(c.instanceId, "BARRITAS", "ft-ability", -40);
            }
            
            const handIdx = p.hand.findIndex(c => c.instanceId === card.instanceId);
            if (handIdx !== -1) { p.hand.splice(handIdx, 1); p.discard.push(card); card.location = 'discard'; }
            
            game.cancelAction();
            game.render();
        }
    },
    {
        name: "Chaqueta metálica defensiva de la muerte", type: "Ayuda", subtype: "Vestimenta", tags: ["Equipable"], rarity: "C", cost: 1, series: 1,
        text: "Anexa a un aliado que NO tenga la etiqueta 'Cosa'. +3 Def y -3 Atq.",
        canPlayCard: function(card, game, p) {
            const valid = [...p.vanguard, ...p.rearguard].filter(c => !c.tags.includes("Cosa") && !getCardTemplate(c.id).isAvatar);
            if (valid.length === 0) { game.logError("No tienes aliados válidos (sin etiqueta 'Cosa')."); return false; }
            return true;
        },
        onPlay: async function(card, game) {
            const p = game.players[card.owner];
            const valid = [...p.vanguard, ...p.rearguard].filter(c => !c.tags.includes("Cosa") && !getCardTemplate(c.id).isAvatar);
            
            const chosen = await game.openVisualSearchModal('¿QUIÉN SE PONE LA CHAQUETA METÁLICA?', valid, 1, true, card.owner);
            if (!chosen || chosen.length === 0) { game.cancelAction(); return; }
            const target = chosen[0];
            
            if (!target.equippedCards) target.equippedCards = [];
            target.equippedCards.push(card);
            
            const handIdx = p.hand.findIndex(c => c.instanceId === card.instanceId);
            if (handIdx !== -1) p.hand.splice(handIdx, 1);
            card.location = 'equipped';
            card.equippedTo = target.instanceId;

            showFloatingText(target.instanceId, "CHAQUETA METÁLICA", "ft-ability", -40);
            showFloatingText(target.instanceId, "+3 DEF / -3 ATQ", "ft-green", -20);
            game.logMsg(`${target.name} se pone la Chaqueta (+3 Def, -3 Atq).`, 'ability');

            game.updatePassives();
            game.cancelAction();
            game.render();
        },
        onEquipUpdate: function(equipCard, target, game) {
            target.currentDef += 3;
            target.currentAtk -= 3;
        },
        onGetPreviewEffects: function(card, game) {
            if (card.type === 'Personaje' || card.type === 'Esbirro') return ["+3 DEF, -3 ATQ (fuente: Chaqueta metálica)"];
            return [];
        }
    },
    {
        name: "Muro parlante", hp: 5, def: 7, atk: 0, type: "Esbirro", subtype: "Ser mágico", tags: ["Cosa"], rarity: "C", cost: 1, series: 1,
        text: "P: INAMOVIBLE: Mientras tenga 0 de Atq, no puede realizar ataques normales.",
        passiveName: "INAMOVIBLE",
        canAttackNormally: function(card, game) {
            if (card.currentAtk <= 0) {
                game.logError("INAMOVIBLE: Muro parlante no puede atacar mientras su ATQ sea 0 o menor.");
                return false;
            }
            return true;
        }
    },
    {
        name: "Canceladora", type: "Ayuda", subtype: "Arma", tags: ["Consumible", "a distancia"], rarity: "B", cost: 1, series: 1,
        text: "Elige un enemigo con la etiqueta 'Usuario de VP'. Ese enemigo no podrá actuar (atacar, usar Habilidad o retirarse) en su próximo turno.",
        canPlayCard: function(card, game, p) {
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            const valid = [...game.players[enemyId].vanguard, ...game.players[enemyId].rearguard].filter(c => c.tags.includes("Usuaria de VP") || c.tags.includes("Usuario de VP"));
            if (valid.length === 0) { game.logError("El rival no tiene Usuarios de VP en el campo."); return false; }
            return true;
        },
        onPlay: async function(card, game) {
            const p = game.players[card.owner];
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            const valid = [...game.players[enemyId].vanguard, ...game.players[enemyId].rearguard].filter(c => c.tags.includes("Usuaria de VP") || c.tags.includes("Usuario de VP"));
            
            const chosen = await game.openVisualSearchModal('CANCELADORA: ELIGE OBJETIVO', valid, 1, true, card.owner);
            if (!chosen || chosen.length === 0) { game.cancelAction(); return; }
            const target = chosen[0];
            
            if (!target.tempEffects) target.tempEffects = [];
            target.tempEffects.push({ sourceId: card.id, ownerId: card.owner });

            showFloatingText(target.instanceId, "CANCELADO", "ft-ability", -40);
            game.logMsg(`¡La Canceladora golpea a ${target.name}! Perderá su próximo turno.`, 'ability');
            
            const handIdx = p.hand.findIndex(c => c.instanceId === card.instanceId);
            if (handIdx !== -1) { p.hand.splice(handIdx, 1); p.discard.push(card); card.location = 'discard'; }
            
            game.cancelAction();
            game.render();
        },
        onStartTurnTempEffect: function(target, effect, game, currentTurnPlayerId) {
            if (currentTurnPlayerId === target.owner) {
                target.exhausted = true; // No puede actuar
                game.logMsg(`¡${target.name} no puede actuar este turno debido a la Canceladora!`, 'system');
                return false; // El efecto se elimina tras hacerle perder el turno
            }
            return true;
        }
    },
    {
        name: "Karlitos", hp: 3, def: 2, atk: 3, type: "Personaje", subtype: "Ser vivo", tags: ["Usuario de Súper Evolución"], gender: "M", rarity: "A", cost: 4, series: 1,
        text: "[Stats Súper Evolución: ♥4 / 🛡7 / ⚔7]. P: PRÁCTICA CONSTANTE: Inicio de tu turno: +1 contador. A los 3, busca 'Super Evolución' en mazo o descarte. A: APRENDIZ DE ARMAS (1F): Equipa un Arma de tu mano ignorando requisitos, luego ataca normal.",
        passiveName: "PRÁCTICA CONSTANTE", activeName: "APRENDIZ DE ARMAS", activeCost: 1,
        superStats: { hp: 4, def: 7, atk: 7 }, 
        
        onAfterPlayAsync: async function(card, game, p) {
            card.karlitosEntrenado = false; 
        },
        
        onStartTurn: async function(card, game) {
            if (card.owner === game.activePlayerId && (card.location === 'vanguard' || card.location === 'rearguard')) {
                if (card.karlitosEntrenado) return; 

                game.modifyCounters(card, 'karlitos_entrenamiento', 1, 'Práctica', 'PRÁCTICA CONSTANTE', '🏋️');
                
                if (card.counters['karlitos_entrenamiento'] && card.counters['karlitos_entrenamiento'].count >= 3) {
                    game.logMsg(`¡${card.name} ha completado su entrenamiento!`, 'ability');
                    showFloatingText(card.instanceId, "¡PRÁCTICA COMPLETADA!", "ft-ability", -40);
                    delete card.counters['karlitos_entrenamiento']; 
                    card.karlitosEntrenado = true; 
                    
                    const p = game.players[card.owner];
                    const inDeck = p.deck.filter(c => c.name === "Super Evolución");
                    const inDiscard = p.discard.filter(c => c.name === "Super Evolución");
                    const allValid = [...inDeck, ...inDiscard];
                    
                    if (allValid.length > 0) {
                        const wantSearch = await new Promise(resolve => {
                            game.openChoiceModal('PRÁCTICA COMPLETADA', [
                                { label: 'BUSCAR SÚPER EVOLUCIÓN', action: () => resolve(true) },
                                { label: 'NO BUSCAR', action: () => resolve(false) }
                            ], card.owner);
                        });

                        if (wantSearch) {
                            const chosen = await game.openVisualSearchModal('BUSCAR SÚPER EVOLUCIÓN', allValid, 1, false, card.owner);
                            if (chosen && chosen.length > 0) {
                                const target = chosen[0];
                                
                                let idx = p.deck.findIndex(c => c.instanceId === target.instanceId);
                                if (idx !== -1) {
                                    p.deck.splice(idx, 1);
                                    await animateStackToHand(`${p.id}-deck-stack`, p.id, target.id);
                                } else {
                                    idx = p.discard.findIndex(c => c.instanceId === target.instanceId);
                                    p.discard.splice(idx, 1);
                                    await animateStackToHand(`${p.id}-discard-stack`, p.id, target.id);
                                }
                                
                                target.location = 'hand';
                                p.hand.push(target);
                                game.logMsg(`Añades ${target.name} a tu mano.`, 'ability');
                            }
                            
                            game.logMsg("Barajando el mazo...", 'system');
                            if (typeof animateShuffle === 'function') await animateShuffle(p.id);
                            game.shuffle(p.deck);
                            game.render();
                        }
                    } else {
                        game.logMsg("No quedan cartas de Súper Evolución en el mazo ni en los descartes.", 'system');
                    }
                }
            }
        },
        canActivateAbility: function(card, game) {
            if (card.furor < 1) { game.logError("Falta Furor (1)."); return false; }
            const p = game.players[card.owner];
            const validWeapons = p.hand.filter(c => c.subtype === 'Arma' || c.subtype === 'Arma legendaria');
            if (validWeapons.length === 0) { game.logError("No tienes armas en la mano."); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            if (game.players[enemyId].vanguard.length === 0) { game.logError("No hay enemigos para atacar."); return false; }
            return true;
        },
        onExecuteAbility: async function(card, game) {
            const p = game.players[card.owner];
            const validWeapons = p.hand.filter(c => c.subtype === 'Arma' || c.subtype === 'Arma legendaria');
            
            const chosenWeapon = await game.openVisualSearchModal('APRENDIZ: ELIGE ARMA PARA EQUIPAR', validWeapons, 1, true, card.owner);
            if (!chosenWeapon || chosenWeapon.length === 0) { game.cancelAction(); return; }
            
            const weapon = chosenWeapon[0];
            const handIdx = p.hand.findIndex(c => c.instanceId === weapon.instanceId);
            p.hand.splice(handIdx, 1);
            
            if (!card.equippedCards) card.equippedCards = [];
            card.equippedCards.push(weapon);
            weapon.location = 'equipped';
            weapon.equippedTo = card.instanceId;
            
            game.modifyStat(card, 'furor', -1);
            showFloatingText(card.instanceId, "APRENDIZ DE ARMAS", "ft-ability", -40);
            game.logMsg(`¡Karlitos se equipa velozmente con ${weapon.name} y se prepara para atacar!`, 'ability');
            
            game.updatePassives();
            game.render();
            await game.sleep(500);

            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 1, name: 'APRENDIZ DE ARMAS', targetType: 'enemy', isNormalAttack: true };
            game.isActionLocked = true; 
            game.logError("Elige un enemigo de la vanguardia para atacarlo.");
            game.render();
        },
        onValidateTarget: function(card, target, game, isSilent) {
            if (target.owner === card.owner || target.location !== 'vanguard' || getCardTemplate(target.id).isAvatar) return false;
            return true;
        },
        onTargetsReady: async function(card, game) {
            const target = game.abilityContext.targets[0];
            game.logMsg(`¡Karlitos ataca a ${target.name} con su nueva arma!`, 'ability');
            
            game.selectedCard = card; 
            await game.performAttack(card, target); 
        }
    },
    {
        name: "Super Evolución", type: "Ayuda", subtype: "Técnica", tags: ["Equipable"], rarity: "B", cost: 4, series: 1,
        text: "Equipa a un 'Usuario de Súper Evolución' en vanguardia. Sus stats cambian a las de Súper Evolución (restaurando Vida) y elimina estados alterados. Tras 3 turnos tuyos, se destruye y restaura sus stats originales (restaurando Vida) eliminando estados.",
        canPlayCard: function(card, game, p) {
            const valid = p.vanguard.filter(c => c.tags.includes("Usuario de Súper Evolución"));
            if (valid.length === 0) { game.logError("No hay ningún 'Usuario de Súper Evolución' en vanguardia."); return false; }
            return true;
        },
        onPlay: async function(card, game) {
            const p = game.players[card.owner];
            const valid = p.vanguard.filter(c => c.tags.includes("Usuario de Súper Evolución"));
            
            const chosen = await game.openVisualSearchModal('¿A QUIÉN APLICAR SÚPER EVOLUCIÓN?', valid, 1, true, card.owner);
            if (!chosen || chosen.length === 0) { game.cancelAction(); return; }
            
            const target = chosen[0];
            const template = getCardTemplate(target.id);
            
            if (!target.equippedCards) target.equippedCards = [];
            target.equippedCards.push(card);
            const handIdx = p.hand.findIndex(c => c.instanceId === card.instanceId);
            if (handIdx !== -1) p.hand.splice(handIdx, 1);
            
            card.location = 'equipped';
            card.equippedTo = target.instanceId;

            // 1. Aplicar Súper Stats y curar
            if (template.superStats) {
                target.maxHp = template.superStats.hp;
                target.currentHp = target.maxHp; 
            }
            target.status = {}; // Purifica estados
            
            // 2. Añadir temporizador usando nuestro sistema de tempEffects
            if (!target.tempEffects) target.tempEffects = [];
            target.tempEffects.push({ sourceId: card.id, ownerId: card.owner, count: 0, instanceId: card.instanceId });

            showFloatingText(target.instanceId, "¡SÚPER EVOLUCIÓN!", "ft-purple", -40);
            game.logMsg(`¡${target.name} alcanza su Súper Evolución! Su cuerpo se restaura y libera un poder abrumador.`, 'ability');
            try { await animateEvolution(target.instanceId); } catch(e){}

            game.updatePassives();
            game.cancelAction();
            game.render();
        },
        onEquipUpdate: function(equipCard, target, game) {
            // Calculamos matemáticamente el aumento para ATQ y DEF
            const template = getCardTemplate(target.id);
            if (template.superStats) {
                target.currentAtk += (template.superStats.atk - template.atk);
                target.currentDef += (template.superStats.def - template.def);
            }
        },
        onStartTurnTempEffect: function(target, effect, game, currentTurnPlayerId) {
            // Sumar al contador cada inicio de turno de su propietario
            if (currentTurnPlayerId === effect.ownerId) {
                effect.count++;
                showFloatingText(target.instanceId, `SÚPER EVO: ${effect.count}/3`, "ft-ability", -20);
                
                // Añadimos el contador visual de rayo ⚡ a la carta
                game.modifyCounters(target, 'super_evo_timer', 1, 'Turnos Evo', 'Súper Evolución', '⚡');
                
                if (effect.count >= 3) {
                    game.logMsg(`¡La Súper Evolución de ${target.name} se ha agotado!`, 'system');
                    showFloatingText(target.instanceId, "AGOTADO", "ft-red-stat", -30);
                    
                    // Borramos el contador visual
                    if (target.counters && target.counters['super_evo_timer']) {
                        delete target.counters['super_evo_timer'];
                    }
                    
                    // Restaurar Vida y stats base
                    const template = getCardTemplate(target.id);
                    target.maxHp = template.hp;
                    target.currentHp = target.maxHp;
                    target.status = {};
                    
                    // Destruir este equipo de la lista del Personaje
                    const p = game.players[effect.ownerId];
                    if (target.equippedCards) {
                        const eqIdx = target.equippedCards.findIndex(c => c.instanceId === effect.instanceId);
                        if (eqIdx !== -1) {
                            const eqCard = target.equippedCards.splice(eqIdx, 1)[0];
                            eqCard.location = 'discard';
                            if (!p.discard) p.discard = [];
                            p.discard.push(eqCard);
                        }
                    }
                    return false; // Devuelve false para que el motor borre este tempEffect automáticamente
                }
            }
            return true;
        },
        onGetPreviewEffects: function(card, game) {
            return []; // Ocultamos texto extra ya que el cambio visual de los stats se explica solo
        }
    },
    {
        name: "Karolina", hp: 2, def: 3, atk: 7, type: "Personaje", subtype: "Ser vivo", tags: ["Mercenaria"], gender: "F", rarity: "A", cost: 4, series: 1,
        text: "P: HUESO DURO: Def máxima 6. Ante ataque normal, solo pierde Vida si (Atq atacante - su Def) >= 2. Ante ataque especial, si es >= 1. A: HOSTIA MÁGICA TERRIBLE (2F): Ataque especial. Si tiene éxito, +1 Def permanente (máx 2 por puesta en juego).",
        passiveName: "HUESO DURO", activeName: "HOSTIA MÁGICA TERRIBLE", activeCost: 2,
        
        onAfterPlayAsync: async function(card, game, p) {
            card.karolinaDefBoosts = 0; // Reiniciamos sus bufos al ser jugada
        },
        
        onUpdatePassive: function(card, game) {
            // Aplicamos los bufos de su Activa
            if (card.karolinaDefBoosts) {
                card.currentDef += card.karolinaDefBoosts;
            }
            // Tope estricto de Hueso Duro: La máxima Def que puede alcanzar es 6.
            if (card.currentDef > 6) {
                card.currentDef = 6;
            }
        },
        
        onBeforeTakeDamage: async function(card, attacker, dmg, isSpecial, game) {
            // Calculamos la diferencia bruta de fuerza antes de que el motor aplique mínimos de daño
            let rawDiff = attacker.currentAtk - card.currentDef;
            
            if (!isSpecial) {
                // Ataque normal: Solo pierde vida si rawDiff >= 2
                if (rawDiff < 2) {
                    game.logMsg(`¡${card.passiveName}! ${card.name} absorbe el golpe normal sin inmutarse.`, 'ability');
                    showFloatingText(card.instanceId, "BLOQUEADO", "ft-ability", -30);
                    return 0; // Anula el daño por completo
                }
            } else {
                // Ataque especial: Solo pierde vida si rawDiff >= 1
                if (rawDiff < 1) {
                    game.logMsg(`¡${card.passiveName}! ${card.name} resiste el ataque especial gracias a su Hueso Duro.`, 'ability');
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
            game.logMsg(`¡Karolina lanza una HOSTIA MÁGICA TERRIBLE a ${target.name}!`, 'ability');
            
            game.inputState = 'EXECUTING';
            game.render();
            await game.sleep(500);

            // Intentamos hacer el ataque especial
            let dodged = false;
            const defTemplate = getCardTemplate(target.id);
            if (typeof defTemplate.onBeforeDefend === 'function') {
                dodged = await defTemplate.onBeforeDefend(target, card, game, game.abilityContext.name);
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
        text: "P: IDOL A DISTANCIA: Sólo colocable en retaguardia (vanguardia llena). Siempre Oculta. Desde la retaguardia: Gana 1 Furor en la Fase de Furor y puede usar su Activa. A: INTERFAZ (1F): Busca 'Rebobinar', 'Cambio de canal' o 'Publicidad mental' en mazo o descarte. Baraja si buscas en mazo.",
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
        
        onUpdatePassive: function(card, game) {
            card.stealth = true; // Siempre Oculta
        },
        
        canActivateAbility: function(card, game) {
            if (card.furor < 1) { game.logError("Falta Furor (1)."); return false; }
            return true;
        },
        
        onExecuteAbility: async function(card, game) {
            game.modifyStat(card, 'furor', -1);
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);
            
            const p = game.players[card.owner];
            const validNames = ["Rebobinar", "Cambio de canal", "Publicidad mental"];
            
            const inDeck = p.deck.filter(c => validNames.includes(c.name));
            const inDiscard = p.discard.filter(c => validNames.includes(c.name));
            const allValid = [...inDeck, ...inDiscard];
            
            if (allValid.length > 0) {
                const chosen = await game.openVisualSearchModal('INTERFAZ: BUSCAR CARTA', allValid, 1, false, card.owner);
                if (chosen && chosen.length > 0) {
                    const target = chosen[0];
                    
                    let idx = p.deck.findIndex(c => c.instanceId === target.instanceId);
                    if (idx !== -1) {
                        p.deck.splice(idx, 1);
                        await animateStackToHand(`${p.id}-deck-stack`, p.id, target.id);
                    } else {
                        idx = p.discard.findIndex(c => c.instanceId === target.instanceId);
                        p.discard.splice(idx, 1);
                        await animateStackToHand(`${p.id}-discard-stack`, p.id, target.id);
                    }
                    
                    target.location = 'hand';
                    p.hand.push(target);
                    game.logMsg(`¡Berry teclea velozmente y te consigue ${target.name}!`, 'ability');
                }
            } else {
                game.logError("Error 404: No quedan cartas compatibles con la Interfaz en tu mazo ni en los descartes.");
            }
            
            // BARAJEADO OBLIGATORIO: Siempre que se "busca" en el mazo, se baraja después.
            game.logError("Barajando el mazo...");
            if (typeof animateShuffle === 'function') await animateShuffle(p.id);
            game.shuffle(p.deck);
            
            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.render();
        }
    },
    {
        name: "Achmay", hp: 8, def: 2, atk: 0, type: "Personaje", subtype: "Ser mágico", tags: ["Cosa"], gender: "M", rarity: "S", cost: 3, series: 1,
        text: "P: YOLOLO: No puede atacar. Todos los ataques normales enemigos deben ir dirigidos a él. Si recibe un ataque normal, quita 1 Vida al atacante. A: PÉGAME, PERRA (2F): Obliga a un enemigo a realizar un ataque normal hacia Achmay en su próximo turno (si puede). Esta habilidad no gasta la acción de Achmay.",
        passiveName: "YOLOLO", activeName: "PÉGAME, PERRA", activeCost: 2,
        
        isTaunt: true, // Propiedad mágica que lee el motor para obligar los ataques
        
        canAttackNormally: function() { 
            return false; // Prohibido atacar
        },
        
        onAfterDefend: async function(defender, attacker, dmg, isSpecial, game) {
            if (!isSpecial) {
                game.logMsg(`¡YOLOLO! ${attacker.name} se pincha con la barrera de Achmay.`, 'combat');
                game.modifyStat(attacker, 'currentHp', -1);
                showFloatingText(attacker.instanceId, "-1 VIDA (Espinas)", "ft-purple", -30);
                await game.checkDeath(attacker);
            }
        },
        
        canActivateAbility: function(card, game) {
            if (card.furor < 2) { game.logError("Falta Furor (2)."); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            if (game.players[enemyId].vanguard.length === 0 && game.players[enemyId].rearguard.length === 0) {
                game.logError("No hay enemigos a los que provocar."); return false;
            }
            return true;
        },
        
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 1, name: 'PÉGAME, PERRA', targetType: 'enemy' };
            game.logError("Elige al enemigo que será provocado.");
            game.render();
        },
        
        onValidateTarget: function(card, target, game, isSilent) {
            if (target.owner === card.owner || getCardTemplate(target.id).isAvatar) return false;
            return true;
        },
        
        onTargetsReady: async function(card, game) {
            const target = game.abilityContext.targets[0];
            game.modifyStat(card, 'furor', -2);
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);
            
            // Le metemos la semilla de la locura en su cerebro
            if (!target.tempEffects) target.tempEffects = [];
            target.tempEffects.push({ sourceId: card.id, ownerId: card.owner, achmayId: card.instanceId });
            
            game.logMsg(`¡Achmay insulta a ${target.name}! ¡Deberá atacarle en su próximo turno!`, 'ability');
            showFloatingText(target.instanceId, "PROVOCADO", "ft-red-stat", -20);
            
            // CRÍTICO: NO agotamos la carta (NO ponemos card.exhausted = true)
            game.isActionLocked = false;
            game.cancelAction();
            game.updatePassives();
            game.render();
        },
        
        onStartTurnTempEffect: function(target, effect, game, currentTurnPlayerId) {
            // Cuando empiece el turno de la víctima, lo marcamos para que el motor ejecute el ataque
            if (currentTurnPlayerId === target.owner) {
                target.forcedAttackTarget = effect.achmayId;
                return false; // Borra el efecto temporal para que solo lo haga 1 vez
            }
            return true;
        },
        
        onGetPreviewEffects: function(card, game) {
            return [];
        }
    },
    {
        name: "Rezo en grupo", type: "Ayuda", subtype: "Técnica", tags: ["Consumible"], rarity: "C", cost: 2, series: 2,
        text: "Debes tributar 1 de Furor de dos aliados para usar esta carta. Busca en tu mazo cualquier carta con la etiqueta 'Dios/a' y añádela a tu mano. Baraja tu mazo.",
        canPlayCard: function(card, game, p) {
            const validAllies = [...p.vanguard, ...p.rearguard].filter(c => c.furor >= 1);
            if (validAllies.length < 2) { game.logError("Necesitas al menos 2 aliados con 1 de Furor cada uno."); return false; }
            return true;
        },
        onPlay: async function(card, game) {
            const p = game.players[card.owner];
            const validAllies = [...p.vanguard, ...p.rearguard].filter(c => c.furor >= 1);
            
            const chosen = await game.openVisualSearchModal('ELIGE 2 ALIADOS (-1 FUROR C/U)', validAllies, 2, true, card.owner);
            if (!chosen || chosen.length < 2) { game.cancelAction(); return; }

            chosen.forEach(c => {
                game.modifyStat(c, 'furor', -1);
                showFloatingText(c.instanceId, "-1 FUR", "ft-red-stat", -20);
            });
            game.logMsg(`Tributo pagado. ¡Inicia el Rezo en grupo!`, 'ability');

            const dioses = p.deck.filter(c => c.tags && (c.tags.includes("Diosa") || c.tags.includes("Dios")));
            if (dioses.length > 0) {
                const chosenDios = await game.openVisualSearchModal('BUSCAR DIOS/A EN EL MAZO', dioses, 1, false, card.owner);
                if (chosenDios && chosenDios.length > 0) {
                    const target = chosenDios[0];
                    const idx = p.deck.findIndex(c => c.instanceId === target.instanceId);
                    p.deck.splice(idx, 1);
                    await window.animateStackToHand(`${p.id}-deck-stack`, p.id, target.id);
                    target.location = 'hand';
                    p.hand.push(target);
                    game.logMsg(`¡La deidad ${target.name} acude a tu mano!`, 'ability');
                }
            } else {
                game.logError("No quedan Dioses ni Diosas en tu mazo.");
            }

            game.logError("Barajando el mazo...");
            if (typeof animateShuffle === 'function') await animateShuffle(p.id);
            game.shuffle(p.deck);

            const handIdx = p.hand.findIndex(c => c.instanceId === card.instanceId);
            if (handIdx !== -1) { 
                const selfCard = p.hand.splice(handIdx, 1)[0];
                if (typeof game.resetCard === 'function') game.resetCard(selfCard);
                p.discard.push(selfCard); 
                selfCard.location = 'discard'; 
            }
            game.cancelAction();
            game.render();
        }
    },
    {
        name: "Dáedra", type: "Evento", rarity: "B", cost: 1, duration: 3, series: 2,
        text: "Mientras esté en juego, todos los aliados con etiqueta 'Usuario de magia' o 'Monstruo' reciben el doble de Furor al principio de cada turno. 3 turnos.",
        onPlay: function(card, game) {
            game.logMsg(`¡La influencia de Dáedra inunda el campo!`, 'ability');
        },
        // Aquí usa el nuevo Hook que añadimos a index.html
        onGlobalBeforeGainFuror: function(eventCard, targetCard, amount, game) {
            if (targetCard.owner === eventCard.owner && targetCard.tags) {
                if (targetCard.tags.includes("Usuario de magia") || targetCard.tags.includes("Usuaria de magia") || targetCard.tags.includes("Monstruo")) {
                    game.logMsg(`¡Dáedra potencia la recuperación de ${targetCard.name}! (+1 Furor extra)`, 'ability');
                    return amount * 2;
                }
            }
            return amount;
        },
        onGlobalGetPreviewEffects: function(eventCard, targetCard, game) {
            if (targetCard.owner === eventCard.owner && targetCard.tags &&
                (targetCard.tags.includes("Usuario de magia") || targetCard.tags.includes("Usuaria de magia") || targetCard.tags.includes("Monstruo"))) {
                const dn = typeof game.getDisplayName === 'function' ? game.getDisplayName(eventCard.owner) : eventCard.owner;
                return [`Doble Furor al inicio del turno, fuente: Dáedra (Evento de ${dn})`];
            }
            return [];
        },
        onExpire: function(card, game, playerId) {
            game.logMsg("El evento Dáedra se desvanece.", 'system');
        }
    },
    {
        name: "La Bestia", hp: 8, def: 4, atk: 4, type: "Esbirro", subtype: "Ser mágico", tags: ["Invocación"], rarity: "S", cost: 1, series: 2,
        text: "P: MANIFESTACIÓN PROHIBIDA: Tributa 6 Furor de entre tus aliados. Si 'Dáedra' está activo (tuyo o rival), Def y Atq = 8. Si expira, baja. A: CATÁSTROFE (1F): Busca 'Fusión de planos' en el mazo. Baraja siempre.",
        passiveName: "MANIFESTACIÓN PROHIBIDA", activeName: "CATÁSTROFE", activeCost: 1,
        onBeforePlayAsync: async function(card, game, p) {
            let totalFuror = 0;
            [...p.vanguard, ...p.rearguard].forEach(c => totalFuror += c.furor);
            if (totalFuror < 6) { game.logError("Necesitas un total de 6 de Furor entre todos tus aliados."); return false; }

            game.logMsg("Se requiere un tributo masivo de 6 Furor.", 'system');
            let remaining = 6;
            
            // Loop para exprimir furor carta a carta hasta llegar a 6
            while (remaining > 0) {
                const valid = [...p.vanguard, ...p.rearguard].filter(c => c.furor > 0 && !getCardTemplate(c.id).isAvatar);
                const chosen = await game.openVisualSearchModal(`TRIBUTO PARA LA BESTIA (Faltan ${remaining})`, valid, 1, true, card.owner);
                if (!chosen || chosen.length === 0) return false; // Canceló el tributo
                
                game.modifyStat(chosen[0], 'furor', -1);
                remaining--;
            }
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
        onExecuteAbility: async function(card, game) {
            game.modifyStat(card, 'furor', -1);
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);
            
            const p = game.players[card.owner];
            const fusions = p.deck.filter(c => c.name === "Fusión de planos");

            if (fusions.length > 0) {
                const chosen = await game.openVisualSearchModal('BUSCAR FUSIÓN DE PLANOS', fusions, 1, false, card.owner);
                if (chosen && chosen.length > 0) {
                    const target = chosen[0];
                    const idx = p.deck.findIndex(c => c.instanceId === target.instanceId);
                    p.deck.splice(idx, 1);
                    await window.animateStackToHand(`${p.id}-deck-stack`, p.id, target.id);
                    target.location = 'hand';
                    p.hand.push(target);
                    game.logMsg(`La Bestia atrae el caos: Fusión de planos añadida a la mano.`, 'ability');
                }
            } else {
                game.logError("No quedan cartas 'Fusión de planos' en el mazo.");
            }

            game.logError("Barajando el mazo...");
            if (typeof animateShuffle === 'function') await animateShuffle(p.id);
            game.shuffle(p.deck);

            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.render();
        }
    },
    {
        name: "Xidachane", hp: 3, def: 3, atk: 4, type: "Personaje", subtype: "Ser vivo", tags: ["Alienígena", "Usuario de Súper Evolución"], gender: "M", rarity: "S", cost: 4, series: 2,
        text: "P: PIRATA GALÁCTICO: Sus stats base son (3/3/4). Cada vez que destruye a un enemigo, gana un contador. A los 3 contadores, vuelve a tu mano. A: FRUSTRACIÓN (1F): Ataque normal. Si no tuviera éxito (no hace daño), aumenta todas sus stats y Vida en +2 permanentemente.",
        passiveName: "PIRATA GALÁCTICO", activeName: "FRUSTRACIÓN", activeCost: 1,
        superStats: { hp: 6, def: 5, atk: 7 },
        onUpdatePassive: function(card, game) {
            if (!card.xidachaneBoosts) card.xidachaneBoosts = 0;
            const base = getCardTemplate(card.id);
            card.currentAtk = base.atk + (card.xidachaneBoosts * 2);
            card.currentDef = base.def + (card.xidachaneBoosts * 2);
        },
        onAfterAttack: async function(attacker, defender, game) {
            // Hook para los Kills
            if (defender.currentHp <= 0) {
                game.modifyCounters(attacker, 'xidachane_kills', 1, 'Bajas', 'PIRATA GALÁCTICO', '💀');
                if (attacker.counters['xidachane_kills'] && attacker.counters['xidachane_kills'].count >= 3) {
                    game.logMsg(`¡${attacker.name} ha reunido botín suficiente y escapa a la mano!`, 'ability');
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
                game.logMsg(`¡El ataque no tuvo éxito! La frustración invade a ${card.name} y se hace más fuerte.`, 'ability');
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
        text: "P: MAESTRO DE ARMAS: Puedes equipar a Honsow cualquier Arma ignorando condiciones. A: GENERACIÓN DE ARMAMENTO MELÉ (1F): Busca Arma (no legendaria) con 'melé' en mano o mazo, equípala, baraja y realiza un ataque normal.",
        passiveName: "MAESTRO DE ARMAS", activeName: "GENERACIÓN DE ARMAMENTO MELÉ", activeCost: 1,
        canActivateAbility: function(card, game) {
            if (card.furor < 1) { game.logError("Falta Furor (1)."); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            if (game.players[enemyId].vanguard.length === 0) { game.logError("No hay enemigos para atacar."); return false; }
            return true;
        },
        onExecuteAbility: async function(card, game) {
            const p = game.players[card.owner];
            // Armas melé y NO legendarias en mano y mazo
            const validWeapons = [...p.hand, ...p.deck].filter(c => c.subtype === 'Arma' && c.tags && c.tags.includes('melé'));

            if (validWeapons.length === 0) {
                game.logError("No hay armas 'melé' válidas en tu mano ni en tu mazo.");
                game.cancelAction();
                return;
            }

            const chosen = await game.openVisualSearchModal('GENERACIÓN: BUSCAR ARMA MELÉ', validWeapons, 1, false, card.owner);
            if (!chosen || chosen.length === 0) { game.cancelAction(); return; }

            const weapon = chosen[0];
            game.modifyStat(card, 'furor', -1);

            let fromDeck = false;
            let idx = p.hand.findIndex(c => c.instanceId === weapon.instanceId);
            if (idx !== -1) {
                p.hand.splice(idx, 1);
            } else {
                idx = p.deck.findIndex(c => c.instanceId === weapon.instanceId);
                p.deck.splice(idx, 1);
                fromDeck = true;
            }

            if (!card.equippedCards) card.equippedCards = [];
            card.equippedCards.push(weapon);
            weapon.location = 'equipped';
            weapon.equippedTo = card.instanceId;

            showFloatingText(card.instanceId, "ARMAMENTO MELÉ", "ft-ability", -40);
            game.logMsg(`¡Honsow genera y se equipa con ${weapon.name} ignorando sus condiciones!`, 'ability');

            if (fromDeck) {
                game.logError("Barajando el mazo...");
                if (typeof animateShuffle === 'function') await animateShuffle(p.id);
                game.shuffle(p.deck);
            }

            game.updatePassives();
            game.render();
            await game.sleep(500);

            // Prepara el ataque físico encadenado
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 1, name: 'ATAQUE MAESTRO', targetType: 'enemy', isNormalAttack: true };
            game.isActionLocked = true;
            game.logError("Elige un enemigo para atacarlo con tu nueva arma.");
            game.render();
        },
        onTargetsReady: async function(card, game) {
            const target = game.abilityContext.targets[0];
            game.selectedCard = card;
            await game.performAttack(card, target);
        }
    },
    {
        name: "Domador", type: "Ayuda", subtype: "Ser vivo", tags: ["Consumible"], rarity: "C", cost: 1, series: 2,
        text: "Elige un aliado 'Animal salvaje'. Aumenta su Def y Atq en 2 permanentemente (mientras siga en juego).",
        canPlayCard: function(card, game, p) {
            const valid = [...p.vanguard, ...p.rearguard].filter(c => c.tags && c.tags.includes('Animal salvaje'));
            if (valid.length === 0) { game.logError("No tienes 'Animales salvajes' en el campo."); return false; }
            return true;
        },
        onPlay: async function(card, game) {
            const p = game.players[card.owner];
            const valid = [...p.vanguard, ...p.rearguard].filter(c => c.tags && c.tags.includes('Animal salvaje'));

            const chosen = await game.openVisualSearchModal('¿A QUÉ ANIMAL DOMAR?', valid, 1, true, card.owner);
            if (!chosen || chosen.length === 0) { game.cancelAction(); return; }

            const target = chosen[0];

            // Efecto temporal infinito para no modificar la base destructivamente
            if (!target.tempEffects) target.tempEffects = [];
            target.tempEffects.push({ sourceId: card.id, ownerId: card.owner, duration: 999, isDomador: true });

            showFloatingText(target.instanceId, "DOMADO", "ft-ability", -40);
            showFloatingText(target.instanceId, "+2 ATQ / +2 DEF", "ft-green", -20);
            game.logMsg(`¡${target.name} ha sido domado y recibe +2 Atq y +2 Def!`, 'ability');

            const handIdx = p.hand.findIndex(c => c.instanceId === card.instanceId);
            if (handIdx !== -1) { 
                const selfCard = p.hand.splice(handIdx, 1)[0];
                if (typeof game.resetCard === 'function') game.resetCard(selfCard);
                p.discard.push(selfCard); 
                selfCard.location = 'discard'; 
            }

            game.updatePassives();
            game.cancelAction();
            game.render();
        },
        onUpdateTempEffect: function(target, effect, game) {
            if (effect.isDomador) {
                target.currentAtk += 2;
                target.currentDef += 2;
            }
        },
        onStartTurnTempEffect: function() { return true; }, // Supervivencia infinita
        onEndTurnTempEffect: function() { return true; },
        onGetPreviewEffects: function(card, game, effect) {
            if (effect && effect.isDomador) return ["+2 ATQ, +2 DEF permanentemente (fuente: Domador)"];
            return [];
        }
    },
    {
        name: "Gólem de tierra", hp: 4, def: 4, atk: 2, type: "Esbirro", subtype: "Ser mágico", tags: ["Invocación", "Gólem"], rarity: "B", cost: 1, series: 2,
        text: "A: SEÍSMO (1F): Elige a dos enemigos distintos de la vanguardia del rival para hacerle un ataque normal a cada uno.",
        activeName: "SEÍSMO", activeCost: 1,
        canActivateAbility: function(card, game) {
            if (card.furor < 1) { game.logError("Falta Furor (1)."); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            const enemyP = game.players[enemyId];
            
            const hasTaunt = enemyP.vanguard.some(c => getCardTemplate(c.id).isTaunt);
            if (hasTaunt) { game.logError("Hay un enemigo Provocando, no puedes atacar a objetivos múltiples."); return false; }
            
            const valid = enemyP.vanguard.filter(c => !c.stealth);
            if (valid.length < 2) { game.logError("No hay suficientes enemigos en vanguardia para Seísmo."); return false; }
            return true;
        },
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 2, name: 'SEÍSMO', targetType: 'enemy', isNormalAttack: true };
            game.logMsg("Elige al primer objetivo del Seísmo.", 'system');
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
            game.modifyStat(card, 'furor', -1);
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
        name: "Karlos (KL)", hp: 6, def: 7, atk: 6, type: "Personaje", subtype: "Ser vivo", tags: ["Mercenario", "Usuario de VP"], gender: "M", rarity: "A", cost: 4, series: 2,
        text: "P: DAME TRABAJOS: Tributa 2 Furor o ten a Karolina, Karlitos o Igniz. Si Vida <= 3, +2 Atq. A: ULTRA-CHOQUE (2F): Dos ataques normales a vanguardia rival.",
        passiveName: "DAME TRABAJOS", activeName: "ULTRA-CHOQUE", activeCost: 2,
        onBeforePlayAsync: async function(card, game, p) {
            const hasFriend = [...p.vanguard, ...p.rearguard].some(c => c.name === 'Karolina' || c.name === 'Karlitos' || c.name === 'Igniz');
            if (hasFriend) {
                game.logMsg(`Karlos (KL) se une al grupo sin cobrar.`, 'ability');
                return true;
            }

            const validTributes = [...p.vanguard, ...p.rearguard].filter(c => c.furor >= 2 && !getCardTemplate(c.id).isAvatar);
            if (validTributes.length === 0) {
                game.logError("No tienes a Karolina/Karlitos/Igniz, ni aliados con 2 de Furor para pagarle.");
                return false;
            }

            const chosen = await game.openVisualSearchModal('DAME TRABAJOS: PAGA 2 FUROR', validTributes, 1, true, card.owner);
            if (chosen && chosen.length > 0) {
                game.modifyStat(chosen[0], 'furor', -2);
                return true;
            }
            return false;
        },
        onUpdatePassive: function(card, game) {
            if (card.currentHp <= 3) card.currentAtk += 2;
        },
        onGetPreviewEffects: function(card, game) {
            if (card.currentHp <= 3) return ["+2 ATQ (fuente: DAME TRABAJOS)"];
            return [];
        },
        canActivateAbility: function(card, game) {
            if (card.furor < 2) { game.logError("Falta Furor (2)."); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            const enemyP = game.players[enemyId];
            const hasTaunt = enemyP.vanguard.some(c => getCardTemplate(c.id).isTaunt);
            if (hasTaunt) { game.logError("Hay un enemigo Provocando, no puedes atacar a múltiples."); return false; }
            
            const valid = enemyP.vanguard.filter(c => !c.stealth);
            if (valid.length < 2) { game.logError("No hay suficientes enemigos en vanguardia."); return false; }
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
        text: "Anexa a Vanguardia con 'Karlos' y exactamente 1 de Vida. Sus stats pasan a ser 9 (inamovible). Quien le ataque pierde 1 de Furor. Al inicio de tu próximo turno, destruye este equipo y devuelve el personaje a tu mano.",
        canPlayCard: function(card, game, p) {
            const valid = p.vanguard.filter(c => c.name.includes("Karlos") && c.currentHp === 1);
            if (valid.length === 0) { game.logError("Necesitas un Karlos en vanguardia con exactamente 1 de Vida."); return false; }
            return true;
        },
        onPlay: async function(card, game) {
            const p = game.players[card.owner];
            const valid = p.vanguard.filter(c => c.name.includes("Karlos") && c.currentHp === 1);
            const chosen = await game.openVisualSearchModal('¿QUIÉN DESPIERTA EL PODER LEGADO?', valid, 1, true, card.owner);
            if (!chosen || chosen.length === 0) { game.cancelAction(); return; }

            const target = chosen[0];
            
            if (!target.equippedCards) target.equippedCards = [];
            target.equippedCards.push(card);
            
            const handIdx = p.hand.findIndex(c => c.instanceId === card.instanceId);
            if (handIdx !== -1) p.hand.splice(handIdx, 1);
            
            card.location = 'equipped';
            card.equippedTo = target.instanceId;

            // Escudo temporal para devolver a la mano en el sig. turno
            if (!target.tempEffects) target.tempEffects = [];
            target.tempEffects.push({ sourceId: card.id, ownerId: card.owner, turnApplied: game.turn, isLegado: true, cardRef: card });

            showFloatingText(target.instanceId, "PODER LEGADO", "ft-purple", -40);
            game.logMsg(`¡${target.name} despierta su verdadero poder!`, 'ability');

            game.updatePassives();
            game.cancelAction();
            game.render();
        },
        onEquipUpdate: function(equipCard, target, game) {
            // Bloquea los stats al máximo
            target.currentAtk = 9;
            target.currentDef = 9;
            target.maxHp = 9;
            target.currentHp = 9;
            target.ignoreStatCaps = true; // Para que el motor no baje cosas
        },
        // Aquí usa el nuevo Hook que añadimos a index.html (reacciona al ser atacado)
        onEquipBeforeDefend: async function(equipCard, defender, attacker, game) {
            game.logMsg(`El aura del Poder Legado drena la energía de ${attacker.name}. (-1 Furor)`, 'ability');
            game.modifyStat(attacker, 'furor', -1);
            showFloatingText(attacker.instanceId, "-1 FUR (Aura)", "ft-red-stat", -20);
        },
        onStartTurnTempEffect: async function(target, effect, game, currentTurnPlayerId) {
            if (effect.turnApplied === game.turn) return true; // El mismo turno que se jugó se salva
            
            if (currentTurnPlayerId === effect.ownerId && effect.isLegado) {
                game.logMsg(`El Poder Legado ha consumido la energía de ${target.name}. Regresa a la mano.`, 'ability');
                
                const p = game.players[target.owner];
                p.vanguard = p.vanguard.filter(c => c.instanceId !== target.instanceId);
                
                // Lo lavamos antes de devolverlo a la mano
                if (typeof game.resetCard === 'function') game.resetCard(target);
                target.location = 'hand';
                p.hand.push(target);
                
                try { await window.animateSpinToHand(target.instanceId, target.owner); } catch(e){}
                
                game.render();
                return false; // Borra el efecto
            }
            return true;
        },
        onGetPreviewEffects: function(card, game) {
            if (card.type === 'Personaje' || card.type === 'Esbirro') return ["Stats bloqueados a 9. Devuelve a la mano. (fuente: Poder Legado)"];
            return [];
        }
    },
    {
        name: "Igniz", hp: 3, def: 2, atk: 4, type: "Personaje", subtype: "Ser vivo", tags: ["Mercenario", "Procedencia virtual", "Energía Adán"], gender: "M", rarity: "A", cost: 4, series: 2,
        text: "P: CONOCIMIENTO TEÓRICO: Al colocar, puedes buscar una 'Ayuda' en tu mazo y añadirla a tu mano. Si buscas, baraja el mazo. A: LLAMAR MECA (2F): Busca 'Meca EBA' en mano o mazo y colócalo en campo. Si buscas en mazo, baraja. Puedes activar su Habilidad gratis de inmediato.",
        passiveName: "CONOCIMIENTO TEÓRICO", activeName: "LLAMAR MECA", activeCost: 2,
        
        // --- PASIVA CORREGIDA (Solo baraja si busca) ---
        onAfterPlayAsync: async function(card, game, p) {
            const wantSearch = await new Promise(resolve => {
                game.openChoiceModal('CONOCIMIENTO TEÓRICO', [
                    { label: 'BUSCAR AYUDA EN EL MAZO', action: () => resolve(true) },
                    { label: 'NO BUSCAR', action: () => resolve(false) }
                ], card.owner);
            });

            if (wantSearch) {
                const valid = p.deck.filter(c => c.type === 'Ayuda');
                if (valid.length > 0) {
                    const chosen = await game.openVisualSearchModal('BUSCAR AYUDA', valid, 1, false, card.owner);
                    if (chosen && chosen.length > 0) {
                        const target = chosen[0];
                        const idx = p.deck.findIndex(c => c.instanceId === target.instanceId);
                        p.deck.splice(idx, 1);
                        
                        if (typeof animateStackToHand === 'function') await animateStackToHand(`${p.id}-deck-stack`, p.id, target.id);
                        
                        target.location = 'hand';
                        p.hand.push(target);
                        game.logMsg(`Igniz obtiene ${target.name} gracias a su Conocimiento Teórico.`, 'ability');
                    }
                } else {
                    game.logMsg("No quedan cartas de Ayuda en el mazo.", 'system');
                }

                // REGLA TCG: Como ha mirado el mazo, ahora sí barajamos SIEMPRE
                game.logMsg("Barajando el mazo...", 'system');
                if (typeof animateShuffle === 'function') await animateShuffle(p.id);
                game.shuffle(p.deck);
            }
            game.render();
        },
        
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
            game.modifyStat(card, 'furor', -2);
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);
            
            const p = game.players[card.owner];
            
            // 1. Miramos si hay Mecas en la mano
            const mecasInHand = p.hand.filter(c => c.name === "Meca EBA");
            let mecaToPlay = null;
            let searchedDeck = false;

            if (mecasInHand.length > 0) {
                // Preguntamos al jugador si quiere usar el de la mano o buscar en mazo
                const choice = await new Promise(resolve => {
                    game.openChoiceModal('¿DE DÓNDE LLAMAS AL MECA EBA?', [
                        { label: 'DESDE LA MANO', action: () => resolve('hand') },
                        { label: 'BUSCAR EN EL MAZO', action: () => resolve('deck') },
                        { label: 'CANCELAR', action: () => resolve('cancel') }
                    ], card.owner);
                });

                if (choice === 'cancel') {
                    game.modifyStat(card, 'furor', 2); // Devolvemos coste
                    game.cancelAction();
                    game.render();
                    return;
                } else if (choice === 'hand') {
                    mecaToPlay = mecasInHand[0]; // Coge el primero sin preguntar
                    const hIdx = p.hand.findIndex(c => c.instanceId === mecaToPlay.instanceId);
                    p.hand.splice(hIdx, 1);
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
                const chosen = await game.openVisualSearchModal('BUSCAR MECA EBA EN MAZO', validDeck, 1, true, card.owner);
                
                // Barajamos SIEMPRE tras abrir el modal del mazo
                game.logMsg("Barajando el mazo...", 'system');
                if (typeof animateShuffle === 'function') await animateShuffle(p.id);
                game.shuffle(p.deck);

                if (!chosen || chosen.length === 0) {
                    game.modifyStat(card, 'furor', 2); // Devolver coste
                    game.cancelAction(); 
                    game.render();
                    return;
                }
                
                mecaToPlay = chosen[0];
                const dIdx = p.deck.findIndex(c => c.instanceId === mecaToPlay.instanceId);
                p.deck.splice(dIdx, 1);
                if (typeof animateStackToHand === 'function') await animateStackToHand(`${p.id}-deck-stack`, p.id, mecaToPlay.id);
            }

            // 3. Colocación y Activación
            game.logMsg(`¡Igniz llama a su ${mecaToPlay.name}!`, 'ability');

            const placeChoice = p.vanguard.length < 4 ? 'vanguard' : 'rearguard';
            mecaToPlay.location = placeChoice;
            p[placeChoice].push(mecaToPlay);

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
        text: "P: CONSUMO DESMESURADO: Máx 2 Furor. Al colocar: +1 Furor. No gana Furor en la Fase de Furor. Fin de tu turno: -1 Furor; si baja a 0 así, se destruye. A: EMPLAZAR PILOTO (1F): Requiere aliado 'Energía Adán' en campo o mano. Destrúyelo/descártalo (si en campo, intercambia posición con Meca EBA antes). Anula la Pasiva de este Meca.",
        passiveName: "CONSUMO DESMESURADO", activeName: "EMPLAZAR PILOTO", activeCost: 1,
        
        maxFuror: 2, // El motor ya se encarga de capar el límite con esta propiedad
        
        onAfterPlayAsync: async function(card, game, p) {
            game.modifyStat(card, 'furor', 1);
            showFloatingText(card.instanceId, "CONSUMO DESMESURADO", "ft-ability", -30);
            game.logMsg(`${card.name} entra al campo y gana 1 de Furor inicial.`, 'ability');
        },
        
        onBeforeGainFuror: function(card, amount, source, game) {
            if (source === 'fase_furor' && !card.pilotoEmplazado) {
                game.logMsg(`${card.name} no recupera energía pasivamente.`, 'system');
                return 0; // Anula la ganancia pasiva en la fase de furor
            }
            return amount;
        },
        
        onEndTurn: async function(card, game) {
            if (card.owner === game.activePlayerId && (card.location === 'vanguard' || card.location === 'rearguard')) {
                if (!card.pilotoEmplazado) {
                    game.modifyStat(card, 'furor', -1);
                    showFloatingText(card.instanceId, "-1 FUR (Consumo)", "ft-red-stat", -30);
                    // Solo muere si baja a 0 exactamente en este momento
                    if (card.furor === 0) {
                        game.logMsg(`¡A ${card.name} se le agotó la energía por completo y se desploma!`, 'ability');
                        card.currentHp = 0;
                        await game.checkDeath(card, false);
                    }
                }
            }
        },
        
        canActivateAbility: function(card, game) {
            if (card.furor < 1) { game.logError("Falta Furor (1)."); return false; }
            const p = game.players[card.owner];
            const valid = [...p.vanguard, ...p.rearguard, ...p.hand].filter(c => c.tags && c.tags.includes("Energía Adán"));
            if (valid.length === 0) { game.logError("No tienes aliados con 'Energía Adán' en campo ni en mano."); return false; }
            return true;
        },
        
        onExecuteAbility: async function(card, game) {
            game.modifyStat(card, 'furor', -1);
            await getCardTemplate(card.id).doEmplazarPiloto(card, game, false);
        },
        
        // Función ayudante para que Igniz también pueda llamarla "gratis" si quiere
        doEmplazarPiloto: async function(card, game, isFree) {
            const p = game.players[card.owner];
            // Buscamos pilotos que no sean el propio Meca
            const valid = [...p.vanguard, ...p.rearguard, ...p.hand].filter(c => c.tags && c.tags.includes("Energía Adán") && c.instanceId !== card.instanceId); 

            const chosen = await game.openVisualSearchModal('ELIGE PILOTO (ENERGÍA ADÁN)', valid, 1, true, card.owner);
            if (!chosen || chosen.length === 0) {
                if (!isFree) game.modifyStat(card, 'furor', 1); // Devolvemos el coste si cancela
                game.cancelAction();
                return;
            }
            
            const pilot = chosen[0];
            showFloatingText(card.instanceId, "EMPLAZAR PILOTO", "ft-ability", -40);

            if (pilot.location === 'hand') {
                const idx = p.hand.findIndex(c => c.instanceId === pilot.instanceId);
                p.hand.splice(idx, 1);
                
                if (typeof game.resetCard === 'function') game.resetCard(pilot);
                p.discard.push(pilot);
                pilot.location = 'discard';
                game.logMsg(`¡${pilot.name} aborda el ${card.name} saltando desde la mano!`, 'ability');
            } else {
                game.logMsg(`¡${pilot.name} corre a abordar el ${card.name} en el campo!`, 'ability');
                
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
            game.logMsg(`${card.name} ahora tiene piloto. CONSUMO DESMESURADO desactivado.`, 'system');

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
        text: "Requiere un aliado 'Estudioso' en campo. Aliados 'Estudiosos' no ganan Furor al inicio del turno y quedan ocultos (inmunes a atq. normales). Expira (3T): Se destruye y robas 2 cartas por cada aliado afectado.",
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
        text: "P: HERRERO LEGENDARIO: Carta dual (Personaje / Ayuda equipable). No usable si Karolina está en tu Vanguardia (se autodestruye si ella entra). Si está como Personaje: puedes equiparlo a un aliado sin coste en tu turno (deja su hueco). Si su portador muere o deja el campo, Arthas cae de nuevo al campo si hay cupo válido (si no, va a los Descartes). Al usar como Ayuda equipable: Anexa a un aliado (NO 'Animal salvaje', NO 'Cosa', NO Karolina). +3 Atq.",
        passiveName: "HERRERO LEGENDARIO",
        
        canPlayCard: function(card, game, p) {
            if (p.vanguard.some(c => c.name === 'Karolina')) {
                game.logError("Arthas se niega a actuar si Karolina lidera la vanguardia.");
                return false;
            }
            return true;
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
            game.logMsg(`¡${target.name} empuña al legendario Arthas!`, 'ability');
            
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
                game.logMsg(`¡${hostCard.name} cae, pero no hay hueco para Arthas (límite de Personajes)! Arthas se pierde en los descartes.`, 'system');
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
        },

        onGetPreviewEffects: function(previewedCard, game, sourceItem) {
            // Si existe sourceItem, significa que el ratón está sobre el Portador, no sobre Arthas
            if (sourceItem && sourceItem.name === 'Arthas') {
                return ["Otorga +3 ATQ (fuente: Arthas)"];
            }
            return []; // Si no, el ratón está sobre Arthas, así que no mostramos el texto en sí mismo
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
                game.logMsg(`¡ABSORCIÓN DE MAGIA! NoName desintegra el daño del ataque especial de ${attacker.name}.`, 'ability');
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

            game.logMsg(`¡NoName escanea y replica [${mimicTemplate.activeName}] de ${target.name}!`, 'ability');
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
        text: "Este clon copia el ATQ y DEF de NoName en todo momento. Tiene su propia Vida, pero no puede ganar Furor ni usar habilidades. Si el NoName original muere o abandona el campo, este clon se desvanece instantáneamente.",
        onUpdatePassive: function(card, game) {
            // El clon tiene el Furor capado a 0 siempre
            card.maxFuror = 0; 
            card.furor = 0;
            
            if (card.parentId) {
                const parent = game.findCard(card.parentId);
                if (parent && (parent.location === 'vanguard' || parent.location === 'rearguard')) {
                    card.currentAtk = parent.currentAtk;
                    card.currentDef = parent.currentDef;
                } else {
                    card.currentHp = 0;
                    game.checkDeath(card, false); 
                }
            }
        }
    },
    {
        name: "Capitán Guardia Real", hp: 3, def: 4, atk: 5, type: "Esbirro", subtype: "Ser vivo", tags: ["Guardia Real", "Traje protector"], rarity: "A", cost: 1, series: 2,
        text: "A: LIDERAZGO (1F): Elige un aliado de tu vanguardia que no haya atacado. +2 Atq hasta el final del turno. Puedes usarla desde retaguardia.",
        activeName: "LIDERAZGO", activeCost: 1,
        canUseAbilityFromRearguard: true,
        
        canActivateAbility: function(card, game) {
            if (card.furor < 1) { game.logError("Falta Furor (1)."); return false; }
            const valid = game.players[card.owner].vanguard.filter(c => !c.hasAttackedThisTurn);
            if (valid.length === 0) { game.logError("No hay aliados válidos en vanguardia que no hayan atacado."); return false; }
            return true;
        },
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 1, name: 'LIDERAZGO', targetType: 'ally' };
            game.render();
        },
        onValidateTarget: function(card, target, game, isSilent) {
            if (target.owner !== card.owner || target.location !== 'vanguard') return false;
            if (target.hasAttackedThisTurn) { if (!isSilent) game.logError("Ese aliado ya ha atacado este turno."); return false; }
            return true;
        },
        onTargetsReady: async function(card, game) {
            const target = game.abilityContext.targets[0];
            game.modifyStat(card, 'furor', -1);
            showFloatingText(card.instanceId, "LIDERAZGO", "ft-ability", -30);
            
            if (!target.tempEffects) target.tempEffects = [];
            target.tempEffects.push({ sourceId: card.id, ownerId: card.owner, type: 'liderazgo' });
            
            game.logMsg(`${card.name} motiva profundamente a ${target.name}. (+2 ATQ temporal)`, 'ability');
            showFloatingText(target.instanceId, "+2 ATQ", "ft-green", -20);
            
            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.updatePassives();
            game.render();
        },
        onUpdateTempEffect: function(target, effect, game) {
            if (effect.type === 'liderazgo') target.currentAtk += 2;
        },
        onEndTurnTempEffect: function(target, effect, game, currentTurnPlayerId) {
            if (currentTurnPlayerId === effect.ownerId && effect.type === 'liderazgo') {
                game.logMsg(`El Liderazgo sobre ${target.name} expira.`, 'system');
                return false; 
            }
            return true;
        }
    },
    {
        name: "Llamada del deber", type: "Evento", rarity: "B", cost: 1, duration: 2, series: 2,
        text: "Aliados 'Guardia Real' ganan 1 Furor inmediatamente al colocarse. Fin de tu turno: Puedes buscar un 'Guardia Real' en tu mazo, añadirlo a la mano y barajar.",
        onPlay: function(card, game) { game.logMsg("¡Llamada del deber activada!", 'ability'); },
        onUpdatePassive: function(card, game, p) {
            [...p.vanguard, ...p.rearguard].forEach(c => {
                if (c.justPlayed && c.tags && c.tags.includes('Guardia Real') && !c.llamadaBuffed) {
                    c.llamadaBuffed = true; 
                    game.modifyStat(c, 'furor', 1);
                    showFloatingText(c.instanceId, "+1 FUR", "ft-green", -20);
                    game.logMsg(`¡Llamada del deber inspira a ${c.name}!`, 'ability');
                }
            });
        },
        onEndTurn: async function(card, game, playerId) {
            if (playerId !== card.owner) return;
            const p = game.players[playerId];
            const validCards = p.deck.filter(c => c.tags && c.tags.includes('Guardia Real'));
            
            if (validCards.length > 0) {
                const wantSearch = await new Promise(resolve => {
                    game.openChoiceModal('LLAMADA DEL DEBER', [
                        { label: 'BUSCAR GUARDIA REAL EN MAZO', action: () => resolve(true) },
                        { label: 'NO BUSCAR', action: () => resolve(false) }
                    ], card.owner);
                });
                
                if (wantSearch) {
                    const chosen = await game.openVisualSearchModal('RECLUTAR GUARDIA REAL', validCards, 1, false, card.owner);
                    if (chosen && chosen.length > 0) {
                        const target = chosen[0];
                        const idx = p.deck.findIndex(c => c.instanceId === target.instanceId);
                        p.deck.splice(idx, 1);
                        if (typeof animateStackToHand === 'function') await animateStackToHand(`${p.id}-deck-stack`, p.id, target.id);
                        target.location = 'hand';
                        p.hand.push(target);
                        game.logMsg(`Reclutas a ${target.name} desde tu cuartel.`, 'ability');
                    }
                    
                    game.logMsg("Barajando el mazo...", 'system');
                    if (typeof animateShuffle === 'function') await animateShuffle(p.id);
                    game.shuffle(p.deck);
                    game.render();
                }
            }
        },
        onExpire: function(card, game, playerId) { game.logMsg("La Llamada del deber se extingue.", 'system'); }
    },
    {
        name: "Clarise", hp: 4, def: 3, atk: 6, type: "Personaje", subtype: "Ser vivo", tags: ["Usuaria de VP", "Estudiosa"], gender: "F", rarity: "C", cost: 1, series: 2,
        text: "A: PESANTEZ MUTUA (1F): El enemigo que elijas no podrá realizar ataques normales en el próximo turno del rival (sí Habilidades, pero fallarán si involucran ataques).",
        activeName: "PESANTEZ MUTUA", activeCost: 1,
        
        canActivateAbility: function(card, game) {
            if (card.furor < 1) { game.logError("Falta Furor (1)."); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            if (game.players[enemyId].vanguard.length === 0 && game.players[enemyId].rearguard.length === 0) return false;
            return true;
        },
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 1, name: 'PESANTEZ MUTUA', targetType: 'enemy' };
            game.render();
        },
        onTargetsReady: async function(card, game) {
            const target = game.abilityContext.targets[0];
            game.modifyStat(card, 'furor', -1);
            showFloatingText(card.instanceId, "PESANTEZ MUTUA", "ft-ability", -30);
            
            if (!target.tempEffects) target.tempEffects = [];
            target.tempEffects.push({ sourceId: card.id, ownerId: card.owner, type: 'pesantez' });
            
            showFloatingText(target.instanceId, "INMOVILIZADO", "ft-purple", -30);
            game.logMsg(`¡${target.name} sufre Pesantez Mutua! Sus piernas pesan toneladas.`, 'ability');
            
            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.render();
        },
        
        onBeforeAttackTempEffect: async function(attacker, effect, defender, game) {
            if (effect.type === 'pesantez') {
                const isNormal = !game.abilityContext || game.abilityContext.isNormalAttack;
                if (isNormal) {
                    game.logMsg(`¡PESANTEZ MUTUA! ${attacker.name} está inmovilizado y no puede realizar ataques físicos.`, 'ability');
                    return false;
                }
            }
            return true;
        },
        
        onStartTurnTempEffect: function(target, effect, game, currentTurnPlayerId) {
            if (currentTurnPlayerId === effect.ownerId && effect.type === 'pesantez') {
                game.logMsg(`La Pesantez Mutua sobre ${target.name} desaparece.`, 'system');
                return false; 
            }
            return true;
        }
    },
    {
        name: "Alumno con VP", hp: 2, def: 1, atk: 3, type: "Esbirro", subtype: "Ser vivo", tags: ["Usuario de VP", "Estudioso"], rarity: "C", cost: 1, series: 2,
        text: "A: ACERTIJO (1F): Moneda. Cara: Elige enemigo y le quita 2 Furor. Cruz: Rival elige enemigo y le quita 1 Furor.",
        activeName: "ACERTIJO", activeCost: 1,
        canActivateAbility: function(card, game) {
            if (card.furor < 1) { game.logError("Falta Furor (1)."); return false; }
            return true;
        },
        onExecuteAbility: async function(card, game) {
            game.modifyStat(card, 'furor', -1);
            showFloatingText(card.instanceId, "ACERTIJO", "ft-ability", -30);
            game.isActionLocked = true;
            
            const results = await game.triggerCoinFlips(1, card.owner);
            if (!results) { game.cancelAction(); return; }

            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            const enemyP = game.players[enemyId];
            const validEnemies = [...enemyP.vanguard, ...enemyP.rearguard].filter(c => !getCardTemplate(c.id).isAvatar);

            if (validEnemies.length === 0) {
                game.logError("No hay enemigos para escuchar el acertijo.");
                card.exhausted = true;
                game.isActionLocked = false;
                game.cancelAction();
                game.render();
                return;
            }

            if (results[0] === 'heads') {
                game.logMsg("Moneda: CARA - Tú eliges a quién vaciarle la mente.", 'ability');
                const chosen = await game.openVisualSearchModal('ACERTIJO (CARA): TÚ ELIGES (-2 FUR)', validEnemies, 1, true, card.owner);
                if (chosen && chosen.length > 0) {
                    game.modifyStat(chosen[0], 'furor', -2);
                    game.logMsg(`¡${chosen[0].name} no sabe la respuesta y pierde 2 de Furor!`, 'ability');
                }
            } else {
                game.logMsg("Moneda: CRUZ - El rival decide quién de sus tropas sufrirá la jaqueca.", 'ability');
                const chosen = await game.openVisualSearchModal('ACERTIJO (CRUZ): ELIGE UN ALIADO PARA PERDER 1 FUR', validEnemies, 1, true, enemyId);
                if (chosen && chosen.length > 0) {
                    game.modifyStat(chosen[0], 'furor', -1);
                    game.logMsg(`El rival decide sacrificar 1 Furor de ${chosen[0].name}.`, 'ability');
                }
            }
            
            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.render();
        }
    },
    {
        name: "Frikazo", hp: 3, def: 2, atk: 2, type: "Esbirro", subtype: "Ser vivo", tags: ["Estudioso", "Otaku"], rarity: "C", cost: 1, series: 2,
        text: "A: FIJACIÓN (1F): Anexa a un Personaje aliado. Mientras esté activo, Frikazo recibe en su lugar los ataques que vayan dirigidos a ese Personaje. Reusable.",
        activeName: "FIJACIÓN", activeCost: 1,
        canActivateAbility: function(card, game) {
            if (card.furor < 1) { game.logError("Falta Furor (1)."); return false; }
            const valid = [...game.players[card.owner].vanguard, ...game.players[card.owner].rearguard].filter(c => c.type === 'Personaje' && c.instanceId !== card.instanceId);
            if (valid.length === 0) { game.logError("No hay Personajes aliados a los que proteger."); return false; }
            return true;
        },
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 1, name: 'FIJACIÓN', targetType: 'ally' };
            game.render();
        },
        onValidateTarget: function(card, target, game, isSilent) {
            if (target.owner !== card.owner || target.type !== 'Personaje' || target.instanceId === card.instanceId) return false;
            return true;
        },
        onTargetsReady: async function(card, game) {
            const target = game.abilityContext.targets[0];
            game.modifyStat(card, 'furor', -1);
            showFloatingText(card.instanceId, "FIJACIÓN", "ft-ability", -30);
            
            if (card.attachedTo) {
                const oldHost = game.findCard(card.attachedTo);
                if (oldHost && oldHost.attachments) {
                    oldHost.attachments = oldHost.attachments.filter(id => id !== card.instanceId);
                }
            }

            card.attachedTo = target.instanceId;
            card.reverseArrow = true; 
            if (!target.attachments) target.attachments = [];
            target.attachments.push(card.instanceId);

            game.logMsg(`¡${card.name} se vuelve el fan número 1 de ${target.name} y lo protegerá con su vida!`, 'ability');

            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.updatePassives();
            game.render();
        },
        onInterceptAttack: function(interceptorCard, attacker, defender, game) {
            game.logMsg(`¡FIJACIÓN! ${interceptorCard.name} se lanza cual guardaespaldas a recibir el golpe en lugar de ${defender.name}.`, 'ability');
            showFloatingText(interceptorCard.instanceId, "¡CUIDADO!", "ft-purple", -30);
            return interceptorCard; // Cambiamos la víctima antes del golpe
        }
    },
    {
        name: "Gladiador", hp: 5, def: 4, atk: 5, type: "Personaje", subtype: "Ser vivo", tags: ["Mercenario", "Draconiano", "Maleante"], rarity: "C", cost: 1, series: 2,
        text: "P: OBSESIÓN DE VENGANZA: Al colocar, puedes anexar un aliado en tu campo a él. Mientras la unión esté activa, Gladiador aumenta en 1 su Vida, Def y Atq. (Su Vida no bajará de 1 al perderlo).",
        passiveName: "OBSESIÓN DE VENGANZA",
        
        onAfterPlayAsync: async function(card, game, p) {
            const validAllies = [...p.vanguard, ...p.rearguard].filter(c => c.instanceId !== card.instanceId && !getCardTemplate(c.id).isAvatar);
            if (validAllies.length > 0) {
                const chosen = await game.openVisualSearchModal('OBSESIÓN DE VENGANZA: ANEXAR ALIADO', validAllies, 1, false, card.owner);
                if (chosen && chosen.length > 0) {
                    const ally = chosen[0];
                    
                    if (!card.attachments) card.attachments = [];
                    card.attachments.push(ally.instanceId);
                    ally.attachedTo = card.instanceId;
                    ally.reverseArrow = false;
                    
                    game.logMsg(`¡${card.name} se obsesiona y anexa a ${ally.name}!`, 'ability');
                    
                    // Incremento de vida máxima matemática
                    card.maxHp += 1;
                    card.currentHp += 1;
                    showFloatingText(card.instanceId, "+1 A TODO", "ft-green", -30);
                    
                    game.updatePassives(); // <--- Fuerza a actualizar sus stats de inmediato
                }
            }
        },
        onUpdatePassive: function(card, game) {
            if (card.attachments && card.attachments.length > 0) {
                const allyId = card.attachments[0];
                const ally = game.findCard(allyId);
                if (ally && ally.attachedTo === card.instanceId && ally.currentHp > 0) {
                    card.currentAtk += 1;
                    card.currentDef += 1;
                    card.gladiadorBuffActive = true;
                } else {
                    card.attachments = [];
                    if (card.gladiadorBuffActive) {
                        game.logMsg(`La obsesión de Gladiador ha sido erradicada. Pierde sus stats de bonificación.`, 'system');
                        card.maxHp -= 1;
                        if (card.currentHp > card.maxHp) card.currentHp = card.maxHp;
                        if (card.currentHp < 1) card.currentHp = 1;
                        card.gladiadorBuffActive = false;
                    }
                }
            }
        }
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
        text: "Aliados 'Científico' ganan +1 Furor al inicio del turno (incluso en retaguardia). Al expirar (3T): Robas 3 cartas y recuperas un Esbirro 'No-muerto' o 'Creación artificial' del descarte.",
        // Carta HÍBRIDA: la parte declarable va en abilities; el onExpire (búsqueda en descarte) sigue en código.
        abilities: [
            { trigger: "AL_JUGAR", log: "¡La investigación comienza!" },
            { trigger: "GLOBAL_MODIFICAR_FUROR", reglas: [
                { si: { origen: "fase_furor", objetivoDe: "PROPIO", algunaEtiqueta: ["Científico", "Científica"] },
                  preview: "+1 de Furor extra en tu fase de Furor",
                  log: { msg: "¡{objetivo} investiga y gana Furor extra!", tipo: "ability" },
                  accion: { sumar: 1 } }
            ] }
        ],
        onExpire: async function(card, game, playerId) {
            game.logMsg(`¡La investigación concluye! ${game.getDisplayName(playerId)} roba 3 cartas.`, 'ability');
            for (let i = 0; i < 3; i++) {
                if (game.players[playerId].deck.length > 0) await game.drawCard(playerId, true, 200); 
            }
            
            const p = game.players[playerId];
            const validDiscards = p.discard.filter(c => c.type === 'Esbirro' && (c.subtype === 'No-muerto' || (c.tags && c.tags.includes('Creación artificial'))));
            
            if (validDiscards.length > 0) {
                const wantSearch = await new Promise(resolve => {
                    game.openChoiceModal('RESULTADO DEL EXPERIMENTO', [
                        { label: 'RECUPERAR ESBIRRO DEL DESCARTE', action: () => resolve(true) },
                        { label: 'IGNORAR', action: () => resolve(false) }
                    ], playerId);
                });

                if (wantSearch) {
                    const chosen = await game.openVisualSearchModal('RECUPERAR ESBIRRO', validDiscards, 1, false, playerId);
                    if (chosen && chosen.length > 0) {
                        const target = chosen[0];
                        const idx = p.discard.findIndex(c => c.instanceId === target.instanceId);
                        p.discard.splice(idx, 1);
                        if (typeof animateStackToHand === 'function') await animateStackToHand(`${playerId}-discard-stack`, playerId, target.id);
                        target.location = 'hand';
                        p.hand.push(target);
                        game.logMsg(`${target.name} es reanimado y se añade a la mano.`, 'ability');
                    }
                }
            }
            game.render();
        }
    },
    {
        name: "Investigador demente", hp: 3, def: 4, atk: 2, type: "Esbirro", subtype: "Ser vivo", tags: ["Científico"], gender: "M", rarity: "B", cost: 2, series: 2,
        text: "A: INYECCIÓN DE MEJUNJE (1F): Elige un enemigo y echa una moneda. Cara: Ataque normal y lo duerme 2 turnos. Cruz: Sólo le inflige Daño por tiempo 2 turnos.",
        activeName: "INYECCIÓN DE MEJUNJE", activeCost: 1,
        canActivateAbility: function(card, game) {
            if (card.furor < 1) { game.logError("Falta Furor (1)."); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            if (game.players[enemyId].vanguard.length === 0) return false;
            return true;
        },
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 1, name: 'INYECCIÓN DE MEJUNJE', targetType: 'enemy', isNormalAttack: true };
            game.render();
        },
        onValidateTarget: function(card, target, game, isSilent) {
            if (target.location !== 'vanguard') { if (!isSilent) game.logError("Debe estar en vanguardia."); return false; }
            return true;
        },
        onTargetsReady: async function(card, game) {
            const target = game.abilityContext.targets[0];
            game.modifyStat(card, 'furor', -1);
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);
            game.isActionLocked = true;

            const results = await game.triggerCoinFlips(1, card.owner);
            if (!results) { game.cancelAction(); return; }

            if (results[0] === 'heads') {
                game.logMsg("Moneda: CARA - ¡Ataque normal y sedante fuerte!", 'ability');
                const canAttack = await game.checkAttackStatus(card, target);
                if (canAttack) {
                    let dodged = false;
                    const defTemplate = getCardTemplate(target.id);
                    if (typeof defTemplate.onBeforeDefend === 'function') {
                        dodged = await defTemplate.onBeforeDefend(target, card, game, card.activeName);
                    }
                    if (!dodged) {
                        let dmg = card.currentAtk - target.currentDef;
                        if (dmg <= 0) dmg = (card.type === 'Esbirro' && target.type === 'Personaje') ? 0.5 : 1;
                        await game.dealDamage(card, target, dmg, false);
                        
                        if (target.currentHp > 0) {
                            game.applyStatus(target, 'sueno', 2, card.name);
                        }
                        await game.checkDeath(target);
                    }
                }
            } else {
                game.logMsg("Moneda: CRUZ - ¡El mejunje le quema la piel! (Daño por tiempo 2T)", 'ability');
                game.applyStatus(target, 'dot', 2, card.name);
            }
            
            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.updatePassives();
            game.render();
        }
    },
    {
        name: "Ayudante perturbada", hp: 2, def: 2, atk: 3, type: "Esbirro", subtype: "Ser vivo", tags: ["Científica"], gender: "F", rarity: "C", cost: 1, series: 2,
        text: "P: MANO PARÁSITA: Cada vez que vaya a atacar, echa una moneda. Si sale cara, aumenta en 2 su Atq durante ese ataque.",
        passiveName: "MANO PARÁSITA",
        onBeforeAttack: async function(attacker, defender, game) {
            // --- Si es un ataque directo, no hay defensor. Saltamos la moneda. ---
            if (!defender) return true;

            game.logMsg(`¡${attacker.passiveName}! La mano parásita reacciona...`, 'ability');
            const results = await game.triggerCoinFlips(1, attacker.owner);
            if (!results) return false;

            if (results[0] === 'heads') {
                game.logMsg("Moneda: CARA - ¡La mano otorga fuerza sobrehumana! (+2 ATQ)", 'ability');
                showFloatingText(attacker.instanceId, "+2 ATQ", "ft-green", -20);
                attacker.currentAtk += 2;
                attacker.ayudanteBuff = true;
            } else {
                game.logMsg("Moneda: CRUZ - La mano no coopera.", 'neutral');
            }
            return true;
        },
        onAfterAttack: async function(attacker, defender, game) {
            if (attacker.ayudanteBuff) {
                attacker.currentAtk -= 2;
                attacker.ayudanteBuff = false;
            }
        }
    },
    {
        name: "Feria del cómic", type: "Evento", rarity: "A", cost: 1, duration: 2, series: 2,
        text: "Aura: Todos los que NO tengan la etiqueta 'Otaku' están Silenciados (no pueden usar Habilidades). Fin de tu turno: Moneda. Cara = Busca carta 'Otaku' en mazo, añádela a tu mano y baraja.",
        onPlay: function(card, game) { game.logMsg("¡Empieza la Feria del Cómic! Hay demasiado ruido para concentrarse...", 'ability'); },
        
        onUpdatePassive: function(card, game, p) {
            ['p1', 'p2'].forEach(pid => {
                [...game.players[pid].vanguard, ...game.players[pid].rearguard].forEach(c => {
                    if (!c.tags || (!c.tags.includes("Otaku") && !c.tags.includes("otaku"))) {
                        c.isSilenced = true; // Inyecta el silencio al motor lógico
                    }
                });
            });
        },

        // ¡AQUÍ ESTÁ LA MAGIA PARA EL HOVER (Afectado por...)!
        onGlobalGetPreviewEffects: function(evCard, targetCard, game) {
            if (!targetCard.tags || (!targetCard.tags.includes("Otaku") && !targetCard.tags.includes("otaku"))) {
                return [`Silenciado, fuente: ${evCard.name} (Evento activo)`];
            }
            return [];
        },
        
        onEndTurn: async function(card, game, playerId) {
            if (playerId !== card.owner) return;
            game.logMsg(`Feria del cómic: Buscando merchandising exclusivo...`, 'system');
            
            const results = await game.triggerCoinFlips(1, card.owner);
            if (results && results[0] === 'heads') {
                game.logMsg("Moneda: CARA - ¡Has encontrado algo genial en la Feria!", 'ability');
                const p = game.players[playerId];
                const otakus = p.deck.filter(c => c.tags && (c.tags.includes('Otaku') || c.tags.includes('otaku')));
                
                if (otakus.length > 0) {
                    const wantSearch = await new Promise(resolve => {
                        game.openChoiceModal('FERIA DEL CÓMIC', [
                            { label: 'COMPRAR MERCHANDISING (BUSCAR OTAKU)', action: () => resolve(true) },
                            { label: 'NO COMPRAR', action: () => resolve(false) }
                        ], card.owner);
                    });

                    if (wantSearch) {
                        const chosen = await game.openVisualSearchModal('COMPRAR CARTA OTAKU', otakus, 1, false, card.owner);
                        if (chosen && chosen.length > 0) {
                            const target = chosen[0];
                            const idx = p.deck.findIndex(c => c.instanceId === target.instanceId);
                            p.deck.splice(idx, 1);
                            if (typeof animateStackToHand === 'function') await animateStackToHand(`${playerId}-deck-stack`, playerId, target.id);
                            target.location = 'hand';
                            p.hand.push(target);
                            game.logMsg(`Añades ${target.name} a tu mano.`, 'ability');
                        }
                        
                        game.logMsg("Barajando el mazo...", 'system');
                        if (typeof animateShuffle === 'function') await animateShuffle(playerId);
                        game.shuffle(p.deck);
                        game.render();
                    }
                } else {
                    game.logMsg("Has mirado en todos los puestos, pero no quedan cartas Otaku en tu mazo.", 'system');
                }
            } else {
                game.logMsg("Moneda: CRUZ - Había demasiada cola y te fuiste con las manos vacías.", 'neutral');
            }
        },
        onExpire: function(card, game, playerId) { game.logMsg("La Feria del cómic cierra sus puertas.", 'system'); }
    },
    {
        name: "Deuda con la mafia", type: "Evento", rarity: "A", cost: 1, duration: 2, series: 2,
        text: "Al colocar: Elige un aliado; queda Silenciado y no gana Furor. Al expirar (2T): Busca en tu mazo una carta 'Mafia', añádela a la mano y baraja. El rival puede hacer lo mismo.",
        canPlayCard: function(card, game, p) {
            if (p.vanguard.length === 0 && p.rearguard.length === 0) {
                game.logError("Necesitas al menos 1 aliado en el campo para contraer la deuda.");
                return false;
            }
            return true;
        },
        onBeforePlayAsync: async function(card, game, p) {
            const allies = [...p.vanguard, ...p.rearguard].filter(c => !getCardTemplate(c.id).isAvatar);
            if (allies.length === 0) return false;
            
            const chosen = await game.openVisualSearchModal('¿QUIÉN CONTRAE LA DEUDA?', allies, 1, true, card.owner);
            if (chosen && chosen.length > 0) {
                card.mafiaTargetId = chosen[0].instanceId;
                return true;
            }
            return false;
        },
        onPlay: function(card, game) {
            const target = game.findCard(card.mafiaTargetId);
            if (target) {
                game.logMsg(`¡${target.name} se ha endeudado con la mafia! Queda silenciado y sin cobrar Furor.`, 'ability');
            }
        },
        onUpdatePassive: function(card, game, p) {
            if (card.mafiaTargetId) {
                const target = game.findCard(card.mafiaTargetId);
                if (target && (target.location === 'vanguard' || target.location === 'rearguard')) {
                    target.isSilenced = true; // Silencio forzado
                }
            }
        },
        onGlobalBeforeGainFuror: function(eventCard, targetCard, amount, game, source) {
            if (source === 'fase_furor' && targetCard.instanceId === eventCard.mafiaTargetId) {
                return 0; // Cortamos el grifo de furor
            }
            return amount;
        },
        onExpire: async function(card, game, playerId) {
            game.logMsg(`¡La Deuda ha sido saldada! Ambos jugadores pueden contactar a la Mafia.`, 'ability');
            
            for (let pid of ['p1', 'p2']) {
                const p = game.players[pid];
                const validCards = p.deck.filter(c => c.tags && (c.tags.includes('Mafia') || c.tags.includes('mafia')));
                
                if (validCards.length > 0) {
                    const wantSearch = await new Promise(resolve => {
                        game.openChoiceModal(`${game.getDisplayName(pid)}: COBRAR FAVOR A LA MAFIA`, [
                            { label: 'BUSCAR MAFIA EN EL MAZO', action: () => resolve(true) },
                            { label: 'NO BUSCAR', action: () => resolve(false) }
                        ], pid); // Ojo aquí: El modal le sale al jugador correcto en online
                    });

                    if (wantSearch) {
                        const chosen = await game.openVisualSearchModal(`${game.getDisplayName(pid)}: Llama a un contacto`, validCards, 1, false, pid);
                        if (chosen && chosen.length > 0) {
                            const c = chosen[0];
                            const idx = p.deck.findIndex(x => x.instanceId === c.instanceId);
                            if (idx !== -1) {
                                p.deck.splice(idx, 1);
                                if (typeof animateStackToHand === 'function') await animateStackToHand(`${pid}-deck-stack`, pid, c.id);
                                c.location = 'hand';
                                p.hand.push(c);
                                game.logMsg(`${game.getDisplayName(pid)} recibe a ${c.name} desde el submundo.`, 'system');
                            }
                        }
                        
                        game.logMsg("Barajando el mazo...", 'system');
                        if (typeof animateShuffle === 'function') await animateShuffle(pid);
                        game.shuffle(p.deck);
                        game.render();
                    }
                }
            }
        }
    },
    {
        name: "Escape con bomba de humo", type: "Evento", rarity: "C", cost: 1, duration: 1, series: 2,
        text: "Mientras esté en juego, puedes retirar a tus aliados sin coste de Furor. 1 turno de duración. Al expirar, cura 3 de Vida a cada aliado con etiqueta 'Ninja'.",
        abilities: [
            { trigger: "AL_JUGAR", log: "¡Bomba de humo! El campo se llena de niebla.", logTipo: "ability" },
            { trigger: "AL_CADUCAR", log: "La niebla se disipa.", logTipo: "system",
              efectos: [ { op: "CURAR", valor: 3, conBeforeHealed: false, soloSiHerido: true,
                           floating: "CURADO", floatingStyle: "ft-green", offsetY: -20, fuente: "healing",
                           target: { quien: "ALIADO", filtros: [ { campo: "tags", op: "includes", valor: "Ninja" } ] } } ],
              logSiAplicado: { msg: "Los Ninjas emergen revitalizados de las sombras.", tipo: "healing" } }
        ]
    },
    {
        name: "Guardaespaldas", hp: 4, def: 4, atk: 3, type: "Esbirro", subtype: "Ser vivo", tags: ["Mafia"], rarity: "B", cost: 1, series: 2,
        text: "P: YO SIEMPRE TE AMARÉ: Cuando un aliado vaya a recibir un ataque letal (0 Vida), puedes destruir a Guardaespaldas en su lugar. El rival consigue el premio y se activan los efectos de muerte.",
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
                game.logMsg(`¡${card.passiveName}! Guardaespaldas se arroja heroicamente frente al ataque de ${attacker.name}.`, 'ability');
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
        text: "Reacción. Úsala justo antes de que un aliado reciba un ataque. Elige un aliado distinto para que reciba el ataque en su lugar, ignorando los demás efectos del ataque original.",
        canPlayCard: function() { return false; },
        onHandReactionToAttack: async function(handCard, attacker, defender, game) {
            const p = game.players[handCard.owner];
            const validTargets = [...p.vanguard, ...p.rearguard].filter(c => c.instanceId !== defender.instanceId);
            
            if (validTargets.length === 0) return { used: false };

            const reactor = handCard.owner === 'p1' ? 'JUGADOR 1' : 'JUGADOR 2';
            const wantUse = await new Promise(resolve => {
                game.openChoiceModal(`REACCIÓN DE ${reactor}\n\n¿Usar Pequeña traición para desviar el ataque hacia otro aliado?`, [
                    { label: 'SÍ', action: () => resolve(true) },
                    { label: 'NO REACCIONAR', action: () => resolve(false) }
                ], handCard.owner);
            });

            if (wantUse) {
                const chosen = await game.openVisualSearchModal('ELIGE A LA NUEVA VÍCTIMA', validTargets, 1, false, handCard.owner);
                if (chosen && chosen.length > 0) {
                    game.logMsg(`¡Pequeña traición! El ataque es redirigido vilmente hacia ${chosen[0].name}.`, 'ability');
                    showFloatingText(chosen[0].instanceId, "OBJETIVO", "ft-purple", -30);
                    return { used: true, newDefender: chosen[0] };
                }
            }
            return { used: false };
        }
    },
    {
        name: "Inspiración", type: "Ayuda", subtype: "Técnica", tags: ["Consumible"], rarity: "C", cost: 1, series: 2,
        text: "Reacción. Úsala antes de recibir un ataque normal. Busca hasta dos 'Ayuda - Técnica' en tu mazo, añádelas y baraja.",
        canPlayCard: function() { return false; },
        onHandReactionToAttack: async function(handCard, attacker, defender, game) {
            const isNormal = !game.abilityContext || game.abilityContext.isNormalAttack;
            if (!isNormal) return { used: false };

            const reactor = handCard.owner === 'p1' ? 'JUGADOR 1' : 'JUGADOR 2';
            const wantUse = await new Promise(resolve => {
                game.openChoiceModal(`REACCIÓN DE ${reactor}\n\n¿Usar Inspiración mientras te atacan?`, [
                    { label: 'SÍ', action: () => resolve(true) },
                    { label: 'NO REACCIONAR', action: () => resolve(false) }
                ], handCard.owner);
            });

            if (wantUse) {
                game.logMsg(`¡La adrenalina del combate te da Inspiración!`, 'ability');
                const p = game.players[handCard.owner];
                const validCards = p.deck.filter(c => c.subtype === 'Técnica');
                
                if (validCards.length > 0) {
                    const chosen = await game.openVisualSearchModal('BUSCAR HASTA 2 TÉCNICAS', validCards, 2, false, handCard.owner);
                    if (chosen && chosen.length > 0) {
                        for (let c of chosen) {
                            const idx = p.deck.findIndex(x => x.instanceId === c.instanceId);
                            if (idx !== -1) {
                                p.deck.splice(idx, 1);
                                if (typeof animateStackToHand === 'function') await animateStackToHand(`${handCard.owner}-deck-stack`, handCard.owner, c.id);
                                c.location = 'hand';
                                p.hand.push(c);
                            }
                        }
                    }
                    if (typeof animateShuffle === 'function') await animateShuffle(handCard.owner);
                    game.shuffle(p.deck);
                }
                return { used: true };
            }
            return { used: false };
        }
    },
    {
        name: "Jugada arriesgada", type: "Ayuda", subtype: "Técnica", tags: ["Consumible"], rarity: "B", cost: 1, series: 2,
        text: "Reacción. Moneda. Cara = el atacante se ataca a sí mismo. Cruz = el ataque ocurre y el atacante pierde 1 Furor.",
        canPlayCard: function() { return false; },
        onHandReactionToAttack: async function(handCard, attacker, defender, game) {
            const reactor = handCard.owner === 'p1' ? 'JUGADOR 1' : 'JUGADOR 2';
            const wantUse = await new Promise(resolve => {
                game.openChoiceModal(`REACCIÓN DE ${reactor}\n\n¿Lanzar Jugada arriesgada ante el ataque de ${attacker.name}?`, [
                    { label: 'SÍ (Lanzar moneda)', action: () => resolve(true) },
                    { label: 'NO REACCIONAR', action: () => resolve(false) }
                ], handCard.owner);
            });

            if (wantUse) {
                game.logMsg(`¡${reactor} opta por una Jugada arriesgada!`, 'ability');
                const results = await game.triggerCoinFlips(1, handCard.owner);
                
                if (results[0] === 'heads') {
                    game.logMsg(`Moneda: CARA - ¡El ataque de ${attacker.name} rebota contra sí mismo!`, 'combat');
                    let dmg = attacker.currentAtk - attacker.currentDef;
                    if (dmg <= 0) dmg = 1;
                    
                    await game.dealDamage(attacker, attacker, dmg, false);
                    return { used: true, cancelAttack: true };
                } else {
                    game.logError(`Moneda: CRUZ - El ataque procede, pero le costará energía.`);
                    return { used: true, drainFurorAfter: true };
                }
            }
            return { used: false };
        }
    },
    {
        name: "Cortarrollos", type: "Ayuda", subtype: "Técnica", tags: ["Consumible"], rarity: "B", cost: 1, series: 2,
        text: "Reacción. Úsala antes de recibir un ataque. El atacante pierde TODO su Furor instantáneamente.",
        canPlayCard: function() { return false; },
        onHandReactionToAttack: async function(handCard, attacker, defender, game) {
            if (attacker.furor === 0) return { used: false };

            const reactor = handCard.owner === 'p1' ? 'JUGADOR 1' : 'JUGADOR 2';
            const wantUse = await new Promise(resolve => {
                game.openChoiceModal(`REACCIÓN DE ${reactor}\n\n¿Usar Cortarrollos para vaciar el Furor de ${attacker.name}?`, [
                    { label: 'SÍ (-TODO EL FUROR)', action: () => resolve(true) },
                    { label: 'NO REACCIONAR', action: () => resolve(false) }
                ], handCard.owner);
            });

            if (wantUse) {
                game.logMsg(`¡Cortarrollos anula la inercia de ${attacker.name}! Pierde todo el Furor.`, 'ability');
                game.modifyStat(attacker, 'furor', -attacker.furor);
                return { used: true };
            }
            return { used: false };
        }
    },
    {
        name: "Milkor MGL", type: "Ayuda", subtype: "Arma", tags: ["Equipable", "a distancia"], rarity: "B", cost: 1, series: 2,
        text: "Equípala a un aliado (NO 'Animal salvaje'). Al atacar normal: +1 contador y lanza moneda. Cara: Aumenta su Atq en 4 durante el ataque (máximo 8). Cruz: Rival elige el objetivo y reduce el daño en 3. Se destruye con 2 contadores.",
        canPlayCard: function(card, game, p) {
            const valid = [...p.vanguard, ...p.rearguard].filter(c => !c.tags.includes('Animal salvaje') && !getCardTemplate(c.id).isAvatar);
            if (valid.length === 0) { game.logError("No hay aliados válidos para empuñar el arma."); return false; }
            return true;
        },
        onPlay: async function(card, game) {
            const p = game.players[card.owner];
            const valid = [...p.vanguard, ...p.rearguard].filter(c => !c.tags.includes('Animal salvaje') && !getCardTemplate(c.id).isAvatar);
            const chosen = await game.openVisualSearchModal('¿QUIÉN EMPUÑA EL MILKOR MGL?', valid, 1, true, card.owner);
            if (!chosen || chosen.length === 0) { game.cancelAction(); return; }
            
            const target = chosen[0];
            if (!target.equippedCards) target.equippedCards = [];
            target.equippedCards.push(card);
            card.location = 'equipped';
            card.equippedTo = target.instanceId;
            card.milkorCounters = 0;

            const handIdx = p.hand.findIndex(c => c.instanceId === card.instanceId);
            if (handIdx !== -1) p.hand.splice(handIdx, 1);

            game.logMsg(`${target.name} carga el Milkor MGL.`, 'ability');
            game.updatePassives();
            game.cancelAction();
            game.render();
        },
        onEquipBeforeAttack: async function(equipCard, attacker, defender, game) {
            const isNormal = !game.abilityContext || game.abilityContext.isNormalAttack;
            if (!isNormal) return null;

            equipCard.milkorCounters++;
            game.logMsg(`¡${attacker.name} dispara el Milkor MGL! (Disparo ${equipCard.milkorCounters}/2)`, 'ability');
            
            const results = await game.triggerCoinFlips(1, attacker.owner);
            if (results && results[0] === 'heads') {
                game.logMsg(`Moneda: CARA - ¡Impacto explosivo! (+4 ATQ temporal)`, 'combat');
                showFloatingText(attacker.instanceId, "+4 ATQ", "ft-green", -20);
                return { dmgMod: 4 };
            } else {
                game.logMsg(`Moneda: CRUZ - ¡El disparo se desvía! El rival redirige el daño reducido.`, 'neutral');
                const enemyId = attacker.owner === 'p1' ? 'p2' : 'p1';
                const enemyP = game.players[enemyId];
                const validTargets = [...enemyP.vanguard, ...enemyP.rearguard].filter(c => !getCardTemplate(c.id).isAvatar);
                
                if (validTargets.length > 0) {
                    const chosen = await game.openVisualSearchModal('MILKOR FALLIDO: ELIGE QUIÉN RECIBE EL ROCE', validTargets, 1, true, enemyId);
                    if (chosen && chosen.length > 0) {
                        return { dmgMod: -3, newDefender: chosen[0] };
                    }
                }
                return { dmgMod: -3 };
            }
        },
        onEquipUpdate: function(equipCard, target, game) {
            // Comprobación de destrucción tras disparos
            if (equipCard.milkorCounters >= 2 && !equipCard.pendingDestroy) {
                equipCard.pendingDestroy = true;
                setTimeout(() => {
                    game.logMsg(`El Milkor MGL se queda sin munición y es descartado.`, 'system');
                    target.equippedCards = target.equippedCards.filter(c => c.instanceId !== equipCard.instanceId);
                    equipCard.location = 'discard';
                    const p = game.players[equipCard.owner];
                    if (!p.discard) p.discard = [];
                    p.discard.push(equipCard);
                    game.render();
                }, 1000);
            }
        },
        onGetPreviewEffects: function(card, game) {
            return [`Equipado con Milkor MGL (${card.milkorCounters || 0}/2 disparos)`];
        }
    },
    {
        name: "Apuesta", type: "Evento", rarity: "C", cost: 1, duration: 2, series: 2,
        text: "Tu rival echa una moneda al inicio de cada turno suyo, antes de ganar Furor. Cruz: pierde 1 de Furor de cada Personaje que debería haberlo ganado. 2T. Al expirar: cada aliado de tu vanguardia gana 1 de Furor por cada cruz sacada.",
        abilities: [
            { trigger: "GLOBAL_INICIO_TURNO", turnoDe: "RIVAL",
              log: { msg: "¡Apuesta activa! El azar decide el destino de la energía de {jugador}...", tipo: "ability" },
              moneda: {
                cruz: { log: { msg: "Moneda: CRUZ - ¡Mala suerte! Sus Personajes perderán el Furor de este turno.", tipo: "combat" },
                        marcar: [ { campo: "apuestaFailed", valor: true }, { campo: "apuestaCruces", sumar: 1 } ] },
                cara: { log: { msg: "Moneda: CARA - Mantiene su energía intacta.", tipo: "neutral" },
                        marcar: [ { campo: "apuestaFailed", valor: false } ] }
              } },
            { trigger: "GLOBAL_MODIFICAR_FUROR", reglas: [
                { si: { origen: "fase_furor", objetivoDe: "RIVAL", campoObjetivo: { campo: "type", op: "==", valor: "Personaje" }, campoSelf: { campo: "apuestaFailed", op: "truthy" } },
                  preview: "Perderá 1 de Furor al recibirlo este turno (cruz de Apuesta)",
                  floating: { texto: "APUESTA FALLIDA", estilo: "ft-red-stat", offset: -30 },
                  accion: { fijar: -1 } }
            ] },
            { trigger: "AL_CADUCAR", log: "La mesa de apuestas se cierra.", logTipo: "system",
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
        text: "Cada vez que un aliado tuyo realice un ataque normal con éxito, roba 1 Furor del enemigo golpeado.",
        abilities: [
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
        text: "Mientras esté en juego, todos los aliados y enemigos tienen siempre 0 de Furor y no ganan ninguno. El Furor original se restablece cuando esta carta expira o es destruida.",
        onPlay: function(card, game) {
            game.logMsg("¡BANCARROTA! Toda la energía del tablero queda congelada a 0.", 'ability');
            
            // Secuestramos el Furor real de todos y los dejamos a 0
            ['p1', 'p2'].forEach(pid => {
                [...game.players[pid].vanguard, ...game.players[pid].rearguard].forEach(c => {
                    c.bankruptStoredFuror = c.furor; // Lo guardamos en el bolsillo
                    c.furor = 0;                     // Lo vaciamos
                });
            });
            game.render();
        },
        
        // Bloqueamos cualquier intento de sumar o restar Furor mientras esté activa
        onGlobalBeforeStatChange: function(eventCard, targetCard, stat, amount, source, game) {
            if (stat === 'furor') {
                return 0; 
            }
            return amount;
        },
        
        // Texto dinámico para el panel de previsualización de las cartas afectadas
        onGlobalGetPreviewEffects: function(eventCard, targetCard, game) {
            if (targetCard.type === 'Personaje' || targetCard.type === 'Esbirro') {
                const original = targetCard.bankruptStoredFuror !== undefined ? targetCard.bankruptStoredFuror : 0;
                return [`Afectado por: Agotamiento de Furor (Bancarrota). Originalmente ${original} de Furor.`];
            }
            return [];
        },
        
        onExpire: function(card, game, playerId) {
            game.logMsg("La Bancarrota ha terminado. El Furor vuelve a fluir a sus dueños.", 'system');
            
            // Devolvemos el Furor del bolsillo a la realidad
            ['p1', 'p2'].forEach(pid => {
                [...game.players[pid].vanguard, ...game.players[pid].rearguard].forEach(c => {
                    if (c.bankruptStoredFuror !== undefined) {
                        c.furor = c.bankruptStoredFuror;
                        delete c.bankruptStoredFuror;
                    }
                });
            });
            
            // Forzamos un repintado general para quitar las X rojas de golpe
            game.updatePassives();
            game.render();
        },
        
        onDestroy: function(card, game, playerId) {
            // Si la destruyen prematuramente (Ej. Giro de Guion), ejecutamos la misma liberación
            this.onExpire(card, game, playerId);
        }
    },
    {
        name: "Imp mayor", hp: 6, def: 2, atk: 4, type: "Esbirro", subtype: "Ser mágico", tags: ["Monstruo"], rarity: "B", cost: 1, series: 2,
        text: "P: DEMONIO VIL: Sólo puedes colocar esta carta si un aliado tributa 2 de Furor. Cada vez que sea atacado, el atacante pierde 1 de Furor.",
        passiveName: "DEMONIO VIL",
        onBeforePlayAsync: async function(card, game, p) {
            const valid = [...p.vanguard, ...p.rearguard].filter(c => c.furor >= 2 && !getCardTemplate(c.id).isAvatar);
            if (valid.length === 0) {
                game.logError(`Necesitas un aliado con al menos 2 de Furor para invocar al ${card.name}.`);
                return false;
            }
            const chosen = await game.openVisualSearchModal(`${card.name}: ELIGE TRIBUTO (-2 FUROR)`, valid, 1, true, card.owner);
            if (chosen && chosen.length > 0) {
                game.modifyStat(chosen[0], 'furor', -2);
                return true;
            }
            return false;
        },
        onBeforeDefend: async function(defender, attacker, game, abilityName) {
            if (attacker.furor > 0) {
                game.logMsg(`¡${defender.passiveName}! El aura del Imp drena 1 de Furor de ${attacker.name}.`, 'ability');
                game.modifyStat(attacker, 'furor', -1);
                showFloatingText(attacker.instanceId, "-1 FUR", "ft-red-stat", -20);
            }
            return false; // No esquiva, se come el ataque
        }
    },
    {
        name: "Gul guerrero", hp: 3, def: 2, atk: 5, type: "Esbirro", subtype: "No-muerto", tags: ["Monstruo", "Ninja"], rarity: "B", cost: 1, series: 2,
        text: "P: DEMONIO BELICOSO: Sólo colocable si un aliado tributa 2 de Furor. Al atacar con éxito, el enemigo pierde 1 de Furor. A: SANGRE MALDITA (1F): Ataque normal. Aplica Daño por tiempo al enemigo (3 turnos).",
        passiveName: "DEMONIO BELICOSO", activeName: "SANGRE MALDITA", activeCost: 1,
        onBeforePlayAsync: async function(card, game, p) {
            const valid = [...p.vanguard, ...p.rearguard].filter(c => c.furor >= 2 && !getCardTemplate(c.id).isAvatar);
            if (valid.length === 0) { game.logError(`Necesitas un aliado con 2 Furor para el tributo.`); return false; }
            const chosen = await game.openVisualSearchModal(`${card.name}: ELIGE TRIBUTO (-2 FUROR)`, valid, 1, true, card.owner);
            if (chosen && chosen.length > 0) { game.modifyStat(chosen[0], 'furor', -2); return true; }
            return false;
        },
        onBeforeAttack: async function(attacker, defender, game) {
            attacker._enemyHpBefore = defender.currentHp;
            return true;
        },
        onAfterAttack: async function(attacker, defender, game) {
            if (attacker._enemyHpBefore !== undefined) {
                const dmgDealt = attacker._enemyHpBefore - defender.currentHp;
                if (dmgDealt > 0 && defender.furor > 0) {
                    game.logMsg(`¡${attacker.passiveName}! El Gul desgarra la energía de ${defender.name}.`, 'ability');
                    game.modifyStat(defender, 'furor', -1);
                    showFloatingText(defender.instanceId, "-1 FUR", "ft-red-stat", -20);
                }
                delete attacker._enemyHpBefore;
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
            game.abilityContext = { targets: [], maxTargets: 1, name: 'SANGRE MALDITA', targetType: 'enemy', isNormalAttack: true };
            game.render();
        },
        onValidateTarget: function(card, target, game, isSilent) {
            if (target.owner === card.owner || target.location !== 'vanguard' || getCardTemplate(target.id).isAvatar) return false;
            return true;
        },
        onTargetsReady: async function(card, game) {
            const target = game.abilityContext.targets[0];
            game.modifyStat(card, 'furor', -1);
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);
            
            const startHp = target.currentHp;
            await game.performAttack(card, target);
            
            if (target.currentHp < startHp && target.currentHp > 0) {
                game.logMsg(`La sangre maldita infecta a ${target.name}.`, 'ability');
                game.applyStatus(target, 'dot', 3, card.name);
            }
        }
    },
    {
        name: "Oni ancho", hp: 4, def: 4, atk: 6, type: "Esbirro", subtype: "Ser mágico", tags: ["Monstruo"], rarity: "B", cost: 1, series: 2,
        text: "P: YŌKAI VIOLENTO: Sólo colocable si un aliado tributa 2 de Furor. Al realizar un ataque normal, echa una moneda. Cara: +1 Atq. Cruz: -1 Atq durante ese ataque.",
        passiveName: "YŌKAI VIOLENTO",
        onBeforePlayAsync: async function(card, game, p) {
            const valid = [...p.vanguard, ...p.rearguard].filter(c => c.furor >= 2 && !getCardTemplate(c.id).isAvatar);
            if (valid.length === 0) return false;
            const chosen = await game.openVisualSearchModal(`${card.name}: ELIGE TRIBUTO (-2 FUROR)`, valid, 1, true, card.owner);
            if (chosen && chosen.length > 0) { game.modifyStat(chosen[0], 'furor', -2); return true; }
            return false;
        },
        onBeforeAttack: async function(attacker, defender, game) {
            const isNormal = !game.abilityContext || game.abilityContext.isNormalAttack;
            if (isNormal) {
                game.logMsg(`¡${attacker.passiveName}! La brutalidad del Oni lo vuelve impredecible...`, 'ability');
                const results = await game.triggerCoinFlips(1, attacker.owner);
                if (results) {
                    if (results[0] === 'heads') {
                        game.logMsg("Moneda: CARA - ¡Golpe brutal! (+1 ATQ)", 'combat');
                        showFloatingText(attacker.instanceId, "+1 ATQ", "ft-green", -20);
                        attacker.currentAtk += 1;
                        attacker.oniModifier = 1;
                    } else {
                        game.logMsg("Moneda: CRUZ - El Oni tropieza ligeramente. (-1 ATQ)", 'neutral');
                        showFloatingText(attacker.instanceId, "-1 ATQ", "ft-red-stat", -20);
                        attacker.currentAtk -= 1;
                        attacker.oniModifier = -1;
                    }
                }
            }
            return true;
        },
        onAfterAttack: async function(attacker, defender, game) {
            if (attacker.oniModifier !== undefined) {
                attacker.currentAtk -= attacker.oniModifier;
                delete attacker.oniModifier;
            }
        }
    },
    {
        name: "Tengu orgulloso", hp: 5, def: 2, atk: 5, type: "Esbirro", subtype: "Ser mágico", tags: ["Monstruo"], rarity: "B", cost: 1, series: 2,
        text: "P: YŌKAI SOBERBIO: Sólo colocable si un aliado tributa 2 de Furor. A: DOMINANCIA ILUSORIA (1F): Echa 2 monedas. Por cada cara, realiza 2 ataques normales a un enemigo (pudiendo elegir objetivos distintos para cada ráfaga).",
        passiveName: "YŌKAI SOBERBIO", activeName: "DOMINANCIA ILUSORIA", activeCost: 1,
        onBeforePlayAsync: async function(card, game, p) {
            const valid = [...p.vanguard, ...p.rearguard].filter(c => c.furor >= 2 && !getCardTemplate(c.id).isAvatar);
            if (valid.length === 0) return false;
            const chosen = await game.openVisualSearchModal(`${card.name}: ELIGE TRIBUTO (-2 FUROR)`, valid, 1, true, card.owner);
            if (chosen && chosen.length > 0) { game.modifyStat(chosen[0], 'furor', -2); return true; }
            return false;
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
            
            game.logMsg(`¡${card.name} invoca ilusiones y lanza 2 monedas!`, 'ability');
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
            
            game.logMsg(`${heads} CARAS. ${card.name} realizará ${heads} ráfagas de 2 ataques.`, 'ability');
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
                    game.logMsg(`¡Tengu dirige una ráfaga de 2 ataques hacia ${realTarget.name}!`, 'ability');
                    
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
        name: "Súcubo", hp: 2, def: 3, atk: 4, type: "Esbirro", subtype: "Ser mágico", tags: ["Monstruo"], rarity: "B", cost: 1, series: 2,
        text: "P: DEMONIO VOLUPTUOSO: Sólo colocable si un aliado tributa 2 de Furor. A: SEDUCCIÓN (1F): Permanece Oculta permanentemente mientras siga en el campo.",
        passiveName: "DEMONIO VOLUPTUOSO", activeName: "SEDUCCIÓN", activeCost: 1,
        onBeforePlayAsync: async function(card, game, p) {
            const valid = [...p.vanguard, ...p.rearguard].filter(c => c.furor >= 2 && !getCardTemplate(c.id).isAvatar);
            if (valid.length === 0) return false;
            const chosen = await game.openVisualSearchModal(`${card.name}: ELIGE TRIBUTO (-2 FUROR)`, valid, 1, true, card.owner);
            if (chosen && chosen.length > 0) { game.modifyStat(chosen[0], 'furor', -2); return true; }
            return false;
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
        onUpdatePassive: function(card, game) {
            if (card.permanentStealth) card.stealth = true;
        }
    },
    {
        name: "Fanático", hp: 3, def: 3, atk: 3, type: "Esbirro", subtype: "Ser vivo", tags: ["Usuario de magia"], rarity: "B", cost: 1, series: 2,
        text: "P: ADORACIÓN PERVERSA: Aumenta todas sus estadísticas (+1 Vida, +1 Def, +1 Atq) por cada aliado 'Ser mágico' con etiqueta 'Monstruo' (máximo de +3).",
        passiveName: "ADORACIÓN PERVERSA",
        onUpdatePassive: function(card, game) {
            const p = game.players[card.owner];
            const validMonsters = [...p.vanguard, ...p.rearguard].filter(c => c.instanceId !== card.instanceId && c.subtype === 'Ser mágico' && c.tags && c.tags.includes('Monstruo'));
            
            const newBoost = Math.min(3, validMonsters.length);
            
            if (card.fanaticoBoost === undefined) card.fanaticoBoost = 0;
            const diff = newBoost - card.fanaticoBoost;
            
            if (diff !== 0) {
                card.maxHp += diff;
                card.currentHp += diff;
                // Prevención: Si el ajuste de salud máxima lo dejaría en 0 o menos, sobrevive a 1 HP.
                if (card.currentHp < 1 && diff < 0 && card.maxHp >= 1) card.currentHp = 1;
                
                card.fanaticoBoost = newBoost;
                const sign = diff > 0 ? '+' : '';
                showFloatingText(card.instanceId, `${sign}${diff} A TODO`, diff > 0 ? "ft-green" : "ft-red-stat", -30);
                game.logMsg(`¡${card.passiveName}! Fanático siente el poder de los monstruos (${sign}${diff} a todo).`, 'ability');
            }
            
            card.currentAtk += card.fanaticoBoost;
            card.currentDef += card.fanaticoBoost;
        },
        onGetPreviewEffects: function(card, game) {
            if (card.fanaticoBoost > 0) return [`+${card.fanaticoBoost} ATQ/DEF/VIDA MÁX. (fuente: Adoración perversa)`];
            return [];
        }
    },
    {
        name: "Raiju", hp: 2, def: 4, atk: 5, type: "Esbirro", subtype: "Ser mágico", tags: ["Invocación", "Monstruo"], rarity: "B", cost: 1, series: 2,
        text: "P: ENTIDAD ELÉCTRICA: Sólo colocable si un aliado tributa 1 de Furor. A: FOSFORESCENCIA (1F): Realiza 2 ataques especiales a enemigos distintos y les ciega (2 turnos).",
        passiveName: "ENTIDAD ELÉCTRICA", activeName: "FOSFORESCENCIA", activeCost: 1,
        onBeforePlayAsync: async function(card, game, p) {
            const valid = [...p.vanguard, ...p.rearguard].filter(c => c.furor >= 1 && !getCardTemplate(c.id).isAvatar);
            if (valid.length === 0) return false;
            const chosen = await game.openVisualSearchModal(`${card.name}: ELIGE TRIBUTO (-1 FUROR)`, valid, 1, true, card.owner);
            if (chosen && chosen.length > 0) { game.modifyStat(chosen[0], 'furor', -1); return true; }
            return false;
        },
        canActivateAbility: function(card, game) {
            if (card.furor < 1) { game.logError("Falta Furor (1)."); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            const valid = game.players[enemyId].vanguard.filter(c => !getCardTemplate(c.id).isAvatar);
            if (valid.length < 2) { game.logError("Necesitas al menos 2 enemigos en vanguardia para golpear a objetivos distintos."); return false; }
            return true;
        },
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 2, name: 'FOSFORESCENCIA', targetType: 'enemy' };
            game.logError("Elige al primer objetivo del impacto eléctrico.");
            game.render();
        },
        onValidateTarget: function(card, target, game, isSilent) {
            if (target.owner === card.owner || target.location !== 'vanguard' || getCardTemplate(target.id).isAvatar) return false;
            if (game.abilityContext.targets.some(t => t.instanceId === target.instanceId)) {
                if (!isSilent) game.logError("Deben ser enemigos distintos.");
                return false;
            }
            return true;
        },
        onTargetsReady: async function(card, game) {
            const targets = game.abilityContext.targets;
            game.modifyStat(card, 'furor', -1);
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);
            game.inputState = 'EXECUTING';
            game.render();
            await game.sleep(500);
            
            game.logMsg(`¡Raiju desata una tormenta eléctrica cegadora!`, 'ability');
            
            for (let target of targets) {
                if (card.currentHp <= 0) break;
                if (target.currentHp > 0) {
                    let dmg = card.currentAtk - target.currentDef;
                    if (dmg <= 0) dmg = (card.type === 'Esbirro' && target.type === 'Personaje') ? 0.5 : 1;
                    
                    await game.dealDamage(card, target, dmg, true); // true = Ataque especial (Fosforescencia)
                    
                    if (target.currentHp > 0) {
                        game.applyStatus(target, 'ceguera', 2, card.name);
                        game.logMsg(`El fogonazo ciega a ${target.name}.`, 'ability');
                    }
                    await game.sleep(400);
                    await game.checkDeath(target);
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
        name: "Muñeca del mal", hp: 2, def: 2, atk: 4, type: "Esbirro", subtype: "No-muerto", tags: ["Monstruo", "Creación artificial"], rarity: "B", cost: 1, series: 2,
        text: "P: IMPRECACIÓN: Cuando su Vida llegue a 0 debido a un ataque, echa una moneda. Si sale cara, destruye la carta que realizó ese ataque.",
        passiveName: "IMPRECACIÓN",
        onAfterDefend: async function(defender, attacker, dmg, isSpecial, game) {
            if (defender.currentHp <= 0 && attacker && attacker.currentHp > 0) {
                game.logMsg(`¡${defender.passiveName}! La muñeca lanza una maldición final antes de expirar...`, 'ability');
                
                game.isActionLocked = true;
                const results = await game.triggerCoinFlips(1, defender.owner);
                
                if (results && results[0] === 'heads') {
                    game.logMsg(`Moneda: CARA - ¡La maldición atrapa a ${attacker.name} y lo destruye!`, 'combat');
                    showFloatingText(attacker.instanceId, "MALDITO", "ft-purple", -30);
                    attacker.currentHp = 0;
                    await game.checkDeath(attacker, true); 
                } else {
                    game.logMsg(`Moneda: CRUZ - La maldición se disipa en el aire.`, 'neutral');
                }
                game.isActionLocked = false;
            }
        }
    },
    {
        name: "Experimento fallido", hp: 4, def: 3, atk: 5, type: "Esbirro", subtype: "No-muerto", tags: ["Monstruo", "Creación artificial"], rarity: "B", cost: 1, series: 2,
        text: "P: ABOMINACIÓN AFABLE: Debes tributar 1 de Furor de un aliado para poder colocar esta carta.",
        passiveName: "ABOMINACIÓN AFABLE",
        onBeforePlayAsync: async function(card, game, p) {
            const valid = [...p.vanguard, ...p.rearguard].filter(c => c.furor >= 1 && !getCardTemplate(c.id).isAvatar);
            if (valid.length === 0) { game.logError("Necesitas un aliado con al menos 1 de Furor para el tributo."); return false; }
            const chosen = await game.openVisualSearchModal(`${card.name}: ELIGE TRIBUTO (-1 FUROR)`, valid, 1, true, card.owner);
            if (chosen && chosen.length > 0) { game.modifyStat(chosen[0], 'furor', -1); return true; }
            return false;
        }
    },
    {
        name: "Hiposaurio", hp: 6, def: 4, atk: 2, type: "Esbirro", subtype: "Ser vivo", tags: ["Bestia salvaje"], rarity: "B", cost: 1, series: 2,
        text: "P: ECOSISTEMA VIVIENTE: Al sufrir Daño por tiempo, pierde 3 de Vida en vez de 1. A: CABREO (3F): Realiza un ataque normal subiendo en 2 puntos su Atq durante dicho ataque.",
        passiveName: "ECOSISTEMA VIVIENTE", activeName: "CABREO", activeCost: 3,
        onDoTTick: function(card, game) {
            // El motor base quita 1 HP. Quitamos 2 más para llegar a 3.
            game.logMsg(`¡${card.passiveName}! El veneno afecta drásticamente al Hiposaurio.`, 'ability');
            showFloatingText(card.instanceId, "-2 VIDA EXTRA", "ft-purple", -30);
            game.modifyStat(card, 'currentHp', -2);
        },
        canActivateAbility: function(card, game) {
            if (card.furor < 3) { game.logError("Falta Furor (3)."); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            if (game.players[enemyId].vanguard.length === 0) return false;
            return true;
        },
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 1, name: 'CABREO', targetType: 'enemy', isNormalAttack: true };
            game.render();
        },
        onTargetsReady: async function(card, game) {
            const target = game.abilityContext.targets[0];
            game.modifyStat(card, 'furor', -3);
            showFloatingText(card.instanceId, "CABREO", "ft-ability", -30);
            showFloatingText(card.instanceId, "+2 ATQ", "ft-green", -10);
            
            card.currentAtk += 2;
            await game.performAttack(card, target);
            card.currentAtk -= 2;
        }
    },
    {
        name: "Lolita", hp: 2, def: 2, atk: 2, type: "Esbirro", subtype: "Ser vivo", tags: ["Otaku"], rarity: "A", cost: 1, series: 2,
        isToken: true, // Esto le quita la retribución al morir automáticamente en checkDeath
        text: "P: PRESTIGIO: Esta carta no te otorga retribución cuando su Vida llega a 0. A: NOCIONES DE OCULTISMO (1F): Realiza un ataque especial subiendo el Atq de esta carta en 2 durante dicho ataque.",
        passiveName: "PRESTIGIO", activeName: "NOCIONES DE OCULTISMO", activeCost: 1,
        canActivateAbility: function(card, game) {
            if (card.furor < 1) { game.logError("Falta Furor (1)."); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            if (game.players[enemyId].vanguard.length === 0) return false;
            return true;
        },
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 1, name: 'NOCIONES DE OCULTISMO', targetType: 'enemy' };
            game.render();
        },
        onTargetsReady: async function(card, game) {
            const target = game.abilityContext.targets[0];
            game.modifyStat(card, 'furor', -1);
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);
            showFloatingText(card.instanceId, "+2 ATQ", "ft-green", -10);
            
            card.currentAtk += 2;
            let dmg = card.currentAtk - target.currentDef;
            if (dmg <= 0) dmg = (card.type === 'Esbirro' && target.type === 'Personaje') ? 0.5 : 1;
            
            await game.dealDamage(card, target, dmg, true); // Especial
            await game.checkDeath(target);
            card.currentAtk -= 2;
            
            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.updatePassives();
            game.render();
        }
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
                game.logMsg(`¡Uniojo aprovecha el vacío de ${deadCard.name} y entra al campo!`, 'ability');
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
        text: "P: AUMENTO: Puedes sustituir cualquier 'Limo artificial' en tu campo por esta carta. Las bonificaciones se transfieren. A: ABRAZO VISCOSO (2F): Ataque normal. Si tiene éxito, confunde 2 turnos.",
        passiveName: "AUMENTO", activeName: "ABRAZO VISCOSO", activeCost: 2,
        canPlayCard: function() { return true; }, 
        onBeforePlayAsync: async function(card, game, p) {
            const limos = [...p.vanguard, ...p.rearguard].filter(c => c.name === 'Limo artificial');
            if (limos.length > 0) {
                const choice = await new Promise(resolve => {
                    game.openChoiceModal(`¿CÓMO COLOCAR A LIMO CRECIDO?`, [
                        { label: 'EVOLUCIONAR LIMO ARTIFICIAL', action: () => resolve(true) },
                        { label: 'COLOCAR COMO ESBIRRO NUEVO', action: () => resolve(false) }
                    ], card.owner);
                });
                if (choice) {
                    const chosen = await game.openVisualSearchModal('ELIGE LIMO PARA EVOLUCIONAR', limos, 1, false, card.owner);
                    if (chosen && chosen.length > 0) {
                        const oldLimo = chosen[0];
                        card.location = oldLimo.location;
                        
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
                        try { await animateEvolution(card.instanceId); } catch(e){}
                        return false; 
                    }
                }
            }
            return true; 
        },
        canActivateAbility: function(card, game) {
            if (card.furor < 2) { game.logError("Falta Furor (2)."); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            if (game.players[enemyId].vanguard.length === 0) return false;
            return true;
        },
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 1, name: 'ABRAZO VISCOSO', targetType: 'enemy', isNormalAttack: true };
            game.render();
        },
        onTargetsReady: async function(card, game) {
            const target = game.abilityContext.targets[0];
            game.modifyStat(card, 'furor', -2);
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);
            
            const startHp = target.currentHp;
            await game.performAttack(card, target);
            
            if (target.currentHp < startHp && target.currentHp > 0) {
                game.logMsg(`¡El líquido envuelve a ${target.name}!`, 'ability');
                game.applyStatus(target, 'confusion', 2, card.name);
            }
        }
    },
    {
        name: "Matón", hp: 3, def: 3, atk: 4, type: "Esbirro", subtype: "Ser vivo", tags: ["Maleante"], rarity: "C", cost: 1, series: 2,
        text: "P: PANDILLA: Puedes colocar en tu campo durante el mismo turno hasta tres copias de esta carta, si las tienes en la mano.",
        passiveName: "PANDILLA",
        onAfterPlayAsync: async function(card, game, p) {
            if (!p.matonesPlayedThisTurn) p.matonesPlayedThisTurn = 0;
            p.matonesPlayedThisTurn++;
            
            if (p.matonesPlayedThisTurn < 3) {
                const moreMatones = p.hand.some(c => c.name === 'Matón');
                if (moreMatones) {
                    game.placedUnitThisTurn = false; // El motor levanta el candado de "unidad colocada por turno"
                    game.logMsg(`¡PANDILLA! Aún puedes colocar más Matones este turno.`, 'ability');
                }
            }
        },
        onStartTurn: function(card, game) {
            if (card.owner === game.activePlayerId) {
                game.players[card.owner].matonesPlayedThisTurn = 0;
            }
        }
    },
    {
        name: "Droide antidisturbios", hp: 2, def: 4, atk: 5, type: "Esbirro", subtype: "Máquina", tags: ["Controlable"], rarity: "C", cost: 1, series: 2,
        text: "-"
    },
    {
        name: "Hechicero", hp: 3, def: 3, atk: 4, type: "Esbirro", subtype: "Ser vivo", tags: ["Usuario de magia"], rarity: "B", cost: 1, series: 2,
        text: "A: CHIRIBITA (1F): Realiza un ataque especial, aumentando en 1 el Atq de esta carta durante dicho ataque.",
        activeName: "CHIRIBITA", activeCost: 1,
        canActivateAbility: function(card, game) {
            if (card.furor < 1) { game.logError("Falta Furor (1)."); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            if (game.players[enemyId].vanguard.length === 0) return false;
            return true;
        },
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 1, name: 'CHIRIBITA', targetType: 'enemy' };
            game.render();
        },
        onTargetsReady: async function(card, game) {
            const target = game.abilityContext.targets[0];
            game.modifyStat(card, 'furor', -1);
            showFloatingText(card.instanceId, "CHIRIBITA", "ft-ability", -30);
            showFloatingText(card.instanceId, "+1 ATQ", "ft-green", -10);
            
            card.currentAtk += 1;
            let dmg = card.currentAtk - target.currentDef;
            if (dmg <= 0) dmg = (card.type === 'Esbirro' && target.type === 'Personaje') ? 0.5 : 1;
            
            await game.dealDamage(card, target, dmg, true); 
            await game.checkDeath(target);
            card.currentAtk -= 1;
            
            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.updatePassives();
            game.render();
        }
    },
    {
        name: "Megalimo", hp: 6, def: 3, atk: 2, type: "Esbirro", subtype: "Ser vivo", tags: ["Creación artificial"], rarity: "S", cost: 1, series: 2,
        isEvolution: true,
        text: "P: EVOLUCIÓN: Sólo colocable sustituyendo un 'Limo crecido'. Hereda stats. Botón Extra: Puedes consumir la cantidad de Furor que quieras para curar esa misma cantidad de Vida. A: ABRAZO PERTURBADOR (3F): Ataque normal con +4 Atq. Si tiene éxito, confunde 2 turnos.",
        passiveName: "EVOLUCIÓN", activeName: "ABRAZO PERTURBADOR", activeCost: 3,
        onBeforePlayAsync: async function(card, game, p) {
            const limos = [...p.vanguard, ...p.rearguard].filter(c => c.name === 'Limo crecido');
            if (limos.length === 0) {
                game.logError("Necesitas un Limo crecido para evolucionarlo a Megalimo.");
                return false;
            }
            // Cambiado el 4º parámetro a 'true' para que se pueda cancelar la selección
            const chosen = await game.openVisualSearchModal('ELIGE LIMO CRECIDO', limos, 1, true, card.owner);
            if (chosen && chosen.length > 0) {
                const oldLimo = chosen[0];
                card.location = oldLimo.location;
                
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
                try { await animateEvolution(card.instanceId); } catch(e){}
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
        canActivateAbility: function(card, game) {
            if (card.furor < 3) { game.logError("Falta Furor (3)."); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            
            // Filtro Anti-Sigilo añadido
            const validEnemies = game.players[enemyId].vanguard.filter(c => !c.stealth);
            if (validEnemies.length === 0) {
                game.logError("No hay enemigos válidos (sin Ocultarse) en la vanguardia."); 
                return false;
            }
            return true;
        },
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 1, name: 'ABRAZO PERTURBADOR', targetType: 'enemy', isNormalAttack: true };
            game.render();
        },
        onTargetsReady: async function(card, game) {
            const target = game.abilityContext.targets[0];
            game.modifyStat(card, 'furor', -3);
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);
            showFloatingText(card.instanceId, "+4 ATQ", "ft-green", -10);
            
            const startHp = target.currentHp;
            card.currentAtk += 4;
            await game.performAttack(card, target);
            card.currentAtk -= 4;
            
            if (target.currentHp < startHp && target.currentHp > 0) {
                game.logMsg(`¡La inmensa viscosidad satura los sentidos de ${target.name}!`, 'ability');
                game.applyStatus(target, 'confusion', 2, card.name);
            }
        }
    },
    {
        name: "Gárgola", hp: 6, def: 4, atk: 4, type: "Esbirro", subtype: "Ser mágico", tags: ["Monstruo"], rarity: "A", cost: 1, series: 2,
        text: "P: PRUEBA DE CARÁCTER: Al colocar esta carta, echa dos monedas. 1ª Cara: elige enemigo y quítale 2 Furor. 2ª Cruz: tributa 2 Furor de un aliado o Gárgola se destruye.",
        passiveName: "PRUEBA DE CARÁCTER",
        onAfterPlayAsync: async function(card, game, p) {
            game.logMsg(`¡${card.passiveName}! Gárgola te juzga y lanza dos monedas.`, 'ability');
            game.isActionLocked = true;
            
            let results = await game.triggerCoinFlips(1, card.owner);
            if (results && results[0] === 'heads') {
                game.logMsg(`Moneda 1: CARA - ¡Drenaje de Furor enemigo!`, 'ability');
                const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
                const validEnemies = [...game.players[enemyId].vanguard, ...game.players[enemyId].rearguard].filter(c => !getCardTemplate(c.id).isAvatar);
                
                if (validEnemies.length > 0) {
                    const chosen = await game.openVisualSearchModal(`GÁRGOLA: ELIGE ENEMIGO PARA QUITARLE 2 FUROR`, validEnemies, 1, true, card.owner);
                    if (chosen && chosen.length > 0) {
                        game.modifyStat(chosen[0], 'furor', -2);
                        showFloatingText(chosen[0].instanceId, "-2 FUR", "ft-red-stat", -20);
                    }
                } else {
                    game.logMsg(`No hay enemigos para drenar.`, 'system');
                }
            } else {
                game.logMsg(`Moneda 1: CRUZ - Sin efecto.`, 'neutral');
            }
            
            results = await game.triggerCoinFlips(1, card.owner);
            if (results && results[0] === 'tails') {
                game.logMsg(`Moneda 2: CRUZ - ¡Gárgola exige un tributo de 2 Furor!`, 'ability');
                const validAllies = [...p.vanguard, ...p.rearguard].filter(c => c.furor >= 2 && c.instanceId !== card.instanceId && !getCardTemplate(c.id).isAvatar);
                
                if (validAllies.length > 0) {
                    const chosen = await game.openVisualSearchModal(`GÁRGOLA: ELIGE TRIBUTO O SE DESTRUYE (-2 FUROR)`, validAllies, 1, true, card.owner);
                    if (chosen && chosen.length > 0) {
                        game.modifyStat(chosen[0], 'furor', -2);
                    } else {
                        game.logMsg(`¡Nadie pagó el tributo! Gárgola se hace pedazos.`, 'combat');
                        card.currentHp = 0;
                        await game.checkDeath(card, false);
                    }
                } else {
                    game.logMsg(`¡No hay aliados con suficiente Furor! Gárgola se hace pedazos.`, 'combat');
                    card.currentHp = 0;
                    await game.checkDeath(card, false);
                }
            } else {
                game.logMsg(`Moneda 2: CARA - Gárgola está satisfecha.`, 'neutral');
            }
            
            game.isActionLocked = false;
            game.render();
        }
    },
    {
        name: "Ángel", hp: 4, def: 4, atk: 4, type: "Esbirro", subtype: "Ser mágico", tags: ["Monstruo"], rarity: "A", cost: 1, series: 2,
        text: "P: PRODIGIO: Sólo colocable si un aliado tributa 2 Furor. Al colocarla, cura 1 de Vida a tu vanguardia. A: SANCIÓN (2F): Ataque especial a dos enemigos de la vanguardia rival.",
        passiveName: "PRODIGIO", activeName: "SANCIÓN", activeCost: 2,
        onBeforePlayAsync: async function(card, game, p) {
            const valid = [...p.vanguard, ...p.rearguard].filter(c => c.furor >= 2 && !getCardTemplate(c.id).isAvatar);
            if (valid.length === 0) { game.logError("Necesitas un aliado con 2 Furor para el tributo."); return false; }
            const chosen = await game.openVisualSearchModal(`TRIBUTO PARA ÁNGEL (-2 FUROR)`, valid, 1, true, card.owner);
            if (chosen && chosen.length > 0) { game.modifyStat(chosen[0], 'furor', -2); return true; }
            return false;
        },
        onAfterPlayAsync: async function(card, game, p) {
            let healed = false;
            p.vanguard.forEach(c => {
                if (c.currentHp < c.maxHp) {
                    game.modifyStat(c, 'currentHp', 1, -20, 'healing');
                    showFloatingText(c.instanceId, "+1 VIDA", "ft-green", -40);
                    healed = true;
                }
            });
            if (healed) game.logMsg(`¡La luz del Ángel sana a la vanguardia!`, 'healing');
        },
        canActivateAbility: function(card, game) {
            if (card.furor < 2) { game.logError("Falta Furor (2)."); return false; }
            const enemyId = card.owner === 'p1' ? 'p2' : 'p1';
            if (game.players[enemyId].vanguard.length === 0) return false;
            return true;
        },
        onExecuteAbility: function(card, game) {
            game.selectedCard = card;
            game.inputState = 'SELECT_ABILITY_TARGETS';
            game.abilityContext = { targets: [], maxTargets: 2, name: 'SANCIÓN', targetType: 'enemy', canStopEarly: true };
            game.render();
        },
        onValidateTarget: function(card, target, game, isSilent) {
            const ctx = game.abilityContext;
            if (target.owner === card.owner || target.location !== 'vanguard' || getCardTemplate(target.id).isAvatar) return false;
            if (ctx.targets.some(t => t.instanceId === target.instanceId)) return false;
            return true;
        },
        onTargetsReady: async function(card, game) {
            const targets = game.abilityContext.targets;
            if (targets.length === 0) { game.cancelAction(); return; }
            
            game.modifyStat(card, 'furor', -2);
            showFloatingText(card.instanceId, card.activeName, "ft-ability", -30);
            game.inputState = 'EXECUTING';
            game.render();
            await game.sleep(500);
            
            for (let t of targets) {
                if (card.currentHp <= 0 || (card.location !== 'vanguard' && card.location !== 'rearguard')) break;
                const realTarget = game.findCard(t.instanceId);
                
                if (realTarget && realTarget.location === 'vanguard' && realTarget.currentHp > 0) {
                    let dmg = card.currentAtk - realTarget.currentDef;
                    if (dmg <= 0) dmg = (card.type === 'Esbirro' && realTarget.type === 'Personaje') ? 0.5 : 1;
                    
                    await game.dealDamage(card, realTarget, dmg, true); 
                    await game.checkDeath(realTarget);
                }
            }
            
            card.exhausted = true;
            game.isActionLocked = false;
            game.cancelAction();
            game.render();
        }
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
        text: "Al jugarse: inflige 2 de daño a cada enemigo de vanguardia.",
        abilities: [
            { trigger: "AL_JUGAR", log: "¡Meteorito! Llueve fuego sobre la vanguardia enemiga.",
              efectos: [ { op: "DAÑO", valor: 2, target: { quien: "ENEMIGO", zona: "vanguardia" } } ] }
        ]
    },
    {
        id: 993, name: "Biblioteca de prueba", type: "Evento", rarity: "C", cost: 0, duration: 2, series: 1,
        text: "Al caducar: robas 2 cartas.",
        abilities: [
            { trigger: "AL_CADUCAR", log: "La biblioteca cierra: te llevas lo aprendido.",
              efectos: [ { op: "ROBAR", cantidad: 2 } ] }
        ]
    },
    {
        id: 994, name: "Maldición de prueba", type: "Evento", rarity: "C", cost: 0, duration: 2, series: 1,
        text: "Al jugarse: aplica Daño por tiempo (2T) y un contador de Maldición a cada enemigo de vanguardia.",
        abilities: [
            { trigger: "AL_JUGAR", log: "¡Una maldición doble cae sobre la vanguardia enemiga!",
              efectos: [
                { op: "APLICAR_ESTADO", estado: "dot", duracion: 2, target: { quien: "ENEMIGO", zona: "vanguardia" } },
                { op: "MODIFICAR_CONTADORES", contador: "maldicion", delta: 1, nombreContador: "Maldición", icono: "💀", target: { quien: "ENEMIGO", zona: "vanguardia" } }
              ] }
        ]
    },
];

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
    TRIGGERS: ['PASIVA_CONTINUA', 'JUGAR', 'AL_JUGAR', 'AL_USAR_AYUDA', 'AL_CADUCAR', 'ACTIVA', 'GLOBAL_TRAS_ATAQUE', 'GLOBAL_MODIFICAR_FUROR', 'GLOBAL_INICIO_TURNO', 'GLOBAL_ANTES_DE_ATAQUE'],
    OPS_EFECTO: ['MODIFICAR_STAT', 'CURAR', 'DAÑO', 'APLICAR_ESTADO', 'MODIFICAR_CONTADORES', 'ATACAR', 'MONEDA', 'ROBAR'],
    OPS_CMP: ['==', '!=', '<=', '>=', '<', '>', 'includes', 'truthy', 'falsy'],
    QUIEN: ['SELF', 'ALIADO', 'ENEMIGO', 'TODOS', 'ATACANTE', 'DEFENSOR'], // los dos últimos solo tienen sentido en GLOBAL_TRAS_ATAQUE

    _tmpl(id) { return (typeof getCardTemplate === 'function') ? getCardTemplate(id) : CARD_DB.find(c => c.id === id); },
    _field(c, campo) {
        const k = String(campo).replace(/^self\./, '');
        if (k === 'hp') return c.currentHp;
        if (k === 'atk') return c.currentAtk;
        if (k === 'def') return c.currentDef;
        if (k === 'furorMax') return KARLOS_RULES.getFurorMax(c); // campo computado (capa de reglas)
        return c[k];
    },
    _ref(path, ctx) { // "objetivo.furorMax" | "self.atk"
        const [who, campo] = String(path).split('.');
        const c = who === 'objetivo' ? ctx.objetivo : ctx.self;
        return c ? DSL._field(c, campo) : undefined;
    },
    _cmp(a, op, b) {
        switch (op) {
            case '==': return a === b;   case '!=': return a !== b;
            case '<=': return a <= b;    case '>=': return a >= b;
            case '<': return a < b;      case '>': return a > b;
            case 'includes': return Array.isArray(a) && a.includes(b);
            case 'truthy': return !!a;   case 'falsy': return !a;
            default: return false;
        }
    },
    _match(c, f) { return DSL._cmp(DSL._field(c, f.campo), f.op, f.valor); },
    _zone(game, pid, zona) {
        const p = game.players[pid];
        if (zona === 'vanguardia') return [...p.vanguard];
        if (zona === 'retaguardia') return [...p.rearguard];
        return [...p.vanguard, ...p.rearguard];
    },
    _pool(ownerId, game, spec, selfCard) {
        if (spec.quien === 'SELF') return selfCard ? [selfCard] : [];
        const en = ownerId === 'p1' ? 'p2' : 'p1';
        let pool = spec.quien === 'ENEMIGO' ? DSL._zone(game, en, spec.zona)
                 : spec.quien === 'TODOS' ? [...DSL._zone(game, 'p1', spec.zona), ...DSL._zone(game, 'p2', spec.zona)]
                 : DSL._zone(game, ownerId, spec.zona);
        if (spec.excludeSelf && selfCard) pool = pool.filter(c => c.instanceId !== selfCard.instanceId);
        (spec.filtros || []).forEach(f => { pool = pool.filter(c => DSL._match(c, f)); });
        return pool;
    },
    _count(ownerId, game, spec, selfCard) {
        let n = DSL._pool(ownerId, game, spec, selfCard).length;
        if (typeof spec.max === 'number') n = Math.min(n, spec.max);
        return n;
    },
    _value(ownerId, game, v, selfCard, ctx) {
        if (typeof v === 'number') return v;
        if (v && v.COUNT) return DSL._count(ownerId, game, v.COUNT, selfCard);
        if (v && v.REF) return DSL._ref(v.REF, ctx || { self: selfCard });
        return 0;
    },
    _cond(card, game, c) {
        if (!c) return true;
        return DSL._cmp(DSL._field(card, c.campo), c.op, DSL._value(card.owner, game, c.valor, card, { self: card }));
    },
    _fill(txt, ctx) {
        return String(txt)
            .replace('{carta}', ctx.carta || '')
            .replace('{objetivo}', ctx.objetivo || '')
            .replace('{antes}', ctx.antes !== undefined ? ctx.antes : '')
            .replace('{despues}', ctx.despues !== undefined ? ctx.despues : '');
    },
    _nombre(game, c) { return (game && typeof game.getCardNameWithOwner === 'function') ? game.getCardNameWithOwner(c) : c.name; },

    _passiveDeltas(card, game, effects) {
        const out = { atk: 0, def: 0 };
        (effects || []).forEach(e => {
            if (e.if) { const s = DSL._passiveDeltas(card, game, DSL._cond(card, game, e.if) ? e.then : (e.else || [])); out.atk += s.atk; out.def += s.def; return; }
            if (e.op === 'MODIFICAR_STAT') {
                const d = DSL._value(card.owner, game, e.delta, card);
                if (e.stat === 'atk') out.atk += d;
                else if (e.stat === 'def') out.def += d;
            }
        });
        return out;
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
    async _doEffect(e, sourceCard, target, game, ownerId, habilidad) {
        const ctx = { self: sourceCard, objetivo: target };
        if (e.op === 'MODIFICAR_STAT') {
            const d = DSL._value(ownerId, game, e.delta, sourceCard, ctx);
            const antes = target[e.stat];
            game.modifyStat(target, e.stat, d, e.offsetY || 0, e.fuente !== undefined ? e.fuente : sourceCard);
            if (e.floating && typeof showFloatingText === 'function') showFloatingText(target.instanceId, e.floating.texto, e.floating.estilo || 'ft-green', e.floating.offset !== undefined ? e.floating.offset : -20);
            if (e.log) game.logMsg(DSL._fill(e.log, { carta: sourceCard.name, objetivo: DSL._nombre(game, target), antes, despues: target[e.stat] }), 'ability');
            if (e.comprobarMuerte) await game.checkDeath(target);
            return true;
        }
        if (e.op === 'CURAR') {
            let amount = DSL._value(ownerId, game, e.valor, sourceCard, ctx);
            if (e.conBeforeHealed === false) {
                // Variante simple (grupal): sin passthrough ni tope manual (el motor capa la vida); salta ilesos.
                if (e.soloSiHerido && target.currentHp >= target.maxHp) return 'skip';
                if (typeof showFloatingText === 'function') showFloatingText(target.instanceId, e.floating || 'CURADO', e.floatingStyle || 'ft-green', e.offsetFloating !== undefined ? e.offsetFloating : -40);
                game.modifyStat(target, 'currentHp', amount, e.offsetY !== undefined ? e.offsetY : 0, e.fuente !== undefined ? e.fuente : sourceCard);
                if (e.log) game.logMsg(DSL._fill(e.log, { carta: sourceCard.name, objetivo: DSL._nombre(game, target) }), 'ability');
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
            if (e.log) game.logMsg(DSL._fill(e.log, { carta: sourceCard.name, objetivo: DSL._nombre(game, target), antes, despues: target.currentHp }), 'ability');
            return true;
        }
        if (e.op === 'DAÑO') {
            const d = DSL._value(ownerId, game, e.valor, sourceCard, ctx);
            if (e.log) game.logMsg(DSL._fill(e.log, { carta: sourceCard.name, objetivo: DSL._nombre(game, target) }), 'ability');
            await game.dealDamage(sourceCard, target, d, e.directo !== false); // daño de efecto: directo por defecto
            await game.checkDeath(target);
            return true;
        }
        if (e.op === 'APLICAR_ESTADO') {
            if (e.log) game.logMsg(DSL._fill(e.log, { carta: sourceCard.name, objetivo: DSL._nombre(game, target) }), 'ability');
            game.applyStatus(target, e.estado, e.duracion, e.fuente !== undefined ? e.fuente : sourceCard, habilidad || null);
            return true;
        }
        if (e.op === 'MODIFICAR_CONTADORES') {
            const d = DSL._value(ownerId, game, e.delta, sourceCard, ctx);
            game.modifyCounters(target, e.contador, d, e.nombreContador || e.contador, e.fuente !== undefined ? e.fuente : sourceCard.name, e.icono || '⚙️');
            if (e.log) game.logMsg(DSL._fill(e.log, { carta: sourceCard.name, objetivo: DSL._nombre(game, target) }), 'ability');
            return true;
        }
        if (e.op === 'ATACAR') {
            const startHp = target.currentHp;
            const bono = DSL._value(ownerId, game, e.bonoAtq, sourceCard, ctx) || 0;
            if (bono) sourceCard.currentAtk += bono;
            await game.performAttack(sourceCard, target);
            if (bono) { if (typeof game.updatePassives === 'function') game.updatePassives(); else sourceCard.currentAtk -= bono; }
            const exito = target.currentHp < startHp && target.currentHp > 0; // dañó y sigue vivo
            if (exito && Array.isArray(e.siExito)) await DSL._runEffectList(e.siExito, sourceCard, game, ownerId, [target], habilidad);
            return true;
        }
        if (e.op === 'MONEDA') {
            const res = await game.triggerCoinFlips(e.cantidad || 1, ownerId);
            const cruz = res && res[0] === 'tails'; // sin resultado (cancelado) => rama de cara, como las cartas originales
            if (cruz) {
                if (e.logCruz) game.logMsg(e.logCruz.msg, e.logCruz.tipo || 'combat');
                if (Array.isArray(e.cruz)) await DSL._runEffectList(e.cruz, sourceCard, game, ownerId, [target], habilidad);
            } else {
                if (e.logCara) game.logMsg(e.logCara.msg, e.logCara.tipo || 'neutral');
                if (Array.isArray(e.cara)) await DSL._runEffectList(e.cara, sourceCard, game, ownerId, [target], habilidad);
            }
            return true;
        }
        if (e.op === 'ROBAR') {
            const n = DSL._value(ownerId, game, e.cantidad, sourceCard, ctx) || 1;
            const pid = e.jugador === 'RIVAL' ? (ownerId === 'p1' ? 'p2' : 'p1') : ownerId;
            if (e.log) game.logMsg(DSL._fill(e.log, { carta: sourceCard.name }), 'ability');
            for (let i = 0; i < n; i++) await game.drawCard(pid);
            return true;
        }
        return true;
    },

    async _runEffectList(efectos, sourceCard, game, ownerId, fallbackTargets, habilidad) {
        let anyApplied = false;
        for (const e of (efectos || [])) {
            if (e.if && !DSL._cond(sourceCard, game, e.if)) continue; // condición evaluada sobre la carta fuente
            if (e.op === 'ROBAR') { // afecta al jugador, no a cartas: una sola ejecución
                const r = await DSL._doEffect(e, sourceCard, null, game, ownerId, habilidad);
                if (r === true) anyApplied = true;
                continue;
            }
            const tspec = e.target;
            const targets = (!tspec || tspec === 'OBJETIVO') ? (Array.isArray(fallbackTargets) ? fallbackTargets : [fallbackTargets]) : DSL._pool(ownerId, game, tspec, sourceCard);
            for (const t of targets) {
                const r = await DSL._doEffect(e, sourceCard, t, game, ownerId, habilidad);
                if (r === false) return { ok: false, anyApplied };
                if (r === true) anyApplied = true;
            }
        }
        return { ok: true, anyApplied };
    },

    validate(tmpl) {
        const errs = [];
        (tmpl.abilities || []).forEach((ab, i) => {
            if (!DSL.TRIGGERS.includes(ab.trigger)) errs.push(`abilities[${i}]: trigger desconocido '${ab.trigger}'`);
            const effs = [...(ab.then || []), ...(ab.else || []), ...(ab.efectos || [])];
            effs.forEach((e, j) => {
                if (e.if) return;
                if (!DSL.OPS_EFECTO.includes(e.op)) errs.push(`abilities[${i}] efecto[${j}]: op desconocida '${e.op}'`);
                if (e.target && typeof e.target === 'object' && !DSL.QUIEN.includes(e.target.quien)) errs.push(`abilities[${i}] efecto[${j}]: target.quien inválido`);
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

        const passives = abs.filter(a => a.trigger === 'PASIVA_CONTINUA');
        if (passives.length && typeof tmpl.onUpdatePassive !== 'function') {
            tmpl.onUpdatePassive = function (card, game) {
                // Las pasivas solo actúan con la carta EN MESA (mano/mazo/descartes quedan intactos).
                const pl = game.players && game.players[card.owner];
                if (!pl || ![...pl.vanguard, ...pl.rearguard].some(x => x.instanceId === card.instanceId)) return;
                passives.forEach((ab, i) => {
                    const efs = DSL._cond(card, game, ab.if) ? ab.then : (ab.else || []);
                    const d = DSL._passiveDeltas(card, game, efs);
                    card.currentAtk += d.atk;
                    card.currentDef += d.def;
                    // Anuncio (estilo Karlos): al activarse o intensificarse; 'desactivada' al volver a 0.
                    const mag = Math.abs(d.atk) + Math.abs(d.def);
                    const key = '_dslPas' + i;
                    const prev = card[key] || 0;
                    const nombre = ab.nombre || tmpl.passiveName || 'PASIVA';
                    if (mag > prev) {
                        const partes = [];
                        if (d.atk) partes.push((d.atk > 0 ? '+' : '') + d.atk + ' de Atq');
                        if (d.def) partes.push((d.def > 0 ? '+' : '') + d.def + ' de Def');
                        game.logMsg(`¡Habilidad pasiva de ${DSL._nombre(game, card)}: ${nombre} tiene lugar! (${partes.join(', ')})`, 'ability');
                        if (typeof showFloatingText === 'function') {
                            showFloatingText(card.instanceId, nombre, 'ft-ability', -40);
                            if (d.atk) showFloatingText(card.instanceId, (d.atk > 0 ? '+' : '') + d.atk + ' ATQ', d.atk > 0 ? 'ft-green' : 'ft-red-stat', -20);
                            if (d.def) showFloatingText(card.instanceId, (d.def > 0 ? '+' : '') + d.def + ' DEF', d.def > 0 ? 'ft-green' : 'ft-red-stat', -10);
                        }
                    } else if (prev > 0 && mag === 0) {
                        game.logMsg(`${nombre} (${DSL._nombre(game, card)}) desactivada.`, 'system');
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
                        let pool = [...p.vanguard, ...p.rearguard];
                        (r.count.filtros || []).forEach(f => { pool = pool.filter(c => DSL._match(c, f)); });
                        val = pool.length;
                    } else val = DSL._field(card, r.campo);
                    if (!DSL._cmp(val, r.op, r.valor)) {
                        if (r.msg) game.logError(DSL._fill(r.msg, { carta: card.name }));
                        return false;
                    }
                }
                return true;
            };
        }

        // AL_JUGAR -> onPlay. Nota: para Ayudas el motor NO espera onPlay (síncrono); para Eventos sí.
        // Efectos async (DAÑO) en AL_JUGAR: usar solo en Eventos.
        const alJugar = abs.find(a => a.trigger === 'AL_JUGAR');
        if (alJugar && typeof tmpl.onPlay !== 'function') {
            tmpl.onPlay = async function (card, game) {
                if (alJugar.log) game.logMsg(alJugar.log, alJugar.logTipo || 'ability');
                await DSL._runEffectList(alJugar.efectos, card, game, card.owner, null);
            };
        }

        const usar = abs.find(a => a.trigger === 'AL_USAR_AYUDA');
        if (usar && typeof tmpl.onValidateTarget !== 'function') {
            // El motor usa este hook (en silencio) para decidir qué cartas llevan reborde de objetivo válido,
            // y (con voz) para explicar el rechazo al clicar. Se deriva de los requisitos + viabilidad de efectos.
            tmpl.onValidateTarget = function (card, target, game, isSilent) {
                for (const r of (usar.requisitosObjetivo || [])) {
                    const bv = DSL._value(card.owner, game, r.valor, card, { self: card, objetivo: target });
                    if (!DSL._cmp(DSL._field(target, r.campo), r.op, bv)) {
                        if (!isSilent && r.msg) game.logError(DSL._fill(r.msg, { objetivo: DSL._nombre(game, target) }));
                        return false;
                    }
                }
                for (const e of (usar.efectos || [])) {
                    if (e.op === 'CURAR' && e.conBeforeHealed !== false && target.currentHp >= target.maxHp) {
                        if (!isSilent) game.logError(DSL._fill(e.msgLleno || '{objetivo} ya tiene la Vida completa.', { objetivo: DSL._nombre(game, target) }));
                        return false;
                    }
                }
                return true;
            };
        }
        if (usar && typeof tmpl.onExecuteAyuda !== 'function') {
            tmpl.onExecuteAyuda = async function (card, target, game) {
                for (const r of (usar.requisitosObjetivo || [])) {
                    const bv = DSL._value(card.owner, game, r.valor, card, { self: card, objetivo: target });
                    if (!DSL._cmp(DSL._field(target, r.campo), r.op, bv)) {
                        if (r.msg) game.logError(DSL._fill(r.msg, { objetivo: DSL._nombre(game, target) }));
                        return false;
                    }
                }
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
            tmpl.onExecuteAbility = function (card, game) {
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
                    const targets = game.abilityContext.targets;
                    if (costeFuror > 0) game.modifyStat(card, 'furor', -costeFuror);
                    if (typeof showFloatingText === 'function') {
                        showFloatingText(card.instanceId, card.activeName, 'ft-ability', -30);
                        (activa.floatingExtra || []).forEach(fe => showFloatingText(card.instanceId, fe.texto, fe.estilo || 'ft-green', fe.offset !== undefined ? fe.offset : -10));
                    }
                    await DSL._runEffectList(activa.efectos, card, game, card.owner, targets, activa.nombre || tmpl.activeName || null);
                };
            }
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
                for (const r of (modFuror.reglas || [])) {
                    const si = r.si || {};
                    if (si.origen && source !== si.origen) continue;
                    if (si.objetivoDe === 'PROPIO' && targetCard.owner !== ev.owner) continue;
                    if (si.objetivoDe === 'RIVAL' && targetCard.owner === ev.owner) continue;
                    if (si.algunaEtiqueta && !(targetCard.tags && si.algunaEtiqueta.some(t => targetCard.tags.includes(t)))) continue;
                    if (si.campoObjetivo && !DSL._cmp(DSL._field(targetCard, si.campoObjetivo.campo), si.campoObjetivo.op, si.campoObjetivo.valor)) continue;
                    if (si.campoSelf && !DSL._cmp(DSL._field(ev, si.campoSelf.campo), si.campoSelf.op, si.campoSelf.valor)) continue;
                    if (r.log) game.logMsg(String(r.log.msg).replace('{objetivo}', targetCard.name), r.log.tipo || 'ability');
                    if (r.floating && typeof showFloatingText === 'function') showFloatingText(targetCard.instanceId, r.floating.texto, r.floating.estilo || 'ft-red-stat', r.floating.offset !== undefined ? r.floating.offset : -30);
                    if (r.accion && typeof r.accion.fijar === 'number') return r.accion.fijar;
                    if (r.accion && typeof r.accion.sumar === 'number') return amount + r.accion.sumar;
                }
                return amount;
            };
            if (typeof tmpl.onGlobalGetPreviewEffects !== 'function') {
                tmpl.onGlobalGetPreviewEffects = function (ev, targetCard, game) {
                    const out = [];
                    for (const r of (modFuror.reglas || [])) {
                        if (!r.preview) continue;
                        const si = r.si || {};
                        if (si.objetivoDe === 'PROPIO' && targetCard.owner !== ev.owner) continue;
                        if (si.objetivoDe === 'RIVAL' && targetCard.owner === ev.owner) continue;
                        if (si.algunaEtiqueta && !(targetCard.tags && si.algunaEtiqueta.some(t => targetCard.tags.includes(t)))) continue;
                        if (si.campoObjetivo && !DSL._cmp(DSL._field(targetCard, si.campoObjetivo.campo), si.campoObjetivo.op, si.campoObjetivo.valor)) continue;
                        if (si.campoSelf && !DSL._cmp(DSL._field(ev, si.campoSelf.campo), si.campoSelf.op, si.campoSelf.valor)) continue;
                        const dn = typeof game.getDisplayName === 'function' ? game.getDisplayName(ev.owner) : ev.owner;
                        out.push(`${r.preview}, fuente: ${ev.name} (Evento de ${dn})`);
                    }
                    return out;
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

        // GLOBAL_ANTES_DE_ATAQUE -> onGlobalBeforeAttack (eventos): intercepta cualquier ataque; devuelve permitir/bloquear.
        const antesAtaque = abs.find(a => a.trigger === 'GLOBAL_ANTES_DE_ATAQUE');
        if (antesAtaque && typeof tmpl.onGlobalBeforeAttack !== 'function') {
            tmpl.onGlobalBeforeAttack = async function (ev, attacker, defender, game) {
                if (antesAtaque.exentoPlantilla) {
                    const at = DSL._tmpl(attacker.id);
                    if (at && at[antesAtaque.exentoPlantilla]) return true; // p. ej. Simon con immuneToApagon
                }
                if (antesAtaque.log) game.logMsg(String(antesAtaque.log.msg).replace('{atacante}', attacker.name), antesAtaque.log.tipo || 'system');
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
        }

        const caducar = abs.find(a => a.trigger === 'AL_CADUCAR');
        if (caducar && typeof tmpl.onExpire !== 'function') {
            tmpl.onExpire = async function (ev, game, playerId) {
                if (caducar.log) game.logMsg(caducar.log, caducar.logTipo || 'ability');
                const res = await DSL._runEffectList(caducar.efectos, ev, game, playerId, null);
                if (res.anyApplied && caducar.logSiAplicado) game.logMsg(caducar.logSiAplicado.msg, caducar.logSiAplicado.tipo || 'ability');
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