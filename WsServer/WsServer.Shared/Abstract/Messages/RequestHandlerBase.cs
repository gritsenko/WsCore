using System;

namespace WsServer.Abstract.Messages;

public abstract class RequestHandlerBase<TRequest> : IRequestHandler
    where TRequest : struct, IClientRequest
{
    protected abstract void Handle(uint clientId, TRequest request);
    public void Handle(uint clientId, IClientRequest request)
    {
        if (request is TRequest typedMessage)
            Handle(clientId, typedMessage);
        else
            throw new ArgumentException("Invalid message type.");
    }
}
