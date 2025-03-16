namespace WsServer.Abstract;

public interface IClientConnectionManager
{
    IClientConnection Register(IWebSocketClient socket);
    void Remove(uint clientId);
}