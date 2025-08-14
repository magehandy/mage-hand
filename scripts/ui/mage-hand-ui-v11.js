/**
 * Mage Hand UI for Foundry v11 (Legacy Application)
 */

import { BaseMageHandUI } from './base-ui.js';
import { ConnectionAppV11 } from './connection-app-v11.js';

export class MageHandUIV11 extends BaseMageHandUI {
  constructor() {
    super();
    this.version = 'v11';
  }

  /**
   * Show the connection panel using Foundry v11 Application
   */
  showConnectionPanel() {
    if (this.connectionPanel) {
      this.connectionPanel.render(true, { focus: true });
      return;
    }

    this.connectionPanel = new ConnectionAppV11(this);
    this.connectionPanel.render(true);
  }
}