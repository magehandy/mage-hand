import { BaseExtractor } from './base-extractor.js';
import { FormulaParser } from '../utils/formula-parser.js';

export class ExtractorV11 extends BaseExtractor {
  constructor() {
    super();
    this.version = 'v11-dnd5e-v3';
  }

  getRace(actor) {
    const items = actor.items.filter(i => i.type === 'race');
    const races = items.map(act => ({
      name: act.name,
      img: act.img || 'icons/svg/mystery.svg'
    }));
    
    return races.length >= 1 ? races[0] : { name: '', img: '' };
  }

  getBackground(actor) {
    const items = actor.items.filter(i => i.type === 'background');
    return items.map(act => ({
      name: act.name,
      img: act.img || 'icons/svg/mystery.svg'
    }));
  }

  getClasses(actor) {
    const items = actor.items.filter(i => {
      if (i.type !== 'class') return false;
      return i.system.isOriginalClass !== undefined ? i.system.isOriginalClass : true;
    });
    
    return items.map(act => {
      const identifier = act.system.identifier || act.name.toLowerCase().replace(/\s+/g, '');
      const subclasses = actor.items
        .filter(i => {
          if (i.type !== 'subclass') return false;
          return i.system.classIdentifier === identifier || 
                 i.flags?.dnd5e?.classIdentifier === identifier;
        })
        .map(s => s.name);
      
      return {
        name: act.name,
        img: act.img || 'icons/svg/mystery.svg',
        identifier: identifier,
        levels: act.system.levels || 0,
        subclasses: subclasses,
        displayName: subclasses.length > 0 ? `${act.name} (${subclasses.join(', ')})` : act.name
      };
    });
  }


  getSpells(actor) {
    const items = actor.items.filter(i => i.type === 'spell');
    
    return items.map(item => {
      const data = {
        name: item.name,
        img: item.img,
        level: item.system.level || 0,
        activation: this.normalizeActivation(item.labels?.activation) || this.getActivationLabel(item),
        prepared: false,
        range: item.labels?.range || this.getRangeLabel(item),
        target: this.normalizeTarget(item.labels?.target) || this.getTargetLabel(item),
        school: item.labels?.school || this.getSchoolLabel(item.system.school),
        concentration: item.requiresConcentration !== undefined ? item.requiresConcentration : 
                      (item.system.duration?.concentration || false)
      };
      
      // Determine if spell is prepared and its casting mode
      if (item.system.preparation) {
        const mode = item.system.preparation.mode;
        
        // Set prepared based on mode and preparation status
        if (mode === 'atwill' || mode === 'innate') {
          data.prepared = true;
          data.castingMode = 'atwill';
        } else if (mode === 'ritual') {
          data.prepared = true;
          data.castingMode = 'ritual';
        } else if (mode === 'always' || mode === 'pact') {
          data.prepared = true;
        } else if (mode === 'prepared' && item.system.preparation.prepared) {
          data.prepared = true;
        }
      }
      
      // Check if spell has an attack roll - use label first if available
      if (item.labels?.toHit) {
        data.toHit = item.labels.toHit;
      } else {
        const hasAttack = item.hasAttack !== undefined ? item.hasAttack : 
                         (item.system.actionType === 'msak' || item.system.actionType === 'rsak' || 
                          item.system.attack?.bonus !== undefined);
        if (hasAttack) {
          data.toHit = this.getSpellAttackBonus(item, actor);
        }
      }
      
      // Check for limited uses
      if (item.system.uses?.max !== undefined && item.system.uses.max !== '') {
        const max = parseInt(item.system.uses.max) || item.system.uses.max;
        if (max) {
          data.uses = {
            value: item.system.uses.value || 0,
            max: max
          };
        }
      }
      
      return data;
    });
  }

