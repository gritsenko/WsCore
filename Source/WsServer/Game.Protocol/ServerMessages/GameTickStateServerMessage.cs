using WsServer.Abstract;
using WsServer.Common;

namespace Game.Protocol.ServerMessages;

[ServerMessageType(ServerMessageType.GameTickState)]
public struct GameTickStateServerMessage : IServerMessage
{
    //keep structure to client code generator
    public MovementStateData[] MovementStates;
    public uint[] DestroyedBulletsIds;
    public uint[] RespawnedPlayerIds;
    public HitPlayerStateData[] HitPlayersState;

    //write directly to buffer to reduce allocations
    public void WriteToBuffer(MyBuffer buffer, IGameModel gameModel)
    {
        var game = (Model.Game)gameModel;
        //MovementStates
        buffer.SetCollection(game.ForEachPlayers(x => new MovementStateData(x)));
        //DestroyedBulletsIds
        buffer.SetCollection(game.GetDestroyedBulletIds());
        //RespawnedPlayerIds
        buffer.SetCollection(game.GetRespawnedPlayerIds());
        //HitPlayersState
        buffer.SetCollection(game.GetHits());
    }
}