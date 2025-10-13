using Game.ServerLogic;
using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Events;

[GenerateTypeScript]
[MemoryPackable]
public partial class UpdatePlayerSlotsEvent : IServerEvent
{
    public static byte TypeId => 102;

    public uint PlayerId;
    public int Body;
    public int Gun;
    public int Armor;

    public UpdatePlayerSlotsEvent(uint PlayerId, int Body, int Gun, int Armor)
    {
        this.PlayerId = PlayerId;
        this.Body = Body;
        this.Gun = Gun;
        this.Armor = Armor;
    }
}