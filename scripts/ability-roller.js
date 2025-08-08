/**
 * Ability Roller - Version-independent ability test rolling
 * Works across Foundry v11-13 with D&D5e system
 */

export class AbilityRoller {
  constructor() {
    this.pendingRolls = new Map(); // Track pending rolls for result capture
    this.setupChatListener();
  }

  /**
   * Roll an ability test for a character
   * @param {string} actorInput - Actor name or ID
   * @param {string} ability - Ability identifier (e.g., "str", "dex", "con", "int", "wis", "cha")
   * @param {string} mode - Roll mode: "normal", "advantage", "disadvantage"
   * @returns {Promise<Object>} Roll result with total and details
   */
  async rollAbilityTest(actorInput, ability, mode = "normal") {
    // Resolve actor
    const actor = this.resolveActor(actorInput);
    if (!actor) {
      console.error('Mage Hand | Cannot find actor:', actorInput);
      return null;
    }

    // Validate ability
    const validAbilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
    if (!validAbilities.includes(ability)) {
      console.error('Mage Hand | Invalid ability:', ability);
      return null;
    }

    // Create simulated event based on mode
    const event = this.createEvent(mode);
    
    // Create speaker for the roll
    const speaker = ChatMessage.getSpeaker({ actor: actor });
    
    // Create a promise that will resolve when we capture the roll result
    const rollPromise = new Promise((resolve, reject) => {
      const rollId = `${actor.id}-${ability}-${Date.now()}`;
      this.pendingRolls.set(rollId, { resolve, reject, actor, ability });
      
      // Set a timeout in case we don't capture the result
      setTimeout(() => {
        if (this.pendingRolls.has(rollId)) {
          this.pendingRolls.delete(rollId);
          reject(new Error('Roll result capture timeout'));
        }
      }, 5000);
    });

    // Perform the roll based on D&D5e system version
    try {
      const systemVersion = game.system.version;
      const majorVersion = parseInt(systemVersion.split('.')[0]);
      const minorVersion = parseInt(systemVersion.split('.')[1]);
      
      // D&D5e v4.x and v5.x use the same method signatures
      if (majorVersion >= 4) {
        // v4.x and v5.x use object as first parameter
        if (actor.rollAbilityCheck) {
          // Determine advantage/disadvantage from our event simulation
          let advantage = event.altKey;
          let disadvantage = event.ctrlKey || event.metaKey;
          
          await actor.rollAbilityCheck(
            {
              ability: ability,
              advantage: advantage,
              disadvantage: disadvantage
            },
            {
              configure: false,  // Skip dialog
              messageConfig: { speaker: speaker }
            }
          );
        } else {
          // Fallback to old method
          await actor.rollAbilityTest(ability, { event, speaker });
        }
      } else {
        // D&D5e v3 and earlier use rollAbilityTest
        if (actor.rollAbilityTest) {
          await actor.rollAbilityTest(ability, { event, speaker });
        } else {
          console.error('Mage Hand | rollAbilityTest not available on actor');
          return null;
        }
      }
      
      // Wait for the roll result to be captured
      const result = await rollPromise;
      return result;
    } catch (error) {
      console.error('Mage Hand | Error rolling ability test:', error);
      return null;
    }
  }

