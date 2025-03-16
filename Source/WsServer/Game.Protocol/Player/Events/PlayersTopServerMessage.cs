using System.Runtime.InteropServices;
using WsServer.Abstract;

namespace Game.Protocol.Player.Events;

[StructLayout(LayoutKind.Sequential)]
public struct PlayersTopServerMessage(Model.Game game) : IServerMessage
{
    public static byte TypeId => 6;

    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 1024)]
    public string PlayersTop = game.Top ?? "";
}