/**
 * Roller for Foundry v12 with D&D5e v4.x
 * Uses new method names and object-based parameters
 */

import { BaseRoller } from './base-roller.js';
import { RollParser } from '../utils/roll-parser.js';

export class RollerV12 extends BaseRoller {
  constructor() {
    super();
    this.version = 'v12-dnd5e-v4';
  }

  async performAbilityTest(actor, ability, mode) {
    const event = this.createEvent(mode);
    const { advantage, disadvantage } = this.parseAdvantage(event);
    const speaker = this.getSpeaker(actor);
    
    if (actor.rollAbilityCheck) {
      await actor.rollAbilityCheck(
        {
          ability: ability,
          advantage: advantage,
          disadvantage: disadvantage
        },
        {
          configure: false,
          messageConfig: { speaker: speaker }
        }
      );
    } else if (actor.rollAbilityTest) {
      // Fallback for early v4.0
      await actor.rollAbilityTest(ability, { event, speaker });
    } else {
      throw new Error('rollAbilityCheck/rollAbilityTest not available on actor');
    }
  }

  async performAbilitySave(actor, ability, mode) {
    const event = this.createEvent(mode);
    const { advantage, disadvantage } = this.parseAdvantage(event);
    const speaker = this.getSpeaker(actor);
    
    if (actor.rollSavingThrow) {
      await actor.rollSavingThrow(
        {
          ability: ability,
          advantage: advantage,
          disadvantage: disadvantage
        },
        {
          configure: false,
          messageConfig: { speaker: speaker }
        }
      );
    } else if (actor.rollAbilitySave) {
      // Fallback for v4.0
      await actor.rollAbilitySave(
        {
          ability: ability,
          advantage: advantage,
          disadvantage: disadvantage
        },
        {
          configure: false,
          messageConfig: { speaker: speaker }
        }
      );
    } else {
      throw new Error('rollSavingThrow/rollAbilitySave not available on actor');
    }
  }

  async performSkillCheck(actor, skill, mode) {
    const event = this.createEvent(mode);
    const { advantage, disadvantage } = this.parseAdvantage(event);
    const speaker = this.getSpeaker(actor);
    
    if (actor.rollSkillCheck) {
      await actor.rollSkillCheck(
        {
          skill: skill,
          advantage: advantage,
          disadvantage: disadvantage
        },
        {
          configure: false,
          messageConfig: { speaker: speaker }
        }
      );
    } else if (actor.rollSkill) {
      // Fallback for v4.0
      await actor.rollSkill(
        {
          skill: skill,
          advantage: advantage,
          disadvantage: disadvantage
        },
        {
          configure: false,
          messageConfig: { speaker: speaker }
        }
      );
    } else {
      throw new Error('rollSkillCheck/rollSkill not available on actor');
    }
  }

