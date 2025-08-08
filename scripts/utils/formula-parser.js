export class FormulaParser {
  /**
   * Evaluates a formula string, resolving dice notation and @-references
   * @param {string} formula - The formula to evaluate (e.g., "1d4 + @prof + 2")
   * @param {object} actor - The actor object for resolving references
   * @param {object} context - Additional context for resolving references
   * @returns {number} The evaluated result as an integer
   */
  static evaluate(formula, actor, context = {}) {
    if (!formula || typeof formula !== 'string') return 0;
    
    try {
      // Resolve @-references first
      let resolved = this.resolveReferences(formula, actor, context);
      
      // Evaluate dice notation (use average for predictable results)
      resolved = this.resolveDice(resolved);
      
      // Clean up the formula
      resolved = this.cleanFormula(resolved);
      
      // Evaluate the mathematical expression
      return this.safeEval(resolved);
    } catch (error) {
      console.warn(`Mage Hand | Failed to evaluate formula "${formula}":`, error);
      return 0;
    }
  }
  
  /**
   * Resolves @-references in the formula
   */
  static resolveReferences(formula, actor, context = {}) {
    if (!actor) return formula;
    
    let result = formula;
    
    // Handle complex path references like @abilities.str.mod, @skills.acr.total
    result = result.replace(/@([\w.]+)/g, (match, path) => {
      const value = this.resolvePath(actor, path, context);
      return value !== undefined ? value : match;
    });
    
    return result;
  }
  
  /**
   * Resolves a dot-notation path in the actor data
   */
  static resolvePath(actor, path, context = {}) {
    // Handle special shortcuts
    const shortcuts = {
      'str': 'abilities.str.mod',
      'dex': 'abilities.dex.mod',
      'con': 'abilities.con.mod',
      'int': 'abilities.int.mod',
      'wis': 'abilities.wis.mod',
      'cha': 'abilities.cha.mod',
      'prof': 'attributes.prof',
      'proficiency': 'attributes.prof',
      'level': 'details.level',
      'spellMod': `abilities.${actor.system?.attributes?.spellcasting || 'int'}.mod`,
      'spell.mod': `abilities.${actor.system?.attributes?.spellcasting || 'int'}.mod`,
      'spell.dc': 'attributes.spelldc',
      'spelldc': 'attributes.spelldc'
    };
    
    // Handle @mod based on context
    if (path === 'mod') {
      if (context.defaultMod) {
        path = context.defaultMod;
      } else if (context.item) {
        // Determine mod based on item properties
        const item = context.item;
        const actionType = item.system?.actionType;
        
        if (actionType === 'msak' || actionType === 'mwak') {
          // Melee attacks
          if (item.system?.properties?.fin) {
            // Finesse weapons use higher of STR or DEX
            const strMod = actor.system?.abilities?.str?.mod || 0;
            const dexMod = actor.system?.abilities?.dex?.mod || 0;
            return Math.max(strMod, dexMod);
          }
          path = 'abilities.str.mod';
        } else if (actionType === 'rsak' || actionType === 'rwak') {
          // Ranged attacks
          path = 'abilities.dex.mod';
        } else if (item.type === 'spell') {
          // Spell attacks
          const spellAbility = actor.system?.attributes?.spellcasting || 'int';
          path = `abilities.${spellAbility}.mod`;
        } else {
          // Default to STR for unknown
          path = 'abilities.str.mod';
        }
      } else {
        // No context, default to STR
        path = 'abilities.str.mod';
      }
    }
    
    // Check if it's a shortcut
    if (shortcuts[path]) {
      path = shortcuts[path];
    }
    
    // Navigate the path
    const parts = path.split('.');
    let current = actor.system;
    
    for (const part of parts) {
      if (current === null || current === undefined) return 0;
      
      // Handle wildcard notation (e.g., classes.*.levels)
      if (part === '*') {
        // For wildcards, sum all matching values
        if (typeof current === 'object' && !Array.isArray(current)) {
          let sum = 0;
          for (const key in current) {
            const value = current[key]?.levels || 0;
            sum += typeof value === 'number' ? value : 0;
          }
          return sum;
        }
        return 0;
      }
      
      current = current[part];
    }
    
    // Return the final value
    if (typeof current === 'number') return current;
    if (current?.value !== undefined) return current.value;
    if (current?.total !== undefined) return current.total;
    if (current?.mod !== undefined) return current.mod;
    
    // Calculate spell DC if needed
    if (path === 'attributes.spelldc' && !current) {
      const spellAbility = actor.system?.attributes?.spellcasting || 'int';
      const spellMod = actor.system?.abilities?.[spellAbility]?.mod || 0;
      const prof = actor.system?.attributes?.prof || 2;
      return 8 + prof + spellMod;
    }
    
    return 0;
  }
  
  /**
   * Resolves dice notation to average values
   * Using average provides predictable values for UI display
   */
  static resolveDice(formula) {
    // Match dice notation like 1d4, 2d6, d20, etc.
    const diceRegex = /(\d*)[dD](\d+)/g;
    
    return formula.replace(diceRegex, (match, count, sides) => {
      const diceCount = parseInt(count) || 1;
      const diceSides = parseInt(sides);
      
      // Use average roll (e.g., 1d6 = 3.5, round up to 4)
      const average = Math.ceil((diceSides + 1) / 2);
      return diceCount * average;
    });
  }
  
  /**
   * Cleans up the formula for safe evaluation
   */
  static cleanFormula(formula) {
    // Remove any remaining @-references that couldn't be resolved
    let cleaned = formula.replace(/@[\w.]+/g, '0');
    
    // Fix double operators
    cleaned = cleaned.replace(/\+\s*\+/g, '+');
    cleaned = cleaned.replace(/\-\s*\-/g, '+');
    cleaned = cleaned.replace(/\+\s*\-/g, '-');
    cleaned = cleaned.replace(/\-\s*\+/g, '-');
    
    // Remove leading operators
    cleaned = cleaned.replace(/^\s*\+/, '');
    
    // Ensure it's a valid expression (default to 0 if empty)
    cleaned = cleaned.trim() || '0';
    
    return cleaned;
  }
  
  /**
   * Safely evaluates a mathematical expression
   */
  static safeEval(expression) {
    // Validate the expression contains only safe characters
    if (!/^[\d\s+\-*/()]+$/.test(expression)) {
      console.warn(`Mage Hand | Unsafe expression: "${expression}"`);
      return 0;
    }
    
    try {
      // Use Function constructor for safer evaluation than eval()
      const result = new Function(`"use strict"; return (${expression})`)();
      return Math.floor(result);
    } catch (error) {
      console.warn(`Mage Hand | Failed to evaluate expression "${expression}":`, error);
      return 0;
    }
  }
  
  /**
   * Gets the spellcasting ability modifier
   */
  static getSpellMod(actor) {
    const spellAbility = actor.system?.attributes?.spellcasting || 'int';
    return actor.system?.abilities?.[spellAbility]?.mod || 0;
  }
  
  /**
   * Gets the spell DC
   */
  static getSpellDC(actor) {
    const spellMod = this.getSpellMod(actor);
    const prof = actor.system?.attributes?.prof || 2;
    return 8 + prof + spellMod;
  }
}