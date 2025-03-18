using WsServer.Abstract.Messages;
using WsServer.Common;

namespace WsServer.Abstract;

public interface IMessageSerializer
{
    MyBuffer Serialize(IServerEvent message);
    IClientRequest Deserialize(ref byte[] data, out byte messageTypeId);
}