  getWeapons(actor) {
    const items = actor.items.filter(i => i.type === 'weapon');
    
    return items.map(item => {
      const data = {
        name: item.name,
        img: item.img,
        type: item.labels?.weaponType || this.getWeaponTypeLabel(item),
        activation: this.normalizeActivation(item.labels?.activation) || this.getActivationLabel(item),
        toHit: item.labels?.toHit || this.getAttackBonus(item, actor),
        dmg: [],
        equipped: item.system.equipped || false,
        range: item.labels?.range || this.getRangeLabel(item),
        properties: []
      };
      
      // Check for derived damage first (most accurate)
      if (item.labels?.derivedDamage && Array.isArray(item.labels.derivedDamage)) {
        data.dmg = item.labels.derivedDamage.map(dmg => ({
          formula: dmg.formula,
          type: dmg.damageType || ''
        }));
      } else if (item.system.damage?.parts) {
        const abilityMod = this.getWeaponAbilityMod(item, actor);
        data.dmg = this.consolidateDamage(item.system.damage.parts, abilityMod, item, actor);
      }
      
      // Check for pre-formatted properties labels first
      if (item.labels?.properties && Array.isArray(item.labels.properties)) {
        data.properties = item.labels.properties.map(prop => 
          typeof prop === 'object' ? prop.label : prop
        );
      } else if (item.system.properties) {
        const propMap = {
          // Weapon properties
          'ada': 'Adamantine',
          'amm': 'Ammunition',
          'fin': 'Finesse',
          'fir': 'Firearm',
          'foc': 'Focus',
          'hvy': 'Heavy',
          'lgt': 'Light',
          'lod': 'Loading',
          'mgc': 'Magical',
          'rch': 'Reach',
          'rel': 'Reload',
          'ret': 'Returning',
          'sil': 'Silvered',
          'spc': 'Special',
          'thr': 'Thrown',
          'two': 'Two-Handed',
          'ver': 'Versatile',
          // Spell/other properties
          'concentration': 'Concentration',
          'material': 'Material',
          'ritual': 'Ritual',
          'somatic': 'Somatic',
          'vocal': 'Verbal',
          'stealthDisadvantage': 'Stealth Disadvantage',
          'weightlessContents': 'Weightless Contents'
        };
        
        // Handle Set, array, and object formats
        if (item.system.properties instanceof Set) {
          data.properties = Array.from(item.system.properties)
            .filter(key => propMap[key])
            .map(key => propMap[key]);
        } else if (Array.isArray(item.system.properties)) {
          data.properties = item.system.properties
            .filter(key => propMap[key])
            .map(key => propMap[key]);
        } else {
          data.properties = Object.keys(item.system.properties)
            .filter(key => item.system.properties[key])
            .map(key => propMap[key] || key.toUpperCase());
        }
      }
      
      // Check for limited uses
      if (item.system.uses?.max !== undefined && item.system.uses.max !== '') {
        const max = parseInt(item.system.uses.max) || item.system.uses.max;
        if (max) {
          data.uses = {
            value: item.system.uses.value || 0,
            max: max
          };
        }
      }
      
      return data;
    });
  }

  getAbilities(actor) {
    const abilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
    const result = {};
    
    abilities.forEach(ab => {
      const ability = actor.system.abilities[ab];
      result[ab] = {
        value: ability?.value || 10,
        modifier: ability?.mod || 0,
        proficient: ability?.proficient || (ability?.save > ability?.mod ? 1 : 0) || 0,
        saveValue: ability?.save || ability?.mod || 0
      };
    });
    
    return result;
  }

  getSkills(actor) {
    const skills = ['acr', 'ani', 'arc', 'ath', 'dec', 'his', 'ins', 'inv', 
                   'itm', 'med', 'nat', 'per', 'prc', 'prf', 'rel', 'slt', 'ste', 'sur'];
    const result = {};
    
    skills.forEach(sk => {
      const skill = actor.system.skills[sk];
      // For v11: use skill.total for the modifier, check both proficient paths
      const isProficient = skill?.proficient || skill?.prof?.hasProficiency || false;
      result[sk] = {
        passive: skill?.passive || 10,
        modifier: skill?.total || skill?.mod || 0,
        proficient: isProficient ? 1 : 0
      };
    });
    
    return result;
  }

  getSpellSlots(actor) {
    const slots = {};
    const spells = actor.system.spells;
    
    if (spells) {
      if (spells.pact) {
        slots.pact = {
          value: spells.pact.value || 0,
          max: spells.pact.max || 0
        };
      }
      
      for (let i = 1; i <= 9; i++) {
        const slot = spells[`spell${i}`];
        if (slot && slot.max > 0) {
          slots[`level${i}`] = {
            value: slot.value || 0,
            max: slot.max
          };
        }
      }
    }
    
    return slots;
  }

