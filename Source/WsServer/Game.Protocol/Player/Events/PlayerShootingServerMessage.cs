using System.Runtime.InteropServices;
using WsServer.Abstract;

namespace Game.Protocol.Player.Events;

[StructLayout(LayoutKind.Sequential)]
public struct PlayerShootingServerMessage(uint clientId, int weapon, uint[] bulletIds) : IServerMessage
{
    public static byte TypeId => 103;

    public uint ClientId = clientId;
    public int Weapon = weapon;
    public uint[] BulletIds = bulletIds;
}