  /**
   * Roll an ability save for a character
   * @param {string} actorInput - Actor name or ID
   * @param {string} ability - Ability identifier (e.g., "str", "dex", "con", "int", "wis", "cha")
   * @param {string} mode - Roll mode: "normal", "advantage", "disadvantage"
   * @returns {Promise<Object>} Roll result with total and details
   */
  async rollAbilitySave(actorInput, ability, mode = "normal") {
    // Resolve actor
    const actor = this.resolveActor(actorInput);
    if (!actor) {
      console.error('Mage Hand | Cannot find actor:', actorInput);
      return null;
    }

    // Validate ability
    const validAbilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
    if (!validAbilities.includes(ability)) {
      console.error('Mage Hand | Invalid ability:', ability);
      return null;
    }

    // Create simulated event based on mode
    const event = this.createEvent(mode);
    
    // Create speaker for the roll
    const speaker = ChatMessage.getSpeaker({ actor: actor });
    
    // Create a promise that will resolve when we capture the roll result
    const rollPromise = new Promise((resolve, reject) => {
      const rollId = `${actor.id}-${ability}-save-${Date.now()}`;
      this.pendingRolls.set(rollId, { resolve, reject, actor, ability, isSave: true });
      
      // Set a timeout in case we don't capture the result
      setTimeout(() => {
        if (this.pendingRolls.has(rollId)) {
          this.pendingRolls.delete(rollId);
          reject(new Error('Roll result capture timeout'));
        }
      }, 5000);
    });

    // Perform the roll based on D&D5e system version
    try {
      const systemVersion = game.system.version;
      const majorVersion = parseInt(systemVersion.split('.')[0]);
      const minorVersion = parseInt(systemVersion.split('.')[1]);
      
      // D&D5e v4.x and v5.x use the same method signatures and names
      if (majorVersion >= 4) {
        if (actor.rollSavingThrow) {
          // v4.1+ and v5.x use rollSavingThrow
          // Determine advantage/disadvantage from our event simulation
          let advantage = event.altKey;
          let disadvantage = event.ctrlKey || event.metaKey;
          
          await actor.rollSavingThrow(
            {
              ability: ability,
              advantage: advantage,
              disadvantage: disadvantage
            },
            {
              configure: false,  // Skip dialog
              messageConfig: { speaker: speaker }
            }
          );
        } else if (actor.rollAbilitySave) {
          // Fallback for v4.0
          let advantage = event.altKey;
          let disadvantage = event.ctrlKey || event.metaKey;
          
          await actor.rollAbilitySave(
            {
              ability: ability,
              advantage: advantage,
              disadvantage: disadvantage
            },
            {
              configure: false,  // Skip dialog
              messageConfig: { speaker: speaker }
            }
          );
        } else {
          console.error('Mage Hand | rollSavingThrow/rollAbilitySave not available on actor');
          return null;
        }
      } else {
        // D&D5e v3 and earlier use old parameter structure
        if (actor.rollAbilitySave) {
          await actor.rollAbilitySave(ability, { event, speaker });
        } else {
          console.error('Mage Hand | rollAbilitySave not available on actor');
          return null;
        }
      }
      
      // Wait for the roll result to be captured
      const result = await rollPromise;
      return result;
    } catch (error) {
      console.error('Mage Hand | Error rolling ability save:', error);
      return null;
    }
  }

  /**
   * Roll a skill check for a character
   * @param {string} actorInput - Actor name or ID
   * @param {string} skill - Skill identifier (e.g., "acr", "ath", "dec", etc.)
   * @param {string} mode - Roll mode: "normal", "advantage", "disadvantage"
   * @returns {Promise<Object>} Roll result with total and details
   */
  async rollSkillCheck(actorInput, skill, mode = "normal") {
    // Resolve actor
    const actor = this.resolveActor(actorInput);
    if (!actor) {
      console.error('Mage Hand | Cannot find actor:', actorInput);
      return null;
    }

    // Create simulated event based on mode
    const event = this.createEvent(mode);
    
    // Create speaker for the roll
    const speaker = ChatMessage.getSpeaker({ actor: actor });
    
    // Create a promise that will resolve when we capture the roll result
    const rollPromise = new Promise((resolve, reject) => {
      const rollId = `${actor.id}-${skill}-skill-${Date.now()}`;
      this.pendingRolls.set(rollId, { resolve, reject, actor, skill, isSkill: true });
      
      // Set a timeout in case we don't capture the result
      setTimeout(() => {
        if (this.pendingRolls.has(rollId)) {
          this.pendingRolls.delete(rollId);
          reject(new Error('Roll result capture timeout'));
        }
      }, 5000);
    });

    // Perform the roll based on D&D5e system version
    try {
      const systemVersion = game.system.version;
      const majorVersion = parseInt(systemVersion.split('.')[0]);
      const minorVersion = parseInt(systemVersion.split('.')[1]);
      
      // D&D5e v4.x and v5.x use the same method signatures and names
      if (majorVersion >= 4) {
        if (actor.rollSkillCheck) {
          // v4.1+ and v5.x use rollSkillCheck
          // Determine advantage/disadvantage from our event simulation
          let advantage = event.altKey;
          let disadvantage = event.ctrlKey || event.metaKey;
          
          await actor.rollSkillCheck(
            {
              skill: skill,
              advantage: advantage,
              disadvantage: disadvantage
            },
            {
              configure: false,  // Skip dialog
              messageConfig: { speaker: speaker }
            }
          );
        } else if (actor.rollSkill) {
          // Fallback for v4.0
          let advantage = event.altKey;
          let disadvantage = event.ctrlKey || event.metaKey;
          
          await actor.rollSkill(
            {
              skill: skill,
              advantage: advantage,
              disadvantage: disadvantage
            },
            {
              configure: false,  // Skip dialog
              messageConfig: { speaker: speaker }
            }
          );
        } else {
          console.error('Mage Hand | rollSkillCheck/rollSkill not available on actor');
          return null;
        }
      } else {
        // D&D5e v3 and earlier use old parameter structure
        if (actor.rollSkill) {
          await actor.rollSkill(skill, { event, speaker });
        } else {
          console.error('Mage Hand | rollSkill not available on actor');
          return null;
        }
      }
      
      // Wait for the roll result to be captured
      const result = await rollPromise;
      return result;
    } catch (error) {
      console.error('Mage Hand | Error rolling skill check:', error);
      return null;
    }
  }

