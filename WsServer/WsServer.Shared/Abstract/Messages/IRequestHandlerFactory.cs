using System;

namespace WsServer.Abstract.Messages;

public interface IRequestHandlerFactory
{
    IRequestHandler CreateHandler(Type handlerType);
}