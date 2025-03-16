using WsServer.Common;

namespace WsServer.Abstract;

public interface IClientConnection
{
    uint Id { get; }
    void Send(MyBuffer data);
}