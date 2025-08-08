/**
 * Utility class for parsing Foundry roll data into a standardized format
 */
export class RollParser {
  /**
   * Parse a roll object into standardized format
   * @param {Roll} roll - The Foundry Roll object to parse
   * @param {string} type - The type of roll (attack, damage, ability, save, skill, etc.)
   * @returns {Object} Parsed roll data in standard format
   */
  static parseRoll(roll, type = 'unknown') {
    if (!roll) return null;
    
    // For damage rolls, parse damage types from formula
    let damageByType = {};
    if (type === 'damage') {
      damageByType = this.parseDamageTypes(roll);
    }
    
    // Parse the roll terms into parts
    const parts = this.parseTerms(roll.terms);
    
    // Rebuild clean formula (or clean the existing formula if no terms)
    const cleanFormula = parts.length > 0 
      ? this.buildCleanFormula(parts)
      : roll.formula?.replace(/\[[\w\s]+\]/g, '').trim();
    
    // Determine advantage/disadvantage
    const hasAdvantage = roll.formula?.includes('2d20kh') || roll.formula?.includes('2d20kl');
    const hasDisadvantage = roll.formula?.includes('2d20kl');
    
    // Check for critical/fumble (primarily for d20 rolls)
    const d20Results = roll.dice?.[0]?.results || [];
    const critical = d20Results.some(r => (r.result || r) === 20);
    const fumble = d20Results.some(r => (r.result || r) === 1);
    
    // Build standardized result
    const result = {
      total: roll.total,
      formula: cleanFormula,
      advantage: hasAdvantage && !hasDisadvantage,
      disadvantage: hasDisadvantage,
      critical: critical,
      type: type,
      timestamp: Date.now()
    };
    
    // Add damage type breakdown for damage rolls
    if (type === 'damage' && Object.keys(damageByType).length > 0) {
      result.damageByType = damageByType;
    }
    
    return result;
  }

  /**
   * Parse roll terms into structured parts
   * @param {Array} terms - Array of roll terms from Foundry
   * @returns {Array} Array of parsed term objects
   */
  static parseTerms(terms) {
    if (!terms) return [];
    
    const parts = [];
    let nextOperator = '+';
    
    for (const term of terms) {
      // Die term
      if (term.class === 'Die' || term.constructor.name === 'Die') {
        parts.push({
          type: 'die',
          formula: term.formula,
          faces: term.faces,
          number: term.number,
          results: term.results.map(r => r.result || r),
          total: term.total,
          operator: nextOperator
        });
        nextOperator = '+';
      } 
      // Numeric term
      else if (term.class === 'NumericTerm' || term.constructor.name === 'NumericTerm') {
        const value = nextOperator === '-' ? -term.number : term.number;
        parts.push({
          type: 'modifier',
          value: value,
          operator: nextOperator
        });
        nextOperator = '+';
      } 
      // Operator term
      else if (term.class === 'OperatorTerm' || term.constructor.name === 'OperatorTerm') {
        nextOperator = term.operator || term.value || '+';
      }
    }
    
    return parts;
  }

  /**
   * Build a clean, readable formula from parsed parts
   * @param {Array} parts - Array of parsed term objects
   * @returns {string} Clean formula string
   */
  static buildCleanFormula(parts) {
    let formula = '';
    
    parts.forEach((part, index) => {
      if (part.type === 'die') {
        if (index > 0 && part.operator === '+') formula += ' + ';
        else if (index > 0 && part.operator === '-') formula += ' - ';
        // Strip damage type annotations like [piercing], [slashing], etc.
        const cleanDieFormula = part.formula.replace(/\[[\w\s]+\]/g, '').trim();
        formula += cleanDieFormula;
      } else if (part.type === 'modifier') {
        if (part.value >= 0) {
          if (index > 0) formula += ' + ';
          formula += Math.abs(part.value);
        } else {
          formula += ' - ';
          formula += Math.abs(part.value);
        }
      }
    });
    
    return formula.trim();
  }

  /**
   * Parse dice data into standardized format
   * @param {Array} dice - Array of dice from roll
   * @returns {Array} Parsed dice array
   */
  static parseDice(dice) {
    if (!dice) return [];
    
    return dice.map(d => ({
      faces: d.faces,
      results: d.results?.map(r => r.result || r) || [],
      total: d.total
    }));
  }

  /**
   * Parse a chat message with rolls into standardized format
   * @param {ChatMessage} message - The chat message containing rolls
   * @param {Object} pending - Pending roll information for context
   * @returns {Object} Parsed roll data with context
   */
  static parseFromMessage(message, pending = {}) {
    if (!message.rolls || message.rolls.length === 0) return null;
    
    const roll = message.rolls[0];
    const actor = game.actors.get(message.speaker?.actor);
    
    // Parse the base roll
    const result = this.parseRoll(roll, pending.type || 'unknown');
    
    // Add actor information
    if (actor) {
      result.actorId = actor.id;
      result.actorName = actor.name;
    }
    
    // Add context from pending information
    if (pending.isItem && pending.itemId) {
      result.type = 'item';
      result.itemId = pending.itemId;
      const item = actor?.items.get(pending.itemId);
      if (item) {
        result.itemName = item.name;
        result.itemType = item.type;
      }
    } else if (pending.isDeathSave) {
      result.type = 'deathSave';
    } else if (pending.isInitiative) {
      result.type = 'initiative';
    } else if (pending.isSave) {
      result.type = 'save';
      result.ability = pending.ability;
    } else if (pending.isSkill) {
      result.type = 'skill';
      result.skill = pending.skill;
    } else if (pending.ability) {
      result.type = 'ability';
      result.ability = pending.ability;
    }
    
    // Try to determine type from message flavor if not set
    if (!result.type || result.type === 'unknown') {
      const flavor = message.flavor?.toLowerCase() || '';
      if (flavor.includes('death save') || flavor.includes('death saving')) {
        result.type = 'deathSave';
      } else if (flavor.includes('initiative')) {
        result.type = 'initiative';
      } else if (flavor.includes('saving throw')) {
        result.type = 'save';
      } else if (flavor.includes('ability check')) {
        result.type = 'ability';
      } else if (flavor.includes('skill check')) {
        result.type = 'skill';
      } else if (flavor.includes('attack')) {
        result.type = 'attack';
      } else if (flavor.includes('damage')) {
        result.type = 'damage';
      }
    }
    
    return result;
  }

