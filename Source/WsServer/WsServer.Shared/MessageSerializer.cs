using System;
using System.Runtime.InteropServices;
using WsServer.Abstract;
using WsServer.Abstract.Messages;

namespace WsServer;

public class MessageSerializer : IMessageSerializer
{
    private readonly DefaultMessageDataWriter _defaultMessageWriter;
    private readonly IServerLogicProvider _serverLogicProvider;

    public MessageSerializer(IServerLogicProvider serverLogicProvider)
    {
        _serverLogicProvider = serverLogicProvider;
        _defaultMessageWriter = new DefaultMessageDataWriter(WriteItem);
    }

    public void Serialize<TEventMessage>(IWriteDestination dest, TEventMessage message) where TEventMessage : IServerEvent
    {
        var messageType = _serverLogicProvider.FindServerEventIdByType(typeof(TEventMessage));
        dest.SetUint8(messageType);
        WriteItem(dest, message);
    }

    public void WriteItem(IWriteDestination dest, object item)
    {
        var itemType = item.GetType();
        var writer = _serverLogicProvider.GetWriter(itemType) ?? _defaultMessageWriter;
        writer.Write(dest, item);
    }

    public IClientRequest Deserialize(ref byte[] data, out Type messageType)
    {
        if (data == null || data.Length == 0)
            throw new ArgumentException("data is null or zero length");

        var messageTypeId = data[0];
        messageType = _serverLogicProvider.FindClientRequestTypeById(messageTypeId);

        if (messageType == null)
            throw new ArgumentException($"Unknown message type ID: {messageTypeId}");

        var size = Marshal.SizeOf(messageType);

        if (data.Length - 1 < size)
            throw new ArgumentException("Payload size is less than structure size");

        var payload = new ArraySegment<byte>(data, 1, size);
        IntPtr ptr = Marshal.AllocHGlobal(size);

        try
        {
            Marshal.Copy(payload.Array, payload.Offset, ptr, size);
            return (IClientRequest)Marshal.PtrToStructure(ptr, messageType);
        }
        finally
        {
            Marshal.FreeHGlobal(ptr);
        }
    }
}