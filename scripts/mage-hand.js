import { ExtractorFactory } from './extractors/extractor-factory.js';
import { RollerFactory } from './rollers/roller-factory.js';
import { deepDiff } from './utils/deep-diff.js';
import { SchemaRegistry } from './schemas/schema-registry.js';
import { WebSocketHandler } from './websocket-handler.js';
import { UIFactory } from './ui/ui-factory.js';
import { KillTracker } from './kill-tracker.js';
import { logger } from './utils/logger.js';

class MageHand {
  constructor() {
    this.moduleId = 'mage-hand';
    this.websocketHandler = null;
    this.sessionCode = null;
    this.characterData = new Map();
    this.lastSync = new Map();
    this.extractor = null;
    this.roller = null;
    this.ui = null;
    this.killTracker = null;
  }

  init() {
    logger.info(`Initializing module v${game.modules.get(this.moduleId).version}`);
    logger.info(`Schema version: v${SchemaRegistry.CURRENT_VERSION} (${SchemaRegistry.getCurrentSchema().name})`);
    this.registerSettings();
    this.detectVersions();
  }

  async ready() {
    logger.info('Module ready');
    this.extractor = ExtractorFactory.getExtractor();
    logger.verbose(`Using extractor: ${this.extractor.version}`);
    this.roller = RollerFactory.getInstance();
    logger.verbose(`Using roller: ${this.roller.version}`);
    this.websocketHandler = new WebSocketHandler(this);
    
    // Initialize UI
    this.ui = await UIFactory.getInstance();
    this.ui.init(this);
    
    // Initialize kill tracker with websocket handler
    this.killTracker = new KillTracker(this.websocketHandler);
    this.killTracker.init();
    
    this.registerHooks();
    this.registerUIHooks();
    
    // Check for saved session in user flags
    const session = game.user.getFlag(this.moduleId, 'session');
    if (session?.valid && session?.code) {
      // Auto-reconnect if session is less than 24 hours old
      const sessionAge = Date.now() - (session.timestamp || 0);
      if (sessionAge < 86400000) { // 24 hours in milliseconds
        logger.info('Auto-reconnecting to saved session');
        this.connect(session.code);
      } else {
        // Session too old, clear it
        await game.user.unsetFlag(this.moduleId, 'session');
      }
    }
  }

  registerSettings() {
    // Note: Session code is now stored in user flags, not settings
    // Settings UI is replaced by the connection panel

    // Register log level setting (user-scoped)
    game.settings.register(this.moduleId, 'logLevel', {
      name: 'Log Level',
      hint: 'Control the amount of console output from Mage Hand. Debug shows everything, None disables logging.',
      scope: 'user',       // Each user can set their own log level
      config: true,        // Show in settings UI
      type: Number,
      default: 2,          // Default to INFO level
      choices: {
        0: 'Debug - All messages',
        1: 'Verbose - Detailed info',
        2: 'Info - Important events only',
        3: 'Warning - Warnings and errors',
        4: 'Error - Errors only',
        5: 'None - No logging'
      }
    });

    // Register schema version as read-only (not shown in config UI)
    game.settings.register(this.moduleId, 'schemaVersion', {
      name: 'Schema Version',
      hint: 'Current data schema version used by the module',
      scope: 'world',
      config: false,  // Not shown in settings UI
      type: Number,
      default: SchemaRegistry.CURRENT_VERSION,
      restricted: true,  // Only GM can change (though it's hidden anyway)
      onChange: () => {
        // Reset to correct version if somehow changed
        if (game.settings.get(this.moduleId, 'schemaVersion') !== SchemaRegistry.CURRENT_VERSION) {
          console.warn('Mage Hand | Schema version was modified externally, resetting to correct value');
          game.settings.set(this.moduleId, 'schemaVersion', SchemaRegistry.CURRENT_VERSION);
        }
      }
    });
  }

