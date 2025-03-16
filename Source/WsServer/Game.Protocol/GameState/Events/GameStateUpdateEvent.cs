using Game.Core;
using Game.ServerLogic.Player.Events.PlayerData;
using WsServer.Abstract;

namespace Game.ServerLogic.GameState.Events;

public struct GameStateUpdateEvent : IServerEvent
{
    public static byte TypeId => 0;

    public PlayerStateData[] PlayerStateData;

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