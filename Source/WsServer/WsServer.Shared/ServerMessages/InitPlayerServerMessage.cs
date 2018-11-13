using GameModel;
using WsServer.Abstract;
using WsServer.Common;

namespace WsServer.ServerMessages
{
    [ServerMessageType(ServerMessageType.InitPlayer)]
    public struct InitPlayerServerMessage : IServerMessage
    {
        public uint ClientId;

        public InitPlayerServerMessage(uint clientId) : this()
        {
            ClientId = clientId;
        }
    }
}