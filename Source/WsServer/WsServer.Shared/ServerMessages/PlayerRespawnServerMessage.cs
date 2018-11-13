using GameModel;
using WsServer.Abstract;
using WsServer.Common;

namespace WsServer.ServerMessages
{
    [ServerMessageType(ServerMessageType.RespawnPlayer)]
    public struct PlayerRespawnServerMessage : IServerMessage
    {
        public PlayerStateData PlayerStateData;

        public PlayerRespawnServerMessage(Player respawnPlayer) : this()
        {
            PlayerStateData = new PlayerStateData(respawnPlayer);
        }

    }
}