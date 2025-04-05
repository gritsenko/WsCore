using WsServer.Abstract;
using WsServer.Abstract.Messages;

namespace WsServer;

public class GameMessenger(IClientConnectionManager connectionManager) : IGameMessenger
{
    public void Broadcast<TEventMessage>(TEventMessage @event) where TEventMessage : IServerEvent
    {
        foreach (var connection in connectionManager.Connections)
            connection.Send(@event);
    }

    public void Send<TEventMessage>(uint clientId, TEventMessage @event) where TEventMessage : IServerEvent
    {
        connectionManager.GetConnectionById(clientId)?.Send(@event);
    }
}