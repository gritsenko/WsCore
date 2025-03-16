using WsServer.Abstract;

namespace Game.Protocol.ServerMessages;

[ServerMessageType(ServerMessageType.GameState)]
public struct GameStateServerMessage : IServerMessage
{
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