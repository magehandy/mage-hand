/**
 * UI Factory - Selects the appropriate UI implementation based on Foundry version
 */

// Only import v11 by default since it's the fallback
import { MageHandUIV11 } from './mage-hand-ui-v11.js';

export class UIFactory {
  static async getUI() {
    const foundryVersion = game.version;
    const foundryMajor = parseInt(foundryVersion.split('.')[0]);
    
    console.log(`Mage Hand | Selecting UI for Foundry v${foundryMajor}`);
    
    if (foundryMajor >= 13) {
      console.log('Mage Hand | Using V13 UI (Foundry v13+)');
      // Dynamic import to avoid loading v13 code on older versions
      const { MageHandUIV13 } = await import('./mage-hand-ui-v13.js');
      return new MageHandUIV13();
    } else if (foundryMajor >= 12) {
      console.log('Mage Hand | Using V12 UI (Foundry v12)');
      // Dynamic import to avoid loading v12 code on older versions
      const { MageHandUIV12 } = await import('./mage-hand-ui-v12.js');
      return new MageHandUIV12();
    } else if (foundryMajor >= 11) {
      console.log('Mage Hand | Using V11 UI (Foundry v11)');
      return new MageHandUIV11();
    } else {
      console.warn('Mage Hand | Unsupported Foundry version, using V11 UI as fallback');
      return new MageHandUIV11();
    }
  }
  
  /**
   * Get a singleton instance of the appropriate UI
   */
  static async getInstance() {
    if (!this._instance) {
      this._instance = await this.getUI();
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