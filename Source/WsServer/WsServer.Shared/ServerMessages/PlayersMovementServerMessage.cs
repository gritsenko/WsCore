using GameModel;
using WsServer.Abstract;
using WsServer.Common;

namespace WsServer.ServerMessages
{
    [ServerMessageType(ServerMessageType.PlayersMovment)]
    public struct PlayersMovementServerMessage : IServerMessage
    {
        public MovmentStateData[] MovmentStates;

        public PlayersMovementServerMessage(GameState gameState) : this()
        {
        }
    }
}