using System.Runtime.InteropServices;
using WsServer.Abstract;

namespace Game.Protocol.ServerMessages;

[StructLayout(LayoutKind.Sequential)]
[ServerMessageType(ServerMessageType.SetPlayerName)]
public struct SetPlayerNameServerMessage(uint clinetId, string name) : IServerMessage
{
    public uint ClientId = clinetId;

    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
    public string Name = name;
}