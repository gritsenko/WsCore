using System.Runtime.InteropServices;
using WsServer.Abstract;

namespace Game.Protocol.ServerMessages;

[StructLayout(LayoutKind.Sequential)]
[ServerMessageType(ServerMessageType.PlayerShooting)]
public struct PlayerShootingServerMessage(uint clientId, int weapon, uint[] bulletIds) : IServerMessage
{
    public uint ClientId = clientId;
    public int Weapon = weapon;
    public uint[] BulletIds = bulletIds;
}