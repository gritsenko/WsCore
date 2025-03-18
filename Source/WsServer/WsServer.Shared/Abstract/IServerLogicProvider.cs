using System.Collections.Generic;
using WsServer.Abstract.Messages;
using WsServer.Common;

namespace WsServer.Abstract;

public interface IServerLogicProvider
{
    MessageTypeRegistry ClientRequests { get; }
    MessageTypeRegistry ServerEvents { get; }
    Dictionary<byte, IRequestHandler> RequestHandlers { get; }
}