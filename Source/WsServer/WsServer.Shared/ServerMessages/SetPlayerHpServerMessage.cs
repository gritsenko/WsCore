using GameModel;
using WsServer.Abstract;
using WsServer.Common;

namespace WsServer.ServerMessages
{
    [ServerMessageType(ServerMessageType.PlayerSetHp)]
    public struct SetPlayerHpServerMessage : IServerMessage
    {
        public uint PlayerId;
        public byte PlayerHp;

        public SetPlayerHpServerMessage(Player p) : this()
        {
            PlayerId = p.Id;
            PlayerHp = p.Hp;
        }
    }
}