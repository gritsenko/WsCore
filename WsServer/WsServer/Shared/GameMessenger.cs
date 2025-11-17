using WsServer.Abstract;
using WsServer.Abstract.Messages;
using WsServer.Rooms;

namespace WsServer;

/// <summary>
/// Unified GameMessenger with built-in room awareness.
/// When rooms are active, messaging respects room boundaries.
/// When no rooms are active, falls back to broadcasting to all clients.
/// </summary>
public class GameMessenger : IGameMessenger
{
    protected readonly IClientConnectionManager _connectionManager;
    protected readonly IMessageSerializer _messageSerializer;
    protected readonly RoomManager? _roomManager;

    public GameMessenger(
        IClientConnectionManager connectionManager,
        IMessageSerializer messageSerializer,
        RoomManager? roomManager = null,
        int maxPoolSize = 20)
    {
        _connectionManager = connectionManager;
        _messageSerializer = messageSerializer;
        _roomManager = roomManager;
    }

    /// <summary>
    /// Broadcast messages to all clients (ignores room boundaries for global messages).
    /// </summary>
    public virtual void Broadcast<TEventMessage>(TEventMessage @event) where TEventMessage : IServerEvent
    {
        var segment = _messageSerializer.Serialize(@event);
        foreach (var connection in _connectionManager.Connections)
        {
            connection.Send(segment);
        }
    }

    /// <summary>
    /// Send message to a specific client (always delivered regardless of room).
    /// </summary>
    public virtual void Send<TEventMessage>(uint clientId, TEventMessage @event) where TEventMessage : IServerEvent
    {
        var segment = _messageSerializer.Serialize(@event);
        _connectionManager.GetConnectionById(clientId)?.Send(segment);
    }

    /// <summary>
    /// Broadcast spatial updates only to clients that should receive them based on room membership.
    /// When room manager is active, uses ShouldReceiveSpatialUpdates to filter recipients.
    /// </summary>
    public void BroadcastSpatialUpdates<TEventMessage>(TEventMessage @event) where TEventMessage : IServerEvent
    {
        var segment = _messageSerializer.Serialize(@event);
        
        foreach (var connection in _connectionManager.Connections)
        {
            // Only send spatial updates to clients that should receive them
            if (_roomManager?.ShouldReceiveSpatialUpdates(connection.Id) ?? true)
            {
                connection.Send(segment);
            }
        }
    }

    /// <summary>
    /// Broadcast chat messages to clients in the same room (or all clients if rooms are inactive).
    /// </summary>
    public void BroadcastToRoomOrAll<TEventMessage>(uint senderId, TEventMessage @event) where TEventMessage : IServerEvent
    {
        var segment = _messageSerializer.Serialize(@event);
        
        if (_roomManager == null)
        {
            // No room system active, broadcast to all
            Broadcast(@event);
            return;
        }

        var senderRoom = _roomManager.GetClientRoom(senderId);
        
        if (senderRoom == null)
        {
            // Sender not in a room, broadcast to all
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
    /// Broadcast to clients in a specific room.
    /// </summary>
    public void BroadcastToRoom<TEventMessage>(string roomId, TEventMessage @event) where TEventMessage : IServerEvent
    {
        if (_roomManager == null)
        {
            // No room system active, broadcast to all
            Broadcast(@event);
            return;
        }

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

    public virtual IClientRequest Deserialize(ref byte[] data, out Type messageType) => _messageSerializer.Deserialize(ref data, out messageType);
}