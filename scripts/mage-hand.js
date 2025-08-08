import { ExtractorFactory } from './extractors/extractor-factory.js';
import { RollerFactory } from './rollers/roller-factory.js';
import { deepDiff } from './utils/deep-diff.js';
import { SchemaRegistry } from './schemas/schema-registry.js';

class MageHand {
  constructor() {
    this.moduleId = 'mage-hand';
    this.socket = null;
    this.sessionCode = null;
    this.characterData = new Map();
    this.lastSync = new Map();
    this.extractor = null;
    this.roller = null;
  }

  init() {
    console.log(`Mage Hand | Initializing module v${game.modules.get(this.moduleId).version}`);
    console.log(`Mage Hand | Schema version: v${SchemaRegistry.CURRENT_VERSION} (${SchemaRegistry.getCurrentSchema().name})`);
    this.registerSettings();
    this.detectVersions();
  }

  ready() {
    console.log('Mage Hand | Module ready');
    this.extractor = ExtractorFactory.getExtractor();
    console.log(`Mage Hand | Using extractor: ${this.extractor.version}`);
    this.roller = RollerFactory.getInstance();
    console.log(`Mage Hand | Using roller: ${this.roller.version}`);
    this.registerHooks();
    
    const savedCode = game.settings.get(this.moduleId, 'sessionCode');
    if (savedCode) {
      this.connect(savedCode);
    }
  }

  registerSettings() {
    game.settings.register(this.moduleId, 'sessionCode', {
      name: 'Session Code',
      hint: 'Enter the 6-character code from your Mage Hand app (format: XXX-XXX)',
      scope: 'client',
      config: true,
      type: String,
      default: '',
      onChange: value => {
        if (value && value.match(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/)) {
          this.connect(value);
        } else if (!value && this.socket) {
          this.disconnect();
        }
      }
    });

    game.settings.register(this.moduleId, 'relayServer', {
      name: 'Relay Server URL',
      hint: 'WebSocket relay server URL',
      scope: 'world',
      config: true,
      type: String,
      default: 'wss://relay.magehand.org',
      restricted: true
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

  registerHooks() {
    Hooks.on('updateActor', (actor, changes, options, userId) => {
      console.log('Mage Hand | Actor updated:', actor.name);
      if (this.shouldSync(actor, userId)) {
        this.handleActorUpdate(actor, changes);
      }
    });

    Hooks.on('updateItem', (item, changes, options, userId) => {
      console.log('Mage Hand | Item updated:', item.name);
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
    
    console.log(`Mage Hand | Foundry VTT: v${foundryVersion}`);
    console.log(`Mage Hand | D&D 5e System: v${dnd5eVersion}`);
    
    this.foundryMajor = parseInt(foundryVersion.split('.')[0]);
    this.dnd5eMajor = parseInt(dnd5eVersion.split('.')[0]);
    this.dnd5eMinor = parseInt(dnd5eVersion.split('.')[1]);
  }

  shouldSync(actor, userId) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    if (userId !== game.userId) return false;
    if (actor.type !== 'character') return false;
    
    const isOwner = actor.testUserPermission(game.user, 'OWNER');
    return isOwner;
  }

  connect(sessionCode) {
    console.log(`Mage Hand | Connecting with session code: ${sessionCode}`);
    
    // Get schema metadata for handshake
    const schemaMetadata = SchemaRegistry.getHandshakeMetadata();
    console.log(`Mage Hand | Schema metadata:`, schemaMetadata);
    
    // TODO: Implement WebSocket connection
    // When connection is established, send handshake with schema info:
    // {
    //   type: 'handshake',
    //   sessionCode: sessionCode,
    //   module: {
    //     name: 'mage-hand',
    //     version: game.modules.get(this.moduleId).version
    //   },
    //   foundry: {
    //     version: game.version,
    //     system: game.system.id,
    //     systemVersion: game.system.version
    //   },
    //   schema: schemaMetadata
    // }
    
    this.sessionCode = sessionCode;
  }

  disconnect() {
    console.log('Mage Hand | Disconnecting');
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.sessionCode = null;
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
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    
    const message = {
      type: 'update',
      actorId: actorId,
      updates: diff,
      timestamp: Date.now()
    };
    
    console.log(`Mage Hand | Sending diff update for actor ${actorId}:`, diff);
    this.socket.send(JSON.stringify(message));
  }
  
  sendFullSync(actorId, data) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    
    const message = {
      type: 'fullSync',
      actorId: actorId,
      data: data,
      timestamp: Date.now()
    };
    
    console.log(`Mage Hand | Sending full sync for actor ${actorId}`);
    this.socket.send(JSON.stringify(message));
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
}

const mageHand = new MageHand();

Hooks.once('init', () => {
  mageHand.init();
  
  // Expose to global scope for debugging/testing
  window.mageHand = mageHand;
  game.mageHand = mageHand;
});

Hooks.once('ready', () => {
  mageHand.ready();
  
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
});