  /**
   * Perform a direct attack roll using an item's activity
   * @param {Actor} actor - The actor making the attack
   * @param {Item} item - The item being used
   * @param {string} mode - Roll mode (normal, advantage, disadvantage)
   * @returns {Object} Attack roll result with critical status
   */
  async performAttackRoll(actor, item, mode) {
    const event = this.createEvent(mode);
    const { advantage, disadvantage } = this.parseAdvantage(event);
    
    // Get the first attack activity from the item
    let activity = null;
    if (item.system?.activities) {
      // Find the first attack activity
      activity = Array.from(item.system.activities.values()).find(a => a.type === 'attack');
    }
    
    if (!activity) {
      console.error(`Mage Hand | Item ${item.name} has no attack activity`);
      throw new Error(`Item ${item.name} has no attack activity`);
    }
    
    console.log(`Mage Hand | Rolling attack for ${item.name} using activity ${activity.name}`);
    
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
    
    // Configuration for the attack roll (v12/D&D5e v4.x)
    const rollConfig = {
      event: event,
      advantage: advantage,
      disadvantage: disadvantage
    };
    
    const dialogConfig = {
      configure: false
    };
    
    const messageConfig = {};
    
    // Roll the attack
    const attackRolls = await activity.rollAttack(rollConfig, dialogConfig, messageConfig);
    
    // Wait for the message
    const message = await Promise.race([
      messagePromise,
      new Promise(resolve => setTimeout(() => resolve(null), 2000))
    ]);
    
    // Clean up hook
    Hooks.off('createChatMessage', hookId);
    
    // Extract roll data
    if (attackRolls && attackRolls.length > 0) {
      const roll = attackRolls[0];
      
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
   * @param {string} messageId - Optional message ID from the attack roll
   * @returns {Object} Damage roll result
   */
  async performDamageRoll(actor, item, isCritical = false, messageId = null) {
    // Get the first activity that can roll damage
    let activity = null;
    if (item.system?.activities) {
      // Find attack activity or any activity with damage
      activity = Array.from(item.system.activities.values()).find(a => 
        a.type === 'attack' || a.damage?.parts?.length > 0
      );
    }
    
    if (!activity) {
      console.error(`Mage Hand | Item ${item.name} has no activity with damage`);
      throw new Error(`Item ${item.name} has no activity with damage`);
    }
    
    console.log(`Mage Hand | Rolling damage for ${item.name}, Critical: ${isCritical}`);
    
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
    
    // Create a mock event with the message context if we have a messageId
    let event;
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
    } else {
      // Fallback to basic event
      event = new Event('click');
    }
    
    // Configuration for damage roll - Pass the critical flag
    const rollConfig = {
      isCritical: isCritical,  // Pass critical hit information
      event: event  // Pass the event with message context
    };
    
    const dialogConfig = {
      configure: false
    };
    
    const messageConfig = {};
    
    // Roll the damage
    const damageRolls = await activity.rollDamage(rollConfig, dialogConfig, messageConfig);
    
    // Wait for the message
    const message = await Promise.race([
      messagePromise,
      new Promise(resolve => setTimeout(() => resolve(null), 2000))
    ]);
    
    // Clean up hook
    Hooks.off('createChatMessage', hookId);
    
    // Extract roll data
    if (damageRolls && damageRolls.length > 0) {
      // Use utility to combine damage rolls
      const rollData = RollParser.combineDamageRolls(damageRolls, {
        isCritical: isCritical,
        itemName: item.name,
        actorId: actor.id,
        actorName: actor.name,
        messageId: message?.id
      });
      
      console.log(`Mage Hand | Damage roll: ${rollData.formula} = ${rollData.total}`);
      return rollData;
    }
    
    return null;
  }

  async performDeathSave(actor, mode) {
    const event = this.createEvent(mode);
    const { advantage, disadvantage } = this.parseAdvantage(event);
    
    // Check if actor supports death saves
    const death = actor.system?.attributes?.death;
    if (!death) {
      console.warn(`Actors of type '${actor.type}' don't support death saves`);
      return;
    }

    // Check if actor can roll death save
    if (!actor.rollDeathSave) {
      console.warn('rollDeathSave not available on actor');
      return;
    }

    // Check current HP and death save status
    const hp = actor.system.attributes.hp;
    const currentHP = hp?.value || 0;
    const failures = death.failure || 0;
    const successes = death.success || 0;

    // Validate death save conditions - warn and return without rolling
    if (currentHP > 0) {
      console.warn(`Mage Hand | ${actor.name} has ${currentHP} HP and doesn't need death saves`);
      return;
    }
    
    if (failures >= 3) {
      console.warn(`Mage Hand | ${actor.name} has already failed 3 death saves (dead)`);
      return;
    }
    
    if (successes >= 3) {
      console.warn(`Mage Hand | ${actor.name} has already succeeded 3 death saves (stabilized)`);
      return;
    }

    console.log(`Mage Hand | Rolling death save for ${actor.name} (${successes} successes, ${failures} failures)`);
    
    // D&D5e v4.1+ uses new parameter structure for rollDeathSave
    await actor.rollDeathSave(
      {
        legacy: false, // Suppress deprecation warning in v12
        advantage: advantage,
        disadvantage: disadvantage,
      },
      {
        // advantage: advantage,
        // disadvantage: disadvantage,
        configure: false,
      },
      {
        speaker: this.getSpeaker(actor),
      }
    );
  }
}