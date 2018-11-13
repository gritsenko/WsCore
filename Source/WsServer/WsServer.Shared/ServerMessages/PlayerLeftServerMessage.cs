using WsServer.Abstract;
using WsServer.Common;

namespace WsServer.ServerMessages
{
    [ServerMessageType(ServerMessageType.PlayerLeft)]
    public struct PlayerLeftServerMessage : IServerMessage
    {
        public uint ClientId;
        public PlayerLeftServerMessage(uint clientId)
        {
            ClientId = clientId;
        }
    }
}