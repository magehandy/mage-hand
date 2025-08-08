/**
 * Base Roller - Common functionality for all version-specific rollers
 */

import { RollParser } from '../utils/roll-parser.js';

export class BaseRoller {
  constructor() {
    this.pendingRolls = new Map();
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
    const actor = this.resolveActor(actorInput);
    if (!actor) {
      console.error('Mage Hand | Cannot find actor:', actorInput);
      return null;
    }

    const validAbilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
    if (!validAbilities.includes(ability)) {
      console.error('Mage Hand | Invalid ability:', ability);
      return null;
    }

    const rollPromise = this.createRollPromise(actor, ability, 'ability');
    
    try {
      await this.performAbilityTest(actor, ability, mode);
      return await rollPromise;
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
    const actor = this.resolveActor(actorInput);
    if (!actor) {
      console.error('Mage Hand | Cannot find actor:', actorInput);
      return null;
    }

    const validAbilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
    if (!validAbilities.includes(ability)) {
      console.error('Mage Hand | Invalid ability:', ability);
      return null;
    }

    const rollPromise = this.createRollPromise(actor, ability, 'save');
    
    try {
      await this.performAbilitySave(actor, ability, mode);
      return await rollPromise;
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
    const actor = this.resolveActor(actorInput);
    if (!actor) {
      console.error('Mage Hand | Cannot find actor:', actorInput);
      return null;
    }

    const rollPromise = this.createRollPromise(actor, skill, 'skill');
    
    try {
      await this.performSkillCheck(actor, skill, mode);
      return await rollPromise;
    } catch (error) {
      console.error('Mage Hand | Error rolling skill check:', error);
      return null;
    }
  }

  /**
   * Roll initiative for a character
   * @param {string} actorInput - Actor name or ID
   * @param {string} mode - Roll mode: "normal", "advantage", "disadvantage"
   * @returns {Promise<Object>} Roll result with total and details
   */
  async rollInitiative(actorInput, mode = "normal") {
    const actor = this.resolveActor(actorInput);
    if (!actor) {
      console.error('Mage Hand | Cannot find actor:', actorInput);
      return null;
    }

    const rollPromise = this.createRollPromise(actor, 'init', 'initiative');
    
    try {
      await this.performInitiative(actor, mode);
      return await rollPromise;
    } catch (error) {
      console.error('Mage Hand | Error rolling initiative:', error);
      return null;
    }
  }

  /**
   * Roll a death save for a character
   * @param {string} actorInput - Actor name or ID
   * @param {string} mode - Roll mode: "normal", "advantage", "disadvantage"
   * @returns {Promise<Object>} Roll result with total and details
   */
  async rollDeathSave(actorInput, mode = "normal") {
    const actor = this.resolveActor(actorInput);
    if (!actor) {
      console.error('Mage Hand | Cannot find actor:', actorInput);
      return null;
    }

    const rollPromise = this.createRollPromise(actor, 'death', 'deathSave');
    
    try {
      await this.performDeathSave(actor, mode);
      return await rollPromise;
    } catch (error) {
      console.error('Mage Hand | Error rolling death save:', error);
      return null;
    }
  }

  /**
   * Use an item (weapon, spell, feature, etc.)
   * @param {string} actorInput - Actor name or ID
   * @param {string} itemNameOrId - Item name or ID
   * @param {string} mode - Roll mode: "normal", "advantage", "disadvantage"
   * @returns {Promise<Object>} Roll result with total and details
   */
  async useItem(actorInput, itemNameOrId, mode = "normal") {
    const actor = this.resolveActor(actorInput);
    if (!actor) {
      console.error('Mage Hand | Cannot find actor:', actorInput);
      return null;
    }

    // Find the item by name or ID
    let item = actor.items.get(itemNameOrId);
    if (!item) {
      item = actor.items.find(i => i.name === itemNameOrId);
    }
    
    if (!item) {
      console.error('Mage Hand | Cannot find item:', itemNameOrId);
      return null;
    }
    
    try {
      // Call performItemUse which now returns structured data
      const result = await this.performItemUse(actor, item, mode);
      
      // Return the structured result with messageId and buttons
      return result;
    } catch (error) {
      console.error('Mage Hand | Error using item:', error);
      return null;
    }
  }

  /**
   * Roll an attack for an item
   * @param {string} actorInput - Actor name or ID
   * @param {string} itemNameOrId - Item name or ID
   * @param {string} mode - Roll mode: "normal", "advantage", "disadvantage"
   * @returns {Promise<Object>} Attack roll result with critical status
   */
  async rollAttack(actorInput, itemNameOrId, mode = "normal") {
    const actor = this.resolveActor(actorInput);
    if (!actor) {
      console.error('Mage Hand | Cannot find actor:', actorInput);
      return null;
    }

    // Find the item by name or ID
    let item = actor.items.get(itemNameOrId);
    if (!item) {
      item = actor.items.find(i => i.name === itemNameOrId);
    }
    
    if (!item) {
      console.error('Mage Hand | Cannot find item:', itemNameOrId);
      return null;
    }
    
    try {
      // Call performAttackRoll which handles the activity-based rolling
      const result = await this.performAttackRoll(actor, item, mode);
      return result;
    } catch (error) {
      console.error('Mage Hand | Error rolling attack:', error);
      return null;
    }
  }

  /**
   * Roll damage for an item with optional critical hit
   * @param {string} actorInput - Actor name or ID
   * @param {string} itemNameOrId - Item name or ID
   * @param {boolean} isCritical - Whether this is a critical hit
   * @param {string} messageId - Optional message ID from the attack roll
   * @returns {Promise<Object>} Damage roll result
   */
  async rollDamage(actorInput, itemNameOrId, isCritical = false, messageId = null) {
    const actor = this.resolveActor(actorInput);
    if (!actor) {
      console.error('Mage Hand | Cannot find actor:', actorInput);
      return null;
    }

    // Find the item by name or ID
    let item = actor.items.get(itemNameOrId);
    if (!item) {
      item = actor.items.find(i => i.name === itemNameOrId);
    }
    
    if (!item) {
      console.error('Mage Hand | Cannot find item:', itemNameOrId);
      return null;
    }
    
    try {
      // Call performDamageRoll which handles the activity-based rolling
      const result = await this.performDamageRoll(actor, item, isCritical, messageId);
      return result;
    } catch (error) {
      console.error('Mage Hand | Error rolling damage:', error);
      return null;
    }
  }

  // Abstract methods to be implemented by version-specific rollers
  async performAbilityTest(actor, ability, mode) {
    throw new Error('performAbilityTest must be implemented by subclass');
  }

  async performAbilitySave(actor, ability, mode) {
    throw new Error('performAbilitySave must be implemented by subclass');
  }

  async performSkillCheck(actor, skill, mode) {
    throw new Error('performSkillCheck must be implemented by subclass');
  }

  async performItemUse(actor, item, mode) {
    throw new Error('performItemUse must be implemented by subclass');
  }

  async performAttackRoll(actor, item, mode) {
    throw new Error('performAttackRoll must be implemented by subclass');
  }

  async performDamageRoll(actor, item, isCritical, messageId) {
    throw new Error('performDamageRoll must be implemented by subclass');
  }

  async performInitiative(actor, mode) {
    const event = this.createEvent(mode);
    const { advantage, disadvantage } = this.parseAdvantage(event);
    
    if (!actor.rollInitiative) {
      throw new Error('rollInitiative not available on actor');
    }

    // Check if there's an active combat
    const activeCombat = game.combats?.active;
    
    if (activeCombat) {
      const combatant = activeCombat.combatants.find(c => c.actorId === actor.id);
      
      if (combatant && combatant.initiative === null) {
        // Actor is in combat and hasn't rolled initiative yet - proceed with roll
        console.log(`Mage Hand | Rolling initiative for ${actor.name} in active combat`);
        
        await actor.rollInitiative(
          { 
            advantage: advantage,
            disadvantage: disadvantage
          },
          {
            messageConfig: {
              speaker: this.getSpeaker(actor)
            }
          }
        );
      } else if (combatant && combatant.initiative !== null) {
        console.log(`Mage Hand | ${actor.name} already has initiative: ${combatant.initiative}`);
        // Prevent re-rolling once initiative is set
        throw new Error(`${actor.name} already has initiative: ${combatant.initiative}`);
      } else if (!combatant) {
        console.log(`Mage Hand | ${actor.name} is not in the active combat`);
        // Attempt roll anyway - v12/v13 handle this gracefully, v11 may fail
        await actor.rollInitiative(
          { 
            advantage: advantage,
            disadvantage: disadvantage
          },
          {
            messageConfig: {
              speaker: this.getSpeaker(actor)
            }
          }
        );
      }
    } else {
      console.log(`Mage Hand | No active combat for initiative roll`);
      // Attempt roll anyway - v12/v13 can roll without combat, v11 will fail
      await actor.rollInitiative(
        { 
          advantage: advantage,
          disadvantage: disadvantage
        },
        {
          messageConfig: {
            speaker: this.getSpeaker(actor)
          }
        }
      );
    }
  }

  async performDeathSave(actor, mode) {
    const event = this.createEvent(mode);
    const { advantage, disadvantage } = this.parseAdvantage(event);
    
    // Check if actor supports death saves
    const death = actor.system?.attributes?.death;
    if (!death) {
      console.warn(`Actors of type '${actor.type}' don't support death saves`);
      return
    }

    // Check if actor can roll death save
    if (!actor.rollDeathSave) {
      console.warn('rollDeathSave not available on actor');
      return
    }

    // Check current HP and death save status
    const hp = actor.system.attributes.hp;
    const currentHP = hp?.value || 0;
    const failures = death.failure || 0;
    const successes = death.success || 0;

    // Validate death save conditions - warn and return without rolling
    if (currentHP > 0) {
      console.warn(`Mage Hand | ${actor.name} has ${currentHP} HP and doesn't need death saves`);
      return; // Exit without rolling or throwing error
    }
    
    if (failures >= 3) {
      console.warn(`Mage Hand | ${actor.name} has already failed 3 death saves (dead)`);
      return; // Exit without rolling or throwing error
    }
    
    if (successes >= 3) {
      console.warn(`Mage Hand | ${actor.name} has already succeeded 3 death saves (stabilized)`);
      return; // Exit without rolling or throwing error
    }

    console.log(`Mage Hand | Rolling death save for ${actor.name} (${successes} successes, ${failures} failures)`);
    
    // Perform the death save roll only if conditions are met
    await actor.rollDeathSave(
      { 
        advantage: advantage,
        disadvantage: disadvantage,
        fastForward: true  // Skip dialog (needed for v11)
      },
      {
        messageConfig: {
          speaker: this.getSpeaker(actor)
        }
      }
    );
  }

  /**
   * Create a promise that will resolve when we capture the roll result
   */
  createRollPromise(actor, identifier, type) {
    return new Promise((resolve, reject) => {
      const rollId = `${actor.id}-${identifier}-${type}-${Date.now()}`;
      const pending = { 
        resolve, 
        reject, 
        actor, 
        type
      };
      
      if (type === 'ability') {
        pending.ability = identifier;
      } else if (type === 'save') {
        pending.ability = identifier;
        pending.isSave = true;
      } else if (type === 'skill') {
        pending.skill = identifier;
        pending.isSkill = true;
      } else if (type === 'initiative') {
        pending.isInitiative = true;
      } else if (type === 'deathSave') {
        pending.isDeathSave = true;
      } else if (type === 'item') {
        pending.itemId = identifier;
        pending.isItem = true;
      }
      
      this.pendingRolls.set(rollId, pending);
      
      // Set a timeout in case we don't capture the result
      setTimeout(() => {
        if (this.pendingRolls.has(rollId)) {
          this.pendingRolls.delete(rollId);
          reject(new Error('Roll result capture timeout'));
        }
      }, 5000);
    });
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
        closest: () => null,
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
    }

    return event;
  }

  /**
   * Parse advantage/disadvantage from event
   */
  parseAdvantage(event) {
    return {
      advantage: event.altKey,
      disadvantage: event.ctrlKey || event.metaKey
    };
  }

  /**
   * Get speaker for the roll
   */
  getSpeaker(actor) {
    return ChatMessage.getSpeaker({ actor: actor });
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
          // Use utility to parse the message with pending context
          const result = RollParser.parseFromMessage(message, pending);
          
          if (!result) {
            console.warn('Mage Hand | Could not parse roll from message');
            continue;
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

  /**
   * Parse available buttons from a chat message
   * @param {ChatMessage} message - The chat message to parse
   * @returns {Array} Array of button objects with action and label
   */
  parseChatButtons(message) {
    const buttons = [];
    
    // Get the message content HTML
    const content = message.content || '';
    if (!content) return buttons;
    
    // Create a temporary DOM element to parse the HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    
    // Find all buttons in the message
    const buttonElements = tempDiv.querySelectorAll('button[data-action]');
    
    buttonElements.forEach(button => {
      const action = button.dataset.action;
      const label = button.textContent.trim();
      
      if (action && label) {
        buttons.push({
          action: action,
          label: label
        });
      }
    });
    
    // Also check for rollable elements that act like buttons
    const rollableElements = tempDiv.querySelectorAll('.rollable[data-action]');
    rollableElements.forEach(element => {
      const action = element.dataset.action;
      const label = element.textContent.trim();
      
      if (action && label && !buttons.find(b => b.action === action)) {
        buttons.push({
          action: action,
          label: label
        });
      }
    });
    
    console.log(`Mage Hand | Parsed ${buttons.length} buttons from message ${message.id}`);
    return buttons;
  }

  /**
   * Cast a spell with an attack roll
   * @param {string} actorInput - Actor name or ID
   * @param {string} spellNameOrId - Spell name or ID
   * @param {string} mode - Roll mode (normal, advantage, disadvantage)
   * @returns {Promise<Object>} Spell attack roll result
   */
  async castSpellAttack(actorInput, spellNameOrId, mode = 'normal') {
    const actor = this.resolveActor(actorInput);
    if (!actor) {
      console.error('Mage Hand | Cannot find actor:', actorInput);
      return null;
    }

    // Find the spell by name or ID
    let spell = actor.items.get(spellNameOrId);
    if (!spell) {
      spell = actor.items.find(i => i.name === spellNameOrId);
    }
    
    if (!spell) {
      console.error('Mage Hand | Cannot find spell:', spellNameOrId);
      return null;
    }
    
    // Validate this is a spell
    if (spell.type !== 'spell') {
      console.error(`Mage Hand | Item ${spell.name} is not a spell (type: ${spell.type})`);
      return null;
    }
    
    console.log(`Mage Hand | Casting spell attack: ${spell.name}`);
    
    try {
      // Use the generic attack roll method
      const result = await this.performAttackRoll(actor, spell, mode);
      
      // Add spell-specific context
      if (result) {
        result.actionType = 'spell-attack';
        result.spellLevel = spell.system?.level || 0;
        result.school = spell.system?.school || 'unknown';
      }
      
      return result;
    } catch (error) {
      console.error('Mage Hand | Error casting spell attack:', error);
      return null;
    }
  }

  /**
   * Cast a spell and roll damage
   * @param {string} actorInput - Actor name or ID
   * @param {string} spellNameOrId - Spell name or ID
   * @param {boolean} isCritical - Whether this is a critical hit
   * @param {string} messageId - Optional message ID from attack roll
   * @returns {Promise<Object>} Spell damage roll result
   */
  async castSpellDamage(actorInput, spellNameOrId, isCritical = false, messageId = null) {
    const actor = this.resolveActor(actorInput);
    if (!actor) {
      console.error('Mage Hand | Cannot find actor:', actorInput);
      return null;
    }

    // Find the spell by name or ID
    let spell = actor.items.get(spellNameOrId);
    if (!spell) {
      spell = actor.items.find(i => i.name === spellNameOrId);
    }
    
    if (!spell) {
      console.error('Mage Hand | Cannot find spell:', spellNameOrId);
      return null;
    }
    
    // Validate this is a spell
    if (spell.type !== 'spell') {
      console.error(`Mage Hand | Item ${spell.name} is not a spell (type: ${spell.type})`);
      return null;
    }
    
    console.log(`Mage Hand | Rolling spell damage: ${spell.name}`);
    
    try {
      // Use the generic damage roll method
      const result = await this.performDamageRoll(actor, spell, isCritical, messageId);
      
      // Add spell-specific context
      if (result) {
        result.actionType = 'spell-damage';
        result.spellLevel = spell.system?.level || 0;
        result.school = spell.system?.school || 'unknown';
      }
      
      return result;
    } catch (error) {
      console.error('Mage Hand | Error rolling spell damage:', error);
      return null;
    }
  }

  /**
   * Attack with a weapon
   * @param {string} actorInput - Actor name or ID
   * @param {string} weaponNameOrId - Weapon name or ID
   * @param {string} mode - Roll mode (normal, advantage, disadvantage)
   * @returns {Promise<Object>} Weapon attack roll result
   */
  async weaponAttack(actorInput, weaponNameOrId, mode = 'normal') {
    const actor = this.resolveActor(actorInput);
    if (!actor) {
      console.error('Mage Hand | Cannot find actor:', actorInput);
      return null;
    }

    // Find the weapon by name or ID
    let weapon = actor.items.get(weaponNameOrId);
    if (!weapon) {
      weapon = actor.items.find(i => i.name === weaponNameOrId);
    }
    
    if (!weapon) {
      console.error('Mage Hand | Cannot find weapon:', weaponNameOrId);
      return null;
    }
    
    // Validate this is a weapon
    if (weapon.type !== 'weapon') {
      console.error(`Mage Hand | Item ${weapon.name} is not a weapon (type: ${weapon.type})`);
      return null;
    }
    
    console.log(`Mage Hand | Weapon attack: ${weapon.name}`);
    
    try {
      // Use the generic attack roll method
      const result = await this.performAttackRoll(actor, weapon, mode);
      
      // Add weapon-specific context
      if (result) {
        result.actionType = 'weapon-attack';
        result.weaponType = weapon.system?.weaponType || 'unknown';
        result.properties = weapon.system?.properties || {};
      }
      
      return result;
    } catch (error) {
      console.error('Mage Hand | Error with weapon attack:', error);
      return null;
    }
  }

  /**
   * Roll weapon damage
   * @param {string} actorInput - Actor name or ID
   * @param {string} weaponNameOrId - Weapon name or ID
   * @param {boolean} isCritical - Whether this is a critical hit
   * @param {string} messageId - Optional message ID from attack roll
   * @returns {Promise<Object>} Weapon damage roll result
   */
  async weaponDamage(actorInput, weaponNameOrId, isCritical = false, messageId = null) {
    const actor = this.resolveActor(actorInput);
    if (!actor) {
      console.error('Mage Hand | Cannot find actor:', actorInput);
      return null;
    }

    // Find the weapon by name or ID
    let weapon = actor.items.get(weaponNameOrId);
    if (!weapon) {
      weapon = actor.items.find(i => i.name === weaponNameOrId);
    }
    
    if (!weapon) {
      console.error('Mage Hand | Cannot find weapon:', weaponNameOrId);
      return null;
    }
    
    // Validate this is a weapon
    if (weapon.type !== 'weapon') {
      console.error(`Mage Hand | Item ${weapon.name} is not a weapon (type: ${weapon.type})`);
      return null;
    }
    
    console.log(`Mage Hand | Rolling weapon damage: ${weapon.name}`);
    
    try {
      // Use the generic damage roll method
      const result = await this.performDamageRoll(actor, weapon, isCritical, messageId);
      
      // Add weapon-specific context
      if (result) {
        result.actionType = 'weapon-damage';
        result.weaponType = weapon.system?.weaponType || 'unknown';
        result.properties = weapon.system?.properties || {};
      }
      
      return result;
    } catch (error) {
      console.error('Mage Hand | Error rolling weapon damage:', error);
      return null;
    }
  }

  /**
   * Use an item with an attack activity (generic items that aren't weapons/spells)
   * @param {string} actorInput - Actor name or ID
   * @param {string} itemNameOrId - Item name or ID
   * @param {string} mode - Roll mode (normal, advantage, disadvantage)
   * @returns {Promise<Object>} Item attack roll result
   */
  async itemAttack(actorInput, itemNameOrId, mode = 'normal') {
    const actor = this.resolveActor(actorInput);
    if (!actor) {
      console.error('Mage Hand | Cannot find actor:', actorInput);
      return null;
    }

    // Find the item by name or ID
    let item = actor.items.get(itemNameOrId);
    if (!item) {
      item = actor.items.find(i => i.name === itemNameOrId);
    }
    
    if (!item) {
      console.error('Mage Hand | Cannot find item:', itemNameOrId);
      return null;
    }
    
    console.log(`Mage Hand | Item attack: ${item.name} (type: ${item.type})`);
    
    try {
      // Use the generic attack roll method
      const result = await this.performAttackRoll(actor, item, mode);
      
      // Add item-specific context
      if (result) {
        result.actionType = 'item-attack';
        result.itemType = item.type;
      }
      
      return result;
    } catch (error) {
      console.error('Mage Hand | Error with item attack:', error);
      return null;
    }
  }

  /**
   * Roll item damage (generic items that aren't weapons/spells)
   * @param {string} actorInput - Actor name or ID
   * @param {string} itemNameOrId - Item name or ID
   * @param {boolean} isCritical - Whether this is a critical hit
   * @param {string} messageId - Optional message ID from attack roll
   * @returns {Promise<Object>} Item damage roll result
   */
  async itemDamage(actorInput, itemNameOrId, isCritical = false, messageId = null) {
    const actor = this.resolveActor(actorInput);
    if (!actor) {
      console.error('Mage Hand | Cannot find actor:', actorInput);
      return null;
    }

    // Find the item by name or ID
    let item = actor.items.get(itemNameOrId);
    if (!item) {
      item = actor.items.find(i => i.name === itemNameOrId);
    }
    
    if (!item) {
      console.error('Mage Hand | Cannot find item:', itemNameOrId);
      return null;
    }
    
    console.log(`Mage Hand | Rolling item damage: ${item.name} (type: ${item.type})`);
    
    try {
      // Use the generic damage roll method
      const result = await this.performDamageRoll(actor, item, isCritical, messageId);
      
      // Add item-specific context
      if (result) {
        result.actionType = 'item-damage';
        result.itemType = item.type;
      }
      
      return result;
    } catch (error) {
      console.error('Mage Hand | Error rolling item damage:', error);
      return null;
    }
  }

  /**
   * Click a button in a chat message and capture any resulting roll
   * @param {string} messageId - The ID of the chat message
   * @param {string} action - The action of the button to click (e.g., "attack", "damage")
   * @returns {Object|boolean} Roll result object if a roll was made, true if clicked without roll, false if failed
   */
  async clickChatButton(messageId, action) {
    // Get the message
    const message = game.messages.get(messageId);
    if (!message) {
      console.error(`Mage Hand | Cannot find message with ID: ${messageId}`);
      return false;
    }
    
    // Try to get the message element from the DOM
    let messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    
    // If not in DOM, try to get it from the message's rendered element
    if (!messageElement && message._element) {
      messageElement = message._element[0];
    }
    
    if (!messageElement) {
      console.error(`Mage Hand | Cannot find message element in DOM for ID: ${messageId}`);
      return false;
    }
    
    // Find the button with the specified action
    const button = messageElement.querySelector(`button[data-action="${action}"]`) ||
                   messageElement.querySelector(`.rollable[data-action="${action}"]`);
    
    if (!button) {
      console.error(`Mage Hand | Cannot find button with action "${action}" in message ${messageId}`);
      return false;
    }
    
    console.log(`Mage Hand | Clicking button with action "${action}" in message ${messageId}`);
    
    // Get the actor from the original message
    const actor = game.actors.get(message.speaker?.actor);
    if (!actor) {
      console.warn('Mage Hand | Cannot determine actor from message');
    }
    
    // Set up a promise to capture any roll result
    let rollResolve;
    let rollPromise = new Promise(resolve => {
      rollResolve = resolve;
    });
    
    // Set up one-time hook to capture any created chat message with a roll
    const hookId = Hooks.once('createChatMessage', (newMessage) => {
      // Check if this message is from the same actor and has rolls
      if (newMessage.speaker?.actor === message.speaker?.actor && newMessage.rolls?.length > 0) {
        const roll = newMessage.rolls[0];
        
        // Build clean parts array (same format as ability checks)
        const parts = [];
        let nextOperator = '+';
        
        if (roll.terms) {
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
              nextOperator = '+';
            } else if (term.class === 'NumericTerm' || term.constructor.name === 'NumericTerm') {
              const value = nextOperator === '-' ? -term.number : term.number;
              parts.push({
                type: 'modifier',
                value: value,
                operator: nextOperator
              });
              nextOperator = '+';
            } else if (term.class === 'OperatorTerm' || term.constructor.name === 'OperatorTerm') {
              nextOperator = term.operator || term.value || '+';
            }
          }
        }
        
        // Rebuild clean formula
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
        
        // Parse the roll into standard format matching ability/skill checks
        const rollData = {
          total: roll.total,
          formula: cleanFormula.trim(),
          originalFormula: roll.formula,
          dice: roll.dice?.map(d => ({
            faces: d.faces,
            results: d.results?.map(r => r.result),
            total: d.total
          })) || [],
          parts: parts,
          // Damage rolls typically don't have advantage/disadvantage
          advantage: false,
          disadvantage: false,
          // Check for max damage (all dice rolled max)
          critical: roll.dice?.every(d => d.results?.every(r => r.result === d.faces)) || false,
          fumble: roll.dice?.[0]?.results?.some(r => r.result === 1) || false,
          type: 'damage',  // This is typically a damage roll from button click
          actorId: actor?.id,
          actorName: actor?.name,
          timestamp: Date.now()
        };
        
        rollResolve(rollData);
      } else {
        rollResolve(null);
      }
    });
    
    // Create and dispatch a click event
    const clickEvent = new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true
    });
    
    button.dispatchEvent(clickEvent);
    
    // Wait briefly for a roll result
    const rollResult = await Promise.race([
      rollPromise,
      new Promise(resolve => setTimeout(() => resolve(null), 1000))
    ]);
    
    // Clean up hook if still active
    Hooks.off('createChatMessage', hookId);
    
    if (rollResult) {
      console.log(`Mage Hand | Captured roll from button click: ${rollResult.formula} = ${rollResult.total}`);
      return rollResult;
    }
    
    // No roll was created, just return true for successful click
    return true;
  }
}