/**
 * Schema Registry - Central definition of all schema versions
 * This file is the single source of truth for schema versions and their capabilities
 */

export class SchemaRegistry {
  /**
   * Current schema version - INCREMENT THIS when making breaking changes
   * @type {number}
   */
  static CURRENT_VERSION = 1;

  /**
   * Schema definitions for each version
   * @type {Object}
   */
  static SCHEMAS = {
    1: {
      version: 1,
      name: 'Combat Focus',
      released: '2024-01-01',
      features: [
        'core-identity',      // name, id, type, img
        'character-details',  // classes, race, background
        'combat-stats',       // hp, ac, initiative, conditions
        'abilities',          // STR, DEX, CON, INT, WIS, CHA
        'skills',            // all skill proficiencies and modifiers
        'spell-slots',       // spell slot tracking
        'spells',            // known/prepared spells
        'weapons',           // weapon items with attack/damage
        'death-saves',       // death save tracking
        'exhaustion',        // exhaustion levels
        'movement',          // movement speeds
        'senses'             // darkvision, blindsight, etc.
      ],
      changes: [
        'Initial release',
        'Full combat data extraction',
        'Spell and weapon support',
        'Condition tracking'
      ]
    },
    // Future versions will be added here
    // 2: {
    //   version: 2,
    //   name: 'Inventory Expansion',
    //   released: '2024-XX-XX',
    //   features: [
    //     ...SCHEMAS[1].features,
    //     'inventory-items',     // all items not just weapons
    //     'class-features',      // class and subclass features
    //     'feats',              // character feats
    //     'resources'           // class resources, ki points, etc.
    //   ],
    //   changes: [
    //     'Added full inventory extraction',
    //     'Added class features and feats',
    //     'Added resource tracking'
    //   ],
    //   migration: (v1Data) => {
    //     // Migration function from v1 to v2
    //     return {
    //       ...v1Data,
    //       _v: 2,
    //       inventory: [],
    //       features: [],
    //       resources: {}
    //     };
    //   }
    // }
  };

  /**
   * Get the current schema definition
   * @returns {Object} Current schema definition
   */
  static getCurrentSchema() {
    return this.SCHEMAS[this.CURRENT_VERSION];
  }

  /**
   * Get a specific schema version
   * @param {number} version - Schema version number
   * @returns {Object|null} Schema definition or null if not found
   */
  static getSchema(version) {
    return this.SCHEMAS[version] || null;
  }

  /**
   * Check if a feature is supported in a given schema version
   * @param {string} feature - Feature identifier
   * @param {number} version - Schema version (defaults to current)
   * @returns {boolean} True if feature is supported
   */
  static hasFeature(feature, version = this.CURRENT_VERSION) {
    const schema = this.getSchema(version);
    return schema ? schema.features.includes(feature) : false;
  }

  /**
   * Get list of all features in current schema
   * @returns {Array<string>} Array of feature identifiers
   */
  static getCurrentFeatures() {
    return this.getCurrentSchema().features;
  }

  /**
   * Check compatibility between two schema versions
   * @param {number} clientVersion - Client's schema version
   * @param {number} serverVersion - Server's schema version (defaults to current)
   * @returns {Object} Compatibility information
   */
  static checkCompatibility(clientVersion, serverVersion = this.CURRENT_VERSION) {
    const compatible = clientVersion === serverVersion;
    const canUpgrade = clientVersion < serverVersion && this.canMigrate(clientVersion, serverVersion);
    const canDowngrade = clientVersion > serverVersion; // Client newer than server
    
    return {
      compatible,
      canUpgrade,
      canDowngrade,
      clientVersion,
      serverVersion,
      message: this.getCompatibilityMessage(clientVersion, serverVersion)
    };
  }

  /**
   * Get human-readable compatibility message
   * @param {number} clientVersion - Client's schema version
   * @param {number} serverVersion - Server's schema version
   * @returns {string} Compatibility message
   */
  static getCompatibilityMessage(clientVersion, serverVersion) {
    if (clientVersion === serverVersion) {
      return `Schema versions match (v${clientVersion})`;
    }
    if (clientVersion < serverVersion) {
      return `Client schema v${clientVersion} is older than server v${serverVersion}. Update may be required.`;
    }
    if (clientVersion > serverVersion) {
      return `Client schema v${clientVersion} is newer than server v${serverVersion}. Some features may not be available.`;
    }
  }

  /**
   * Check if migration path exists between versions
   * @param {number} fromVersion - Starting version
   * @param {number} toVersion - Target version
   * @returns {boolean} True if migration is possible
   */
  static canMigrate(fromVersion, toVersion) {
    if (fromVersion >= toVersion) return false;
    
    // Check if all intermediate versions have migration functions
    for (let v = fromVersion + 1; v <= toVersion; v++) {
      const schema = this.getSchema(v);
      if (!schema || !schema.migration) {
        return false;
      }
    }
    return true;
  }

  /**
   * Migrate data from one schema version to another
   * @param {Object} data - Data to migrate
   * @param {number} targetVersion - Target schema version
   * @returns {Object} Migrated data
   */
  static migrate(data, targetVersion = this.CURRENT_VERSION) {
    if (!data._v) {
      throw new Error('Data does not contain schema version (_v)');
    }
    
    let currentVersion = data._v;
    let migratedData = { ...data };
    
    // Apply migrations sequentially
    while (currentVersion < targetVersion) {
      const nextVersion = currentVersion + 1;
      const schema = this.getSchema(nextVersion);
      
      if (!schema || !schema.migration) {
        throw new Error(`No migration path from v${currentVersion} to v${nextVersion}`);
      }
      
      migratedData = schema.migration(migratedData);
      currentVersion = nextVersion;
    }
    
    return migratedData;
  }

  /**
   * Get schema metadata for connection handshake
   * @returns {Object} Schema metadata
   */
  static getHandshakeMetadata() {
    const current = this.getCurrentSchema();
    return {
      schemaVersion: this.CURRENT_VERSION,
      schemaName: current.name,
      features: current.features,
      supportedVersions: Object.keys(this.SCHEMAS).map(Number),
      canMigrateFrom: Object.keys(this.SCHEMAS)
        .map(Number)
        .filter(v => v < this.CURRENT_VERSION && this.canMigrate(v, this.CURRENT_VERSION))
    };
  }

  /**
   * Validate that extracted data conforms to schema
   * @param {Object} data - Extracted character data
   * @param {number} version - Schema version to validate against
   * @returns {Object} Validation result
   */
  static validate(data, version = this.CURRENT_VERSION) {
    const errors = [];
    const warnings = [];
    
    // Check schema version
    if (!data._v) {
      errors.push('Missing schema version (_v)');
    } else if (data._v !== version) {
      warnings.push(`Schema version mismatch: expected v${version}, got v${data._v}`);
    }
    
    // Check required base fields for v1
    if (version === 1) {
      const requiredFields = ['id', 'name', 'type'];
      for (const field of requiredFields) {
        if (!data[field]) {
          errors.push(`Missing required field: ${field}`);
        }
      }
      
      // Check required nested structures
      if (!data.combat) errors.push('Missing combat data');
      if (!data.abilities) errors.push('Missing abilities data');
      if (!data.skills) errors.push('Missing skills data');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}

// Freeze the registry to prevent external modification
Object.freeze(SchemaRegistry);
Object.freeze(SchemaRegistry.SCHEMAS);
Object.freeze(SchemaRegistry.CURRENT_VERSION);