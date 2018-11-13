using GameModel;
using WsServer.Abstract;
using WsServer.Common;

namespace WsServer.ServerMessages
{
    [ServerMessageType(ServerMessageType.PlayerJoined)]
    public struct PlayerJoinedServerMessage : IServerMessage
    {
        public PlayerStateData PlayerStateData;

        public PlayerJoinedServerMessage(Player p) : this()
        {
            PlayerStateData = new PlayerStateData(p);
        }
    }
}