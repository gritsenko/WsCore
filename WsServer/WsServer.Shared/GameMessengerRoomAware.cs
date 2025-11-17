using System;
using System.Collections.Generic;
using System.Linq;
using WsServer.Abstract;
using WsServer.Abstract.Messages;
using WsServer.Rooms;

namespace WsServer;

/// <summary>
/// Room-aware GameMessenger that respects room-based communication settings
/// </summary>
public class GameMessengerRoomAware : IGameMessenger
{
    private readonly IClientConnectionManager _connectionManager;
    private readonly IServerLogicProvider _serverLogicProvider;
    private readonly IMessageSerializer _messageSerializer;
    private readonly RoomManager _roomManager;

    public GameMessengerRoomAware(
        IClientConnectionManager connectionManager,
        IServerLogicProvider serverLogicProvider,
        RoomManager roomManager,
        int maxPoolSize = 20)
    {
        _connectionManager = connectionManager;
        _serverLogicProvider = serverLogicProvider;
        _messageSerializer = new MessageSerializer(serverLogicProvider);
        _roomManager = roomManager;
    }

    /// <summary>
    /// Broadcast messages to all clients regardless of room settings
    /// </summary>
    public void Broadcast<TEventMessage>(TEventMessage @event) where TEventMessage : IServerEvent
    {
        var segment = _messageSerializer.Serialize(@event);
        foreach (var connection in _connectionManager.Connections)
        {
            connection.Send(segment);
        }
    }

    /// <summary>
    /// Send message to a specific client (always delivered)
    /// </summary>
    public void Send<TEventMessage>(uint clientId, TEventMessage @event) where TEventMessage : IServerEvent
    {
        var segment = _messageSerializer.Serialize(@event);
        _connectionManager.GetConnectionById(clientId)?.Send(segment);
    }

    /// <summary>
    /// Broadcast spatial updates only to clients that should receive them
    /// </summary>
    public void BroadcastSpatialUpdates<TEventMessage>(TEventMessage @event) where TEventMessage : IServerEvent
    {
        var segment = _messageSerializer.Serialize(@event);
        
        foreach (var connection in _connectionManager.Connections)
        {
            // Only send spatial updates to clients that should receive them
            if (_roomManager.ShouldReceiveSpatialUpdates(connection.Id))
            {
                connection.Send(segment);
            }
        }
    }

    /// <summary>
    /// Broadcast chat messages to clients in the same room (or all clients if no room)
    /// </summary>
    public void BroadcastToRoomOrAll<TEventMessage>(uint senderId, TEventMessage @event) where TEventMessage : IServerEvent
    {
        var segment = _messageSerializer.Serialize(@event);
        var senderRoom = _roomManager.GetClientRoom(senderId);
        
        if (senderRoom == null)
        {
            // No room system active, broadcast to all
            Broadcast(@event);
            return;
        }

        // Send to all clients in the sender's room
        foreach (var clientId in senderRoom.GetClientIds())
        {
            _connectionManager.GetConnectionById(clientId)?.Send(segment);
        }
    }

    /// <summary>
    /// Broadcast to clients in a specific room
    /// </summary>
    public void BroadcastToRoom<TEventMessage>(string roomId, TEventMessage @event) where TEventMessage : IServerEvent
    {
        var segment = _messageSerializer.Serialize(@event);
        var room = _roomManager.GetRoom(roomId);
        
        if (room != null)
        {
            foreach (var clientId in room.GetClientIds())
            {
                _connectionManager.GetConnectionById(clientId)?.Send(segment);
            }
        }
    }

    public IClientRequest Deserialize(ref byte[] data, out Type messageType)
    {
        return _messageSerializer.Deserialize(ref data, out messageType);
    }
}