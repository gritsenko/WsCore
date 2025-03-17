using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Events;

public struct SetPlayerHpEvent(Core.Player p) : IServerEvent
{
    public static byte TypeId => 5;

    public uint PlayerId = p.Id;
    public byte PlayerHp = p.Hp;
}