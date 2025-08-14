/**
 * Base UI class with common functionality for all Foundry versions
 */
export class BaseMageHandUI {
  constructor() {
    this.connectionPanel = null;
    this.mageHand = null;
  }

  /**
   * Initialize the UI with the main module reference
   */
  init(mageHand) {
    this.mageHand = mageHand;
  }

  /**
   * Inject the Mage Hand button into the settings sidebar
   */
  injectSettingsButton(html) {
    // Check if button already exists to avoid duplicates
    if (html.find('button[data-action="mage-hand"]').length > 0) {
      console.log('Mage Hand | Button already exists, skipping injection');
      return;
    }
    
    // Debug: Log what we're working with
    console.log('Mage Hand | Looking for logout button in:', html[0]);
    
    // Look for various ways the logout button might exist in different Foundry versions
    let logoutButton = html.find('button[data-action="logout"]');
    if (!logoutButton.length) {
      logoutButton = html.find('button[data-app="logout"]');
    }
    if (!logoutButton.length) {
      logoutButton = html.find('button:contains("Log Out")');
    }
    if (!logoutButton.length) {
      // In v13, buttons might be in a different structure
      logoutButton = html.find('.settings-sidebar button').filter(function() {
        return $(this).text().includes('Log Out') || 
               $(this).attr('data-action') === 'logout' ||
               $(this).attr('data-tooltip')?.includes('Log Out');
      });
    }
    
    console.log('Mage Hand | Found logout button:', logoutButton.length, logoutButton);
    
    if (logoutButton.length) {
      // Create our button matching the style of other buttons
      const button = $(`
        <button type="button" data-action="mage-hand">
          <i class="fas fa-mobile-alt"></i>
          ${game.i18n.localize('MAGEHAND.UI.Connect')}
        </button>
      `);

      button.on('click', (event) => {
        event.preventDefault();
        this.toggleConnectionPanel();
      });
      
      // Insert before the logout button
      logoutButton.first().before(button);
      console.log('Mage Hand | Button injected successfully');
      
      // Add connection status indicator
      this.updateButtonStatus(button);
    } else {
      // Fallback: Try to find any button container and append to it
      const buttonContainer = html.find('.settings-sidebar, .directory-footer, .action-buttons').first();
      if (buttonContainer.length) {
        console.log('Mage Hand | Using fallback button container:', buttonContainer);
        const button = $(`
          <button type="button" data-action="mage-hand" style="width: 100%; margin-top: 8px;">
            <i class="fas fa-mobile-alt"></i>
            ${game.i18n.localize('MAGEHAND.UI.Connect')}
          </button>
        `);

        button.on('click', (event) => {
          event.preventDefault();
          this.toggleConnectionPanel();
        });
        
        buttonContainer.append(button);
        console.log('Mage Hand | Button injected via fallback');
        this.updateButtonStatus(button);
      } else {
        console.warn('Mage Hand | Could not find suitable location for button injection');
      }
    }
  }

  /**
   * Update the button to show connection status
   */
  updateButtonStatus(button) {
    if (!button || !button.length) {
      button = $('button[data-action="mage-hand"]');
    }
    
    if (button.length && this.mageHand?.websocketHandler) {
      const isConnected = this.mageHand.websocketHandler.isConnected();
      const state = this.mageHand.websocketHandler.getState();
      
      // Remove existing status classes
      button.removeClass('connected disconnected connecting');
      
      // Add appropriate status class
      button.addClass(state);
      
      // Update button text if needed
      if (isConnected) {
        const sessionCode = game.user.getFlag('mage-hand', 'session')?.code;
        if (sessionCode) {
          button.attr('title', `Connected: ${sessionCode}`);
        }
      } else {
        button.attr('title', 'Click to connect');
      }
    }
  }

  /**
   * Toggle the connection panel - to be implemented by subclasses
   */
  toggleConnectionPanel() {
    if (this.connectionPanel) {
      this.closeConnectionPanel();
    } else {
      this.showConnectionPanel();
    }
  }

  /**
   * Show the connection panel - must be implemented by subclasses
   */
  showConnectionPanel() {
    throw new Error('showConnectionPanel must be implemented by subclass');
  }

  /**
   * Close the connection panel
   */
  closeConnectionPanel() {
    if (this.connectionPanel) {
      this.connectionPanel.close();
      this.connectionPanel = null;
    }
  }

  /**
   * Handle connection state changes
   */
  onConnectionStateChange(state) {
    this.updateButtonStatus();
    
    // Update panel if open
    if (this.connectionPanel) {
      this.connectionPanel.render(false);
    }
  }

  /**
   * Format session age for display
   */
  formatSessionAge(timestamp) {
    if (!timestamp) return 'Unknown';
    
    const age = Date.now() - timestamp;
    const seconds = Math.floor(age / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days}d ${hours % 24}h ago`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m ago`;
    } else if (minutes > 0) {
      return `${minutes}m ago`;
    } else {
      return 'Just now';
    }
  }

  /**
   * Validate session code format
   */
  validateSessionCode(code) {
    // Session codes are in format: REGION-XXX-XXX (e.g., NYC-ABC-123)
    return /^[A-Z]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(code);
  }

  /**
   * Connect to a session with the given code
   */
  async connectToSession(sessionCode) {
    if (!this.validateSessionCode(sessionCode)) {
      ui.notifications.error(game.i18n.localize('MAGEHAND.Status.InvalidCode'));
      return false;
    }
    
    try {
      // Save session to user flags
      await game.user.setFlag('mage-hand', 'session', {
        code: sessionCode,
        timestamp: Date.now(),
        valid: true
      });
      
      // Connect via websocket
      this.mageHand.connect(sessionCode);
      return true;
    } catch (error) {
      console.error('Mage Hand | Failed to connect:', error);
      ui.notifications.error(game.i18n.localize('MAGEHAND.Notifications.ConnectionFailed'));
      return false;
    }
  }

  /**
   * Disconnect from the current session
   */
  async disconnectSession() {
    try {
      // Clear session from user flags
      await game.user.unsetFlag('mage-hand', 'session');
      
      // Disconnect websocket
      this.mageHand.disconnect();
      
      // Update UI
      this.onConnectionStateChange('disconnected');
    } catch (error) {
      console.error('Mage Hand | Failed to disconnect:', error);
    }
  }
}