  registerUIHooks() {
    // Inject button into settings sidebar
    Hooks.on('renderSidebarTab', (app, html, data) => {
      logger.debug('renderSidebarTab hook fired', app.tabName, app.id, app);
      // Check various ways the settings tab might be identified
      if (app.tabName === 'settings' || app.id === 'settings' || app.options?.id === 'settings') {
        logger.debug('Injecting button into settings tab');
        this.ui.injectSettingsButton(html);
      }
    });
    
    // Alternative hook for Settings specifically
    Hooks.on('renderSettings', (app, html, data) => {
      logger.debug('renderSettings hook fired');
      this.ui.injectSettingsButton(html);
    });
    
    // Also hook into collapseSidebar for when sidebar state changes
    Hooks.on('collapseSidebar', (app, collapsed) => {
      // Wait a bit for the DOM to update after sidebar state change
      setTimeout(() => {
        const settingsTab = document.querySelector('#sidebar .tab[data-tab="settings"]');
        if (settingsTab && settingsTab.classList.contains('active')) {
          const html = $(settingsTab);
          this.ui.injectSettingsButton(html);
        }
      }, 100);
    });
  }

  registerHooks() {
    Hooks.on('updateActor', (actor, changes, options, userId) => {
      logger.debug('Actor updated:', actor.name);
      if (this.shouldSync(actor, userId)) {
        this.handleActorUpdate(actor, changes);
      }
    });

    Hooks.on('updateItem', (item, changes, options, userId) => {
      logger.debug('Item updated:', item.name);
      const actor = item.parent;
      if (actor && this.shouldSync(actor, userId)) {
        this.handleItemUpdate(actor, item, changes);
      }
    });

    Hooks.on('createActiveEffect', (effect, options, userId) => {
      console.log('Mage Hand | Effect created:', effect.name);
      const actor = effect.parent;
      if (actor && this.shouldSync(actor, userId)) {
        this.handleEffectChange(actor, effect, 'create');
      }
    });

    Hooks.on('updateActiveEffect', (effect, changes, options, userId) => {
      console.log('Mage Hand | Effect updated:', effect.name);
      const actor = effect.parent;
      if (actor && this.shouldSync(actor, userId)) {
        this.handleEffectChange(actor, effect, 'update');
      }
    });

    Hooks.on('deleteActiveEffect', (effect, options, userId) => {
      console.log('Mage Hand | Effect deleted:', effect.name);
      const actor = effect.parent;
      if (actor && this.shouldSync(actor, userId)) {
        this.handleEffectChange(actor, effect, 'delete');
      }
    });

    Hooks.on('combatStart', (combat, updateData) => {
      console.log('Mage Hand | Combat started');
      this.handleCombatChange(combat, 'start');
    });

    Hooks.on('combatTurn', (combat, updateData, updateOptions) => {
      console.log('Mage Hand | Combat turn changed');
      this.handleCombatChange(combat, 'turn');
    });

    Hooks.on('combatEnd', (combat, updateData) => {
      console.log('Mage Hand | Combat ended');
      this.handleCombatChange(combat, 'end');
    });

    Hooks.on('createCombatant', (combatant, options, userId) => {
      console.log(`Mage Hand | Combat has started for Actor ${combatant.name} (${combatant.actorId})`);
      // Additional handling can be added here
    });
  }

  detectVersions() {
    const foundryVersion = game.version;
    const dnd5eVersion = game.system.version;
    
    logger.verbose(`Foundry VTT: v${foundryVersion}`);
    logger.verbose(`D&D 5e System: v${dnd5eVersion}`);
    
    this.foundryMajor = parseInt(foundryVersion.split('.')[0]);
    this.dnd5eMajor = parseInt(dnd5eVersion.split('.')[0]);
    this.dnd5eMinor = parseInt(dnd5eVersion.split('.')[1]);
  }

  shouldSync(actor, userId) {
    if (!this.websocketHandler || !this.websocketHandler.isConnected()) return false;
    if (userId !== game.userId) return false;
    if (actor.type !== 'character') return false;
    
    const isOwner = actor.testUserPermission(game.user, 'OWNER');
    return isOwner;
  }

