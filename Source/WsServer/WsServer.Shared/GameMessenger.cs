using WsServer.Abstract;
using WsServer.Abstract.Messages;

namespace WsServer;

public class GameMessenger(IClientConnectionManager connectionManager) : IGameMessenger
{
    public void Broadcast(IServerEvent @event)
    {
        foreach (var connection in connectionManager.Connections)
            connection.Send(@event);
    }

    public void Send(uint clientId, IServerEvent @event) => 
        connectionManager.GetConnectionById(clientId)?.Send(@event);
}