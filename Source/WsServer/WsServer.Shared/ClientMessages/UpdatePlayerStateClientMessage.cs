using WsServer.Abstract;
using WsServer.Common;

namespace WsServer.ClientMessages
{
    [ClientMessageType(ClientMessageType.UpdatePlayerState)]
    public struct UpdatePlayerStateClientMessage : IClientMessage
    {
        public float AimX;
        public float AimY;
        public int ControlsState;
    }
}