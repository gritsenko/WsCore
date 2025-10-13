using System;
using WsServer.Abstract.Messages;
using WsServer.DataBuffer.Abstract;

namespace WsServer.Abstract;

public interface IMessageSerializer
{
    void WriteItem(IDataBuffer dest, object item);
    void Serialize<TEventMessage>(IDataBuffer dest, TEventMessage message) where TEventMessage : IServerEvent;
    IClientRequest Deserialize(ref byte[] data, out Type messageType);
}