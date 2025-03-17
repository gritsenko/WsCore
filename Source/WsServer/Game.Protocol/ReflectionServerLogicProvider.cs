using WsServer.Abstract;
using WsServer.Abstract.Messages;
using WsServer.Common;

namespace Game.ServerLogic;

public class ReflectionServerLogicProvider : IServerLogicProvider
{
    public IEnumerable<Type> GetRequestTypes() => 
        GetTypesImplementing(typeof(IClientRequest));

    public IEnumerable<Type> GetEventTypes() =>
        GetTypesImplementing(typeof(IServerEvent));

    public IEnumerable<Type> GetRequestHandlers() => 
        GetTypesImplementing(typeof(MessageHandlerBase));

    private IEnumerable<Type> GetTypesImplementing(Type tInterface)
    {
        var assembly = GetType().Assembly;
        var types = assembly.GetTypes()
            .Where(t =>
                t is { IsValueType: true, IsAbstract: false } &&
                tInterface.IsAssignableFrom(t)
            );
        return types;
    }
}