  getConditions(actor) {
    if (!actor.effects) return [];
    
    // Filter for active conditions (not disabled and has statuses)
    const conditions = actor.effects.filter(eff => 
      eff.disabled === false && 
      eff.statuses && 
      eff.statuses.size > 0
    );
    
    return conditions.map(effect => ({
      name: effect.name,  // In v11, use name instead of label
      img: effect.icon || effect.img  // v11 still uses icon
    }));
  }

  getHP(actor) {
    const hp = actor.system.attributes.hp;
    return {
      value: hp.value || 0,
      max: hp.max || 0,
      tempValue: hp.temp || 0,
      tempMax: hp.tempmax || 0
    };
  }

  getAC(actor) {
    const ac = actor.system.attributes.ac;
    return {
      value: ac.value || 10,
      natural: ac.base || 10
    };
  }

  getInitiative(actor) {
    return {
      modifier: actor.system.attributes.init?.total || actor.system.attributes.init?.value || 0
    };
  }

  getExhaustion(actor) {
    return actor.system.attributes.exhaustion || 0;
  }

  getDeathSaves(actor) {
    const death = actor.system.attributes.death;
    return {
      success: death?.success || 0,
      failure: death?.failure || 0
    };
  }

  getMovement(actor) {
    const movement = actor.system.attributes.movement;
    
    return {
      walk: movement?.walk || 30,
      fly: movement?.fly || 0,
      swim: movement?.swim || 0,
      burrow: movement?.burrow || 0
    };
  }

  getSenses(actor) {
    const senses = actor.system.attributes.senses;
    
    return {
      darkvision: senses?.darkvision || 0,
      blindsight: senses?.blindsight || 0,
      tremorsense: senses?.tremorsense || 0,
      truesight: senses?.truesight || 0
    };
  }

  getActivationLabel(item) {
    if (item.system.activation) {
      const act = item.system.activation;
      if (act.type === 'action') return 'Action';
      if (act.type === 'bonus') return 'Bonus Action';
      if (act.type === 'reaction') return 'Reaction';
      if (act.type === 'minute' && act.cost) {
        return act.cost === 1 ? 'Minute' : `${act.cost} Minutes`;
      }
      if (act.type === 'hour' && act.cost) {
        return act.cost === 1 ? 'Hour' : `${act.cost} Hours`;
      }
      if (act.type) return act.type.charAt(0).toUpperCase() + act.type.slice(1);
      return 'Action';
    }
    return 'Action';
  }

  getRangeLabel(item) {
    const range = item.system.range;
    if (!range) return '';
    
    // Special case: when value is null and units is "self"
    if (range.value === null && range.units === 'self') {
      return 'Self';
    }
    
    if (range.value && range.units) {
      const long = range.long ? `/${range.long}` : '';
      return `${range.value}${long} ${range.units}`;
    }
    
    return range.value || '';
  }

  getTargetLabel(item) {
    const target = item.system.target;
    if (!target) return '';
    
    // Handle v11 format with value and type
    if (target.type) {
      // Handle special case for self
      if (target.type === 'self') {
        return 'Self';
      }
      
      // Keep type lowercase (like v13 does)
      const typeLabel = target.type;
      
      // If there's a count, include it
      if (target.value && target.value > 0) {
        if (target.value === 1) {
          return `1 ${typeLabel}`;
        } else {
          return `${target.value} ${typeLabel}s`;  // Simple pluralization
        }
      }
      
      return typeLabel;
    }
    
    // Fallback for other formats
    if (target.value && target.units) {
      return `${target.value} ${target.units}`;
    }
    
    return '';
  }

  getAttackBonus(item, actor) {
    const attackBonus = item.system.attackBonus || item.system.attack?.bonus || 0;
    const prof = actor.system.attributes.prof || 2;
    const actionType = item.system.actionType;
    
    // Use the same logic as getWeaponAbilityMod to determine ability modifier
    const abilityMod = this.getWeaponAbilityMod(item, actor);
    
    // Apply global weapon attack bonuses
    let globalBonus = 0;
    if (actionType && actor.system?.bonuses?.[actionType]?.attack) {
      const context = { item: item };
      globalBonus = FormulaParser.evaluate(actor.system.bonuses[actionType].attack, actor, context);
    }
    
    const isProficient = item.system.proficient !== false;
    const total = abilityMod + (isProficient ? prof : 0) + attackBonus + globalBonus;
    return total >= 0 ? `+${total}` : `${total}`;
  }
  
