using WsServer.Abstract;
using WsServer.Common;

namespace WsServer.ClientMessages
{
    [ClientMessageType(ClientMessageType.UpdatePlayerTarget)]
    public struct UpdatePlayerTargetClientMessage : IClientMessage
    {
        public float AimX;
        public float AimY;
    }
}