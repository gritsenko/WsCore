using WsServer.Abstract;
using WsServer.Common;

namespace WsServer.ClientMessages
{
    [ClientMessageType(ClientMessageType.GetMapObjects)]
    public struct GetMapObjectsClientMessage : IClientMessage
    {
        public int MapX;
        public int MapY;
    }
}