  /**
   * Check if a roll is a critical hit (for attacks) or max damage (for damage rolls)
   * @param {Roll} roll - The roll to check
   * @param {string} type - The type of roll
   * @returns {boolean} Whether the roll is critical
   */
  static isCritical(roll, type = 'attack') {
    if (!roll || !roll.dice) return false;
    
    if (type === 'attack') {
      // For attacks, check for natural 20
      return roll.dice[0]?.results?.some(r => (r.result || r) === 20) || false;
    } else if (type === 'damage') {
      // For damage, check if all dice rolled max values
      return roll.dice.every(d => 
        d.results?.every(r => (r.result || r) === d.faces)
      );
    }
    
    return false;
  }

  /**
   * Parse damage types from a roll formula
   * @param {Roll} roll - The roll to parse damage types from
   * @returns {Object} Object with damage types as keys and totals as values
   */
  static parseDamageTypes(roll) {
    const damageByType = {};
    
    // Check if this is a DamageRoll with proper structure
    if (roll.terms && Array.isArray(roll.terms)) {
      let currentOperator = '+';
      let untyped = 0;
      
      for (const term of roll.terms) {
        if (term.class === 'Die' || term.constructor?.name === 'Die') {
          // Get damage type from flavor or fallback to roll options
          const damageType = (term.options?.flavor || roll.options?.type || 'untyped').toLowerCase();
          
          // Sum up active results
          const termTotal = term.results
            ?.filter(r => r.active !== false)
            .reduce((sum, r) => sum + (r.result || 0), 0) || 0;
          
          // Apply operator
          const value = currentOperator === '-' ? -termTotal : termTotal;
          
          if (!damageByType[damageType]) {
            damageByType[damageType] = 0;
          }
          damageByType[damageType] += value;
          
        } else if (term.class === 'NumericTerm' || term.constructor?.name === 'NumericTerm') {
          // Numeric modifiers go to the primary damage type or untyped
          const value = currentOperator === '-' ? -term.number : term.number;
          
          // If we have a main damage type from options, use it; otherwise untyped
          const damageType = (roll.options?.type || 'untyped').toLowerCase();
          
          if (!damageByType[damageType]) {
            damageByType[damageType] = 0;
          }
          damageByType[damageType] += value;
          
        } else if (term.class === 'OperatorTerm' || term.constructor?.name === 'OperatorTerm') {
          currentOperator = term.operator || '+';
        }
      }
    } else {
      // Fallback: parse from formula if no terms available
      const formula = roll.formula || '';
      const typeMatches = formula.matchAll(/\[(\w+)\]/g);
      const types = Array.from(typeMatches).map(m => m[1].toLowerCase());
      
      if (types.length === 1) {
        // Single damage type - assign full total
        damageByType[types[0]] = roll.total;
      } else if (types.length === 0 && roll.total > 0) {
        // No type specified - use untyped
        damageByType.untyped = roll.total;
      } else {
        // Multiple types but no way to split - put in untyped
        damageByType.untyped = roll.total;
      }
    }
    
    // Clean up: remove any types with 0 damage
    for (const type in damageByType) {
      if (damageByType[type] === 0) {
        delete damageByType[type];
      }
    }
    
    // If we have no damage types but have a total, use untyped
    if (Object.keys(damageByType).length === 0 && roll.total > 0) {
      damageByType.untyped = roll.total;
    }
    
    return damageByType;
  }

  /**
   * Combine multiple damage rolls into a single result
   * @param {Array} damageRolls - Array of damage rolls
   * @param {Object} context - Additional context (actor, item, etc.)
   * @returns {Object} Combined damage roll data
   */
  static combineDamageRolls(damageRolls, context = {}) {
    if (!damageRolls || damageRolls.length === 0) return null;
    
    let totalDamage = 0;
    const allFormulas = [];
    const damageByType = {};
    
    damageRolls.forEach(roll => {
      totalDamage += roll.total;
      
      // Build clean formula
      const cleanFormula = roll.formula?.replace(/\[[\w\s]+\]/g, '').trim();
      if (cleanFormula) {
        allFormulas.push(cleanFormula);
      }
      
      // Parse damage types for this roll
      const types = this.parseDamageTypes(roll);
      for (const [type, value] of Object.entries(types)) {
        if (!damageByType[type]) {
          damageByType[type] = 0;
        }
        damageByType[type] += value;
      }
    });
    
    // Build standardized result
    const result = {
      total: totalDamage,
      formula: allFormulas.join(' + '),
      advantage: false,
      disadvantage: false,
      critical: context.isCritical || false,
      type: 'damage',
      timestamp: Date.now()
    };
    
    // Add damage type breakdown if we have any
    if (Object.keys(damageByType).length > 0) {
      result.damageByType = damageByType;
    }
    
    // Add context information
    if (context.itemName) result.itemName = context.itemName;
    if (context.actorId) result.actorId = context.actorId;
    if (context.actorName) result.actorName = context.actorName;
    if (context.messageId) result.messageId = context.messageId;
    
    return result;
  }
}