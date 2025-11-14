using Game.Core;
using Game.ServerLogic.GameState.Events;
using Game.ServerLogic.Player.Events;
using Microsoft.Extensions.Logging;
using WsServer.Abstract;
using WsServer.Rooms;

namespace WsServer;

public class GameServer : GameServerBase<GameModel>
{
    private readonly GameTickUpdateEvent _gameStateEvent;
    private readonly RoomManager _roomManager;
    private readonly GameMessengerRoomAware _roomAwareMessenger;

    public GameServer(
        GameModel gameModel,
        IGameMessenger messenger,
        IClientConnectionManager connectionManager,
        IServerLogicProvider serverLogicProvider,
        ILogger<GameServer> logger) : base(gameModel, messenger, connectionManager, serverLogicProvider, logger)
    {
        _roomManager = new RoomManager();
        _roomAwareMessenger = new GameMessengerRoomAware(connectionManager, serverLogicProvider, _roomManager);
        
        OnPlayerAdded += GameServer_OnPlayerAdded;
        OnPlayerRemoved += GameServer_OnPlayerRemoved;
        OnTick += GameServer_OnTick;

        _gameStateEvent = new GameTickUpdateEvent(gameModel);
        
        // Initialize with a default lobby room
        InitializeDefaultRooms();
    }

    /// <summary>
    /// Initialize default rooms for different communication modes
    /// </summary>
    private void InitializeDefaultRooms()
    {
        // Lobby room - text chat only (persistent)
        _roomManager.CreateRoom(
            "lobby",
            "Lobby",
            new[] { CommunicationMode.TextChat },
            isPersistent: true);
        
        // Voice room - voice chat only (persistent)
        _roomManager.CreateRoom(
            "voice",
            "Voice Room",
            new[] { CommunicationMode.VoiceChat, CommunicationMode.TextChat },
            isPersistent: true);
        
        // 2D Game room (persistent)
        _roomManager.CreateRoom(
            "2d-game",
            "2D Game Room",
            new[] { CommunicationMode.Spatial2D, CommunicationMode.TextChat },
            isPersistent: true);
            
        // 3D Game room (persistent)
        _roomManager.CreateRoom(
            "3d-game",
            "3D Game Room",
            new[] { CommunicationMode.Spatial3D, CommunicationMode.TextChat },
            isPersistent: true);
    }

    private void GameServer_OnTick()
    {
        _gameStateEvent.BuildTickSnapshot();
        // Use room-aware messenger to filter spatial updates
        _roomAwareMessenger.BroadcastSpatialUpdates(_gameStateEvent);

        //if (GameModel.TopChanged)
        //    BroadCastTop();
    }

    private void GameServer_OnPlayerRemoved(uint clientId)
    {
        // Remove from room if they were in one
        _roomManager.LeaveRoom(clientId);
        
        // Broadcast to all clients
        Messenger.Broadcast(new PlayerLeftEvent(clientId));
    }

    private void GameServer_OnPlayerAdded(uint clientId)
    {
        var player = GameModel.GetPlayer(clientId);
        
        // Auto-join lobby room for new players
        _roomManager.JoinRoom(clientId, player.Name, "lobby");
        
        //notifying new player client that it can be initialized
        Messenger.Send(clientId, new InitPlayerEvent(clientId));

        //notifying other players that new player joined
        Messenger.Broadcast(new PlayerJoinedEvent(player));
        //send game state to new client
        Messenger.Send(clientId, new GameStateUpdateEvent(GameModel));
    }

    /// <summary>
    /// Get the room manager for external access
    /// </summary>
    public RoomManager GetRoomManager() => _roomManager;
    
    /// <summary>
    /// Get the room-aware messenger for external access
    /// </summary>
    public GameMessengerRoomAware GetRoomAwareMessenger() => _roomAwareMessenger;
}