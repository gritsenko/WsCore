using System.Runtime.InteropServices;
using Game.ServerLogic;
using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Requests;

[StructLayout(LayoutKind.Sequential)]
[GenerateTypeScript]
[MemoryPackable]
public partial class PlayerShootingRequest : IClientRequest
{
    public static byte TypeId => 103;

    public int Weapon;
}