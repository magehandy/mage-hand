/**
 * WebSocket Handler v2 for Mage Hand Module
 * Implements Protocol v2 with state-based communication
 */

import { logger } from './utils/logger.js';

// Connection States
const ConnectionState = {
  DISCONNECTED: 'DISCONNECTED',
  JOINING: 'JOINING',
  JOINED: 'JOINED',
  INIT: 'INIT',
  SETUP: 'SETUP',
  PLAY: 'PLAY',
  SUSPENDED: 'SUSPENDED'
};

// Message Types
const MessageType = {
  // Pre-connection
  PRE_JOIN: 'PRE:JOIN',
  PRE_JOIN_ACK: 'PRE:JOIN:ACK',
  PRE_JOIN_RESUME: 'PRE:JOIN:RESUME',
  PRE_JOIN_RESET: 'PRE:JOIN:RESET',
  PRE_JOIN_NEW: 'PRE:JOIN:NEW',
  PRE_JOINED: 'PRE:JOINED',

  // Initialization
  INIT_HELO: 'INIT:HELO',
  INIT_HELO_ACK: 'INIT:HELO:ACK',
  INIT_DENY: 'INIT:DENY',
  INIT_REQ_STATE: 'INIT:REQ:STATE',
  INIT_SEND_STATE: 'INIT:SEND:STATE',

  // Setup
  SETUP_REQ_PLAYERS: 'SETUP:REQ:PLAYERS',
  SETUP_SEND_PLAYERS: 'SETUP:SEND:PLAYERS',
  SETUP_REQ_ACTORS: 'SETUP:REQ:ACTORS',
  SETUP_SEND_ACTORS: 'SETUP:SEND:ACTORS',
  SETUP_REQ_ACTOR: 'SETUP:REQ:ACTOR',
  SETUP_SEND_ACTOR: 'SETUP:SEND:ACTOR',
  SETUP_ACTOR_ACK: 'SETUP:ACTOR:ACK',

  // Play
  PLAY_REQ_INIT: 'PLAY:REQ:INIT',
  PLAY_REQ_ABILITY: 'PLAY:REQ:ABILITY',
  PLAY_REQ_SKILL: 'PLAY:REQ:SKILL',
  PLAY_COMBAT_START: 'PLAY:COMBAT:START',
  PLAY_COMBAT_NEXT: 'PLAY:COMBAT:NEXT',
  PLAY_COMBAT_YOU: 'PLAY:COMBAT:YOU',
  PLAY_COMBAT_END: 'PLAY:COMBAT:END',
  PLAY_UPDATE_ACTOR: 'PLAY:UPDATE:ACTOR',
  PLAY_USE_ITEM: 'PLAY:USE:ITEM',
  PLAY_CHECK_ABILITY: 'PLAY:CHECK:ABILITY',
  PLAY_SAVE_ABILITY: 'PLAY:SAVE:ABILITY',
  PLAY_CHECK_SKILL: 'PLAY:CHECK:SKILL',
  PLAY_ATTACK_WEAPON: 'PLAY:ATTACK:WEAPON',
  PLAY_CAST_SPELL: 'PLAY:CAST:SPELL',
  PLAY_ROLL_CUSTOM: 'PLAY:ROLL:CUSTOM',

  // Connection status
  CONNECTION_SUSPENDED: 'CONNECTION:SUSPENDED',
  CONNECTION_RESUMED: 'CONNECTION:RESUMED',
  CONNECTION_LOST: 'CONNECTION:LOST',

  // Error
  ERROR: 'ERROR',
};

// Mobile client state tracking
class MobileClient {
  constructor(clientId, clientType = 'mobile') {
    this.clientId = clientId; // Stable device/user ID
    this.clientType = clientType;
    this.clientInfo = null; // Display info (username, device, etc)
    this.displayName = null; // Friendly display name
    this.state = ConnectionState.JOINED;
    this.stateData = {
      schemaVersion: '1.0.0',
      enabledFeatures: [],
      selectedPlayer: null,
      selectedActor: null,
    };
    this.lastActivity = Date.now();
  }

  updateState(newState) {
    this.state = newState;
    this.lastActivity = Date.now();
  }

  updateStateData(updates) {
    this.stateData = { ...this.stateData, ...updates };
    this.lastActivity = Date.now();
  }
  
  getDisplayName() {
    if (this.displayName) return this.displayName;
    if (this.clientInfo?.username && this.clientInfo?.deviceModel) {
      return `${this.clientInfo.username}'s ${this.clientInfo.deviceModel}`;
    }
    return 'Unknown Device';
  }
}

export class WebSocketHandler {
  constructor(mageHand) {
    this.mageHand = mageHand;
    this.socket = null;
    this.sessionCode = null;
    this.connectionState = ConnectionState.DISCONNECTED;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.reconnectDelay = 1000;
    this.heartbeatInterval = null;
    
    // Connected mobile clients - map of clientId -> MobileClient
    this.mobileClients = new Map();
    
    // Client snapshots for storing actor data
    this.clientSnapshots = new Map();
  }
  
