using System.Runtime.InteropServices;
using GameModel;
using WsServer.Abstract;
using WsServer.Common;

namespace WsServer.ServerMessages
{
    [ServerMessageType(ServerMessageType.GameState)]
    public struct GameStateServerMessage : IServerMessage
    {
        public PlayerStateData[] PlayerStateData;

        public GameStateServerMessage(GameState state) : this()
        {
            PlayerStateData = new PlayerStateData[state.PlayersCount];
            var i = 0;
            foreach (var player in state.GetPlayers())
            {
                PlayerStateData[i] = new PlayerStateData(player);
                i++;
            }
        }
    }
}