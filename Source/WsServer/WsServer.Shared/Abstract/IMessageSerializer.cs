using WsServer.Abstract.Messages;
using WsServer.Common;

namespace WsServer.Abstract;

public interface IMessageSerializer
{
    void Serialize<TEventMessage>(MyBuffer buff, TEventMessage message) where TEventMessage : IServerEvent; 
    IClientRequest Deserialize(ref byte[] data, out byte messageTypeId);
}