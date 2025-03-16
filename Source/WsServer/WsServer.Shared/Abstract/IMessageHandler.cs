namespace WsServer.Abstract;

public interface IMessageHandler
{
    bool Handle(uint clientId, byte[] buffer, int count);
}