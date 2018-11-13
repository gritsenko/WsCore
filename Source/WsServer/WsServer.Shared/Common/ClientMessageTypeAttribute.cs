using System;

namespace WsServer.Common
{
    public class ClientMessageTypeAttribute : Attribute
    {
        public ClientMessageType ClientMessageType { get; }

        public ClientMessageTypeAttribute(ClientMessageType clientMessageType)
        {
            ClientMessageType = clientMessageType;
        }
    }
}