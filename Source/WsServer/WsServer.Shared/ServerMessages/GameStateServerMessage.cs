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
            var ps = state.GetPlayers();
            var cnt = ps.Length;
            PlayerStateData = new PlayerStateData[cnt];
            for (var i = 0; i < cnt; i++)
                PlayerStateData[i] = new PlayerStateData(ps[i]);
        }
    }
}