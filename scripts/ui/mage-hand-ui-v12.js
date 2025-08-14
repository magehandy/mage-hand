/**
 * Mage Hand UI for Foundry v12 (ApplicationV2)
 */

import { BaseMageHandUI } from './base-ui.js';

export class MageHandUIV12 extends BaseMageHandUI {
  constructor() {
    super();
    this.version = 'v12';
  }

  /**
   * Show the connection panel using Foundry v12 ApplicationV2
   */
  async showConnectionPanel() {
    if (this.connectionPanel) {
      this.connectionPanel.render(true, { focus: true });
      return;
    }

    // Dynamic import to avoid loading on incompatible versions
    const { ConnectionAppV12 } = await import('./connection-app-v12.js');
    this.connectionPanel = new ConnectionAppV12(this);
    this.connectionPanel.render(true);
  }
}