namespace WsServer.Abstract;

public interface IClientConnectionManager
{
    void Register(IClientConnection connection);
    void Remove(uint clientId);
}