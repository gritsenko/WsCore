using Game.ServerLogic.GameState.Events.GameTickStateUpdateEventData;
using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Events.PlayerData;

[GenerateTypeScript]
[MemoryPackable]
public partial class PlayerStateData
{
    public uint Id;

    public string Name;
    public byte Hp;
    public byte MaxHp;
    public int BodyIndex;
    public int WeaponIndex;
    public int ArmorIndex;
    public MovementStateData MovementState;

    [MemoryPackConstructor]
    public PlayerStateData()
    {
    }

    public PlayerStateData(Core.Player p)
    {
        Id = p.Id;
        Name = p.Name;
        Hp = p.Hp;
        MaxHp = p.MaxHp;
        BodyIndex = p.BodyIndex;
        WeaponIndex = p.WeaponIndex;
        ArmorIndex = p.ArmorIndex;
        MovementState = new(p);
    }
}