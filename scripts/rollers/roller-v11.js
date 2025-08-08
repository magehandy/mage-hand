/**
 * Roller for Foundry v11 with D&D5e v3.x
 * Uses legacy method names and event-based parameters
 */

import { BaseRoller } from './base-roller.js';
import { RollParser } from '../utils/roll-parser.js';

export class RollerV11 extends BaseRoller {
  constructor() {
    super();
    this.version = 'v11-dnd5e-v3';
  }

  async performAbilityTest(actor, ability, mode) {
    const event = this.createEvent(mode);
    const speaker = this.getSpeaker(actor);
    
    if (actor.rollAbilityTest) {
      await actor.rollAbilityTest(ability, { 
        event, 
        speaker,
        fastForward: true  // v11 needs this to skip dialog
      });
    } else {
      throw new Error('rollAbilityTest not available on actor');
    }
  }

  async performAbilitySave(actor, ability, mode) {
    const event = this.createEvent(mode);
    const speaker = this.getSpeaker(actor);
    
    if (actor.rollAbilitySave) {
      await actor.rollAbilitySave(ability, { event, speaker });
    } else {
      throw new Error('rollAbilitySave not available on actor');
    }
  }

  async performSkillCheck(actor, skill, mode) {
    const event = this.createEvent(mode);
    const speaker = this.getSpeaker(actor);
    
    if (actor.rollSkill) {
      await actor.rollSkill(skill, { 
        event, 
        speaker,
        fastForward: true  // v11 needs this to skip dialog
      });
    } else {
      throw new Error('rollSkill not available on actor');
    }
  }

  /**
   * Perform a direct attack roll using item's rollAttack method
   * @param {Actor} actor - The actor making the attack
   * @param {Item} item - The item being used
   * @param {string} mode - Roll mode (normal, advantage, disadvantage)
   * @returns {Object} Attack roll result with critical status
   */
  async performAttackRoll(actor, item, mode) {
    const event = this.createEvent(mode);
    
    // Check if item has rollAttack method
    if (!item.rollAttack) {
      console.error(`Mage Hand | Item ${item.name} cannot make attack rolls`);
      throw new Error(`Item ${item.name} cannot make attack rolls`);
    }
    
    console.log(`Mage Hand | Rolling attack for ${item.name} (v11 direct method)`);
    
    // Set up hook to capture the chat message with the roll
    let messageResolve;
    const messagePromise = new Promise(resolve => {
      messageResolve = resolve;
    });
    
    const hookId = Hooks.once('createChatMessage', (message) => {
      if (message.speaker?.actor === actor.id && message.rolls?.length > 0) {
        messageResolve(message);
      }
    });
    
    // Roll the attack using v11's direct method
    const options = {
      event: event,
      fastForward: true  // Skip dialog
    };
    
    const roll = await item.rollAttack(options);
    
    // Wait for the message
    const message = await Promise.race([
      messagePromise,
      new Promise(resolve => setTimeout(() => resolve(null), 2000))
    ]);
    
    // Clean up hook
    Hooks.off('createChatMessage', hookId);
    
    // Extract roll data
    if (roll) {
      // Parse into our standard format
      const rollData = RollParser.parseRoll(roll, 'attack');
      
      // Add context
      rollData.itemName = item.name;
      rollData.actorId = actor.id;
      rollData.actorName = actor.name;
      rollData.messageId = message?.id;
      
      // Override critical detection with roll's own isCritical flag if available
      // This handles expanded crit ranges from features like Champion's Improved Critical
      if (roll.isCritical !== undefined) {
        rollData.critical = roll.isCritical;
      }
      
      console.log(`Mage Hand | Attack roll: ${rollData.formula} = ${rollData.total}, Critical: ${rollData.critical}`);
      return rollData;
    }
    
    return null;
  }

  /**
   * Perform a damage roll with optional critical hit
   * @param {Actor} actor - The actor making the damage roll
   * @param {Item} item - The item being used
   * @param {boolean} isCritical - Whether this is a critical hit
   * @param {string} messageId - Optional message ID to associate with the damage roll
   * @returns {Object} Damage roll result
   */
  async performDamageRoll(actor, item, isCritical = false, messageId = null) {
    // Check if item has rollDamage method
    if (!item.rollDamage) {
      console.error(`Mage Hand | Item ${item.name} cannot roll damage`);
      throw new Error(`Item ${item.name} cannot roll damage`);
    }
    
    console.log(`Mage Hand | Rolling damage for ${item.name}, Critical: ${isCritical} (v11 direct method)`);
    
    // Set up hook to capture the chat message
    let messageResolve;
    const messagePromise = new Promise(resolve => {
      messageResolve = resolve;
    });
    
    const hookId = Hooks.once('createChatMessage', (message) => {
      if (message.speaker?.actor === actor.id && message.rolls?.length > 0) {
        messageResolve(message);
      }
    });
    
    // Create event - v11 might need this for context
    let event = null;
    if (messageId) {
      // Create a fake event that includes the message ID in the expected format
      const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
      event = {
        type: 'click',
        target: messageElement || {
          closest: (selector) => {
            if (selector === '[data-message-id]') {
              return { dataset: { messageId: messageId } };
            }
            return null;
          }
        },
        preventDefault: () => {},
        stopPropagation: () => {}
      };
    }
    
    // Roll the damage using v11's direct method with parameters
    const roll = await item.rollDamage({
      critical: isCritical,  // v11 uses 'critical' instead of 'isCritical'
      event: event,
      spellLevel: null,
      versatile: false,
      options: {
        fastForward: true  // Skip dialog
      }
    });
    
    // Wait for the message
    const message = await Promise.race([
      messagePromise,
      new Promise(resolve => setTimeout(() => resolve(null), 2000))
    ]);
    
    // Clean up hook
    Hooks.off('createChatMessage', hookId);
    
    // Extract roll data
    if (roll) {
      // v11 returns a single Roll object for damage
      const rollData = RollParser.parseRoll(roll, 'damage');
      
      // Override critical flag with our input
      rollData.critical = isCritical;
      
      // Add context
      rollData.itemName = item.name;
      rollData.actorId = actor.id;
      rollData.actorName = actor.name;
      rollData.messageId = message?.id;
      
      console.log(`Mage Hand | Damage roll: ${rollData.formula} = ${rollData.total}, Critical: ${rollData.critical}`);
      if (rollData.damageByType) {
        console.log(`Mage Hand | Damage by type:`, rollData.damageByType);
      }
      return rollData;
    }
    
    return null;
  }
}