  /**
   * Create a simulated event object for roll mode
   * @param {string} mode - "normal", "advantage", or "disadvantage"
   * @returns {Object} Simulated event object
   */
  createEvent(mode) {
    const event = {
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      preventDefault: () => {},
      stopPropagation: () => {},
      // Add mock target for v11 compatibility
      target: {
        closest: () => null,  // Returns null for any selector query
        dataset: {}
      }
    };

    switch (mode) {
      case 'advantage':
        event.altKey = true;
        break;
      case 'disadvantage':
        // On Mac, use metaKey; on Windows/Linux, use ctrlKey
        if (navigator.platform.toLowerCase().includes('mac')) {
          event.metaKey = true;
        } else {
          event.ctrlKey = true;
        }
        break;
      case 'normal':
        event.shiftKey = true;
        break;
      default:
        // Default is normal roll (no modifiers)
        break;
    }

    return event;
  }

  /**
   * Resolve actor from name or ID
   * @param {string} input - Actor name or ID
   * @returns {Actor|null} The resolved actor or null
   */
  resolveActor(input) {
    if (!input) return null;
    
    // Try to find by name first
    let actor = game.actors.find(a => a.name === input);
    
    // If not found by name, try by ID
    if (!actor) {
      actor = game.actors.get(input);
    }
    
    return actor;
  }

  /**
   * Setup listener for chat messages to capture roll results
   */
  setupChatListener() {
    Hooks.on('createChatMessage', (message) => {
      // Check if this is a roll message
      if (!message.rolls || message.rolls.length === 0) return;
      
      // Get the actor from the message speaker
      const actor = game.actors.get(message.speaker.actor);
      if (!actor) return;
      
      // Check if we have any pending rolls for this actor
      for (const [rollId, pending] of this.pendingRolls) {
        if (pending.actor.id === actor.id) {
          // Extract roll data
          const roll = message.rolls[0];
          
          // Build clean parts array without operators
          const parts = [];
          let nextOperator = '+'; // Start with addition
          
          for (const term of roll.terms) {
            if (term.class === 'Die' || term.constructor.name === 'Die') {
              parts.push({
                type: 'die',
                formula: term.formula,
                faces: term.faces,
                number: term.number,
                results: term.results.map(r => r.result),
                total: term.total,
                operator: nextOperator
              });
              nextOperator = '+'; // Reset for next term
            } else if (term.class === 'NumericTerm' || term.constructor.name === 'NumericTerm') {
              // Apply the operator to the numeric value
              const value = nextOperator === '-' ? -term.number : term.number;
              parts.push({
                type: 'modifier',
                value: value,
                operator: nextOperator
              });
              nextOperator = '+'; // Reset for next term
            } else if (term.class === 'OperatorTerm' || term.constructor.name === 'OperatorTerm') {
              // Store the operator for the next term
              nextOperator = term.operator || term.value || '+';
            }
          }
          
          // Rebuild clean formula from parts
          let cleanFormula = '';
          parts.forEach((part, index) => {
            if (part.type === 'die') {
              if (index > 0 && part.operator === '+') cleanFormula += ' + ';
              else if (index > 0 && part.operator === '-') cleanFormula += ' - ';
              cleanFormula += part.formula;
            } else if (part.type === 'modifier') {
              if (part.value >= 0) {
                if (index > 0) cleanFormula += ' + ';
                cleanFormula += Math.abs(part.value);
              } else {
                cleanFormula += ' - ';
                cleanFormula += Math.abs(part.value);
              }
            }
          });
          
          const result = {
            total: roll.total,
            formula: cleanFormula.trim(),
            originalFormula: roll.formula,  // Keep original in case needed
            dice: roll.dice.map(d => ({
              faces: d.faces,
              results: d.results.map(r => r.result),
              total: d.total
            })),
            parts: parts,
            advantage: roll.formula.includes('2d20kh') || roll.formula.includes('2d20kl'),
            disadvantage: roll.formula.includes('2d20kl'),
            critical: roll.dice[0]?.results.some(r => r.result === 20),
            fumble: roll.dice[0]?.results.some(r => r.result === 1),
            actorId: actor.id,
            actorName: actor.name,
            timestamp: Date.now()
          };

          // Determine roll type from message flavor
          const flavor = message.flavor?.toLowerCase() || '';
          if (pending.isSave || flavor.includes('saving throw')) {
            result.type = 'save';
            result.ability = pending.ability;
          } else if (pending.isSkill || flavor.includes('skill check')) {
            result.type = 'skill';
            result.skill = pending.skill;
          } else {
            result.type = 'ability';
            result.ability = pending.ability;
          }

          // Resolve the pending promise
          pending.resolve(result);
          this.pendingRolls.delete(rollId);
          
          // Only process the first matching pending roll
          break;
        }
      }
    });
  }
}

// Export a singleton instance
export const abilityRoller = new AbilityRoller();