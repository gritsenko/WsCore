using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Events;

[GenerateTypeScript]
[MemoryPackable]
public partial class SetPlayerHpEvent : IServerEvent
{
    public static byte TypeId => 5;

    public uint PlayerId { get; set; }
    public byte PlayerHp { get; set; }

    [MemoryPackConstructor]
    public SetPlayerHpEvent() { }

    public SetPlayerHpEvent(Core.Player p)
    {
        PlayerId = p.Id;
        PlayerHp = p.Hp;
    }
}