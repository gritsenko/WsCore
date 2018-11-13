using GameModel;
using WsServer.Abstract;
using WsServer.Common;

namespace WsServer.ServerMessages
{
    [ServerMessageType(ServerMessageType.UpdatePlayerSlots)]
    public struct UpdatePlayerSlotsServerMessage : IServerMessage
    {
        public uint PlayerId;
        public int Body;
        public int Gun;
        public int Armor;

        public UpdatePlayerSlotsServerMessage(Player player) : this()
        {
            PlayerId = player.Id;
            Body = player.BodyIndex;
            Gun = player.WeaponIndex;
            Armor = player.ArmorIndex;
        }
    }
}