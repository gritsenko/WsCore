using System;
using System.Collections.Generic;
using WsServer.Abstract.Messages;
using WsServer.Common;

namespace WsServer.Abstract;

public interface IServerLogicProvider
{
    void Initialize();
    MessageTypeRegistry ClientRequests { get; }
    MessageTypeRegistry ServerEvents { get; }
    Dictionary<byte, IRequestHandler> RequestHandlers { get; }
    Dictionary<Type, IMessageDataWriter> MessageDataWriters { get; }
    IMessageDataWriter? GetWriter(Type messageDataType);
}