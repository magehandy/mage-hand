/**
 * Connection Panel Application for Foundry v13
 * Uses ApplicationV2 with HandlebarsApplicationMixin
 */
export class ConnectionAppV13 extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  constructor(ui, options = {}) {
    super(options);
    this.ui = ui;
    this.mageHand = ui.mageHand;
    this.notifications = [];
    this.notificationCounter = 0;
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

  static PARTS = {
    form: {
      id: "form",
      template: "modules/mage-hand/templates/connection-panel.hbs",
      scrollable: [""]
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
      canDisconnect: isConnected,
      notifications: this.notifications
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
    
    // Notification close buttons
    html.querySelectorAll('.notification-close').forEach(btn => {
      btn.addEventListener('click', (event) => {
        const notificationId = parseInt(event.currentTarget.dataset.notificationId);
        this.removeNotification(notificationId);
      });
    });
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
   * Add a notification to the panel
   */
  addNotification(message, type = 'info') {
    const notification = {
      id: ++this.notificationCounter,
      message: message,
      type: type,
      timestamp: Date.now()
    };
    
    this.notifications.unshift(notification);
    
    // Keep only last 10 notifications
    if (this.notifications.length > 10) {
      this.notifications = this.notifications.slice(0, 10);
    }
    
    // Auto-remove success notifications after 5 seconds
    if (type === 'success') {
      setTimeout(() => {
        this.removeNotification(notification.id);
      }, 5000);
    }
    
    this.render(false);
  }
  
  /**
   * Remove a notification
   */
  removeNotification(notificationId) {
    this.notifications = this.notifications.filter(n => n.id !== notificationId);
    this.render(false);
  }
  
  /**
   * Clear all notifications
   */
  clearNotifications() {
    this.notifications = [];
    this.render(false);
  }

  /**
   * Handle window close
   */
  async close(options) {
    this.ui.connectionPanel = null;
    return super.close(options);
  }
}