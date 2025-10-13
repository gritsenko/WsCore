using System;
using WsServer.Abstract.Messages;

namespace WsServer.Abstract;

public interface IServerLogicProvider
{
    void Initialize();
    Type FindClientRequestTypeById(byte messageTypeId);
    byte FindServerEventIdByType(Type type);
    bool TryGetRequestHandler(Type type, out IRequestHandler? handler);
}