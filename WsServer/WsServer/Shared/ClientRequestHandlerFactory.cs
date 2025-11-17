using System;
using Microsoft.Extensions.DependencyInjection;
using WsServer.Abstract.Messages;

namespace WsServer;

public class ClientRequestHandlerFactory(IServiceProvider serviceProvider) : IRequestHandlerFactory
{
    public IRequestHandler CreateHandler(Type handlerType) =>
        ActivatorUtilities.CreateInstance(
            serviceProvider,
            handlerType) as IRequestHandler ?? throw new InvalidOperationException();
}