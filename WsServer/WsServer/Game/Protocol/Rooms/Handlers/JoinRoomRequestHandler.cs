using System;
using System.Linq;
using Game.Core;
using Game.ServerLogic.GameState.Events;
using Game.ServerLogic.Rooms.Requests;
using Game.ServerLogic.Rooms.Events;
using Microsoft.Extensions.Logging;
using WsServer.Abstract;
using WsServer.Abstract.Messages;
using WsServer.Rooms;

namespace Game.ServerLogic.Rooms.Handlers;

public class JoinRoomRequestHandler : RequestHandlerBase<JoinRoomRequest>
{
    private readonly IGameMessenger _messenger;
    private readonly RoomManager _roomManager;
    private readonly GameModel _gameModel;
    private readonly ILogger<JoinRoomRequestHandler> _logger;

    public JoinRoomRequestHandler(
        IGameMessenger messenger,
        RoomManager roomManager,
        GameModel gameModel,
        ILogger<JoinRoomRequestHandler> logger)
    {
        _messenger = messenger;
        _roomManager = roomManager;
        _gameModel = gameModel;
        _logger = logger;
    }

    protected override void Handle(uint clientId, JoinRoomRequest request)
    {
        try
        {
            _logger.LogInformation($"Client {clientId} requested to join room: {request.RoomId}");

            // Get the old room before joining
            var oldRoom = _roomManager.GetClientRoom(clientId);

            // Attempt to join the new room
            if (!_roomManager.JoinRoom(clientId, $"Player {clientId}", request.RoomId))
            {
                _logger.LogWarning($"Failed to join room: {request.RoomId}");
                return;
            }

            // If joining a spatial game room, send game state to the client
            var newRoom = _roomManager.GetRoom(request.RoomId);
            if (newRoom != null && newRoom.SupportsMode(RoomCompatibility.Spatial))
            {
                _logger.LogInformation($"Sending game state to client {clientId} joining spatial room {request.RoomId}");
                _messenger.Send(clientId, new GameStateUpdateEvent(_gameModel));
            }

            // Broadcast updated user list to old room members (if there was an old room)
            if (oldRoom != null)
            {
                BroadcastRoomUserUpdate(oldRoom.Id);
            }

            // Broadcast updated user list to new room members
            BroadcastRoomUserUpdate(request.RoomId);

            _logger.LogInformation($"Client {clientId} successfully joined room: {request.RoomId}");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error handling join room request for client {clientId}");
        }
    }

    /// <summary>
    /// Broadcast the current users in a room to all room members
    /// </summary>
    private void BroadcastRoomUserUpdate(string roomId)
    {
        var room = _roomManager.GetRoom(roomId);
        if (room == null)
            return;

        var users = room.Clients.Values
            .Select(client => new RoomUserInfo { ClientId = client.Id, Name = client.Name })
            .ToList();

        var updateEvent = new RoomUsersUpdateEvent(roomId, users);

        // Send to all clients in this room
        foreach (var clientId in room.GetClientIds())
        {
            _messenger.Send(clientId, updateEvent);
        }
    }
}
