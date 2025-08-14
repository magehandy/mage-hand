/**
 * Mage Hand UI for Foundry v13 (ApplicationV2 with HandlebarsApplicationMixin)
 */

import { BaseMageHandUI } from './base-ui.js';

export class MageHandUIV13 extends BaseMageHandUI {
  constructor() {
    super();
    this.version = 'v13';
  }

  /**
   * Show the connection panel using Foundry v13 ApplicationV2 with Handlebars
   */
  async showConnectionPanel() {
    if (this.connectionPanel) {
      this.connectionPanel.render(true, { focus: true });
      return;
    }

    // Dynamic import to avoid loading on incompatible versions
    const { ConnectionAppV13 } = await import('./connection-app-v13.js');
    this.connectionPanel = new ConnectionAppV13(this);
    this.connectionPanel.render(true);
  }
}