using System;
using MemoryPack;
using WsServer.Abstract;
using WsServer.Abstract.Messages;

namespace WsServer;

public class MessageSerializer : IMessageSerializer
{
    private readonly IServerLogicProvider _serverLogicProvider;

    public MessageSerializer(IServerLogicProvider serverLogicProvider)
    {
        _serverLogicProvider = serverLogicProvider;
    }

    public ArraySegment<byte> Serialize<TEventMessage>(TEventMessage message) where TEventMessage : IServerEvent
    {
        var messageType = _serverLogicProvider.FindServerEventIdByType(typeof(TEventMessage));
        var payload = MemoryPackSerializer.Serialize(message);
        // prepend 1 byte type id
        var buffer = new byte[1 + payload.Length];
        buffer[0] = messageType;
        if (payload.Length > 0)
            Buffer.BlockCopy(payload, 0, buffer, 1, payload.Length);
        return new ArraySegment<byte>(buffer, 0, buffer.Length);
    }

    public IClientRequest Deserialize(ref byte[] data, out Type messageType)
    {
        if (data == null || data.Length == 0)
            throw new ArgumentException("data is null or zero length");

        var messageTypeId = data[0];
        messageType = _serverLogicProvider.FindClientRequestTypeById(messageTypeId);
        if (messageType == null)
            throw new ArgumentException($"Unknown message type ID: {messageTypeId}");

        // slice payload after 1-byte header
        var payload = new ReadOnlySpan<byte>(data, 1, data.Length - 1);
        var obj = MemoryPackSerializer.Deserialize(messageType, payload);
        if (obj is not IClientRequest req)
            throw new InvalidCastException($"Deserialized type is not IClientRequest: {messageType}");
        return req;
    }
}