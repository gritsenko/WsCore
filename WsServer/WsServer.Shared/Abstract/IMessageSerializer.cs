using System;
using WsServer.Abstract.Messages;

namespace WsServer.Abstract;

public interface IMessageSerializer
{
    // Serialize event into a byte array with leading typeId (1 byte) followed by MemoryPack payload
    ArraySegment<byte> Serialize<TEventMessage>(TEventMessage message) where TEventMessage : IServerEvent;

    // Deserialize request from a buffer with leading typeId + MemoryPack payload
    IClientRequest Deserialize(ref byte[] data, out Type messageType);
}