import { ExtractorV11 } from './extractor-v11.js';
import { ExtractorV12 } from './extractor-v12.js';
import { ExtractorV13 } from './extractor-v13.js';

export class ExtractorFactory {
  static getExtractor() {
    const foundryVersion = game.version;
    const dnd5eVersion = game.system.version;
    
    const foundryMajor = parseInt(foundryVersion.split('.')[0]);
    const dnd5eMajor = parseInt(dnd5eVersion.split('.')[0]);
    
    console.log(`Mage Hand | Selecting extractor for Foundry v${foundryMajor}, D&D5e v${dnd5eMajor}`);
    
    if (foundryMajor >= 13 || dnd5eMajor >= 5) {
      console.log('Mage Hand | Using V13 extractor (Foundry v13+/D&D5e v5+)');
      return new ExtractorV13();
    } else if (foundryMajor >= 12 || dnd5eMajor >= 4) {
      console.log('Mage Hand | Using V12 extractor (Foundry v12/D&D5e v4)');
      return new ExtractorV12();
    } else if (foundryMajor >= 11 || dnd5eMajor >= 3) {
      console.log('Mage Hand | Using V11 extractor (Foundry v11/D&D5e v3)');
      return new ExtractorV11();
    } else {
      console.warn('Mage Hand | Unsupported version combination, using V11 extractor as fallback');
      return new ExtractorV11();
    }
  }
  
  static detectVersions() {
    const foundryVersion = game.version;
    const dnd5eVersion = game.system.version;
    
    const foundryMajor = parseInt(foundryVersion.split('.')[0]);
    const foundryMinor = parseInt(foundryVersion.split('.')[1]);
    const dnd5eMajor = parseInt(dnd5eVersion.split('.')[0]);
    const dnd5eMinor = parseInt(dnd5eVersion.split('.')[1]);
    
    return {
      foundry: {
        full: foundryVersion,
        major: foundryMajor,
        minor: foundryMinor
      },
      dnd5e: {
        full: dnd5eVersion,
        major: dnd5eMajor,
        minor: dnd5eMinor
      },
      compatible: this.isCompatible(foundryMajor, dnd5eMajor)
    };
  }
  
  static isCompatible(foundryMajor, dnd5eMajor) {
    const compatibilityMatrix = {
      11: [3],
      12: [4],
      13: [5]
    };
    
    const supportedDnd5eVersions = compatibilityMatrix[foundryMajor];
    if (!supportedDnd5eVersions) {
      return false;
    }
    
    return supportedDnd5eVersions.includes(dnd5eMajor);
  }
  
  static getVersionString() {
    const versions = this.detectVersions();
    return `Foundry v${versions.foundry.full} | D&D5e v${versions.dnd5e.full}`;
  }
}