using System.Runtime.InteropServices;
using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Events;

[StructLayout(LayoutKind.Sequential)]
[GenerateTypeScript]
[MemoryPackable]
public partial class SetPlayerNameEvent(uint ClientId, string Name) : IServerEvent
{
    public static byte TypeId => 100;

    public uint ClientId = ClientId;

    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
    public string Name = Name;
}