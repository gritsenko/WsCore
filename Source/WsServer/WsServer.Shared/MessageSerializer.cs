﻿using System;
using System.Runtime.InteropServices;
using WsServer.Abstract;
using WsServer.Abstract.Messages;
using WsServer.Common;

namespace WsServer;

public class MessageSerializer(IServerLogicProvider serverLogicProvider) : IMessageSerializer
{
    public void Serialize<TEventMessage>(MyBuffer buff, TEventMessage message) where TEventMessage : IServerEvent
    {
        var messageType = serverLogicProvider.ServerEvents.FindIdByType(typeof(TEventMessage));
        var writer = serverLogicProvider.GetWriter<TEventMessage>();

        buff.SetUint8(messageType);

        writer.Write(buff, message);
    }


    public IClientRequest Deserialize(ref byte[] data, out byte messageTypeId)
    {
        if (data == null || data.Length == 0)
            throw new ArgumentException("data is null or zero length");

        messageTypeId = data[0];
        var structureType = serverLogicProvider.ClientRequests.FindTypeById(messageTypeId);

        if (structureType == null)
            throw new ArgumentException($"Unknown message type ID: {messageTypeId}");

        var size = Marshal.SizeOf(structureType);

        if (data.Length - 1 < size)
            throw new ArgumentException("Payload size is less than structure size");

        var payload = new ArraySegment<byte>(data, 1, size);
        IntPtr ptr = Marshal.AllocHGlobal(size);

        try
        {
            Marshal.Copy(payload.Array, payload.Offset, ptr, size);
            return (IClientRequest)Marshal.PtrToStructure(ptr, structureType);
        }
        finally
        {
            Marshal.FreeHGlobal(ptr);
        }
    }
}