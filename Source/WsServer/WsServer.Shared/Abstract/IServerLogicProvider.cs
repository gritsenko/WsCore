using System;
using WsServer.Abstract.Messages;

namespace WsServer.Abstract;

public interface IServerLogicProvider
{
    void Initialize();
    Type FindClientRequestTypeById(byte messageTypeId);
    byte FindServerEventIdByType(Type type);
    IMessageDataWriter? GetWriter(Type messageDataType);
    bool TryGetRequestHandler(Type type, out IRequestHandler? handler);
}