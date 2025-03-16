using System.Reflection;
using System.Runtime.CompilerServices;
using WsServer.Abstract;
using WsServer.Common;

namespace Game.ServerLogic;

public static class MessageRegistry
{
    private static readonly HashSet<byte> _registeredIds = new();

    public static void Register<T>() where T : IMessageType
    {
        var typeId = T.TypeId;
        if (!_registeredIds.Add(typeId))
            throw new DuplicateMessageIdException(typeId);
    }
}

internal static class AutoMessageRegistrar
{
    [ModuleInitializer]
    public static void Initialize()
    {
        var assembly = Assembly.GetExecutingAssembly();
        RegisterTypesImplementing<IServerEvent>(assembly);
        RegisterTypesImplementing<IClientRequest>(assembly);
    }

    private static void RegisterTypesImplementing<TInterface>(Assembly assembly)
    {
        var messageTypes = assembly.GetTypes()
            .Where(t =>
                t.IsValueType &&
                !t.IsAbstract &&
                typeof(TInterface).IsAssignableFrom(t)
            );

        var registerMethod = typeof(MessageRegistry)
            .GetMethod(nameof(MessageRegistry.Register))
            .MakeGenericMethod(typeof(TInterface));

        foreach (var type in messageTypes)
        {
            try
            {
                registerMethod.Invoke(null, null);
                Console.WriteLine($"Registered: {type.Name}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to register {type.Name}: {ex.Message}");
                throw;
            }
        }
    }
}