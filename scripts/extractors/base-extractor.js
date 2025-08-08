import { SchemaRegistry } from '../schemas/schema-registry.js';

export class BaseExtractor {
  constructor() {
    this.schemaVersion = SchemaRegistry.CURRENT_VERSION;
  }

  extractCharacterData(input) {
    const actor = this.resolveActor(input);
    if (!actor) {
      console.error('Mage Hand | Cannot find actor by name or id.');
      return undefined;
    }

    console.log(`Mage Hand | Extracting character ${actor.name} (${actor.id})`);
    console.log(`Mage Hand | Using schema version ${this.schemaVersion}`);

    const data = {
      _v: this.schemaVersion,
      name: actor.name,
      id: actor.id,
      type: actor.type,
      img: actor.img,
      classes: this.getClasses(actor),
      race: this.getRace(actor),
      background: this.getBackground(actor),
      abilities: this.getAbilities(actor),
      skills: this.getSkills(actor),
      spellSlots: this.getSpellSlots(actor),
      spells: this.getSpells(actor),
      weapons: this.getWeapons(actor),
      combat: this.getCombatData(actor)
    };

    // Validate the extracted data
    const validation = SchemaRegistry.validate(data, this.schemaVersion);
    if (!validation.valid) {
      console.error('Mage Hand | Extracted data validation failed:', validation.errors);
    }
    if (validation.warnings.length > 0) {
      console.warn('Mage Hand | Extracted data warnings:', validation.warnings);
    }

    const defaults = this.getDefaults();
    return this.unmerge(data, defaults);
  }

  /**
   * Get the current schema version being used
   */
  getSchemaVersion() {
    return this.schemaVersion;
  }

  /**
   * Get list of supported features for current schema
   */
  getSupportedFeatures() {
    return SchemaRegistry.getCurrentFeatures();
  }

  /**
   * Check if a specific feature is supported
   */
  hasFeature(feature) {
    return SchemaRegistry.hasFeature(feature, this.schemaVersion);
  }

  resolveActor(input) {
    let actor = null;
    
    switch (typeof input) {
      case 'string':
        actor = game.actors.find(a => a.name === input);
        if (!actor) {
          actor = game.actors.find(a => a.id === input);
        }
        break;
      default:
        actor = input;
    }
    
    return actor && actor.name ? actor : null;
  }

  unmerge(obj, defaults) {
    if (obj === null || obj === undefined) {
      return obj === defaults ? undefined : obj;
    }

    if (typeof obj !== 'object' || typeof defaults !== 'object') {
      return obj === defaults ? undefined : obj;
    }

    if (Array.isArray(obj)) {
      return obj.length > 0 ? obj : undefined;
    }

    const result = {};
    let hasProperties = false;

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        const defaultValue = defaults && defaults.hasOwnProperty(key) ? defaults[key] : undefined;

        if (Array.isArray(value)) {
          if (value.length > 0) {
            result[key] = value;
            hasProperties = true;
          }
        } else if (value && typeof value === 'object') {
          if (!defaultValue || typeof defaultValue !== 'object') {
            result[key] = value;
            hasProperties = true;
          } else {
            const unmerged = this.unmerge(value, defaultValue);
            if (unmerged !== undefined) {
              result[key] = unmerged;
              hasProperties = true;
            }
          }
        } else {
          if (defaultValue === undefined || value !== defaultValue) {
            result[key] = value;
            hasProperties = true;
          }
        }
      }
    }

    return hasProperties ? result : undefined;
  }

  getDefaults() {
    return {
      _v: 1,
      name: '',
      id: '',
      type: 'character',
      img: 'icons/svg/mystery-man.svg',
      classes: [],
      race: {
        name: 'Human',
        img: 'icons/environment/people/commoner.webp'
      },
      background: [],
      abilities: {
        str: { value: 10, modifier: 0, proficient: 0, saveValue: 0 },
        dex: { value: 10, modifier: 0, proficient: 0, saveValue: 0 },
        con: { value: 10, modifier: 0, proficient: 0, saveValue: 0 },
        int: { value: 10, modifier: 0, proficient: 0, saveValue: 0 },
        wis: { value: 10, modifier: 0, proficient: 0, saveValue: 0 },
        cha: { value: 10, modifier: 0, proficient: 0, saveValue: 0 }
      },
      skills: this.getDefaultSkills(),
      spellSlots: this.getDefaultSpellSlots(),
      spells: [],
      weapons: [],
      combat: {
        conditions: [],
        hp: { value: 10, max: 10, tempValue: 0, tempMax: 0 },
        ac: { value: 10, equipped: 10, natural: 10 },
        initiative: { modifier: 0 },
        exhaustion: 0,
        deathSaves: { success: 0, failure: 0 },
        mv: { walk: 30 },
        senses: {}
      }
    };
  }

  getDefaultSkills() {
    const skills = ['acr', 'ani', 'arc', 'ath', 'dec', 'his', 'ins', 'itm', 
                   'inv', 'med', 'nat', 'prc', 'prf', 'per', 'rel', 'slt', 'ste', 'sur'];
    const result = {};
    skills.forEach(sk => {
      result[sk] = { passive: 10, modifier: 0, proficient: 0 };
    });
    return result;
  }

  getDefaultSpellSlots() {
    const slots = {};
    for (let i = 1; i <= 9; i++) {
      slots[`level${i}`] = { value: 0, max: 0 };
    }
    slots.pact = { value: 0, max: 0 };
    return slots;
  }

  getCombatData(actor) {
    return {
      conditions: this.getConditions(actor),
      hp: this.getHP(actor),
      ac: this.getAC(actor),
      initiative: this.getInitiative(actor),
      exhaustion: this.getExhaustion(actor),
      deathSaves: this.getDeathSaves(actor),
      mv: this.getMovement(actor),
      senses: this.getSenses(actor)
    };
  }

  getRace(actor) {
    throw new Error('getRace must be implemented by subclass');
  }

  getBackground(actor) {
    throw new Error('getBackground must be implemented by subclass');
  }

  getClasses(actor) {
    throw new Error('getClasses must be implemented by subclass');
  }


  getSpells(actor) {
    throw new Error('getSpells must be implemented by subclass');
  }

  getWeapons(actor) {
    throw new Error('getWeapons must be implemented by subclass');
  }

  getAbilities(actor) {
    throw new Error('getAbilities must be implemented by subclass');
  }

  getSkills(actor) {
    throw new Error('getSkills must be implemented by subclass');
  }

  getSpellSlots(actor) {
    throw new Error('getSpellSlots must be implemented by subclass');
  }

  getConditions(actor) {
    throw new Error('getConditions must be implemented by subclass');
  }

  getHP(actor) {
    throw new Error('getHP must be implemented by subclass');
  }

  getAC(actor) {
    throw new Error('getAC must be implemented by subclass');
  }

  getInitiative(actor) {
    throw new Error('getInitiative must be implemented by subclass');
  }

  getExhaustion(actor) {
    throw new Error('getExhaustion must be implemented by subclass');
  }

  getDeathSaves(actor) {
    throw new Error('getDeathSaves must be implemented by subclass');
  }

  getMovement(actor) {
    throw new Error('getMovement must be implemented by subclass');
  }

  getSenses(actor) {
    throw new Error('getSenses must be implemented by subclass');
  }
}