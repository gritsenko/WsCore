import WsClient from '../network/WsClient';
import LobbyUI from './LobbyUI';
import LobbyPlayer from './LobbyPlayer';
import { SetPlayerNameEvent } from '../network/protocol/SetPlayerNameEvent';
import { PlayerJoinedEvent } from '../network/protocol/PlayerJoinedEvent';
import { PlayerLeftEvent } from '../network/protocol/PlayerLeftEvent';
import { RoomUsersUpdateEvent } from '../network/protocol/RoomUsersUpdateEvent';

export default class LobbyApp {
  serverUrl = '';
  socket: WebSocket;
  playerName: string = 'User';
  private lobbyUI: LobbyUI;
  private gameClient: WsClient<LobbyPlayer>;
  private initialized: boolean = false;

  constructor() {
    console.log('LobbyApp instance created');
    this.lobbyUI = new LobbyUI();
    this.gameClient = new WsClient<LobbyPlayer>();
  }

  /**
   * Set player name (must be called before connect)
   */
  public setPlayerName(name: string): void {
    this.playerName = name;
    this.gameClient.myPlayerName = name;

    // Initialize on first setPlayerName call if not already initialized
    if (!this.initialized) {
      this.initGameClient();
    }
  }

  /**
   * Initialize game client for lobby
   */
  private initGameClient(): void {
    this.initialized = true;
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

    // Callback when room users list is updated
    this.gameClient.onRoomUsersUpdateCallback = (msg: RoomUsersUpdateEvent) => {
      this.handleRoomUsersUpdate(msg);
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

    // Set room join callback
    this.lobbyUI.setOnRoomJoinCallback(roomId => {
      this.joinRoom(roomId);
    });

    // Connect to server
    this.gameClient.connect('ws://127.0.0.1:5000/ws');
  }

  /**
   * Join a specific room
   */
  private joinRoom(roomId: string): void {
    console.log(`Joining room: ${roomId}`);

    // Leave current room first
    this.gameClient.leaveRoom();

    // Clear current messages and users list
    this.lobbyUI.clearMessages();

    // Clear all users from UI to rebuild with room members only
    this.lobbyUI.clearAllUsers();

    // Join new room
    if (this.gameClient.joinRoom(roomId, this.playerName)) {
      this.lobbyUI.setCurrentRoom(roomId);

      // Get room members from roomManager and add only those users
      const currentRoom = this.gameClient.getCurrentRoom();
      if (currentRoom) {
        for (const clientId of currentRoom.getClientIds()) {
          const clientName = currentRoom.getClient(clientId)?.name || `Player ${clientId}`;
          this.lobbyUI.addUser(clientId, clientName);
        }
      }

      // Update room user counts for all rooms
      this.updateRoomUserCounts();
    } else {
      console.error(`Failed to join room: ${roomId}`);
    }
  }

  /**
   * Update room user counts based on server data
   */
  private updateRoomUserCounts(): void {
    // This would typically come from server
    // For now, we'll update based on current client data
    const rooms = [
      { id: 'lobby', name: 'Lobby' },
      { id: 'voice', name: 'Voice Room' },
      { id: '2d-game', name: '2D Game Room' },
      { id: '3d-game', name: '3D Game Room' },
    ];

    for (const room of rooms) {
      // Get user count from server or estimate
      // This is a placeholder - real implementation would query server
      const userCount = Math.floor(Math.random() * 10); // Temporary placeholder
      this.lobbyUI.updateRoomUserCount(room.id, userCount);
    }
  }

  /**
   * Called when game is initialized
   */
  private onGameInit(): void {
    console.log('Lobby initialized, client ID:', this.gameClient.clientId);
    this.lobbyUI.setCurrentUserId(this.gameClient.clientId);
    this.lobbyUI.setCurrentRoom('lobby');

    // Join default lobby room first
    this.gameClient.joinRoom('lobby', this.playerName);

    // Get room members from roomManager and add only those users
    const currentRoom = this.gameClient.getCurrentRoom();
    if (currentRoom) {
      for (const clientId of currentRoom.getClientIds()) {
        const clientName = currentRoom.getClient(clientId)?.name || `Player ${clientId}`;
        this.lobbyUI.addUser(clientId, clientName);
      }
    }

    this.updateRoomUserCounts();
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

      // Only add user if they're in the current room
      const currentRoom = this.gameClient.getCurrentRoom();
      if (currentRoom && currentRoom.getClient(playerId)) {
        this.lobbyUI.addUser(playerId, playerName);
        console.log(`Player joined: ${playerName}`);
      }
    }
  }

  /**
   * Handle when a player leaves
   */
  private handlePlayerLeft(msg: PlayerLeftEvent): void {
    const playerId = msg.clientId;
    const playerName = this.gameClient.playerNames[playerId] || `Player ${playerId}`;

    // Only remove user if they're currently shown in the UI (i.e., in current room)
    this.lobbyUI.removeUser(playerId);
    console.log(`Player left: ${playerName}`);

    // Clean up cached data
    delete this.gameClient.playerNames[playerId];
  }

  /**
   * Handle when room users list is updated
   */
  private handleRoomUsersUpdate(msg: RoomUsersUpdateEvent): void {
    console.log(`Room users updated for room: ${msg.roomId}`, msg.users);

    // Only update UI if this is the current room
    const currentRoom = this.gameClient.getCurrentRoom();
    if (currentRoom && currentRoom.id === msg.roomId && msg.users) {
      // Clear existing users and rebuild
      this.lobbyUI.clearAllUsers();

      for (const userInfo of msg.users) {
        if (userInfo) {
          this.lobbyUI.addUser(userInfo.clientId, userInfo.name || `Player ${userInfo.clientId}`);
        }
      }
    }
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
