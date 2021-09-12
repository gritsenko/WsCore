using GameModel;
using WsServer.Abstract;
using WsServer.Common;

namespace WsServer.ServerMessages
{
    [ServerMessageType(ServerMessageType.GameTickState)]
    public struct GameTickStateServerMessage : IServerMessage
    {
        public MovementStateData[] MovementStates;
        public DestroyedBulletsStateData DestroyedBulletsState;
        public HitPlayerStateData[] HitPlayersState;
        public GameTickStateServerMessage(Game game) : this()
        {
        }
    }
}