  /**
   * Send notification to connection panel if open
   */
  notifyPanel(message, type = 'info') {
    // Send to Foundry UI notifications as well for visibility
    switch(type) {
      case 'error':
        ui.notifications.error(message);
        break;
      case 'warning':
        ui.notifications.warn(message);
        break;
      case 'success':
        ui.notifications.info(message);
        break;
      default:
        ui.notifications.info(message);
    }
    
    // Send to connection panel if it's open
    const connectionPanel = this.mageHand?.ui?.connectionPanel;
    if (connectionPanel && connectionPanel.rendered) {
      connectionPanel.addNotification(message, type);
    }
  }

  /**
   * Parse region from session code and get server URL
   */
  getServerUrl(sessionCode) {
    const parts = sessionCode.split('-');
    if (parts.length !== 3) {
      throw new Error(`Invalid session code format: ${sessionCode}`);
    }
    
    const region = parts[0].toLowerCase();
    
    // Map regions to server URLs
    const regionUrls = {
      'nyc': 'wss://nyc-ws.magehand.org/ws',
      'sfo': 'wss://sfo-ws.magehand.org/ws',
      'ams': 'wss://ams-ws.magehand.org/ws',
      'lon': 'wss://lon-ws.magehand.org/ws',
      'fra': 'wss://fra-ws.magehand.org/ws',
      'tor': 'wss://tor-ws.magehand.org/ws',
      'sgp': 'wss://sgp-ws.magehand.org/ws',
      'blr': 'wss://blr-ws.magehand.org/ws'
    };
    
    const serverUrl = regionUrls[region];
    if (!serverUrl) {
      throw new Error(`Unknown region: ${region}. Valid regions: ${Object.keys(regionUrls).join(', ')}`);
    }
    
    return serverUrl;
  }

