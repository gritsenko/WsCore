using System.Runtime.InteropServices;
using WsServer.Abstract;

namespace Game.Protocol.ServerMessages;

[StructLayout(LayoutKind.Sequential)]
[ServerMessageType(ServerMessageType.PlayersTop)]
public struct PlayersTopServerMessage(Model.Game game) : IServerMessage
{
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 1024)]
    public string PlayersTop = game.Top ?? "";
}