  getWeaponTypeLabel(item) {
    // In v11/D&D5e v3, weapon type is at system.type.value
    const type = item.system.type?.value || item.system.weaponType;
    if (!type) return 'Unknown';
    
    const typeMap = {
      'simpleM': 'Simple Melee',
      'simpleR': 'Simple Ranged',
      'martialM': 'Martial Melee',
      'martialR': 'Martial Ranged',
      'natural': 'Natural',
      'improv': 'Improvised',
      'siege': 'Siege'
    };
    
    return typeMap[type] || type.charAt(0).toUpperCase() + type.slice(1);
  }
  
  getWeaponAbilityMod(item, actor) {
    // Use the item's abilityMod getter if available
    if (item.abilityMod) {
      return actor.system.abilities[item.abilityMod]?.mod || 0;
    }
    
    // Check for explicit ability setting
    if (item.system.ability) {
      return actor.system.abilities[item.system.ability]?.mod || 0;
    }
    
    // Helper to check if a property exists (handles Set, array, and object formats)
    const hasProperty = (prop) => {
      const props = item.system.properties;
      if (!props) return false;
      if (props instanceof Set) {
        return props.has(prop);
      }
      if (Array.isArray(props)) {
        return props.includes(prop);
      }
      return props[prop] === true;
    };
    
    // Check actionType (most reliable indicator)
    const actionType = item.system.actionType;
    if (actionType) {
      if (actionType === 'mwak' || actionType === 'msak') {
        // Melee attacks - check for finesse
        if (hasProperty('fin')) {
          const strMod = actor.system.abilities.str?.mod || 0;
          const dexMod = actor.system.abilities.dex?.mod || 0;
          return Math.max(strMod, dexMod);
        }
        return actor.system.abilities.str?.mod || 0;
      } else if (actionType === 'rwak' || actionType === 'rsak') {
        // Ranged attacks use DEX (unless thrown)
        if (hasProperty('thr')) {
          // Thrown weapons can use STR
          const strMod = actor.system.abilities.str?.mod || 0;
          const dexMod = actor.system.abilities.dex?.mod || 0;
          // Thrown weapons use the same ability as their melee counterpart
          return hasProperty('fin') ? Math.max(strMod, dexMod) : strMod;
        }
        return actor.system.abilities.dex?.mod || 0;
      }
    }
    
    // Fallback to weapon type
    const weaponType = item.system.type?.value || item.system.weaponType || '';
    if (weaponType.includes('M') || weaponType === 'simpleM' || weaponType === 'martialM') {
      if (hasProperty('fin')) {
        const strMod = actor.system.abilities.str?.mod || 0;
        const dexMod = actor.system.abilities.dex?.mod || 0;
        return Math.max(strMod, dexMod);
      }
      return actor.system.abilities.str?.mod || 0;
    } else if (weaponType.includes('R') || weaponType === 'simpleR' || weaponType === 'martialR') {
      return actor.system.abilities.dex?.mod || 0;
    }
    
    // Default to strength
    return actor.system.abilities.str?.mod || 0;
  }
  
