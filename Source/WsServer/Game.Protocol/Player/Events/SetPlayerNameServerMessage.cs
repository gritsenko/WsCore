using System.Runtime.InteropServices;
using WsServer.Abstract;

namespace Game.Protocol.Player.Events;

[StructLayout(LayoutKind.Sequential)]
public struct SetPlayerNameServerMessage(uint clinetId, string name) : IServerMessage
{
    public static byte TypeId => 100;

    public uint ClientId = clinetId;

    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
    public string Name = name;
}