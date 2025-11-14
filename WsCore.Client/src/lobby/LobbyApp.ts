import WsClient from '../network/WsClient';
import LobbyUI from './LobbyUI';
import LobbyPlayer from './LobbyPlayer';
import { SetPlayerNameEvent } from '../network/protocol/SetPlayerNameEvent';
import { PlayerJoinedEvent } from '../network/protocol/PlayerJoinedEvent';
import { PlayerLeftEvent } from '../network/protocol/PlayerLeftEvent';

export default class LobbyApp {
  serverUrl = '';
  socket: WebSocket;
  playerName: string = 'User';
  private lobbyUI: LobbyUI;
  private gameClient: WsClient<LobbyPlayer>;

  constructor() {
    console.log('LobbyApp instance created');
    this.lobbyUI = new LobbyUI();
    this.gameClient = new WsClient<LobbyPlayer>();
    this.initGameClient();
  }

  /**
   * Initialize game client for lobby
   */
  private initGameClient(): void {
    this.gameClient.myPlayerName = this.playerName;
    
    // Use LobbyPlayer factory for creating players in lobby mode
    this.gameClient.playerFactory = (id: number) => new LobbyPlayer(id);
    
    // Callback when player name is set
    this.gameClient.onSetPlayerNameEvent = (msg: SetPlayerNameEvent) => {
      this.handlePlayerNameSet(msg);
    };

    // Callback when a player joins
    this.gameClient.onPlayerJoinedEvent = (msg: PlayerJoinedEvent) => {
      this.handlePlayerJoined(msg);
    };

    // Callback when a player leaves
    this.gameClient.onPlayerLeftEvent = (msg: PlayerLeftEvent) => {
      this.handlePlayerLeft(msg);
    };

    // Set initial game init callback
    this.gameClient.onGameInitCallback = () => {
      this.onGameInit();
    };

    // Override writeToChat to display messages in UI with proper name resolution
    this.gameClient.writeToChat = (id: number, message: string) => {
      let playerName = `Player ${id}`;
      
      // First, check if this is our own player
      if (this.gameClient.myPlayer && id === this.gameClient.myPlayer.id) {
        playerName = this.playerName;
      }
      // Check cached player name
      else if (this.gameClient.playerNames[id]) {
        playerName = this.gameClient.playerNames[id];
      }
      // Check if the player object has a name
      else {
        const player = this.gameClient.players[id];
        if (player?.name && player.name.length > 0) {
          playerName = player.name;
        }
      }
      
      const isOwnMessage = id === this.gameClient.clientId;
      this.lobbyUI.addMessage(playerName, message, isOwnMessage);
    };

    // Set message send callback
    this.lobbyUI.setOnMessageCallback(message => {
      this.gameClient.sendChatMessageRequest(message);
    });

    // Connect to server
    this.gameClient.connect('ws://127.0.0.1:5000/ws');
  }

  /**
   * Called when game is initialized
   */
  private onGameInit(): void {
    console.log('Lobby initialized, client ID:', this.gameClient.clientId);
    this.lobbyUI.setCurrentUserId(this.gameClient.clientId);

    // Add current player to UI
    this.lobbyUI.addUser(this.gameClient.clientId, this.playerName);

    // Add existing players from gameClient
    for (const playerId in this.gameClient.players) {
      const playerName = this.gameClient.playerNames[playerId] || `Player ${playerId}`;
      this.lobbyUI.addUser(parseInt(playerId), playerName);
    }
  }

  /**
   * Handle when a player name is set/updated
   */
  private handlePlayerNameSet(msg: SetPlayerNameEvent): void {
    const playerId = msg.clientId;
    const playerName = msg.name || `Player ${playerId}`;

    // Update in game client cache
    this.gameClient.playerNames[playerId] = playerName;

    // Update in UI
    this.lobbyUI.addUser(playerId, playerName);

    // If it's our player name, update local reference
    if (playerId === this.gameClient.clientId) {
      this.playerName = playerName;
    }
  }

  /**
   * Handle when a player joins
   */
  private handlePlayerJoined(msg: PlayerJoinedEvent): void {
    if (msg.playerStateData) {
      const playerId = msg.playerStateData.id;
      const playerName = this.gameClient.playerNames[playerId] || `Player ${playerId}`;
      
      this.lobbyUI.addUser(playerId, playerName);
      console.log(`Player joined: ${playerName}`);
    }
  }

  /**
   * Handle when a player leaves
   */
  private handlePlayerLeft(msg: PlayerLeftEvent): void {
    const playerId = msg.clientId;
    const playerName = this.gameClient.playerNames[playerId] || `Player ${playerId}`;
    
    this.lobbyUI.removeUser(playerId);
    console.log(`Player left: ${playerName}`);

    // Clean up cached data
    delete this.gameClient.playerNames[playerId];
  }

  /**
   * Send a chat message
   */
  sendMessage(message: string): void {
    this.gameClient.sendChatMessageRequest(message);
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.lobbyUI.destroy();
    if (this.gameClient) {
      this.gameClient.ws?.close();
    }
  }
}
