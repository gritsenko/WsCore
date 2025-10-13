using System;
using WsServer.Abstract.Messages;
using WsServer.DataBuffer.Abstract;

namespace WsServer.Abstract;

public interface IServerLogicProvider
{
    void Initialize();
    Type FindClientRequestTypeById(byte messageTypeId);
    byte FindServerEventIdByType(Type type);
    IDataBufferWriter? GetWriter(Type messageDataType);
    bool TryGetRequestHandler(Type type, out IRequestHandler? handler);
}