using System;
using System.Reflection;
using WsServer.Abstract;
using WsServer.Common;

namespace WsServer;

public class MessageSerializer : IMessageSerializer
{
    public MyBuffer Serialize(IServerEvent message)
    {
        var messageType = messageTypeAttr.ServerMessageType;

        var buff = MyBuffer.Create()
            .SetUint8((byte)messageType)
            .SetData(message);

        return buff;
    }

    public IClientRequest Deserialize(ref byte[] messageBuffer)
    {
        throw new System.NotImplementedException();
    }
}