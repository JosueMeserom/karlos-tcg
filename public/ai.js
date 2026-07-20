class AIEngine {
    constructor(game, aiPlayerId = 'p2') {
        this.game = game;
        this.aiPlayerId = aiPlayerId; 
        this.botType = localStorage.getItem('karlos_ai_type') || 'random';
        this.isThinking = false;
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Cancela cualquier estado de input que la IA no sepa manejar explícitamente.
    // Evita que un modal o selección inesperada bloquee el turno para siempre.
    safeResetIfStuck() {
        const knownStates = ['IDLE', 'EXECUTING', 'SELECT_TARGET', 'SELECT_ABILITY_TARGETS',
                             'CONFIRM_ABILITY', 'SELECT_ESBIRRO_TO_SWAP', 'SELECT_AYUDA_TARGET'];
        if (!knownStates.includes(this.game.inputState)) {
            console.warn(`[IA] Estado inesperado detectado: '${this.game.inputState}'. Forzando cancelación.`);
            this.game.cancelAction();
        }
    }

    async takeTurn() {
        if (this.game.activePlayerId !== this.aiPlayerId || this.game.phase !== 'PRINCIPAL') return;

        document.body.classList.add('ai-playing');
        
        this.isThinking = true;
        const banner = document.getElementById('action-banner');
        banner.innerText = "La IA está pensando su jugada...";
        banner.style.display = 'block';
        
        await this.sleep(1000);

        const p = this.game.players[this.aiPlayerId];
        const enemyId = this.aiPlayerId === 'p1' ? 'p2' : 'p1';
        const enemyP = this.game.players[enemyId];

        try {
            // ==========================================
            // 1. FASE DE INVOCACIÓN (Unidades, Ayudas y Eventos)
            // ==========================================
            let playableUnits = p.hand.filter(c => c.type === 'Personaje' || c.type === 'Esbirro');
            let playableSpells = p.hand.filter(c => c.type === 'Ayuda' || c.type === 'Evento');

            playableUnits = playableUnits.sort(() => Math.random() - 0.5);
            playableSpells = playableSpells.sort(() => Math.random() - 0.5);
            
            const cardsToTry = [...playableUnits, ...playableSpells];

            for (let cardToPlay of cardsToTry) {
                if ((cardToPlay.type === 'Personaje' || cardToPlay.type === 'Esbirro') && this.game.placedUnitThisTurn) continue;

                console.log(`[IA] Intentando jugar: ${cardToPlay.name} (${cardToPlay.type})`);
                await this.game.playCard(cardToPlay.instanceId);
                
                // --- NUEVO: AUTO-CONFIRMAR (Ej: Jugar un Evento sin objetivos) ---
                if (this.game.inputState === 'CONFIRM_ABILITY') {
                    await this.sleep(400);
                    console.log(`[IA] Confirmando uso de carta...`);
                    if (typeof this.game.confirmAction === 'function') this.game.confirmAction();
                }

                if (this.game.inputState === 'SELECT_ESBIRRO_TO_SWAP') {
                    const esbirrosVan = p.vanguard.filter(c => c.type === 'Esbirro');
                    if (esbirrosVan.length > 0) {
                        await this.sleep(600);
                        this.game.selectCard(esbirrosVan[0].instanceId); 
                    } else {
                        this.game.cancelAction(); 
                    }
                }
                
                if (this.game.inputState === 'SELECT_TARGET' || this.game.inputState === 'SELECT_ABILITY_TARGETS') {
                    await this.sleep(600);
                    const ctx = this.game.abilityContext;
                    let target = null;
                    
                    if (ctx && ctx.targetType === 'ally') {
                        let allies = [...p.vanguard, ...p.rearguard].filter(c => c.instanceId !== cardToPlay.instanceId);
                        if (allies.length > 0) target = allies.sort((a, b) => b.currentHp - a.currentHp)[0];
                    } else {
                        let enemies = enemyP.vanguard.filter(c => !c.stealth);
                        if (enemies.length > 0) target = enemies.sort((a, b) => b.currentAtk - a.currentAtk)[0];
                    }
                    
                    if (target) {
                        console.log(`[IA] Selecciona sabiamente como objetivo a ${target.name}`);
                        this.game.selectCard(target.instanceId);
                    } else {
                        this.game.cancelAction(); 
                    }
                }
                // Cinturón de seguridad: si quedó un estado raro, lo limpiamos antes de continuar
                await this.sleep(200);
                this.safeResetIfStuck();
                await this.sleep(600); 
            }

            // ==========================================
            // 2. FASE DE HABILIDADES (Gastar Furor)
            // ==========================================
            let allMyUnits = [...p.vanguard, ...p.rearguard].sort(() => Math.random() - 0.5);
            
            for (let unit of allMyUnits) {
                if (unit.exhausted) continue;
                
                const template = getCardTemplate(unit.id);
                
                if (template.activeName && typeof template.canActivateAbility === 'function') {
                    const cost = template.activeCost || 1;
                    if (unit.furor >= cost) {
                        const originalLogError = this.game.logError;
                        this.game.logError = () => {}; 
                        let canActivate = false;
                        try { canActivate = template.canActivateAbility(unit, this.game); } catch(e){}
                        this.game.logError = originalLogError;
                        
                        if (canActivate) {
                            console.log(`[IA] Activando habilidad de ${unit.name}: ${template.activeName}`);
                            await this.game.activateAbility(unit.instanceId);
                            
                            // --- NUEVO: AUTO-CONFIRMAR (Ej: Activar SEÍSMO de Gólem de tierra) ---
                            if (this.game.inputState === 'CONFIRM_ABILITY') {
                                await this.sleep(400);
                                console.log(`[IA] Confirmando habilidad...`);
                                if (typeof this.game.confirmAction === 'function') this.game.confirmAction();
                            }
                            
                            if (this.game.inputState === 'SELECT_ABILITY_TARGETS' || this.game.inputState === 'SELECT_TARGET') {
                                await this.sleep(400);
                                const ctx = this.game.abilityContext;
                                let target = null;
                                
                                if (ctx && ctx.targetType === 'ally') {
                                    let allies = [...p.vanguard, ...p.rearguard];
                                    if (allies.length > 0) target = allies.sort((a, b) => b.currentHp - a.currentHp)[0];
                                } else {
                                    let enemies = enemyP.vanguard.filter(c => !c.stealth);
                                    if (enemies.length > 0) target = enemies.sort((a, b) => b.currentAtk - a.currentAtk)[0];
                                }
                                
                                if (target) {
                                    console.log(`[IA] Habilidad apunta a ${target.name}`);
                                    this.game.selectCard(target.instanceId);
                                } else {
                                    this.game.cancelAction();
                                }
                            }
                            await this.sleep(400);
                            this.safeResetIfStuck();
                            await this.sleep(1400); 
                        }
                    }
                }
            }

            // ==========================================
            // 3. FASE DE COMBATE (Atacar TÁCTICAMENTE)
            // ==========================================
            let myAttackers = [...p.vanguard].sort((a, b) => a.currentAtk - b.currentAtk);

            for (let attacker of myAttackers) {
                if (attacker.exhausted) continue;
                if (this.game.turn === 1 && this.game.startingPlayerId === this.aiPlayerId) continue;
                
                const template = getCardTemplate(attacker.id);
                let canAttack = true;
                if (typeof template.canAttackNormally === 'function') {
                    canAttack = template.canAttackNormally(attacker, this.game);
                }
                if (!canAttack) continue;

                if (enemyP.vanguard.length === 0 && enemyP.rearguard.length === 0) {
                    if (this.game.directAttackUsedThisTurn) continue;
                    console.log(`[IA] ¡ATAQUE DIRECTO de ${attacker.name}!`);
                    // Usamos selectCard para pasar por la validación normal, igual que haría el jugador
                    await this.game.selectCard(attacker.instanceId);
                    if (this.game.inputState === 'SELECT_TARGET') {
                        await this.game.performDirectAttack();
                    }
                    await this.sleep(1200);
                    continue;
                }

                if (enemyP.vanguard.length > 0) {
                    let validTargets = enemyP.vanguard.filter(c => c.currentHp > 0 && !getCardTemplate(c.id).isAvatar);
                    
                    const tauntTargets = validTargets.filter(c => getCardTemplate(c.id).isTaunt);
                    if (tauntTargets.length > 0) {
                        validTargets = tauntTargets; 
                    } else {
                        if (!template.canAttackStealth) {
                            validTargets = validTargets.filter(c => !c.stealth); 
                        }
                    }
                    
                    if (validTargets.length > 0) {
                        let bestTarget = null;
                        let bestScore = -999;

                        for (let target of validTargets) {
                            let score = 0;
                            
                            let dmg = attacker.currentAtk - target.currentDef;
                            if (dmg <= 0) dmg = (attacker.type === 'Esbirro' && target.type === 'Personaje') ? 0.5 : 1;

                            if (dmg >= target.currentHp) {
                                score += 100; 
                                score -= (dmg - target.currentHp); 
                            } else {
                                score += dmg; 
                            }

                            if (target.type === 'Personaje') score += 10; 

                            if (score > bestScore) {
                                bestScore = score;
                                bestTarget = target;
                            }
                        }

                        console.log(`[IA TÁCTICA] ${attacker.name} ataca a ${bestTarget.name} (Puntuación: ${bestScore}).`);
                        // performAttack recibe atacante y defensor directamente, no necesita selectedCard
                        await this.game.performAttack(attacker, bestTarget);
                        await this.sleep(1200);
                    }
                }
            }
            
        } catch (error) {
            console.error("[IA ERROR CRÍTICO] La IA se ha topado con un error y forzará el pase de turno:", error);
            this.game.cancelAction(); 
        } finally {
            banner.style.display = 'none';
            console.log(`[IA - ${this.botType}] Turno finalizado.`);
            this.isThinking = false;
            
            // --- Encendemos la UI de botones para cuando te toque a ti ---
            document.body.classList.remove('ai-playing');
            
            this.game.confirmEndTurn(); 
        }
    }
}