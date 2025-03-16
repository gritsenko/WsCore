using Game.Model;
using WsServer.Abstract;

namespace Game.Protocol.Player.Events;

public struct PlayerRespawnServerMessage(Player respawnPlayer) : IServerMessage
{
    public static byte TypeId => 4;

    public PlayerStateData PlayerStateData = new(respawnPlayer);
}