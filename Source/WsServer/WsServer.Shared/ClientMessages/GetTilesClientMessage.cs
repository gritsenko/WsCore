using WsServer.Abstract;
using WsServer.Common;

namespace WsServer.ClientMessages
{
    [ClientMessageType(ClientMessageType.GetTiles)]
    public struct GetTilesClientMessage : IClientMessage
    {
        public int MapX;
        public int MapY;
    }
}