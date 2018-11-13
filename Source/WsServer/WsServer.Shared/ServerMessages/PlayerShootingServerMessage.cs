using System.Runtime.InteropServices;
using WsServer.Abstract;
using WsServer.Common;

namespace WsServer.ServerMessages
{
    [StructLayout(LayoutKind.Sequential)]
    [ServerMessageType(ServerMessageType.PlayerShooting)]
    public struct PlayerShootingServerMessage : IServerMessage
    {
        public uint ClientId;
        public int Weapon;
        public PlayerShootingServerMessage(uint clinetId, int weapon)
        {
            ClientId = clinetId;
            Weapon = weapon;
        }
    }
}