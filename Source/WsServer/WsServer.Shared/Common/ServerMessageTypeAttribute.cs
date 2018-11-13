using System;

namespace WsServer.Common
{
    public class ServerMessageTypeAttribute : Attribute
    {
        public ServerMessageType ServerMessageType { get; }

        public ServerMessageTypeAttribute(ServerMessageType serverMessageType)
        {
            ServerMessageType = serverMessageType;
        }
    }
}