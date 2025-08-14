/**
 * Connection Panel Application for Foundry v12
 * Uses ApplicationV2
 */
export class ConnectionAppV12 extends foundry.applications.api.ApplicationV2 {
  constructor(ui, options = {}) {
    super(options);
    this.ui = ui;
    this.mageHand = ui.mageHand;
  }

  static DEFAULT_OPTIONS = {
    id: "mage-hand-connection",
    classes: ["mage-hand", "connection-panel"],
    position: { width: 400 },
    window: {
      icon: "fas fa-mobile-alt",
      title: "MAGEHAND.UI.Connect",
      contentClasses: ["standard-form"]
    }
  };

  get title() {
    return game.i18n.localize("MAGEHAND.UI.Connect");
  }

  /**
   * Prepare rendering context data
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    
    const session = game.user.getFlag('mage-hand', 'session');
    const wsHandler = this.mageHand?.websocketHandler;
    const isConnected = wsHandler?.isConnected() || false;
    const connectionState = wsHandler?.getState() || 'disconnected';
    
    // Get connected clients from websocket handler
    const connectedClients = wsHandler?.connectedClients ? 
      Array.from(wsHandler.connectedClients.values()).map(client => ({
        ...client,
        deviceName: client.getDisplayName(),
        characterName: client.stateData?.selectedActor?.name
      })) : [];

    return foundry.utils.mergeObject(context, {
      isConnected: isConnected,
      connectionState: connectionState,
      sessionCode: session?.code || '',
      sessionAge: session?.timestamp ? this.ui.formatSessionAge(session.timestamp) : '',
      connectedClients: connectedClients,
      worldId: game.world.id,
      userName: game.user.name,
      canConnect: !isConnected,
      canDisconnect: isConnected
    });
  }

  /**
   * Actions performed after rendering
   */
  _onRender(context, options) {
    super._onRender(context, options);
    this._attachListeners();
  }

  /**
   * Attach event listeners
   */
  _attachListeners() {
    const html = this.element;
    if (!html) return;
    
    // Session code input formatting
    const sessionInput = html.querySelector('#session-code-input');
    if (sessionInput) {
      // Focus on input if not connected
      if (!this.mageHand?.websocketHandler?.isConnected()) {
        setTimeout(() => sessionInput.focus(), 100);
      }
      
      // Remove old listener if exists
      const oldInput = sessionInput.cloneNode(true);
      sessionInput.parentNode.replaceChild(oldInput, sessionInput);
      
      // Auto-format input as user types
      oldInput.addEventListener('input', (event) => {
        let value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        
        // Insert hyphens at appropriate positions
        if (value.length > 3) {
          value = value.slice(0, 3) + '-' + value.slice(3);
        }
        if (value.length > 7) {
          value = value.slice(0, 7) + '-' + value.slice(7, 10);
        }
        
        event.target.value = value;
        
        // Enable/disable connect button based on valid input
        const connectBtn = html.querySelector('#connect-btn');
        const isValid = this.ui.validateSessionCode(value);
        if (connectBtn) {
          connectBtn.disabled = !isValid;
        }
        
        // Add visual feedback for valid/invalid input
        if (value.length === 11) {
          oldInput.classList.toggle('invalid', !isValid);
          oldInput.classList.toggle('valid', isValid);
        } else {
          oldInput.classList.remove('invalid', 'valid');
        }
      });
      
      // Handle Enter key submission
      oldInput.addEventListener('keypress', async (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          const value = event.target.value;
          if (this.ui.validateSessionCode(value)) {
            await this._handleConnect(value);
          }
        }
      });
    }
    
    // Connect button
    const connectBtn = html.querySelector('#connect-btn');
    if (connectBtn) {
      const newBtn = connectBtn.cloneNode(true);
      connectBtn.parentNode.replaceChild(newBtn, connectBtn);
      
      newBtn.addEventListener('click', async () => {
        const sessionCode = html.querySelector('#session-code-input')?.value;
        if (sessionCode) {
          await this._handleConnect(sessionCode);
        }
      });
    }
    
    // Disconnect button
    const disconnectBtn = html.querySelector('#disconnect-btn');
    if (disconnectBtn) {
      const newBtn = disconnectBtn.cloneNode(true);
      disconnectBtn.parentNode.replaceChild(newBtn, disconnectBtn);
      
      newBtn.addEventListener('click', async () => {
        await this._handleDisconnect();
      });
    }
    
    // Disconnect specific device buttons
    html.querySelectorAll('.disconnect-device-btn').forEach(btn => {
      btn.addEventListener('click', async (event) => {
        const clientId = event.currentTarget.dataset.clientId;
        if (clientId) {
          await this._handleDisconnectDevice(clientId);
        }
      });
    });
    
    // Copy session code button
    const copyBtn = html.querySelector('#copy-code-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const sessionCode = html.querySelector('.session-code-display')?.textContent;
        if (sessionCode) {
          this._copyToClipboard(sessionCode);
        }
      });
    }
  }

  /**
   * Handle connection
   */
  async _handleConnect(sessionCode) {
    const success = await this.ui.connectToSession(sessionCode);
    if (success) {
      this.render(false);
    }
  }

  /**
   * Handle disconnection
   */
  async _handleDisconnect() {
    await this.ui.disconnectSession();
    this.render(false);
  }

  /**
   * Handle disconnecting a specific device
   */
  async _handleDisconnectDevice(clientId) {
    console.log(`Mage Hand | Disconnecting device: ${clientId}`);
    ui.notifications.info(`Disconnecting device ${clientId}`);
    this.render(false);
  }

  /**
   * Copy text to clipboard
   */
  _copyToClipboard(text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        ui.notifications.info(game.i18n.localize('MAGEHAND.UI.CodeCopied'));
      }).catch(err => {
        console.error('Mage Hand | Failed to copy:', err);
      });
    } else {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      ui.notifications.info(game.i18n.localize('MAGEHAND.UI.CodeCopied'));
    }
  }

  /**
   * Get template path
   */
  get template() {
    return "modules/mage-hand/templates/connection-panel.hbs";
  }

  /**
   * Handle window close
   */
  async close(options) {
    this.ui.connectionPanel = null;
    return super.close(options);
  }
}