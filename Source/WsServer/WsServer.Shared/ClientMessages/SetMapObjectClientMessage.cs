using WsServer.Abstract;
using WsServer.Common;

namespace WsServer.ClientMessages
{
    [ClientMessageType(ClientMessageType.SetMapObject)]
    public struct SetMapObjectClientMessage : IClientMessage
    {
        public int MapX;
        public int MapY;
        public int ObjectType;
    }

    [ClientMessageType(ClientMessageType.DestroyMapObject)]
    public struct DestroyMapObjectClientMessage : IClientMessage
    {
        public int MapX;
        public int MapY;
    }
}