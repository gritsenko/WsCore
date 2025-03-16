using WsServer.Common;

namespace WsServer.Abstract;

public interface IGameMessenger
{
    uint RegisterClient(uint id, IWebSocketClient webSocketClient);

    void RemoveClient(uint client);

    void TerminateConnection(uint clientId);

    void Broadcast(IServerMessage message);
    void Broadcast(MyBuffer buff);

    void SendMessage(uint clientId, IServerMessage message);
    void SendMessage(uint clientId, MyBuffer buff);
}