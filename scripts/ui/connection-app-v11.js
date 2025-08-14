/**
 * Connection Panel Application for Foundry v11
 * Uses the legacy Application class
 */
export class ConnectionAppV11 extends Application {
  constructor(ui) {
    super();
    this.ui = ui;
    this.mageHand = ui.mageHand;
    this.notifications = [];
    this.notificationCounter = 0;
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: "mage-hand-connection",
      title: game.i18n.localize("MAGEHAND.UI.Connect"),
      template: "modules/mage-hand/templates/connection-panel.hbs",
      width: 400,
      height: "auto",
      resizable: false,
      classes: ["mage-hand", "connection-panel"]
    });
  }

  /**
   * Prepare data for rendering
   */
  getData(options) {
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

    return {
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
    };
  }

  /**
   * Activate event listeners
   */
  activateListeners(html) {
    super.activateListeners(html);
    
    // Session code input formatting
    const sessionInput = html.find('#session-code-input');
    if (sessionInput.length) {
      // Focus on input if not connected
      if (!this.mageHand?.websocketHandler?.isConnected()) {
        setTimeout(() => sessionInput[0].focus(), 100);
      }
      
      // Auto-format input as user types
      sessionInput.on('input', (event) => {
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
        const connectBtn = html.find('#connect-btn');
        const isValid = this.ui.validateSessionCode(value);
        connectBtn.prop('disabled', !isValid);
        
        // Add visual feedback for valid/invalid input
        if (value.length === 11) {
          sessionInput.toggleClass('invalid', !isValid);
          sessionInput.toggleClass('valid', isValid);
        } else {
          sessionInput.removeClass('invalid valid');
        }
      });
      
      // Handle Enter key submission
      sessionInput.on('keypress', async (event) => {
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
    html.find('#connect-btn').on('click', async (event) => {
      event.preventDefault();
      const sessionCode = html.find('#session-code-input').val();
      if (sessionCode) {
        await this._handleConnect(sessionCode);
      }
    });
    
    // Disconnect button
    html.find('#disconnect-btn').on('click', async (event) => {
      event.preventDefault();
      await this._handleDisconnect();
    });
    
    // Disconnect specific device buttons
    html.find('.disconnect-device-btn').on('click', async (event) => {
      event.preventDefault();
      const clientId = $(event.currentTarget).data('client-id');
      if (clientId) {
        await this._handleDisconnectDevice(clientId);
      }
    });
    
    // Copy session code button
    html.find('#copy-code-btn').on('click', (event) => {
      event.preventDefault();
      const sessionCode = html.find('.session-code-display').text();
      if (sessionCode) {
        this._copyToClipboard(sessionCode);
      }
    });
    
    // Notification close buttons
    html.find('.notification-close').on('click', (event) => {
      const notificationId = parseInt($(event.currentTarget).data('notification-id'));
      this.removeNotification(notificationId);
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
    // This would send a message to disconnect a specific client
    // Implementation depends on websocket protocol
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