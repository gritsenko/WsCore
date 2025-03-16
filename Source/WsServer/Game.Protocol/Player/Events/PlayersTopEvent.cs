using System.Runtime.InteropServices;
using Game.Core;
using WsServer.Abstract;

namespace Game.ServerLogic.Player.Events;

[StructLayout(LayoutKind.Sequential)]
public struct PlayersTopEvent(GameModel game) : IServerEvent
{
    public static byte TypeId => 6;

    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 1024)]
    public string PlayersTop = game.Top ?? "";
}