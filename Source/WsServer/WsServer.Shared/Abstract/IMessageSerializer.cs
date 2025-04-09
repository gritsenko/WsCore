using System;
using WsServer.Abstract.Messages;

namespace WsServer.Abstract;

public interface IMessageSerializer
{
    void WriteItem(IWriteDestination dest, object item);
    void Serialize<TEventMessage>(IWriteDestination dest, TEventMessage message) where TEventMessage : IServerEvent;
    IClientRequest Deserialize(ref byte[] data, out Type messageType);
}