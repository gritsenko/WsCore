namespace WsServer.Abstract.Messages;

public interface IRequestHandler
{
    void Handle(uint clientId, IClientRequest request);

}