  connect(sessionCode) {
    logger.info(`Connecting with session code: ${sessionCode}`);
    
    if (!this.websocketHandler) {
      logger.error('WebSocket handler not initialized');
      return;
    }
    
    this.sessionCode = sessionCode;
    this.websocketHandler.connect(sessionCode);
  }

  disconnect() {
    logger.info('Disconnecting');
    if (this.websocketHandler) {
      this.websocketHandler.disconnect();
    }
    this.sessionCode = null;
    
    // Notify UI of disconnection
    if (this.ui) {
      this.ui.onConnectionStateChange('disconnected');
    }
  }

  handleActorUpdate(actor, changes) {
    console.log(`Mage Hand | Processing actor update for ${actor.name}`);
    
    try {
      const extractedData = this.extractor.extractCharacterData(actor);
      if (!extractedData) {
        console.warn(`Mage Hand | Failed to extract data for ${actor.name}`);
        return;
      }
      
      const lastData = this.characterData.get(actor.id);
      this.characterData.set(actor.id, extractedData);
      
      if (lastData) {
        const diff = deepDiff(lastData, extractedData);
        if (diff && Object.keys(diff).length > 0) {
          this.sendUpdate(actor.id, diff);
        }
      } else {
        this.sendFullSync(actor.id, extractedData);
      }
    } catch (error) {
      console.error(`Mage Hand | Error processing actor update:`, error);
    }
  }
  
  sendUpdate(actorId, diff) {
    if (!this.websocketHandler || !this.websocketHandler.isConnected()) return;
    
    console.log(`Mage Hand | Sending diff update for actor ${actorId}:`, diff);
    this.websocketHandler.sendCharacterUpdate(actorId, diff);
  }
  
  sendFullSync(actorId, data) {
    if (!this.websocketHandler || !this.websocketHandler.isConnected()) return;
    
    console.log(`Mage Hand | Sending full sync for actor ${actorId}`);
    const actor = game.actors.get(actorId);
    if (actor) {
      this.websocketHandler.sendCharacterData(actor);
    }
  }

  handleItemUpdate(actor, item, changes) {
    console.log(`Mage Hand | Processing item update for ${item.name} on ${actor.name}`);
    this.handleActorUpdate(actor, changes);
  }

  handleEffectChange(actor, effect, changeType) {
    console.log(`Mage Hand | Processing effect ${changeType} for ${effect.name} on ${actor.name}`);
    this.handleActorUpdate(actor, {});
  }

  handleCombatChange(combat, changeType) {
    console.log(`Mage Hand | Processing combat ${changeType}`);
    
    if (combat && combat.combatants) {
      combat.combatants.forEach(combatant => {
        if (combatant.actor && this.shouldSync(combatant.actor, game.userId)) {
          this.handleActorUpdate(combatant.actor, {});
        }
      });
    }
  }

  // Public API methods for rolling
  async rollAbilityTest(actorNameOrId, ability, mode = 'normal') {
    return this.roller.rollAbilityTest(actorNameOrId, ability, mode);
  }

  async rollAbilitySave(actorNameOrId, ability, mode = 'normal') {
    return this.roller.rollAbilitySave(actorNameOrId, ability, mode);
  }

  async rollSkillCheck(actorNameOrId, skill, mode = 'normal') {
    return this.roller.rollSkillCheck(actorNameOrId, skill, mode);
  }

  async rollInitiative(actorNameOrId, mode = 'normal') {
    return this.roller.rollInitiative(actorNameOrId, mode);
  }

  async rollDeathSave(actorNameOrId, mode = 'normal') {
    return this.roller.rollDeathSave(actorNameOrId, mode);
  }

  async useItem(actorNameOrId, itemNameOrId, mode = 'normal') {
    return this.roller.useItem(actorNameOrId, itemNameOrId, mode);
  }

  async rollAttack(actorNameOrId, itemNameOrId, mode = 'normal') {
    return this.roller.rollAttack(actorNameOrId, itemNameOrId, mode);
  }

  async rollDamage(actorNameOrId, itemNameOrId, isCritical = false, messageId = null) {
    return this.roller.rollDamage(actorNameOrId, itemNameOrId, isCritical, messageId);
  }

