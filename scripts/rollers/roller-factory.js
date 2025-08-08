/**
 * Roller Factory - Selects the appropriate roller based on Foundry and D&D5e versions
 */

import { RollerV11 } from './roller-v11.js';
import { RollerV12 } from './roller-v12.js';
import { RollerV13 } from './roller-v13.js';

export class RollerFactory {
  static getRoller() {
    const foundryVersion = game.version;
    const foundryMajor = parseInt(foundryVersion.split('.')[0]);
    
    const dnd5eVersion = game.system.version;
    const dnd5eMajor = parseInt(dnd5eVersion.split('.')[0]);
    const dnd5eMinor = parseInt(dnd5eVersion.split('.')[1]);
    
    console.log(`Mage Hand | Detecting roller for Foundry v${foundryMajor} with D&D5e v${dnd5eMajor}.${dnd5eMinor}`);
    
    // D&D5e version is the primary determinant
    if (dnd5eMajor >= 5) {
      // D&D5e v5.x uses same API as v4.x
      console.log('Mage Hand | Using v13 roller (D&D5e v5.x)');
      return new RollerV13();
    } else if (dnd5eMajor === 4) {
      // D&D5e v4.x
      console.log('Mage Hand | Using v12 roller (D&D5e v4.x)');
      return new RollerV12();
    } else if (dnd5eMajor === 3) {
      // D&D5e v3.x uses legacy methods
      console.log('Mage Hand | Using v11 roller (D&D5e v3.x)');
      return new RollerV11();
    } else if (dnd5eMajor === 2) {
      // D&D5e v2.x (very old, but might still be in use)
      console.log('Mage Hand | Using v11 roller (D&D5e v2.x)');
      return new RollerV11();
    }
    
    // Fallback based on Foundry version if D&D5e version is unexpected
    if (foundryMajor >= 13) {
      console.log('Mage Hand | Fallback: Using v13 roller based on Foundry version');
      return new RollerV13();
    } else if (foundryMajor === 12) {
      console.log('Mage Hand | Fallback: Using v12 roller based on Foundry version');
      return new RollerV12();
    } else if (foundryMajor === 11) {
      console.log('Mage Hand | Fallback: Using v11 roller based on Foundry version');
      return new RollerV11();
    } else {
      console.warn('Mage Hand | Unknown version combination, defaulting to v11 roller');
      return new RollerV11();
    }
  }
  
  /**
   * Get a singleton instance of the appropriate roller
   * Cached for the session to avoid recreating
   */
  static getInstance() {
    if (!this._instance) {
      this._instance = this.getRoller();
    }
    return this._instance;
  }
  
  /**
   * Reset the cached instance (useful for testing)
   */
  static reset() {
    this._instance = null;
  }
}