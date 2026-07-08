using Game.Core;
using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Events;

[GenerateTypeScript]
[MemoryPackable]
public partial class PlayersTopEvent : IServerEvent
{
    public static byte TypeId => 6;

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