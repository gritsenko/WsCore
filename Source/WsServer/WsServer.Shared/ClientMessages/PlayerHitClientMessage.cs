using WsServer.Abstract;
using WsServer.Common;

namespace WsServer.ClientMessages
{
    [ClientMessageType(ClientMessageType.HitPlayer)]
    public struct PlayerHitClientMessage : IClientMessage
    {
        public uint PlayeId;

        public int HitPoints;
    }
}