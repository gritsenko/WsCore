using System;

namespace WsServer.Common;

public class DuplicateMessageIdException : Exception
{
    public override string Message => "This Id already exists in registry";
}