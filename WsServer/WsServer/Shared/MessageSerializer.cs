using System;
using System.Buffers;
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
        // Use ArrayBufferWriter for pooled buffer
        var writer = new ArrayBufferWriter<byte>(1024);
        writer.GetSpan(1)[0] = messageType; // Reserve and set header
        writer.Advance(1);
        MemoryPackSerializer.Serialize(writer, message);
        var buffer = writer.WrittenSpan;
        // Copy to ArrayPool-rented buffer for compatibility with ArraySegment<byte>
        var pooled = ArrayPool<byte>.Shared.Rent(buffer.Length);
        buffer.CopyTo(pooled);
        return new ArraySegment<byte>(pooled, 0, buffer.Length);
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