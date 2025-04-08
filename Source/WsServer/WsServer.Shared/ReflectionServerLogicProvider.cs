using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using WsServer.Abstract;
using WsServer.Abstract.Messages;

namespace WsServer;

public class ReflectionServerLogicProvider(Assembly assembly, IRequestHandlerFactory requestHandlerFactory) : IServerLogicProvider
{
    private readonly MessageTypeRegistry _requestRegistry = new();
    private readonly MessageTypeRegistry _eventRegistry = new();
    private readonly Dictionary<Type, IRequestHandler> _requestHandlers = new();
    private readonly Dictionary<Type, IMessageDataWriter> _messageDataWriters = new();

    public void Initialize()
    {
        RegisterMessages(_requestRegistry, GetRequestTypes());
        RegisterMessages(_eventRegistry, GetEventTypes());
        RegisterMessageHandlers(GetRequestHandlers(), requestHandlerFactory);
        RegisterMessageDataWriters(GetMessageDataWriters());
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
            var handlerBaseType = GetBaseType(handlerType, typeof(RequestHandlerBase<>));
            var messageType = handlerBaseType.GetGenericArguments()[0];
            var handler = requestHandlerFactory.CreateHandler(handlerType);
            _requestHandlers[messageType] = handler;
        }
    }
    private void RegisterMessageDataWriters(IEnumerable<Type> messageDataWriters)
    {
        foreach (var messageDataWriter in messageDataWriters)
        {
            var baseType = GetBaseType(messageDataWriter, typeof(MessageDataWriterBase<>));
            var messageType = baseType.GetGenericArguments()[0];
            var writerInstance = Activator.CreateInstance(messageDataWriter) as IMessageDataWriter;
            _messageDataWriters[messageType] = writerInstance!;
        }
    }

    private Type GetBaseType(Type handlerType, Type desiredBaseType)
    {
        var baseType = handlerType.BaseType;
        while (baseType != null)
        {
            if (baseType.IsGenericType &&
                baseType.GetGenericTypeDefinition() == desiredBaseType)
                return baseType;

            baseType = baseType.BaseType;
        }
        throw new KeyNotFoundException($"Base type not found for {handlerType.Name}");
    }


    private IEnumerable<Type> GetRequestTypes() => GetTypesImplementing(typeof(IClientRequest));

    private IEnumerable<Type> GetEventTypes() => GetTypesImplementing(typeof(IServerEvent));

    private IEnumerable<Type> GetRequestHandlers() => GetTypesImplementing(typeof(IRequestHandler));

    private IEnumerable<Type> GetMessageDataWriters() => GetTypesImplementing(typeof(IMessageDataWriter));


    private IEnumerable<Type> GetTypesImplementing(Type tInterface)
    {
        var types = assembly.GetTypes()
            .Where(t =>
                t is { IsAbstract: false } &&
                tInterface.IsAssignableFrom(t)
            );
        return types;
    }

    public IMessageDataWriter? GetWriter(Type messageType) => _messageDataWriters!.GetValueOrDefault(messageType, null);

    public Type FindClientRequestTypeById(byte messageTypeId) => _requestRegistry.FindTypeById(messageTypeId);

    public byte FindServerEventIdByType(Type type) => _eventRegistry.FindIdByType(type);

    public bool TryGetRequestHandler(Type type, out IRequestHandler? handler) => _requestHandlers.TryGetValue(type, out handler);

    private sealed class MessageTypeRegistry
    {
        private readonly Dictionary<byte, Type> _registeredTypes = [];

        public void Register<T>() where T : IMessageType
        {
            var typeId = T.TypeId;
            if (!_registeredTypes.TryAdd(typeId, typeof(T)))
                throw new DuplicateMessageIdException(typeId);
        }

        public byte FindIdByType(Type type) => _registeredTypes.First(x => x.Value == type).Key;
        public Type FindTypeById(byte typeId) => _registeredTypes[typeId];

        private class DuplicateMessageIdException(byte id) : Exception
        {
            public override string Message => $"This Id : {id} already exists in registry";
        }
    }
}