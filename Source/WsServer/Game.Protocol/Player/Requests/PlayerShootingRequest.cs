using System.Runtime.InteropServices;
using WsServer.Abstract;

namespace Game.Protocol.Player.Requests;

[StructLayout(LayoutKind.Sequential)]
[ClientMessageType(ClientMessageType.PlayerShooting)]
public struct PlayerShootingRequest : IClientRequest
{
    public int Weapon;
}