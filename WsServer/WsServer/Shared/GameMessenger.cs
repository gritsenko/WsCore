using System;
using WsServer.Abstract;
using WsServer.Abstract.Messages;

namespace WsServer;

public class GameMessenger : IGameMessenger
{
    private readonly IClientConnectionManager _connectionManager;
    private readonly IMessageSerializer _messageSerializer;

    public GameMessenger(
        IClientConnectionManager connectionManager,
        IServerLogicProvider serverLogicProvider,
        int maxPoolSize = 20)
    {
        _connectionManager = connectionManager;
        _messageSerializer = new MessageSerializer(serverLogicProvider);
    }

    public void Broadcast<TEventMessage>(TEventMessage @event) where TEventMessage : IServerEvent
    {
        var segment = _messageSerializer.Serialize(@event);
        foreach (var connection in _connectionManager.Connections)
        {
            connection.Send(segment);
        }
    }

    public void Send<TEventMessage>(uint clientId, TEventMessage @event) where TEventMessage : IServerEvent
    {
        var segment = _messageSerializer.Serialize(@event);
        _connectionManager.GetConnectionById(clientId)?.Send(segment);
    }

    public IClientRequest Deserialize(ref byte[] data, out Type messageType) => _messageSerializer.Deserialize(ref data, out messageType);
}