  /**
   * Connect to relay server with session code
   */
  connect(sessionCode) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      logger.info('Mage Hand | Already connected');
      return;
    }
    
    this.sessionCode = sessionCode;
    this.reconnectAttempts = 0;
    
    try {
      const serverUrl = this.getServerUrl(sessionCode);
      logger.info(`Mage Hand | Connecting to ${serverUrl} with code ${sessionCode}`);
      
      this.socket = new WebSocket(serverUrl);
      this.setupEventHandlers();
      this.updateConnectionState(ConnectionState.JOINING);
    } catch (error) {
      logger.error('Mage Hand | Connection error:', error);
      ui.notifications.error(`Failed to connect: ${error.message}`);
      this.updateConnectionState(ConnectionState.DISCONNECTED);
    }
  }

  /**
   * Setup WebSocket event handlers
   */
  setupEventHandlers() {
    this.socket.onopen = this.onOpen.bind(this);
    this.socket.onmessage = this.onMessage.bind(this);
    this.socket.onerror = this.onError.bind(this);
    this.socket.onclose = this.onClose.bind(this);
  }

  /**
   * Handle WebSocket connection opened
   */
  onOpen() {
    logger.info('Mage Hand | WebSocket connected, sending PRE:JOIN');
    
    // Use game.user.id as the stable client ID for Foundry
    const clientId = game.user.id;
    
    // Send PRE:JOIN message
    const message = {
      type: MessageType.PRE_JOIN,
      sessionCode: this.sessionCode,
      clientType: 'foundry',
      clientId: clientId,
      clientInfo: {
        username: game.user.name,
        foundryVersion: game.version,
        moduleVersion: game.modules.get('mage-hand')?.version || 'unknown',
        platform: 'Foundry VTT',
        systemVersion: game.system.version
      }
    };
    
    // Include last state if reconnecting
    if (this.connectionState !== ConnectionState.DISCONNECTED) {
      message.lastState = this.connectionState;
      message.stateData = {
        schemaVersion: '1.0.0'
      };
    }
    
    this.sendMessage(message);
  }

  /**
   * Handle incoming WebSocket messages
   */
  onMessage(event) {
    try {
      const message = JSON.parse(event.data);
      logger.info('Mage Hand | Received message:', message.type, message);
      
      // Route message based on type
      switch (message.type) {
        // Pre-connection messages
        case MessageType.PRE_JOIN_ACK:
          this.handlePreJoinAck(message);
          break;
        case MessageType.PRE_JOIN_RESUME:
          this.handlePreJoinResume(message);
          break;
        case MessageType.PRE_JOIN_RESET:
          this.handlePreJoinReset(message);
          break;
        case MessageType.PRE_JOINED:
          this.handlePreJoined(message);
          break;
          
        // Initialization messages
        case MessageType.INIT_HELO:
          this.handleInitHelo(message);
          break;
        case MessageType.INIT_HELO_ACK:
          this.handleInitHeloAck(message);
          break;
        case MessageType.INIT_REQ_STATE:
          this.handleInitReqState(message);
          break;
          
        // Setup messages
        case MessageType.SETUP_REQ_PLAYERS:
          this.handleSetupReqPlayers(message);
          break;
        case MessageType.SETUP_REQ_ACTORS:
          this.handleSetupReqActors(message);
          break;
        case MessageType.SETUP_REQ_ACTOR:
          this.handleSetupReqActor(message);
          break;
        case MessageType.SETUP_ACTOR_ACK:
          this.handleSetupActorAck(message);
          break;
          
        // Play messages
        case MessageType.PLAY_USE_ITEM:
        case MessageType.PLAY_CHECK_ABILITY:
        case MessageType.PLAY_SAVE_ABILITY:
        case MessageType.PLAY_CHECK_SKILL:
        case MessageType.PLAY_ATTACK_WEAPON:
        case MessageType.PLAY_CAST_SPELL:
        case MessageType.PLAY_ROLL_CUSTOM:
          this.handlePlayMessage(message);
          break;
          
        // Connection status messages
        case MessageType.CONNECTION_SUSPENDED:
          this.handleConnectionSuspended(message);
          break;
        case MessageType.CONNECTION_RESUMED:
          this.handleConnectionResumed(message);
          break;
        case MessageType.CONNECTION_LOST:
          this.handleConnectionLost(message);
          break;
          
        // Error messages
        case MessageType.ERROR:
          this.handleError(message);
          break;
          
        // Heartbeat
        case 'HEARTBEAT':
          this.handleHeartbeat(message);
          break;
        case 'PONG':
          // Pong received, connection is alive
          break;
          
        default:
          logger.warn('Mage Hand | Unknown message type:', message.type);
      }
    } catch (error) {
      logger.error('Mage Hand | Error processing message:', error);
    }
  }

  /**
   * Handle WebSocket errors
   */
  onError(error) {
    logger.error('Mage Hand | WebSocket error:', error);
    ui.notifications.error('WebSocket connection error');
  }

  /**
   * Handle WebSocket connection closed
   */
  onClose(event) {
    logger.info('Mage Hand | WebSocket closed:', event.code, event.reason);
    this.stopHeartbeat();
    
    // Handle different close codes
    switch (event.code) {
      case 1000: // Normal closure
        logger.info('Mage Hand | Normal disconnect');
        this.updateConnectionState(ConnectionState.DISCONNECTED);
        break;
        
      case 4000: // Session not found
        logger.error('Mage Hand | Session not found');
        ui.notifications.error(`Session ${this.sessionCode} does not exist`);
        this.updateConnectionState(ConnectionState.DISCONNECTED);
        game.user.unsetFlag('mage-hand', 'session');
        break;
        
      case 4001: // Session expired
        logger.error('Mage Hand | Session expired');
        ui.notifications.warning('Session expired. Please enter a new session code.');
        this.updateConnectionState(ConnectionState.DISCONNECTED);
        game.user.unsetFlag('mage-hand', 'session');
        break;
        
      case 4002: // Invalid session format
        logger.error('Mage Hand | Invalid session code format');
        ui.notifications.error('Invalid session code format');
        this.updateConnectionState(ConnectionState.DISCONNECTED);
        break;
        
      case 4003: // Version mismatch
        logger.error('Mage Hand | Version mismatch');
        ui.notifications.error('Version mismatch. Please update the Mage Hand module.');
        this.updateConnectionState(ConnectionState.DISCONNECTED);
        break;
        
      default:
        // Unexpected closure, attempt reconnection
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          logger.info('Mage Hand | Unexpected disconnect, will attempt reconnection');
          this.attemptReconnect();
        } else {
          logger.error(`Mage Hand | Giving up after ${this.maxReconnectAttempts} attempts`);
          ui.notifications.error(`Failed to connect after ${this.maxReconnectAttempts} attempts`);
          this.updateConnectionState(ConnectionState.DISCONNECTED);
        }
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  attemptReconnect() {
    this.reconnectAttempts++;
    
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      logger.error(`Mage Hand | Exceeded max reconnect attempts`);
      ui.notifications.error(`Failed to connect after ${this.maxReconnectAttempts} attempts`);
      this.updateConnectionState(ConnectionState.DISCONNECTED);
      return;
    }
    
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    logger.info(`Mage Hand | Reconnect attempt ${this.reconnectAttempts} of ${this.maxReconnectAttempts} in ${delay}ms`);
    this.updateConnectionState(ConnectionState.SUSPENDED);
    
    setTimeout(() => {
      if (this.sessionCode && this.reconnectAttempts <= this.maxReconnectAttempts) {
        logger.info(`Mage Hand | Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        
        try {
          const serverUrl = this.getServerUrl(this.sessionCode);
          this.socket = new WebSocket(serverUrl);
          this.setupEventHandlers();
        } catch (error) {
          logger.error('Mage Hand | Reconnection failed:', error);
          this.updateConnectionState(ConnectionState.DISCONNECTED);
        }
      }
    }, delay);
  }

  // ============================================================================
  // Message Handlers
  // ============================================================================

  /**
   * Message: PRE:JOIN:ACK
   * Sample: {
   *   type: 'PRE:JOIN:ACK',
   *   clientId: 'client-uuid',
   *   resumeState: 'JOINED',
   *   sessionValid: true
   * }
   */
  handlePreJoinAck(message) {
    logger.info('Mage Hand | PRE:JOIN acknowledged');
    this.updateConnectionState(ConnectionState.JOINED);
    this.notifyPanel('Connected to relay server', 'success');
  }

  /**
   * Message: PRE:JOIN:RESUME
   * Sample: {
   *   type: 'PRE:JOIN:RESUME',
   *   resumeFrom: 'PLAY',
   *   clientId: 'existing-client-id',
   *   stateSnapshot: { selectedActor: {...}, combatState: {...} }
   * }
   */
  handlePreJoinResume(message) {
    logger.info('Mage Hand | Resuming from state:', message.resumeFrom);
    this.updateConnectionState(message.resumeFrom);
    
    // Restore any necessary state
    if (message.stateSnapshot) {
      this.restoreStateSnapshot(message.stateSnapshot);
    }
    
    // If we're back in PLAY state, refresh UI
    if (message.resumeFrom === ConnectionState.PLAY) {
      this.refreshClientsUI();
    }
  }

  /**
   * Message: PRE:JOIN:RESET
   * Sample: {
   *   type: 'PRE:JOIN:RESET',
   *   reason: 'STATE_MISMATCH',
   *   startFrom: 'INIT'
   * }
   */
  handlePreJoinReset(message) {
    logger.info('Mage Hand | Reset required:', message.reason);
    // Need to start fresh
    this.updateConnectionState(ConnectionState.DISCONNECTED);
    
    // Try reconnecting with fresh state
    if (this.sessionCode) {
      this.connect(this.sessionCode);
    }
  }

  /**
   * Message: PRE:JOINED
   * Sample: {
   *   type: 'PRE:JOINED',
   *   sessionCode: 'NYC-ABC-123',
   *   connectedClients: [
   *     { clientType: 'mobile', clientId: 'mobile-client-id' },
   *     { clientType: 'foundry', clientId: 'foundry-client-id' }
   *   ]
   * }
   */
  handlePreJoined(message) {
    logger.info('Mage Hand | Both parties connected');
    
    // Reset to JOINED state for fresh handshake
    this.updateConnectionState(ConnectionState.JOINED);
    
    // Track all mobile clients
    const mobileClients = message.connectedClients.filter(c => c.clientType === 'mobile');
    
    // Clear and rebuild mobile client map
    this.mobileClients.clear();
    
    for (const client of mobileClients) {
      const mobileClient = new MobileClient(client.clientId, client.clientType);
      
      // Store client info for display
      if (client.clientInfo) {
        mobileClient.clientInfo = client.clientInfo;
        
        // Generate display name
        const username = client.clientInfo.username || 'Unknown';
        const device = client.clientInfo.deviceModel || 'Mobile';
        mobileClient.displayName = `${username}'s ${device}`;
      }
      
      this.mobileClients.set(client.clientId, mobileClient);
      logger.info(`Mage Hand | Tracking mobile client: ${mobileClient.displayName || client.clientId}`);
    }
    
    if (mobileClients.length > 0) {
      const clientNames = Array.from(this.mobileClients.values())
        .map(c => c.displayName || 'Unknown device')
        .join(', ');
      
      this.notifyPanel(`Connected: ${clientNames}`, 'info');
      logger.info(`Mage Hand | ${mobileClients.length} mobile client(s) connected`);
      // Mobile will initiate INIT:HELO or request state sync
    }
  }

  /**
   * Message: INIT:HELO (from mobile)
   * Sample: {
   *   type: 'INIT:HELO',
   *   from: 'mobile-client-id',
   *   capabilities: {
   *     appVersion: '1.0.0',
   *     schemaVersion: '1.0.0',
   *     platform: 'iOS',
   *     deviceModel: 'iPhone 14',
   *     supportedFeatures: ['combat', 'spells', 'items']
   *   }
   * }
   */
  handleInitHelo(message) {
    logger.info('Mage Hand | Received INIT:HELO from mobile');
    
    // Track which mobile client sent this
    const mobileClientId = message.from;
    let mobileClient = this.mobileClients.get(mobileClientId);
    
    if (!mobileClient) {
      // Unknown mobile client, create entry
      const newClient = new MobileClient(mobileClientId);
      this.mobileClients.set(mobileClientId, newClient);
      mobileClient = newClient;
    }
    
    const mobileCapabilities = message.capabilities;
    
    // Check schema compatibility
    const ourSchema = '1.0.0'; // Should match CharacterV1.SCHEMA_VERSION in iOS
    if (mobileCapabilities.schemaVersion !== ourSchema) {
      // Version mismatch
      this.sendMessage({
        type: MessageType.INIT_DENY,
        to: mobileClientId,
        reason: 'SCHEMA_MISMATCH',
        details: `Foundry schema ${ourSchema} incompatible with mobile ${mobileCapabilities.schemaVersion}`
      });
      return;
    }
    
    // Update this specific mobile client's state
    if (mobileClient) {
      mobileClient.updateState(ConnectionState.INIT);
      mobileClient.updateStateData({
        schemaVersion: mobileCapabilities.schemaVersion,
        enabledFeatures: mobileCapabilities.supportedFeatures || []
      });
    }
    
    // Update global state to INIT
    this.updateConnectionState(ConnectionState.INIT);
    
    // Send our capabilities
    this.sendMessage({
      type: MessageType.INIT_HELO,
      to: mobileClientId,
      capabilities: {
        moduleVersion: game.modules.get('mage-hand').version,
        foundryVersion: game.version,
        systemVersion: game.system.version,
        schemaVersion: ourSchema,
        supportedFeatures: ['combat', 'spells', 'items', 'vision']
      }
    });
    
    // Send ACK
    this.sendMessage({
      type: MessageType.INIT_HELO_ACK,
      to: mobileClientId,
      negotiatedSchema: ourSchema,
      enabledFeatures: mobileCapabilities.supportedFeatures
    });
    
    this.updateConnectionState(ConnectionState.SETUP);
  }

  /**
   * Message: INIT:HELO:ACK (from mobile)
   * Sample: {
   *   type: 'INIT:HELO:ACK',
   *   from: 'mobile-client-id',
   *   negotiatedSchema: '1.0.0',
   *   enabledFeatures: ['combat', 'spells', 'items']
   * }
   */
  handleInitHeloAck(message) {
    logger.info('Mage Hand | Mobile acknowledged INIT');
    
    // Update the specific mobile client's state
    const mobileClientId = message.from;
    const mobileClient = this.mobileClients.get(mobileClientId);
    if (mobileClient) {
      mobileClient.updateState(ConnectionState.SETUP);
    }
    
    this.updateConnectionState(ConnectionState.SETUP);
  }
  
  /**
   * Message: INIT:REQ:STATE (from mobile requesting state sync)
   * This happens when mobile detects Foundry has reconnected
   */
  handleInitReqState(message) {
    logger.info('Mage Hand | Mobile requesting state sync');
    
    // Get the mobile client that's requesting state
    const requestingClientId = message.from;
    let mobileClient = this.mobileClients.get(requestingClientId);
    
    if (!mobileClient) {
      logger.warn(`Mage Hand | Unknown mobile client requesting state: ${requestingClientId}`);
      // Create a new client entry
      const newClient = new MobileClient(requestingClientId);
      this.mobileClients.set(requestingClientId, newClient);
      mobileClient = newClient;
    }
    
    // Send the current state for this specific mobile client
    const stateMessage = {
      type: MessageType.INIT_SEND_STATE,
      currentState: mobileClient.state,
      stateData: {
        schemaVersion: mobileClient.stateData.schemaVersion,
        enabledFeatures: mobileClient.stateData.enabledFeatures,
        selectedPlayer: mobileClient.stateData.selectedPlayer,
        selectedActor: mobileClient.stateData.selectedActor
      }
    };
    
    logger.info(`Mage Hand | Sending state to mobile ${requestingToken}:`, stateMessage.currentState);
    this.sendMessage(stateMessage);
  }

  /**
   * Message: SETUP:REQ:PLAYERS
   * Sample: {
   *   type: 'SETUP:REQ:PLAYERS',
   *   from: 'mobile-client-id'
   * }
   * Response includes actors array for each player
   */
  handleSetupReqPlayers(message) {
    logger.info('Mage Hand | Mobile requesting players');
    
    let players = [];
    
    // Check if current user is GM or Assistant
    const currentUser = game.user;
    const isGMOrAssistant = currentUser.isGM || currentUser.role >= CONST.USER_ROLES.ASSISTANT;
    
    if (isGMOrAssistant) {
      // GM/Assistant can see all players
      players = game.users.contents
        .filter(user => !user.isGM && user.character)
        .map(user => {
          const actors = game.actors.filter(actor => actor.hasPlayerOwner && actor.ownership[user.id] == 3).sort((a,b) => a.name.localeCompare(b.name));
          return {
            id: user.id,
            name: user.name,
            isGM: false,
            hasActors: actors.length > 0,
            actors: actors.map(actor => ({ name: actor.name, id: actor.id }))
          }
        });
    } else {
      // Regular players can only see all characters they have ownership of
      const actors = game.actors.filter(actor => actor.hasPlayerOwner && actor.ownership[currentUser.id] == 3).sort((a,b) => a.name.localeCompare(b.name));
      players = [{
        id: currentUser.id,
        name: currentUser.name,
        isGM: false,
        hasActors: actors.length > 0,
        actors: actors.map(actor => ({ name: actor.name, id: actor.id }))
      }];
      
    }
    
    this.sendMessage({
      type: MessageType.SETUP_SEND_PLAYERS,
      players: players
    });
  }

  /**
   * Message: SETUP:REQ:ACTORS
   * Sample: {
   *   type: 'SETUP:REQ:ACTORS',
   *   from: 'mobile-client-id',
   *   playerId: 'player1' // or 'available' for unassigned actors
   * }
   */
  handleSetupReqActors(message) {
    logger.info('Mage Hand | Mobile requesting actors for player:', message.playerId);
    
    // Track which mobile selected this player
    const mobileClientId = message.from;
    const mobileClient = this.mobileClients.get(mobileClientId);
    
    let actors = [];
    
    // Get actors for specific player
    const user = game.users.get(message.playerId);
    
    // Store the selected player for this mobile client
    if (mobileClient && user) {
      mobileClient.updateStateData({
        selectedPlayer: {
          id: user.id,
          name: user.name,
          isGM: user.isGM,
          hasActors: true
        }
      });
    }
    
    const playerControlledActors = game.actors
      .filter((actor) => actor.hasPlayerOwner && actor.ownership[user.id] == 3)
      .sort((a, b) => a.name.localeCompare(b.name));
    
    // Use extractor to get character details
    actors = playerControlledActors.map(actor => {
      const extractedData = this.mageHand.extractor.extractCharacterData(actor);
      
      // Handle both characters and NPCs
      let classDisplay = 'Unknown';
      if (actor.type === 'npc') {
        // For NPCs, show type and HP instead of class
        const hp = extractedData.combat?.hp?.max || '?';
        classDisplay = `NPC (${hp} HP)`;
      } else if (extractedData.classes && extractedData.classes.length > 0) {
        // For characters, show class and level
        classDisplay = extractedData.classes.map(cls => `${cls.displayName} ${cls.levels}`).join(" / ");
      }
      
      return {
        id: actor.id,
        name: actor.name,
        class: classDisplay,
        image: actor.img || null
      };
    });

    this.sendMessage({
      type: MessageType.SETUP_SEND_ACTORS,
      playerId: message.playerId,
      actors: actors
    });
  }

  /**
   * Message: SETUP:REQ:ACTOR
   * Sample: {
   *   type: 'SETUP:REQ:ACTOR',
   *   from: 'mobile-client-id',
   *   actorId: 'actor1'
   * }
   */
  handleSetupReqActor(message) {
    logger.info('Mage Hand | Mobile requesting full actor:', message.actorId);
    
    const actor = game.actors.get(message.actorId);
    if (!actor) {
      logger.error('Mage Hand | Actor not found:', message.actorId);
      return;
    }
    
    // Extract and send actor data
    const actorData = this.mageHand.extractor.extractCharacterData(actor);
    
    // Ensure schema version is set
    actorData._v = '1.0.0'; // Add schema version to extracted data
    
    this.sendMessage({
      type: MessageType.SETUP_SEND_ACTOR,
      actor: actorData
    });
    
    // Store actor data for this client
    if (message.from) {
      this.clientSnapshots.set(message.from, {
        actorId: message.actorId,
        actorData: actorData
      });
    }
  }

  /**
   * Message: SETUP:ACTOR:ACK
   * Sample: {
   *   type: 'SETUP:ACTOR:ACK',
   *   from: 'mobile-client-id',
   *   actorId: 'actor1',
   *   ready: true
   * }
   */
  handleSetupActorAck(message) {
    logger.info('Mage Hand | Mobile acknowledged actor, transitioning to PLAY');
    
    // Update the specific mobile client's state
    const mobileClientId = message.from;
    const mobileClient = this.mobileClients.get(mobileClientId);
    
    if (mobileClient) {
      // Update this client to PLAY state
      mobileClient.updateState(ConnectionState.PLAY);
      
      // Store the actor ID (we should already have the full actor data from SETUP:REQ:ACTOR)
      if (message.actorId) {
        const actor = game.actors.get(message.actorId);
        if (actor) {
          const extractedData = this.mageHand.extractor.extractCharacterData(actor);
          mobileClient.updateStateData({
            selectedActor: extractedData
          });
        }
      }
      
      logger.info(`Mage Hand | Mobile client ${mobileClientId} now in PLAY state with actor ${message.actorId}`);
    }
    
    // Update global state to PLAY
    this.updateConnectionState(ConnectionState.PLAY);
    
    // Start heartbeat
    this.startHeartbeat();
    
    this.notifyPanel('Mobile client ready to play!', 'success');
  }

  handlePlayMessage(message) {
    logger.info('Mage Hand | Play message:', message.type);
    
    // Route to appropriate handler in main module
    switch (message.type) {
      case MessageType.PLAY_ROLL_CUSTOM:
        this.mageHand.handleRollRequest(message);
        break;
      case MessageType.PLAY_USE_ITEM:
        this.mageHand.handleItemUse(message);
        break;
      case MessageType.PLAY_CHECK_ABILITY:
        this.mageHand.handleAbilityCheck(message);
        break;
      case MessageType.PLAY_SAVE_ABILITY:
        this.mageHand.handleAbilitySave(message);
        break;
      case MessageType.PLAY_CHECK_SKILL:
        this.mageHand.handleSkillCheck(message);
        break;
      case MessageType.PLAY_ATTACK_WEAPON:
        this.mageHand.handleWeaponAttack(message);
        break;
      case MessageType.PLAY_CAST_SPELL:
        this.mageHand.handleSpellCast(message);
        break;
    }
  }

  /**
   * Message: CONNECTION:SUSPENDED
   * Sample: {
   *   type: 'CONNECTION:SUSPENDED',
   *   clientType: 'mobile',
   *   from: 'mobile-client-id'
   * }
   */
  handleConnectionSuspended(message) {
    logger.info(`Mage Hand | Mobile client suspended: ${message.clientType}`);
    this.notifyPanel('Mobile client connection suspended', 'warning');
    this.stopHeartbeat();
  }

  /**
   * Message: CONNECTION:RESUMED
   * Sample: {
   *   type: 'CONNECTION:RESUMED',
   *   clientType: 'mobile',
   *   from: 'mobile-client-id'
   * }
   */
  handleConnectionResumed(message) {
    logger.info(`Mage Hand | Mobile client resumed: ${message.clientType}`);
    this.notifyPanel('Mobile client reconnected', 'success');
  }

  /**
   * Message: CONNECTION:LOST
   * Sample: {
   *   type: 'CONNECTION:LOST',
   *   clientType: 'mobile',
   *   reason: 'GRACE_PERIOD_EXPIRED'
   * }
   */
  handleConnectionLost(message) {
    logger.info(`Mage Hand | Mobile client lost: ${message.clientType}`);
    this.notifyPanel('Mobile client disconnected', 'warning');
    this.stopHeartbeat();
    
    // Remove from tracked clients
    if (message.from) {
      this.mobileClients.delete(message.from);
      this.clientSnapshots.delete(message.from);
    }
  }

  /**
   * Message: ERROR
   * Sample: {
   *   type: 'ERROR',
   *   errorCode: 'INVALID_STATE_TRANSITION',
   *   message: 'Cannot send PLAY messages in SETUP state',
   *   currentState: 'SETUP',
   *   attemptedMessageType: 'PLAY:USE:ITEM'
   * }
   */
  handleError(message) {
    logger.error('Mage Hand | Server error:', message.errorCode, message.message);
    this.notifyPanel(`Server error: ${message.message}`, 'error');
    
    // Stop heartbeat on certain errors
    if (message.errorCode === 'INVALID_STATE') {
      this.stopHeartbeat();
    }
  }

  /**
   * Message: HEARTBEAT
   * Sample: {
   *   type: 'HEARTBEAT',
   *   timestamp: 1234567890
   * }
   */
  handleHeartbeat(message) {
    // Respond with PONG
    this.sendMessage({
      type: 'PONG',
      timestamp: Date.now()
    });
  }

  // ============================================================================
  // Outgoing Messages
  // ============================================================================

  /**
   * Send message through WebSocket
   */
  sendMessage(message) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      logger.error('Mage Hand | Cannot send message, socket not open');
      return;
    }
    
    // Automatically add 'from' field with Foundry user ID (unless it's PRE:JOIN)
    if (message.type !== MessageType.PRE_JOIN && !message.from) {
      message.from = game.user.id;
    }
    
    // Add timestamp if not present
    if (!message.timestamp) {
      message.timestamp = Date.now();
    }
    
    logger.info('Mage Hand | Sending message:', message.type, message);
    this.socket.send(JSON.stringify(message));
  }

  /**
   * Send a message targeted at a specific actor
   * Automatically filters based on whether the actor is controlled by a mobile client
   * @param {Object} message - Message to send, must include actorId
   * @returns {boolean} True if message was sent, false if filtered out
   */
  sendActorMessage(message) {
    // Validate message has actorId
    if (!message.actorId) {
      logger.warn('Mage Hand | sendActorMessage called without actorId');
      return false;
    }

    // Check if we're connected
    if (!this.isConnected()) {
      logger.info('Mage Hand | Not connected to relay, message not sent');
      return false;
    }

    // Check if any mobile client controls this actor
    if (!this.mobileClients || this.mobileClients.size === 0) {
      logger.info('Mage Hand | No mobile clients connected');
      return false;
    }

    let isControlled = false;
    for (const [token, client] of this.mobileClients) {
      if (client.actorId === message.actorId) {
        logger.info(`Mage Hand | Actor ${message.actorId} is controlled by mobile client`);
        isControlled = true;
        break;
      }
    }

    if (!isControlled) {
      logger.info(`Mage Hand | Message filtered - actor ${message.actorId} not controlled by any mobile client`);
      return false;
    }

    // Send the message
    logger.info(`Mage Hand | Sending actor message for ${message.actorId}:`, message.type);
    this.sendMessage(message);
    return true;
  }

  /**
   * Send actor update to mobile clients
   */
  sendActorUpdate(actorId, updates) {
    if (this.connectionState !== ConnectionState.PLAY) {
      return;
    }
    
    // Find clients using this actor
    for (const [token, client] of this.mobileClients) {
      if (client.actorId === actorId) {
        this.sendMessage({
          type: MessageType.PLAY_UPDATE_ACTOR,
          to: mobileClientId,
          updates: updates
        });
      }
    }
  }

  /**
   * Send combat state update
   */
  sendCombatUpdate(updateType, data) {
    if (this.connectionState !== ConnectionState.PLAY) {
      return;
    }
    
    let messageType;
    switch (updateType) {
      case 'start':
        messageType = MessageType.PLAY_COMBAT_START;
        break;
      case 'next':
        messageType = MessageType.PLAY_COMBAT_NEXT;
        break;
      case 'your-turn':
        messageType = MessageType.PLAY_COMBAT_YOU;
        break;
      case 'end':
        messageType = MessageType.PLAY_COMBAT_END;
        break;
      default:
        return;
    }
    
    this.sendMessage({
      type: messageType,
      ...data
    });
  }

  // ============================================================================
  // State Management
  // ============================================================================

  /**
   * Update connection state
   */
  updateConnectionState(newState) {
    const oldState = this.connectionState;
    this.connectionState = newState;
    
    logger.info(`Mage Hand | State transition: ${oldState} -> ${newState}`);
    
    // Stop heartbeat when leaving PLAY state
    if (oldState === ConnectionState.PLAY && newState !== ConnectionState.PLAY) {
      this.stopHeartbeat();
    }
    
    // Update UI based on state
    if (this.mageHand.ui) {
      this.mageHand.ui.onConnectionStateChange(newState);
    }
    
    // Trigger any state-specific actions
    if (newState === ConnectionState.PLAY) {
      this.onEnterPlayState();
    }
  }

  /**
   * Actions when entering PLAY state
   */
  onEnterPlayState() {
    // Hooks are already set up in mageHand.registerHooks()
    // Just log the state transition
    logger.info('Mage Hand | Entered PLAY state, ready for game interaction');
  }

  /**
   * Restore state snapshot after reconnection
   */
  restoreStateSnapshot(snapshot) {
    // Restore any necessary state from snapshot
    logger.info('Mage Hand | Restoring state snapshot:', snapshot);
  }

  /**
   * Refresh connected clients UI
   */
  refreshClientsUI() {
    // Update any UI elements showing connected clients
    if (this.mageHand.ui) {
      // Could update UI with client list if needed
      logger.info('Mage Hand | Refreshing clients UI, connected clients:', this.mobileClients.size);
    }
  }

  // ============================================================================
  // Heartbeat
  // ============================================================================

  startHeartbeat() {
    // Only start heartbeat in PLAY state
    if (this.connectionState !== ConnectionState.PLAY) {
      return;
    }
    
    this.stopHeartbeat();
    
    this.heartbeatInterval = setInterval(() => {
      // Only send heartbeat if still in PLAY state
      if (this.connectionState === ConnectionState.PLAY) {
        this.sendMessage({
          type: 'HEARTBEAT',
          timestamp: Date.now()
        });
      } else {
        this.stopHeartbeat();
      }
    }, 30000); // Every 30 seconds
    
    logger.info('Mage Hand | Heartbeat started');
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // ============================================================================
  // Persistence
  // ============================================================================

  // Connection token methods removed - using clientId instead

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Disconnect and cleanup
   */
  disconnect() {
    logger.info('Mage Hand | Disconnecting');
    
    this.stopHeartbeat();
    
    if (this.socket) {
      this.socket.close(1000, 'User disconnect');
      this.socket = null;
    }
    
    this.updateConnectionState(ConnectionState.DISCONNECTED);
    this.mobileClients.clear();
    if (this.clientSnapshots) {
      this.clientSnapshots.clear();
    }
  }

  /**
   * Shutdown and cleanup
   */
  shutdown() {
    this.disconnect();
    this.clearConnectionToken();
  }

  // ============================================================================
  // UI Compatibility Methods
  // ============================================================================

  /**
   * Check if connected (for UI compatibility)
   */
  isConnected() {
    return this.socket?.readyState === WebSocket.OPEN && 
           this.connectionState !== ConnectionState.DISCONNECTED;
  }

  /**
   * Get current connection state (for UI compatibility)
   */
  getState() {
    // Map v2 states to v1-compatible states for UI
    switch (this.connectionState) {
      case ConnectionState.DISCONNECTED:
        return 'disconnected';
      case ConnectionState.JOINING:
      case ConnectionState.JOINED:
      case ConnectionState.INIT:
      case ConnectionState.SETUP:
        return 'connecting';
      case ConnectionState.PLAY:
        return 'connected';
      case ConnectionState.SUSPENDED:
        return 'suspended';
      default:
        return 'disconnected';
    }
  }

  /**
   * Get list of connected clients (for UI compatibility)
   */
  get connectedClients() {
    return this.mobileClients;
  }
}