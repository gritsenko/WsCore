using System.Runtime.InteropServices;
using WsServer.Abstract;
using WsServer.Common;

namespace WsServer.ClientMessages
{
    [StructLayout(LayoutKind.Sequential)]
    [ClientMessageType(ClientMessageType.PlayerShooting)]
    public struct PlayerShootingClientMessage : IClientMessage
    {
        public int Weapon;
    }
}