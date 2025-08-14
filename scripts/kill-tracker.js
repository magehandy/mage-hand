/**
 * Kill Tracker for Mage Hand Module
 * Tracks when player characters defeat enemies
 */

import { logger } from './utils/logger.js';

export class KillTracker {
  constructor(websocketHandler) {
    // Store reference to websocket handler
    this.websocketHandler = websocketHandler;
    
    // Track kills by player character
    this.kills = [];
    this.maxKills = 100;
    
    this.log = logger.child('KillTracker');
    this.log.verbose('Kill tracker initialized');
  }

  /**
   * Initialize kill tracking hooks
   */
  init() {
    // Track when combatant is marked as defeated
    Hooks.on('updateCombatant', this.onUpdateCombatant.bind(this));
    
    this.log.verbose('Kill tracking hooks registered');
  }

  /**
   * Hook: Combatant updated - check for defeated status
   */
  onUpdateCombatant(combatant, changes, options, userId) {
    // Check if combatant was marked as defeated
    if (!changes.defeated) return;
    
    this.log.debug('Combatant defeated:', {
      combatant: combatant.name,
      actor: combatant.actor?.name,
      defeated: changes.defeated,
      userId
    });
    
    // Track the kill
    this.trackDefeat(combatant, userId);
  }

  /**
   * Track a defeat/kill
   */
  trackDefeat(defeatedCombatant, userId) {
    // Get the defeated actor
    const defeatedActor = defeatedCombatant.actor;
    if (!defeatedActor) {
      this.log.debug('Defeated combatant has no actor');
      return;
    }
    
    // Only track NPC/monster defeats
    if (defeatedActor.type !== 'npc') {
      this.log.debug('Defeated actor is not an NPC:', defeatedActor.type);
      return;
    }
    
    // Get current combat
    const combat = game.combat;
    if (!combat || !combat.started) {
      this.log.debug('Defeat marked outside of active combat');
      return;
    }
    
    // Get the combatant whose turn it is (the one who likely got the kill)
    const currentCombatant = combat.current?.combatantId ? 
                            combat.combatants.get(combat.current.combatantId) : 
                            null;
    
    if (!currentCombatant) {
      this.log.debug('No active combatant found');
      return;
    }
    
    // Edge case: If the defeated combatant IS the current combatant,
    // they died on their own turn (likely from AoE, poison, etc.)
    // We can't easily attribute this kill to anyone
    if (defeatedCombatant.id === currentCombatant.id) {
      this.log.verbose('Combatant died on their own turn (likely from lingering effect), not tracking kill');
      return;
    }
    
    // Check if current combatant is a player character
    const currentActor = currentCombatant.actor;
    if (!currentActor || currentActor.type !== 'character') {
      this.log.debug('Current turn is not a player character:', currentActor?.type);
      return;
    }
    
    // Check if the current actor belongs to a player (not just GM)
    const isPlayerOwned = currentActor.hasPlayerOwner;
    if (!isPlayerOwned) {
      this.log.debug('Current character is not player-owned');
      return;
    }
    
    // Record the kill
    const killEvent = {
      timestamp: Date.now(),
      killer: {
        id: currentActor.id,
        name: currentActor.name,
        player: currentActor.ownership
      },
      victim: {
        id: defeatedActor.id,
        name: defeatedActor.name,
        type: this.getCreatureType(defeatedActor),
        cr: defeatedActor.system.details?.cr || 0,
        xp: defeatedActor.system.details?.xp?.value || 0
      },
      combat: {
        id: combat.id,
        round: combat.round,
        turn: combat.turn
      }
    };
    
    // Add to kills list
    this.kills.unshift(killEvent);
    if (this.kills.length > this.maxKills) {
      this.kills.pop();
    }
    
    this.log.info('KILL TRACKED:', {
      killer: killEvent.killer.name,
      victim: `${killEvent.victim.name} (${killEvent.victim.type})`,
      cr: killEvent.victim.cr,
      xp: killEvent.victim.xp
    });
    
    // Emit custom hook for other modules
    Hooks.callAll('mageHand.killTracked', killEvent);
    
    // Send to connected mobile app
    this.sendKillToMobile(killEvent);
  }

  /**
   * Get creature type from actor
   */
  getCreatureType(actor) {
    // Try to get creature type from system data
    const type = actor.system.details?.type?.value || 
                actor.system.details?.type || 
                'Unknown';
    
    // If it's an object with subtype, format it nicely
    if (typeof type === 'object' && type.value) {
      const baseType = type.value;
      const subtype = type.subtype;
      return subtype ? `${baseType} (${subtype})` : baseType;
    }
    
    return type;
  }

  /**
   * Send kill event to mobile app
   */
  sendKillToMobile(killEvent) {
    if (!this.websocketHandler) return;
    
    const message = {
      type: 'PLAY:KILL:TRACKED',
      actorId: killEvent.killer.id,  // Required for relay routing
      kill: {
        killerName: killEvent.killer.name,
        killerId: killEvent.killer.id,
        victimName: killEvent.victim.name,
        victimType: killEvent.victim.type,
        cr: killEvent.victim.cr,
        xp: killEvent.victim.xp,
        timestamp: killEvent.timestamp
      }
    };
    
    // Use sendActorMessage which handles all the filtering
    const sent = this.websocketHandler.sendActorMessage(message);
    if (sent) {
      this.log.verbose('Kill event sent to mobile');
    } else {
      this.log.debug('Kill event not sent (actor not on mobile or not connected)');
    }
  }

  /**
   * Get recent kills
   */
  getRecentKills(limit = 10) {
    return this.kills.slice(0, limit);
  }

  /**
   * Get kills by character
   */
  getKillsByCharacter(characterId) {
    return this.kills.filter(k => k.killer.id === characterId);
  }

  /**
   * Get kill statistics
   */
  getKillStats() {
    const stats = {};
    
    for (const kill of this.kills) {
      const killerId = kill.killer.id;
      if (!stats[killerId]) {
        stats[killerId] = {
          name: kill.killer.name,
          kills: 0,
          totalXP: 0,
          types: {}
        };
      }
      
      stats[killerId].kills++;
      stats[killerId].totalXP += kill.victim.xp;
      
      // Track creature types killed
      const type = kill.victim.type;
      stats[killerId].types[type] = (stats[killerId].types[type] || 0) + 1;
    }
    
    return stats;
  }

  /**
   * Clear tracking data
   */
  clear() {
    this.kills = [];
    this.log.info('Kill tracking cleared');
  }
}