using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using WsServer.Abstract;
using WsServer.Abstract.Messages;
using WsServer.Common;

namespace WsServer;

public class ReflectionServerLogicProvider : IServerLogicProvider
{
    private readonly MessageTypeRegistry _requestRegistry = new();
    private readonly MessageTypeRegistry _eventRegistry = new();
    private readonly Assembly _assembly;

    public MessageTypeRegistry ClientRequests => _requestRegistry;
    public MessageTypeRegistry ServerEvents => _eventRegistry;
    public Dictionary<byte, IRequestHandler> RequestHandlers { get; } = new();

    public ReflectionServerLogicProvider(Assembly assembly, IRequestHandlerFactory requestHandlerFactory)
    {
        _assembly = assembly;
        RegisterMessages(_requestRegistry, GetRequestTypes());
        RegisterMessages(_eventRegistry, GetEventTypes());
        RegisterMessageHandlers(GetRequestHandlers(), requestHandlerFactory);
    }
    private void RegisterMessages(MessageTypeRegistry registry, IEnumerable<Type> messageTypes)
    {
        foreach (var type in messageTypes)
        {
            try
            {
                // Use the concrete type directly
                var registerMethod = typeof(MessageTypeRegistry)
                    .GetMethod(nameof(MessageTypeRegistry.Register))
                    .MakeGenericMethod(type);

                registerMethod.Invoke(registry, null);
                Console.WriteLine($"Registered: {type.Name}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to register {type.Name}: {ex.Message}");
                throw;
            }
        }
    }

    private void RegisterMessageHandlers(IEnumerable<Type> requestHandlerTypes,
        IRequestHandlerFactory requestHandlerFactory)
    {
        foreach (var handlerType in requestHandlerTypes)
        {
            var handlerBaseType = GetMessageHandlerBaseType(handlerType);
            var messageType = handlerBaseType.GetGenericArguments()[0];
            var handler = requestHandlerFactory.CreateHandler(handlerType);

            var typeId = _requestRegistry.FindIdByType(messageType);

            RequestHandlers[typeId] = handler;
        }
    }

    private Type GetMessageHandlerBaseType(Type handlerType)
    {
        var baseType = handlerType.BaseType;
        while (baseType != null)
        {
            if (baseType.IsGenericType &&
                baseType.GetGenericTypeDefinition() == typeof(RequestHandlerBase<>))
                return baseType;

            baseType = baseType.BaseType;
        }
        throw new KeyNotFoundException($"Base type not found for {handlerType.Name}");
    }


    public IEnumerable<Type> GetRequestTypes() => 
        GetTypesImplementing(typeof(IClientRequest));

    public IEnumerable<Type> GetEventTypes() =>
        GetTypesImplementing(typeof(IServerEvent));

    public IEnumerable<Type> GetRequestHandlers() => 
        GetTypesImplementing(typeof(IRequestHandler));


    private IEnumerable<Type> GetTypesImplementing(Type tInterface)
    {
        var types = _assembly.GetTypes()
            .Where(t =>
                t is { IsAbstract: false } &&
                tInterface.IsAssignableFrom(t)
            );
        return types;
    }
}