using WsServer.Abstract.Messages;

namespace WsServer.Abstract;

public interface IGameMessenger
{
    void Broadcast(IServerEvent @event);
    void Send(uint clientId, IServerEvent @event);
}