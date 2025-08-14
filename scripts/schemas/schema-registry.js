/**
 * Schema Registry - Central definition of all schema versions
 * This file is the single source of truth for schema versions and their capabilities
 */

export class SchemaRegistry {
  /**
   * Current schema version - Uses semantic versioning
   * @type {string}
   */
  static CURRENT_VERSION = "1.0.0";

  /**
   * Schema definitions for each version
   * @type {Object}
   */
  static SCHEMAS = {
    "1.0.0": {
      version: "1.0.0",
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
    // "2.0.0": {
    //   version: "2.0.0",
    //   name: 'Inventory Expansion',
    //   released: '2024-XX-XX',
    //   features: [
    //     ...SCHEMAS["1.0.0"].features,
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
    //       _v: "2.0.0",
    //       inventory: [],
    //       features: [],
    //       resources: {}
    //     };
    //   }
    // }
  };

  /**
   * Parse semantic version string into components
   * @param {string} version - Version string (e.g., "1.0.0")
   * @returns {Object} Version components {major, minor, patch}
   * @private
   */
  static parseVersion(version) {
    const parts = version.split('.').map(Number);
    return {
      major: parts[0] || 0,
      minor: parts[1] || 0,
      patch: parts[2] || 0
    };
  }

  /**
   * Compare two semantic versions
   * @param {string} v1 - First version
   * @param {string} v2 - Second version
   * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
   * @private
   */
  static compareVersions(v1, v2) {
    const ver1 = this.parseVersion(v1);
    const ver2 = this.parseVersion(v2);
    
    if (ver1.major !== ver2.major) {
      return ver1.major < ver2.major ? -1 : 1;
    }
    if (ver1.minor !== ver2.minor) {
      return ver1.minor < ver2.minor ? -1 : 1;
    }
    if (ver1.patch !== ver2.patch) {
      return ver1.patch < ver2.patch ? -1 : 1;
    }
    return 0;
  }

  /**
   * Get the current schema definition
   * @returns {Object} Current schema definition
   */
  static getCurrentSchema() {
    return this.SCHEMAS[this.CURRENT_VERSION];
  }

  /**
   * Get a specific schema version
   * @param {string} version - Schema version (e.g., "1.0.0")
   * @returns {Object|null} Schema definition or null if not found
   */
  static getSchema(version) {
    return this.SCHEMAS[version] || null;
  }

  /**
   * Check if a feature is supported in a given schema version
   * @param {string} feature - Feature identifier
   * @param {string} version - Schema version (defaults to current)
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
   * @param {string} clientVersion - Client's schema version
   * @param {string} serverVersion - Server's schema version (defaults to current)
   * @returns {Object} Compatibility information
   */
  static checkCompatibility(clientVersion, serverVersion = this.CURRENT_VERSION) {
    const comparison = this.compareVersions(clientVersion, serverVersion);
    const compatible = clientVersion === serverVersion;
    const canUpgrade = comparison < 0 && this.canMigrate(clientVersion, serverVersion);
    const canDowngrade = comparison > 0; // Client newer than server
    
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
   * @param {string} clientVersion - Client's schema version
   * @param {string} serverVersion - Server's schema version
   * @returns {string} Compatibility message
   */
  static getCompatibilityMessage(clientVersion, serverVersion) {
    const comparison = this.compareVersions(clientVersion, serverVersion);
    
    if (comparison === 0) {
      return `Schema versions match (v${clientVersion})`;
    }
    if (comparison < 0) {
      return `Client schema v${clientVersion} is older than server v${serverVersion}. Update may be required.`;
    }
    if (comparison > 0) {
      return `Client schema v${clientVersion} is newer than server v${serverVersion}. Some features may not be available.`;
    }
  }

  /**
   * Get all schema versions in order
   * @returns {Array<string>} Sorted array of version strings
   * @private
   */
  static getVersionsInOrder() {
    return Object.keys(this.SCHEMAS).sort(this.compareVersions.bind(this));
  }

  /**
   * Check if migration path exists between versions
   * @param {string} fromVersion - Starting version
   * @param {string} toVersion - Target version
   * @returns {boolean} True if migration is possible
   */
  static canMigrate(fromVersion, toVersion) {
    const comparison = this.compareVersions(fromVersion, toVersion);
    if (comparison >= 0) return false; // Can't migrate backwards or to same version
    
    const versions = this.getVersionsInOrder();
    const fromIndex = versions.indexOf(fromVersion);
    const toIndex = versions.indexOf(toVersion);
    
    if (fromIndex === -1 || toIndex === -1) return false;
    
    // Check if all intermediate versions have migration functions
    for (let i = fromIndex + 1; i <= toIndex; i++) {
      const schema = this.getSchema(versions[i]);
      if (!schema || !schema.migration) {
        return false;
      }
    }
    return true;
  }

  /**
   * Migrate data from one schema version to another
   * @param {Object} data - Data to migrate
   * @param {string} targetVersion - Target schema version
   * @returns {Object} Migrated data
   */
  static migrate(data, targetVersion = this.CURRENT_VERSION) {
    if (!data._v) {
      throw new Error('Data does not contain schema version (_v)');
    }
    
    let currentVersion = data._v;
    let migratedData = { ...data };
    
    const versions = this.getVersionsInOrder();
    const currentIndex = versions.indexOf(currentVersion);
    const targetIndex = versions.indexOf(targetVersion);
    
    if (currentIndex === -1) {
      throw new Error(`Unknown schema version: ${currentVersion}`);
    }
    if (targetIndex === -1) {
      throw new Error(`Unknown target version: ${targetVersion}`);
    }
    
    // Apply migrations sequentially
    for (let i = currentIndex + 1; i <= targetIndex; i++) {
      const nextVersion = versions[i];
      const schema = this.getSchema(nextVersion);
      
      if (!schema || !schema.migration) {
        throw new Error(`No migration path from v${versions[i-1]} to v${nextVersion}`);
      }
      
      migratedData = schema.migration(migratedData);
      migratedData._v = nextVersion;
    }
    
    return migratedData;
  }

  /**
   * Get schema metadata for connection handshake
   * @returns {Object} Schema metadata
   */
  static getHandshakeMetadata() {
    const current = this.getCurrentSchema();
    const allVersions = this.getVersionsInOrder();
    
    return {
      schemaVersion: this.CURRENT_VERSION,
      schemaName: current.name,
      features: current.features,
      supportedVersions: allVersions,
      canMigrateFrom: allVersions.filter(v => 
        this.compareVersions(v, this.CURRENT_VERSION) < 0 && 
        this.canMigrate(v, this.CURRENT_VERSION)
      )
    };
  }

  /**
   * Validate that extracted data conforms to schema
   * @param {Object} data - Extracted character data
   * @param {string} version - Schema version to validate against
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
    
    // Check required base fields for v1.0.0
    if (version === "1.0.0") {
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