using System;

namespace WsServer.Common;

public class DuplicateMessageIdException(byte id) : Exception
{
    public override string Message => $"This Id : {id} already exists in registry";
}