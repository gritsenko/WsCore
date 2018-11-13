using System.Runtime.InteropServices;
using WsServer.Abstract;
using WsServer.Common;

namespace WsServer.ClientMessages
{
    [ClientMessageType(ClientMessageType.UpdatePlayerSlots)]
    public struct UpdatePlayerSlotsClientMessage : IClientMessage
    {
        public int Body;
        public int Gun;
        public int Armor;
    }
}