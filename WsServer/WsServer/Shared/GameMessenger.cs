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
    /// Delivered as unreliable "latest state": a newer update replaces an unsent older one
    /// in each connection's send slot (IClientConnection.SendLatest).
    /// </summary>
    public void BroadcastSpatialUpdates<TEventMessage>(TEventMessage @event, bool keyframe = false) where TEventMessage : IServerEvent
    {
        // Serialize lazily, on the first actual recipient: with nobody in a spatial room
        // the snapshot is never serialized.
        ArraySegment<byte> segment = default;
        var serialized = false;

        foreach (var connection in _connectionManager.Connections)
        {
            if (!IsSpatialRecipient(connection.Id))
                continue;

            if (!serialized)
            {
                segment = _messageSerializer.Serialize(@event);
                serialized = true;
            }
            connection.SendLatest(segment, keyframe);
        }
    }

    public bool HasSpatialRecipients()
    {
        foreach (var connection in _connectionManager.Connections)
        {
            if (IsSpatialRecipient(connection.Id))
                return true;
        }
        return false;
    }

    /// <summary>
    /// Reliable send to every client in a spatial room (the game world's audience), except
    /// <paramref name="exceptClientId"/> (0 = nobody; client ids start at 1). Serialized
    /// once, lazily — nothing is serialized when there are no recipients.
    /// </summary>
    public void BroadcastToSpatial<TEventMessage>(TEventMessage @event, uint exceptClientId = 0) where TEventMessage : IServerEvent
        => BroadcastWhere(@event, id => id != exceptClientId && IsSpatialRecipient(id));

    /// <summary>
    /// Reliable send to every client that is NOT in a spatial room (lobby-UI clients).
    /// </summary>
    public void BroadcastToNonSpatial<TEventMessage>(TEventMessage @event) where TEventMessage : IServerEvent
        => BroadcastWhere(@event, id => !IsSpatialRecipient(id));

    private void BroadcastWhere<TEventMessage>(TEventMessage @event, Func<uint, bool> filter) where TEventMessage : IServerEvent
    {
        ArraySegment<byte> segment = default;
        var serialized = false;
        foreach (var connection in _connectionManager.Connections)
        {
            if (!filter(connection.Id))
                continue;
            if (!serialized)
            {
                segment = _messageSerializer.Serialize(@event);
                serialized = true;
            }
            connection.Send(segment);
        }
    }

    // Without a room manager every client gets spatial updates.
    private bool IsSpatialRecipient(uint clientId) => _roomManager?.ShouldReceiveSpatialUpdates(clientId) ?? true;

    /// <summary>
    /// Broadcast chat messages to clients in the same room (or all clients if rooms are inactive).
    /// </summary>
    public void BroadcastToRoomOrAll<TEventMessage>(uint senderId, TEventMessage @event) where TEventMessage : IServerEvent
    {
        var senderRoom = _roomManager?.GetClientRoom(senderId);

        if (senderRoom == null)
        {
            // No room system active, or sender not in a room: broadcast to all
            // (Broadcast serializes once itself).
            Broadcast(@event);
            return;
        }

        var segment = _messageSerializer.Serialize(@event);

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