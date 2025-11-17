using System;
using WsServer.Abstract.Messages;

namespace WsServer.Abstract;

public interface IMessageSerializer
{
    // Serialize event into a byte array with leading typeId (1 byte) followed by MemoryPack payload
    ArraySegment<byte> Serialize<TEventMessage>(TEventMessage message) where TEventMessage : IServerEvent;

    // Serialize client request into a byte array with leading typeId (1 byte) followed by MemoryPack payload
    ArraySegment<byte> SerializeClientRequest<TRequest>(TRequest request) where TRequest : IClientRequest;

    // Deserialize request from a buffer with leading typeId + MemoryPack payload
    IClientRequest Deserialize(ref byte[] data, out Type messageType);
}