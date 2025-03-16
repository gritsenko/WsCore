using Game.Model;
using WsServer.Abstract;

namespace Game.Protocol.Player.Events;

public struct PlayerJoinedServerMessage(Player p) : IServerMessage
{
    public static byte TypeId => 2;

    public PlayerStateData PlayerStateData = new(p);
}