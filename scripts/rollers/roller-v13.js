/**
 * Roller for Foundry v13 with D&D5e v5.x
 * Uses same API as v4.x (new method names and object-based parameters)
 */

import { BaseRoller } from './base-roller.js';
import { RollParser } from '../utils/roll-parser.js';

export class RollerV13 extends BaseRoller {
  constructor() {
    super();
    this.version = 'v13-dnd5e-v5';
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
    } else {
      throw new Error('rollAbilityCheck not available on actor');
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
    } else {
      throw new Error('rollSavingThrow not available on actor');
    }
  }

  async performSkillCheck(actor, skill, mode) {
    const event = this.createEvent(mode);
    const { advantage, disadvantage } = this.parseAdvantage(event);
    const speaker = this.getSpeaker(actor);
    
    // D&D5e v5.x reverted back to rollSkill
    if (actor.rollSkill) {
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
    } else if (actor.rollSkillCheck) {
      // Fallback just in case
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
    } else {
      throw new Error('rollSkill/rollSkillCheck not available on actor');
    }
  }

  async performItemUse(actor, item, mode) {
    const event = this.createEvent(mode);
    const { advantage, disadvantage } = this.parseAdvantage(event);
    
    // Check if item can be used
    if (!item.use) {
      console.error(`Mage Hand | Item ${item.name} cannot be used`);
      throw new Error(`Item ${item.name} cannot be used`);
    }

    console.log(`Mage Hand | Using item ${item.name} for ${actor.name}`);
    
    // Check for Ready Set Roll module
    const rsrActive = game.modules.get('ready-set-roll-5e')?.active;
    if (rsrActive) {
      console.log('Mage Hand | Ready Set Roll detected - using quickRoll flag');
    }
    
    // Set up promises to capture both chat messages
    let cardMessageResolve, rollMessageResolve;
    const cardMessagePromise = new Promise(resolve => {
      cardMessageResolve = resolve;
    });
    const rollMessagePromise = new Promise(resolve => {
      rollMessageResolve = resolve;
    });
    
    let cardMessage = null;
    let messagesReceived = 0;
    
    // Set up hook to capture the created chat messages
    const hookId = Hooks.on('createChatMessage', (message) => {
      // Check if this message is from our actor
      if (message.speaker?.actor === actor.id) {
        messagesReceived++;
        
        // First message should be the item card with buttons
        if (!cardMessage && !message.rolls?.length) {
          cardMessage = message;
          cardMessageResolve(message);
          console.log(`Mage Hand | Captured item card message: ${message.id}`);
        }
        // Second message should be the attack roll
        else if (cardMessage && message.rolls?.length > 0) {
          // Verify this roll is from our item use
          if (message.flags?.dnd5e?.originatingMessage === cardMessage.id) {
            rollMessageResolve(message);
            console.log(`Mage Hand | Captured attack roll message: ${message.id}`);
            // Remove the hook after getting both messages
            Hooks.off('createChatMessage', hookId);
          }
        }
      }
    });
    
    // D&D5e v5.x item.use() configuration
    const usageConfig = {
      legacy: false,
      createMessage: true,
      event: event,  // Pass the event with modifier keys
      advantage: advantage,
      disadvantage: disadvantage
    };
    
    const dialogConfig = {
      configure: false,   // Skip dialog
      skipDialog: true    // Additional flag to skip all dialogs
    };
    
    // If Ready Set Roll (RSR) is installed, we need to provide flags to ensure automatic rolls
    // RSR normally suppresses automatic attack rolls, but quickRoll flag bypasses this
    const messageConfig = game.modules.get('ready-set-roll-5e')?.active ? {
      flags: {
        rsr5e: {
          quickRoll: true  // Forces RSR to roll automatically without its custom behavior
        }
      }
    } : {};
    
    // Use the item with all three config objects
    const result = await item.use(usageConfig, dialogConfig, messageConfig);
    
    // Wait for the card message
    const itemCardMessage = await Promise.race([
      cardMessagePromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout waiting for item card message')), 5000)
      )
    ]).catch(err => {
      Hooks.off('createChatMessage', hookId);
      console.warn('Mage Hand | Could not capture item card message:', err);
      return null;
    });
    
    // Parse buttons from the card message
    let buttons = [];
    if (itemCardMessage) {
      buttons = this.parseChatButtons(itemCardMessage);
    }
    
    // Wait briefly for the roll message (if there is one)
    let rollMessage = null;
    let rollData = null;
    
    if (itemCardMessage) {
      rollMessage = await Promise.race([
        rollMessagePromise,
        new Promise(resolve => setTimeout(() => resolve(null), 2000))
      ]);
      
      // Extract roll data if we got a roll message
      if (rollMessage && rollMessage.rolls?.length > 0) {
        const roll = rollMessage.rolls[0];
        
        // Parse roll into standard format using utility
        rollData = RollParser.parseRoll(roll, 'attack');
        rollData.itemName = item.name;
        rollData.actorId = actor.id;
        rollData.actorName = actor.name;
        
        console.log(`Mage Hand | Extracted attack roll: ${rollData.formula} = ${rollData.total}`);
        
        // Check if the item's first activity is an attack activity
        // In D&D5e v4+, items have an activities collection
        let firstActivityIsAttack = false;
        if (item.system?.activities) {
          // Get the first activity
          const firstActivity = item.system.activities.contents?.[0] || 
                               Array.from(item.system.activities.values())[0];
          if (firstActivity?.type === 'attack') {
            firstActivityIsAttack = true;
            console.log(`Mage Hand | First activity is attack type, removing Attack button`);
          }
        }
        
        // Only remove "attack" button if we confirmed the first activity is an attack
        if (firstActivityIsAttack) {
          const beforeCount = buttons.length;
          buttons = buttons.filter(b => {
            // Check both action and label case-insensitively
            const actionLower = b.action?.toLowerCase() || '';
            const labelLower = b.label?.toLowerCase() || '';
            return actionLower !== 'attack' && labelLower !== 'attack';
          });
          console.log(`Mage Hand | Filtered buttons: removed ${beforeCount - buttons.length} attack button(s)`);
          console.log(`Mage Hand | Remaining buttons: ${buttons.map(b => `${b.label}(${b.action})`).join(', ')}`);
        }
      }
    }
    
    // Clean up hook if still active
    Hooks.off('createChatMessage', hookId);
    
    return {
      messageId: itemCardMessage?.id || null,
      buttons: buttons,
      roll: rollData  // Include roll data if available
    };
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
    
    // Configuration for the attack roll
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
   * @param {string} messageId - Optional message ID to associate with the damage roll
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
    
    // Configuration for damage roll - THIS is where we pass the critical flag
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
    
    // D&D5e v5.x uses same structure as v4.1+
    await actor.rollDeathSave(
      {
        legacy: false, // Suppress deprecation warning
        advantage: advantage,
        disadvantage: disadvantage
      },
      {
        configure: false  // Skip dialog
      },
      {
        speaker: this.getSpeaker(actor)
      }
    );
  }
}