  async clickChatButton(messageId, action) {
    return this.roller.clickChatButton(messageId, action);
  }

  // Dedicated spell casting methods
  async castSpellAttack(actorNameOrId, spellNameOrId, mode = 'normal') {
    return this.roller.castSpellAttack(actorNameOrId, spellNameOrId, mode);
  }

  async castSpellDamage(actorNameOrId, spellNameOrId, isCritical = false, messageId = null) {
    return this.roller.castSpellDamage(actorNameOrId, spellNameOrId, isCritical, messageId);
  }

  // Dedicated weapon attack methods
  async weaponAttack(actorNameOrId, weaponNameOrId, mode = 'normal') {
    return this.roller.weaponAttack(actorNameOrId, weaponNameOrId, mode);
  }

  async weaponDamage(actorNameOrId, weaponNameOrId, isCritical = false, messageId = null) {
    return this.roller.weaponDamage(actorNameOrId, weaponNameOrId, isCritical, messageId);
  }

  // Dedicated generic item methods (for items that aren't weapons/spells)
  async itemAttack(actorNameOrId, itemNameOrId, mode = 'normal') {
    return this.roller.itemAttack(actorNameOrId, itemNameOrId, mode);
  }

  async itemDamage(actorNameOrId, itemNameOrId, isCritical = false, messageId = null) {
    return this.roller.itemDamage(actorNameOrId, itemNameOrId, isCritical, messageId);
  }

  // Public API method for character extraction
  extractCharacterData(actorNameOrId) {
    if (!this.extractor) {
      console.error('Mage Hand | Extractor not initialized');
      return null;
    }
    return this.extractor.extractCharacterData(actorNameOrId);
  }

  // Schema version methods
  getSchemaVersion() {
    return SchemaRegistry.CURRENT_VERSION;
  }

  getSchemaMetadata() {
    return SchemaRegistry.getHandshakeMetadata();
  }

  checkSchemaCompatibility(clientVersion) {
    return SchemaRegistry.checkCompatibility(clientVersion);
  }

  validateCharacterData(data) {
    return SchemaRegistry.validate(data);
  }

  // ============================================================================
  // Mobile Request Handlers
  // ============================================================================

  async handleRollRequest(message) {
    console.log('Mage Hand | Handling custom roll:', message.formula, message.label);
    try {
      // Custom roll with formula
      const roll = new Roll(message.formula);
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker(),
        flavor: message.label || 'Custom Roll'
      });
    } catch (error) {
      console.error('Mage Hand | Roll error:', error);
    }
  }

  async handleItemUse(message) {
    console.log('Mage Hand | Handling item use:', message.itemId, 'targets:', message.targetIds);
    try {
      // Get the actor from the message connection
      const actor = game.actors.get(message.actorId);
      if (!actor) {
        console.error('Mage Hand | Actor not found for item use');
        return;
      }
      
      // Use the roller to handle item use
      await this.roller.useItem(actor.id, message.itemId, 'normal');
    } catch (error) {
      console.error('Mage Hand | Item use error:', error);
    }
  }

  async handleAbilityCheck(message) {
    console.log('Mage Hand | Handling ability check:', message.ability);
    try {
      const actor = game.actors.get(message.actorId);
      if (!actor) {
        console.error('Mage Hand | Actor not found for ability check');
        return;
      }
      
      // Validate ability
      const validAbilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
      if (!validAbilities.includes(message.ability)) {
        console.error('Mage Hand | Invalid ability:', message.ability);
        return;
      }
      
      // Roll ability test
      await this.roller.rollAbilityTest(actor.id, message.ability, message.mode || 'normal');
    } catch (error) {
      console.error('Mage Hand | Ability check error:', error);
    }
  }

  async handleAbilitySave(message) {
    console.log('Mage Hand | Handling ability save:', message.ability);
    try {
      const actor = game.actors.get(message.actorId);
      if (!actor) {
        console.error('Mage Hand | Actor not found for ability save');
        return;
      }
      
      // Validate ability
      const validAbilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
      if (!validAbilities.includes(message.ability)) {
        console.error('Mage Hand | Invalid ability:', message.ability);
        return;
      }
      
      // Roll ability save
      await this.roller.rollAbilitySave(actor.id, message.ability, message.mode || 'normal');
    } catch (error) {
      console.error('Mage Hand | Ability save error:', error);
    }
  }

  async handleSkillCheck(message) {
    console.log('Mage Hand | Handling skill check:', message.skill);
    try {
      const actor = game.actors.get(message.actorId);
      if (!actor) {
        console.error('Mage Hand | Actor not found for skill check');
        return;
      }
      
      // Roll skill check
      await this.roller.rollSkillCheck(actor.id, message.skill, message.mode || 'normal');
    } catch (error) {
      console.error('Mage Hand | Skill check error:', error);
    }
  }

  async handleWeaponAttack(message) {
    console.log('Mage Hand | Handling weapon attack:', message.weaponId, 'vs', message.targetId);
    try {
      const actor = game.actors.get(message.actorId);
      if (!actor) {
        console.error('Mage Hand | Actor not found for weapon attack');
        return;
      }
      
      // Roll weapon attack
      await this.roller.weaponAttack(actor.id, message.weaponId, 'normal');
    } catch (error) {
      console.error('Mage Hand | Weapon attack error:', error);
    }
  }

  async handleSpellCast(message) {
    console.log('Mage Hand | Handling spell cast:', message.spellId, 'level', message.level, 'targets:', message.targetIds);
    try {
      const actor = game.actors.get(message.actorId);
      if (!actor) {
        console.error('Mage Hand | Actor not found for spell cast');
        return;
      }
      
      // Cast spell (useItem handles spells too)
      await this.roller.useItem(actor.id, message.spellId, 'normal');
    } catch (error) {
      console.error('Mage Hand | Spell cast error:', error);
    }
  }
}

