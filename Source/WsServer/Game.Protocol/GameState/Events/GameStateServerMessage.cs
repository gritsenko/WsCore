using Game.Protocol.Player.Events;
using WsServer.Abstract;

namespace Game.Protocol.GameState.Events;

public struct GameStateServerMessage : IServerMessage
{
    public static byte TypeId => 0;

    public PlayerStateData[] PlayerStateData;

    public GameStateServerMessage(IGameModel gameModel) : this()
    {
        var state = (Model.Game)gameModel;
        PlayerStateData = new PlayerStateData[state.PlayersCount];
        var i = 0;
        foreach (var player in state.GetPlayers())
        {
            PlayerStateData[i] = new PlayerStateData(player);
            i++;
        }
    }

}