using System;
using System.Collections.Generic;
using System.Linq;
using WsServer.Abstract.Messages;

namespace WsServer.Common;

public class MessageTypeRegistry
{
    private readonly Dictionary<byte, Type> _registeredTypes = [];

    public void Register<T>() where T : IMessageType
    {
        var typeId = T.TypeId;
        if (!_registeredTypes.TryAdd(typeId, typeof(T)))
            throw new DuplicateMessageIdException(typeId);
    }

    public byte FindIdByType(Type type) => _registeredTypes.First(x => x.Value == type).Key;
}