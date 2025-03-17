using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using WsServer.Abstract;
using WsServer.Abstract.Messages;
using WsServer.Common;

namespace WsServer;

public class ReflectionServerLogicProvider(Assembly assembly) : IServerLogicProvider
{
    public IEnumerable<Type> GetRequestTypes() => 
        GetTypesImplementing(typeof(IClientRequest));

    public IEnumerable<Type> GetEventTypes() =>
        GetTypesImplementing(typeof(IServerEvent));

    public IEnumerable<Type> GetRequestHandlers() => 
        GetTypesImplementing(typeof(IRequestHandler));

    private IEnumerable<Type> GetTypesImplementing(Type tInterface)
    {
        var types = assembly.GetTypes()
            .Where(t =>
                t is { IsAbstract: false } &&
                tInterface.IsAssignableFrom(t)
            );
        return types;
    }
}