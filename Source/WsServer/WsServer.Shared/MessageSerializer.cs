using System;
using System.Runtime.InteropServices;
using WsServer.Abstract;
using WsServer.Abstract.Messages;
using WsServer.Common;

namespace WsServer;

public class MessageSerializer() : IMessageSerializer
{
    public MyBuffer Serialize(IServerEvent message)
    {
        var messageType = 0;// messageTypeAttr.ServerMessageType;

        var buff = MyBuffer.Create()
            .SetUint8((byte)messageType)
            .SetData(message);

        return buff;
    }

    public IClientRequest Deserialize(ref byte[] data)
    {
        var msg = ByteArrayToStructure<T>(data);
        return msg as IClientRequest;
    }

    protected virtual T DecodeToMessage<T>(byte[] buffer, int count) where T : struct
    {
        var subbuf = new ArraySegment<byte>(buffer, 1, count);
        var msg = ByteArrayToStructure<T>(subbuf.ToArray());
        return msg;
    }

    static T ByteArrayToStructure<T>(byte[] bytes) where T : struct
    {
        var handle = GCHandle.Alloc(bytes, GCHandleType.Pinned);
        var result = (T)Marshal.PtrToStructure(handle.AddrOfPinnedObject(), typeof(T));
        handle.Free();
        return result;
    }

}