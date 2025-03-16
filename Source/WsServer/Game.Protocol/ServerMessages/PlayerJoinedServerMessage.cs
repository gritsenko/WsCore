using Game.Model;
using WsServer.Abstract;

namespace Game.Protocol.ServerMessages;

[ServerMessageType(ServerMessageType.PlayerJoined)]
public struct PlayerJoinedServerMessage(Player p) : IServerMessage
{
    public PlayerStateData PlayerStateData = new(p);
}