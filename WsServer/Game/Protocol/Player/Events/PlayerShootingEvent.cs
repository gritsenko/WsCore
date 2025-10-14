using System.Runtime.InteropServices;
using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Events;

[StructLayout(LayoutKind.Sequential)]
[GenerateTypeScript]
[MemoryPackable]
public partial class PlayerShootingEvent(uint clientId, int weapon, uint[] bulletIds) : IServerEvent
{
    public static byte TypeId => 103;

    public uint ClientId = clientId;
    public int Weapon = weapon;
    public uint[] BulletIds = bulletIds;
}