using Game.ServerLogic.Player.Events.PlayerData;
using WsServer.Abstract;

namespace Game.ServerLogic.Player.Events;

public struct PlayerJoinedEvent(Core.Player p) : IServerEvent
{
    public static byte TypeId => 2;

    public PlayerStateData PlayerStateData = new(p);
}