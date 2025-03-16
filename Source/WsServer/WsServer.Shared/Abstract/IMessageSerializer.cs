using WsServer.Common;

namespace WsServer.Abstract;

public interface IMessageSerializer
{
    MyBuffer Serialize<T>(T message) where T : IServerEvent;
    T Deserialize<T>(MyBuffer buffer) where T : IClientRequest;
}