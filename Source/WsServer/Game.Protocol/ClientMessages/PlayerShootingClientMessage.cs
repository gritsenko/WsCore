using System.Runtime.InteropServices;
using WsServer.Abstract;

namespace Game.Protocol.ClientMessages;

[StructLayout(LayoutKind.Sequential)]
[ClientMessageType(ClientMessageType.PlayerShooting)]
public struct PlayerShootingClientMessage : IClientMessage
{
    public int Weapon;
}