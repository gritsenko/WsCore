using WsServer.Common;

namespace WsServer.Abstract;

public interface IGameMessenger
{
    uint RegisterClient(uint id, IWebSocketClient webSocketClient);

    void RemoveClient(uint client);

    void TerminateConnection(uint clientId);

    void Broadcast(IServerEvent @event);
    void Broadcast(MyBuffer buff);

    void SendMessage(uint clientId, IServerEvent @event);
    void SendMessage(uint clientId, MyBuffer buff);
}