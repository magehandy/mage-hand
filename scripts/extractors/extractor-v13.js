import { BaseExtractor } from './base-extractor.js';
import { FormulaParser } from '../utils/formula-parser.js';

export class ExtractorV13 extends BaseExtractor {
  constructor() {
    super();
    this.version = 'v13-dnd5e-v5';
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
    const items = actor.items.filter(i => i.type === 'class' && i.system.isOriginalClass);
    
    return items.map(act => {
      const identifier = act.system.identifier || '';
      const subclasses = actor.items
        .filter(i => i.type === 'subclass' && i.system.classIdentifier === identifier)
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
        level: item.system.level,
        activation: item.labels.activation,
        prepared: this.isSpellPrepared(item),
        range: item.labels.range || '',
        target: this.getTargetLabel(item),
        school: item.labels.school || 'Unknown',
        concentration: item.requiresConcentration !== undefined ? item.requiresConcentration : 
                      (item.system.duration?.concentration || false)
      };
      
      // Add casting mode if special
      const castingMode = this.getSpellCastingMode(item);
      if (castingMode) {
        data.castingMode = castingMode;
      }
      
      // Check if spell has an attack roll using D&D5e v5 activities
      let hasAttack = false;
      if (item.system.activities) {
        const firstActivity = Object.values(item.system.activities)[0];
        if (firstActivity?.attack?.type?.value) {
          const attackType = firstActivity.attack.type.value;
          hasAttack = (attackType === 'msak' || attackType === 'rsak');
        }
      }
      if (hasAttack) {
        data.toHit = this.getSpellAttackBonus(item, actor);
      } else if (item.labels.toHit) {
        data.toHit = item.labels.toHit;
      }
      
      if (item.system.uses?.max) {
        data.uses = {
          value: item.system.uses.value || 0,
          max: item.system.uses.max
        };
      }
      
      return data;
    });
  }

  getWeapons(actor) {
    const items = actor.items.filter(i => i.type === 'weapon');
    
    return items.map(item => {
      // Calculate attack bonus with FormulaParser for bonuses
      const toHit = this.getAttackBonus(item, actor);
      
      // Process damage with bonuses
      let dmg = [];
      if (item.labels.damages?.length > 0) {
        dmg = item.labels.damages.map(dmg => ({
          formula: dmg.formula,
          type: dmg.damageType
        }));
      } else if (item.system.damage?.parts) {
        const abilityMod = this.getWeaponAbilityMod(item, actor);
        dmg = this.consolidateDamage(item.system.damage.parts, abilityMod, item, actor);
      }
      
      const data = {
        name: item.name,
        img: item.img,
        type: item.system.type?.label || 'Unknown',
        activation: item.labels.activation,
        toHit: toHit,
        dmg: dmg,
        equipped: item.system.equipped,
        range: item.labels.range,
        properties: item.labels.properties?.map(prop => prop.label) || []
      };
      
      if (item.system.uses?.max) {
        data.uses = {
          value: item.system.uses.value || 0,
          max: item.system.uses.max
        };
      }
      
      return data;
    });
  }

  getAbilities(actor) {
    const abilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
    const result = {};
    
    abilities.forEach(ab => {
      const ability = actor.system.abilities[ab];
      // D&D5e v5 uses save.value format
      const saveValue = ability?.save?.value !== undefined ? ability.save.value : ability?.mod || 0;
      
      result[ab] = {
        value: ability?.value || 10,
        modifier: ability?.mod || 0,
        proficient: ability?.proficient || 0,
        saveValue: saveValue
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
      result[sk] = {
        passive: skill?.passive || 10,
        modifier: skill?.total || 0,
        proficient: skill?.proficient || 0
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
      name: effect.name,
      img: effect.img
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
      modifier: actor.system.attributes.init?.total || actor.system.attributes.init?.mod || 0
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
  
  getWeaponAbilityMod(item, actor) {
    // Check for explicit ability setting first
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
    
    // Get actionType from D&D5e v5 activities
    let actionType = null;
    if (item.system.activities) {
      const firstActivity = Object.values(item.system.activities)[0];
      if (firstActivity) {
        actionType = firstActivity.attack?.type?.value || null;
      }
    }
    
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
    
    // Check weapon type if no actionType found
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
    
    // Apply global damage bonuses using D&D5e v5 activities
    let actionType = null;
    if (item?.system?.activities) {
      const firstActivity = Object.values(item.system.activities)[0];
      if (firstActivity) {
        actionType = firstActivity.attack?.type?.value || null;
      }
    }
    
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
    const typedDiceRegex = /(\d*d\d+)\[([^\]]+)\]/g;
    let typedParts = [];
    let untypedFormula = formula;
    
    // Extract typed dice and replace with placeholders
    let match;
    while ((match = typedDiceRegex.exec(formula)) !== null) {
      typedParts.push({ dice: match[1], type: match[2] });
      untypedFormula = untypedFormula.replace(match[0], match[1]);
    }
    
    // Replace @mod with the actual modifier (untyped, will use defaultDamageType)
    let resolved = untypedFormula.replace(/@mod/gi, abilityMod >= 0 ? `+ ${abilityMod}` : `- ${Math.abs(abilityMod)}`);
    
    // Apply global damage bonuses using D&D5e v5 activities
    let actionType = null;
    if (item?.system?.activities) {
      const firstActivity = Object.values(item.system.activities)[0];
      if (firstActivity) {
        actionType = firstActivity.attack?.type?.value || null;
      }
    }
    
    if (actionType && actor?.system?.bonuses?.[actionType]?.damage) {
      const context = { item: item };
      const damageBonus = FormulaParser.evaluate(actor.system.bonuses[actionType].damage, actor, context);
      if (damageBonus !== 0) {
        resolved += damageBonus >= 0 ? ` + ${damageBonus}` : ` - ${Math.abs(damageBonus)}`;
      }
    }
    
    // Re-insert damage type tags for typed dice
    typedParts.forEach(part => {
      resolved = resolved.replace(part.dice, `${part.dice}[${part.type}]`);
    });
    
    // Clean up double operators
    resolved = resolved.replace(/\+\s*\+/g, '+').replace(/\-\s*\-/g, '+').replace(/\+\s*\-/g, '-');
    
    // Clean up leading operators if modifier is already signed
    resolved = resolved.replace(/^[\s\+]+/, '').trim();
    
    return resolved;
  }
  
  getAttackBonus(item, actor) {
    // Use D&D5e v5 activities system
    let attackBonus = 0;
    let actionType = null;
    
    if (item.system.activities) {
      const firstActivity = Object.values(item.system.activities)[0];
      if (firstActivity) {
        attackBonus = firstActivity.attack?.bonus || 0;
        actionType = firstActivity.attack?.type?.value || null;
      }
    }
    
    const prof = actor.system.attributes.prof || 2;
    
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
  
  isSpellPrepared(item) {
    const mode = item.system.preparation?.mode;
    
    // These modes mean the spell is always available
    if (mode === 'atwill' || mode === 'innate' || mode === 'always' || 
        mode === 'pact' || mode === 'ritual') {
      return true;
    }
    
    // For prepared mode, check if it's actually prepared
    if (mode === 'prepared') {
      return item.system.preparation?.prepared || false;
    }
    
    // Default to not prepared
    return false;
  }
  
  getSpellCastingMode(item) {
    const mode = item.system.preparation?.mode;
    
    if (mode === 'atwill' || mode === 'innate') {
      return 'atwill';
    } else if (mode === 'ritual') {
      return 'ritual';
    }
    
    return null;  // No special mode
  }
  
  getTargetLabel(item) {
    // v13 usually has well-formatted labels
    if (item.labels?.target) {
      return item.labels.target;
    }
    
    // Parse system.target if labels not available
    const target = item.system?.target;
    if (!target) return '';
    
    // Check for affects.labels (v13 format)
    if (target.affects?.labels?.sheet) {
      // Use the pre-formatted sheet label as-is
      return target.affects.labels.sheet;
    }
    
    // Handle template areas
    if (target.template?.size && target.template?.type) {
      return `${target.template.size} ft ${target.template.type}`;
    }
    
    return '';
  }
  
  getSpellAttackBonus(spell, actor) {
    // Get spellcasting ability
    const spellcastingAbility = actor.system.attributes?.spellcasting || 'int';
    const abilityMod = actor.system.abilities[spellcastingAbility]?.mod || 0;
    const prof = actor.system.attributes?.prof || 2;
    
    // Get attack bonus and action type from D&D5e v5 activities
    let spellBonus = 0;
    let actionType = null;
    
    if (spell.system.activities) {
      const firstActivity = Object.values(spell.system.activities)[0];
      if (firstActivity) {
        spellBonus = parseInt(firstActivity.attack?.bonus) || 0;
        actionType = firstActivity.attack?.type?.value || null;
      }
    }
    
    // Apply global spell attack bonuses
    let globalBonus = 0;
    if (actionType && actor.system?.bonuses?.[actionType]?.attack) {
      const context = { item: spell };
      globalBonus = FormulaParser.evaluate(actor.system.bonuses[actionType].attack, actor, context);
    }
    
    // Calculate total: ability mod + proficiency + spell bonus + global bonus
    const total = abilityMod + prof + spellBonus + globalBonus;
    return total >= 0 ? `+${total}` : `${total}`;
  }
}