using System.Runtime.InteropServices;
using WsServer.Abstract;

namespace Game.ServerLogic.Player.Events;

[StructLayout(LayoutKind.Sequential)]
public struct PlayerShootingEvent(uint clientId, int weapon, uint[] bulletIds) : IServerEvent
{
    public static byte TypeId => 103;

    public uint ClientId = clientId;
    public int Weapon = weapon;
    public uint[] BulletIds = bulletIds;
}