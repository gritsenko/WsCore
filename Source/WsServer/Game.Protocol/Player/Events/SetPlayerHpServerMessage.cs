using Game.Model;
using WsServer.Abstract;

namespace Game.Protocol.Player.Events;

public struct SetPlayerHpServerMessage(Player p) : IServerMessage
{
    public static byte TypeId => 5;

    public uint PlayerId = p.Id;
    public byte PlayerHp = p.Hp;
}