using Game.ServerLogic.Player.Events.PlayerData;
using WsServer.Abstract;

namespace Game.ServerLogic.Player.Events;

public struct PlayerRespawnEvent(Core.Player respawnPlayer) : IServerEvent
{
    public static byte TypeId => 4;

    public PlayerStateData PlayerStateData = new(respawnPlayer);
}