  consolidateDamage(damageParts, abilityMod, item, actor) {
    if (!damageParts || damageParts.length === 0) return [];
    
    // Track all damage components by type
    const damageByType = {};
    
    // Process each damage part
    damageParts.forEach(part => {
      const [formula, defaultType] = part;
      if (!formula) return;
      
      // Parse typed dice like "1d8[piercing]"
      const typedDiceRegex = /(\d*)d(\d+)\[([^\]]+)\]/g;
      let match;
      let remainingFormula = formula;
      
      // Extract typed dice
      while ((match = typedDiceRegex.exec(formula)) !== null) {
        const count = parseInt(match[1]) || 1;
        const sides = parseInt(match[2]);
        const type = match[3];
        
        if (!damageByType[type]) {
          damageByType[type] = { dice: {}, flat: 0 };
        }
        if (!damageByType[type].dice[sides]) {
          damageByType[type].dice[sides] = 0;
        }
        damageByType[type].dice[sides] += count;
        
        remainingFormula = remainingFormula.replace(match[0], '');
      }
      
      // Process remaining untyped dice
      const untypedDiceRegex = /(\d*)d(\d+)/g;
      remainingFormula = remainingFormula.replace(untypedDiceRegex, (match, count, sides) => {
        const diceCount = parseInt(count) || 1;
        const diceSides = parseInt(sides);
        
        if (!damageByType[defaultType]) {
          damageByType[defaultType] = { dice: {}, flat: 0 };
        }
        if (!damageByType[defaultType].dice[diceSides]) {
          damageByType[defaultType].dice[diceSides] = 0;
        }
        damageByType[defaultType].dice[diceSides] += diceCount;
        
        return '';
      });
      
      // Replace @mod with ability modifier
      remainingFormula = remainingFormula.replace(/@mod/gi, abilityMod.toString());
      
      // Evaluate any remaining numeric expression for flat damage
      remainingFormula = remainingFormula.replace(/[^0-9+\-*/() ]/g, '').trim();
      if (remainingFormula) {
        try {
          const flatDamage = eval(remainingFormula) || 0;
          if (flatDamage !== 0) {
            if (!damageByType[defaultType]) {
              damageByType[defaultType] = { dice: {}, flat: 0 };
            }
            damageByType[defaultType].flat += flatDamage;
          }
        } catch (e) {
          // Ignore evaluation errors
        }
      }
    });
    
    // Apply global damage bonuses
    const actionType = item?.system?.actionType;
    if (actionType && actor?.system?.bonuses?.[actionType]?.damage) {
      const context = { item: item };
      const damageBonus = FormulaParser.evaluate(actor.system.bonuses[actionType].damage, actor, context);
      if (damageBonus !== 0) {
        // Add bonus to the first damage type or create untyped
        const firstType = Object.keys(damageByType)[0] || '';
        if (!damageByType[firstType]) {
          damageByType[firstType] = { dice: {}, flat: 0 };
        }
        damageByType[firstType].flat += damageBonus;
      }
    }
    
    // Build consolidated damage array
    const result = [];
    for (const [type, damage] of Object.entries(damageByType)) {
      // Build dice formula
      const diceParts = [];
      for (const [sides, count] of Object.entries(damage.dice)) {
        if (count > 0) {
          diceParts.push(`${count}d${sides}`);
        }
      }
      
      let formula = diceParts.join(' + ');
      if (damage.flat !== 0) {
        if (formula) {
          formula += damage.flat > 0 ? ` + ${damage.flat}` : ` - ${Math.abs(damage.flat)}`;
        } else {
          formula = damage.flat.toString();
        }
      }
      
      if (formula) {
        result.push({
          formula: formula,
          type: type || ''
        });
      }
    }
    
