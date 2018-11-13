using WsServer.Abstract;
using WsServer.Common;

namespace WsServer.ClientMessages
{
    [ClientMessageType(ClientMessageType.RespawnPlayer)]
    public struct PlayerRespawnClientMessage : IClientMessage
    {
        public uint PlayerId;

    }
}