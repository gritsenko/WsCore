using Game.Model;
using WsServer.Abstract;

namespace Game.Protocol.ServerMessages;

[ServerMessageType(ServerMessageType.PlayerSetHp)]
public struct SetPlayerHpServerMessage(Player p) : IServerMessage
{
    public uint PlayerId = p.Id;
    public byte PlayerHp = p.Hp;
}