    return result;
  }
  
  resolveDamageFormula(formula, abilityMod, item, actor, defaultDamageType = '') {
    if (!formula) return '';
    
    // Parse the formula to separate typed and untyped parts
    // Match patterns like "1d8[piercing]" or "2d6[fire]"
    const typedDiceRegex = /(\d*)d(\d+)\[([^\]]+)\]/g;
    
    // Track damage components by type
    const damageByType = {};
    let remainingFormula = formula;
    
    // Extract typed dice
    let match;
    while ((match = typedDiceRegex.exec(formula)) !== null) {
      const count = parseInt(match[1]) || 1;
      const sides = match[2];
      const type = match[3];
      
      if (!damageByType[type]) {
        damageByType[type] = { dice: [], flat: 0 };
      }
      damageByType[type].dice.push({ count, sides });
      
      // Remove this from the remaining formula
      remainingFormula = remainingFormula.replace(match[0], '');
    }
    
    // Process remaining untyped formula
    remainingFormula = remainingFormula.replace(/@mod/gi, abilityMod.toString());
    
    // Apply global damage bonuses
    let globalBonus = 0;
    const actionType = item?.system?.actionType;
    if (actionType && actor?.system?.bonuses?.[actionType]?.damage) {
      const context = { item: item };
      globalBonus = FormulaParser.evaluate(actor.system.bonuses[actionType].damage, actor, context);
    }
    
    // Calculate total flat modifier for default damage type
    const totalFlat = abilityMod + globalBonus;
    
    // Extract any remaining dice from the formula (untyped)
    const untypedDiceRegex = /(\d*)d(\d+)/g;
    while ((match = untypedDiceRegex.exec(remainingFormula)) !== null) {
      const count = parseInt(match[1]) || 1;
      const sides = match[2];
      
      if (!damageByType[defaultDamageType]) {
        damageByType[defaultDamageType] = { dice: [], flat: 0 };
      }
      damageByType[defaultDamageType].dice.push({ count, sides });
    }
    
    // Add flat damage to default type
    if (totalFlat !== 0) {
      if (!damageByType[defaultDamageType]) {
        damageByType[defaultDamageType] = { dice: [], flat: 0 };
      }
      damageByType[defaultDamageType].flat += totalFlat;
    }
    
    // Build the final formula
    const parts = [];
    const types = [];
    
    for (const [type, damage] of Object.entries(damageByType)) {
      // Consolidate dice of same sides
      const diceMap = {};
      damage.dice.forEach(d => {
        if (!diceMap[d.sides]) diceMap[d.sides] = 0;
        diceMap[d.sides] += d.count;
      });
      
      // Build formula for this damage type
      const diceParts = [];
      for (const [sides, count] of Object.entries(diceMap)) {
        diceParts.push(`${count}d${sides}`);
      }
      
      let typeFormula = diceParts.join(' + ');
      if (damage.flat !== 0) {
        if (diceParts.length > 0) {
          typeFormula += damage.flat > 0 ? ` + ${damage.flat}` : ` - ${Math.abs(damage.flat)}`;
        } else {
          typeFormula = damage.flat.toString();
        }
      }
      
      if (typeFormula) {
        parts.push(typeFormula);
        types.push(type || 'untyped');
      }
    }
    
    // If all damage is the same type, return simple formula
    if (types.length === 1) {
      return parts[0] || '';
    }
    
    // For mixed types, return consolidated formula
    // This maintains compatibility with the current structure
    return parts.join(' + ');
  }
  
  getSchoolLabel(school) {
    if (!school) return 'Unknown';
    
    // Map abbreviations to full names
    const schoolMap = {
      'abj': 'Abjuration',
      'con': 'Conjuration',
      'div': 'Divination',
      'enc': 'Enchantment',
      'evo': 'Evocation',
      'ill': 'Illusion',
      'nec': 'Necromancy',
      'trs': 'Transmutation',
      // Also handle full names (just ensure proper capitalization)
      'abjuration': 'Abjuration',
      'conjuration': 'Conjuration',
      'divination': 'Divination',
      'enchantment': 'Enchantment',
      'evocation': 'Evocation',
      'illusion': 'Illusion',
      'necromancy': 'Necromancy',
      'transmutation': 'Transmutation'
    };
    
    const lowerSchool = school.toLowerCase();
    return schoolMap[lowerSchool] || school.charAt(0).toUpperCase() + school.slice(1);
  }
  
  getSpellAttackBonus(spell, actor) {
    // Use spell's abilityMod if available, otherwise use actor's spellcasting ability
    const spellcastingAbility = spell.abilityMod || actor.system.attributes?.spellcasting || 'int';
    const abilityMod = actor.system.abilities[spellcastingAbility]?.mod || 0;
    const prof = actor.system.attributes?.prof || 2;
    
    // Get any additional attack bonus from the spell
    const spellBonus = parseInt(spell.system.attack?.bonus) || 0;
    
    // Calculate total: ability mod + proficiency + spell bonus
    const total = abilityMod + prof + spellBonus;
    return total >= 0 ? `+${total}` : `${total}`;
  }
  
  normalizeActivation(activation) {
    if (!activation) return null;
    // Remove "1 " prefix from activation (e.g., "1 Action" -> "Action")
    return activation.replace(/^1 /, '');
  }
  
  normalizeTarget(target) {
    if (!target) return null;
    // Keep "Self" capitalized, lowercase everything else
    if (target === 'Self') return target;
    
    // First lowercase the type words
    let normalized = target.replace(/\b(Creature|Creatures|Object|Objects|Humanoid|Humanoids)\b/g, 
                                   match => match.toLowerCase());
    
    // Then fix pluralization: if number > 1, ensure plural form
    normalized = normalized.replace(/(\d+)\s+(creature|object|humanoid)(?!s)/g, (match, num, type) => {
      const count = parseInt(num);
      return count > 1 ? `${num} ${type}s` : match;
    });
    
    return normalized;
  }
}