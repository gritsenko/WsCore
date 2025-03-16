using System.Runtime.InteropServices;
using WsServer.Abstract;

namespace Game.ServerLogic.Player.Events;

[StructLayout(LayoutKind.Sequential)]
public struct SetPlayerNameEvent(uint clinetId, string name) : IServerEvent
{
    public static byte TypeId => 100;

    public uint ClientId = clinetId;

    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
    public string Name = name;
}