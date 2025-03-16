using Game.Model;
using WsServer.Abstract;

namespace Game.Protocol.ServerMessages;

[ServerMessageType(ServerMessageType.RespawnPlayer)]
public struct PlayerRespawnServerMessage(Player respawnPlayer) : IServerMessage
{
    public PlayerStateData PlayerStateData = new(respawnPlayer);
}