const mageHand = new MageHand();

Hooks.once('init', () => {
  mageHand.init();
  
  // Expose to global scope for debugging/testing
  window.mageHand = mageHand;
  game.mageHand = mageHand;
});

Hooks.once('ready', async () => {
  await mageHand.ready();
  
  // Log API usage examples
  console.log('Mage Hand | API Usage Examples:');
  console.log('  Extract: mageHand.extractCharacterData("Character Name")');
  console.log('  Roll ability test: mageHand.rollAbilityTest("Character Name", "str", "advantage")');
  console.log('  Roll save: mageHand.rollAbilitySave("Character Name", "dex", "normal")');
  console.log('  Roll skill: mageHand.rollSkillCheck("Character Name", "ath", "disadvantage")');
  console.log('  Roll initiative: mageHand.rollInitiative("Character Name", "advantage")');
  console.log('  Roll death save: mageHand.rollDeathSave("Character Name", "normal")');
  console.log('  Use item: mageHand.useItem("Character Name", "Longsword", "advantage")');
  console.log('  Generic attack: mageHand.rollAttack("Character Name", "Longsword", "advantage")');
  console.log('  Generic damage: mageHand.rollDamage("Character Name", "Longsword", true)');
  console.log('  Weapon attack: mageHand.weaponAttack("Character Name", "Longsword", "advantage")');
  console.log('  Weapon damage: mageHand.weaponDamage("Character Name", "Longsword", true)');
  console.log('  Spell attack: mageHand.castSpellAttack("Character Name", "Fire Bolt", "normal")');
  console.log('  Spell damage: mageHand.castSpellDamage("Character Name", "Fire Bolt", false)');
  console.log('  Item attack: mageHand.itemAttack("Character Name", "Wand of Magic Missiles", "normal")');
  console.log('  Item damage: mageHand.itemDamage("Character Name", "Wand of Magic Missiles", false)');
  console.log('  Click chat button: mageHand.clickChatButton("messageId", "attack")');
  console.log('  Modes: "normal", "advantage", "disadvantage"');
  console.log('  Kill tracking: mageHand.killTracker.getRecentKills()');
  console.log('  Kill stats: mageHand.killTracker.getKillStats()');
  console.log('  Clear kills: mageHand.killTracker.clear()');
});