using System.Runtime.InteropServices;
using Game.Model;
using WsServer.Abstract;

namespace Game.Protocol.Player.Events;

[StructLayout(LayoutKind.Sequential)]
public struct PlayerStateData(Player p) : IMessageData
{
    public uint Id = p.Id;

    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
    public string Name = p.Name;
    public byte Hp = p.Hp;
    public byte MaxHp = p.MaxHp;
    public int BodyIndex = p.BodyIndex;
    public int WeaponIndex = p.WeaponIndex;
    public int ArmorIndex = p.ArmorIndex;
    public MovementStateData MovementState = new(p);
}