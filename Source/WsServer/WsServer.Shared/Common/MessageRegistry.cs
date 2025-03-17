using System.Collections.Generic;
using WsServer.Abstract.Messages;

namespace WsServer.Common;

public class MessageRegistry
{
    private readonly HashSet<byte> _registeredIds = [];

    public void Register<T>() where T : IMessageType
    {
        var typeId = T.TypeId;
        if (!_registeredIds.Add(typeId))
            throw new DuplicateMessageIdException(typeId);
    }
}