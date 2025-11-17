using Game.Core;
using Game.ServerLogic.Player.Events.PlayerData;
using MemoryPack;
using WsServer.Abstract;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.GameState.Events;

[GenerateTypeScript]
[MemoryPackable]
public partial class GameStateUpdateEvent : IServerEvent
{
    public static byte TypeId => 0;

    public PlayerStateData[] PlayerStateData;

    [MemoryPackConstructor]
    public GameStateUpdateEvent()
    {
    }

    public GameStateUpdateEvent(IGameModel gameModel) : this()
    {
        var state = (GameModel)gameModel;
        PlayerStateData = new PlayerStateData[state.PlayersCount];
        var i = 0;
        foreach (var player in state.GetPlayers())
        {
            PlayerStateData[i] = new PlayerStateData(player);
            i++;
        }
    }

}