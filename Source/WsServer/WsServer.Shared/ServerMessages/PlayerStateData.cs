using System.Runtime.InteropServices;
using GameModel;
using WsServer.Abstract;
using WsServer.Common;

namespace WsServer.ServerMessages
{
    [StructLayout(LayoutKind.Sequential)]
    public struct PlayerStateData : IMessageData
    {
        public uint Id;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string Name;
        public byte Hp;
        public byte MaxHp;
        public int BodyIndex;
        public int WeaponIndex;
        public int ArmorIndex;
        public MovmentStateData MovmentState;

        public PlayerStateData(Player p)
        {
            Id = p.Id;
            Name = p.Name;
            Hp = p.Hp;
            MaxHp = p.Maxhp;
            BodyIndex = p.BodyIndex;
            WeaponIndex = p.WeaponIndex;
            ArmorIndex = p.ArmorIndex;
            MovmentState = new MovmentStateData(p);
        }
    }
}