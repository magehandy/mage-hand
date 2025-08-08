# Mage Hand

A Foundry VTT module for D&D 5e that enables real-time character synchronization with the Mage Hand iOS companion app.

## Features

- **Real-time Character Sync**: Automatically syncs character data to your iOS device
- **Comprehensive Data Extraction**: Includes abilities, skills, spells, weapons, HP, conditions, and more
- **Multi-Version Support**: Compatible with Foundry VTT v11-13 and D&D 5e system v3-5
- **Dice Rolling API**: Roll dice from your mobile device directly in Foundry
- **Schema Versioning**: Future-proof data structure with versioning support

## Installation

### Method 1: Manifest URL
1. In Foundry VTT, go to **Add-on Modules**
2. Click **Install Module**
3. Paste this manifest URL: `https://github.com/magehandy/mage-hand/releases/latest/download/module.json`
4. Click **Install**

### Method 2: Manual Installation
1. Download the latest release from [GitHub Releases](https://github.com/magehandy/mage-hand/releases)
2. Extract the ZIP file to your Foundry VTT `Data/modules` directory
3. Restart Foundry VTT
4. Enable the module in your world

## Setup

1. **Enable the Module**: In your world, go to **Game Settings** → **Manage Modules** and enable Mage Hand
2. **Get the iOS App**: Download Mage Hand from the App Store (coming soon)
3. **Connect**: 
   - Open the iOS app and tap "Create Session"
   - Enter the session code (format: US-XXX-XXX) in Foundry's module settings
   - Your character data will sync automatically

## Usage

### For Players
- Your character data syncs automatically when changes are made in Foundry
- Use the iOS app to view character stats, spell lists, and inventory
- Roll dice from your phone - results appear in Foundry's chat

### For GMs
- All players' characters can be synced simultaneously
- GM can impersonate any character for syncing
- Control which characters sync through Foundry's permissions

## Compatibility

| Foundry Version | D&D 5e System | Status |
|-----------------|---------------|---------|
| v11.315 | v3.3.x | ✅ Supported |
| v12.331 | v4.0.x | ✅ Supported |
| v13.346 | v5.0.x | ✅ Supported |

## API Documentation

The module exposes a comprehensive API for dice rolling and character data extraction:

```javascript
// Extract character data
mageHand.extractCharacterData("Character Name")

// Roll dice
mageHand.rollAbilityTest("Character Name", "str", "advantage")
mageHand.rollSkillCheck("Character Name", "athletics", "normal")
mageHand.rollInitiative("Character Name", "disadvantage")
```

See [API Documentation](docs/api.md) for complete reference.

## Development

### Project Structure
```
mage-hand/
├── scripts/          # Module logic
│   ├── extractors/   # Version-specific data extractors
│   ├── rollers/      # Dice rolling implementations
│   ├── schemas/      # Data schema definitions
│   └── utils/        # Utility functions
├── templates/        # HTML templates
├── lang/            # Translations
└── module.json      # Module manifest
```

### Contributing
Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) before submitting PRs.

### Building from Source
```bash
git clone https://github.com/magehandy/mage-hand.git
cd mage-hand
# No build step required - pure JavaScript module
```

## Related Projects

- [Mage Hand iOS](https://github.com/magehandy/mage-hand-ios) - iOS companion app (private)
- [Mage Hand Relay](https://github.com/magehandy/mage-hand-relay) - WebSocket relay server (private)

## Support

- **Issues**: [GitHub Issues](https://github.com/magehandy/mage-hand/issues)
- **Discord**: Coming soon
- **Documentation**: [Wiki](https://github.com/magehandy/mage-hand/wiki)

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Credits

Created by the Mage Hand team for the Foundry VTT and D&D 5e community.

---

**Note**: This module requires a Mage Hand subscription for the iOS app functionality. The Foundry module itself is free and open source.