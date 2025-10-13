using System.Runtime.InteropServices;
using Game.Core;
using Game.ServerLogic;
using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Events;

[StructLayout(LayoutKind.Sequential)]
[GenerateTypeScript]
[MemoryPackable]
public partial class PlayersTopEvent : IServerEvent
{
    public static byte TypeId => 6;

    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 1024)]
    public string PlayersTop;

    [MemoryPackConstructor]
    public PlayersTopEvent()
    {
    }

    public PlayersTopEvent(GameModel game)
    {
        PlayersTop = game.Top ?? "";
    }
}