using Game.Core;
using Game.ServerLogic.GameState.Events.GameTickStateUpdateEventData;
using WsServer.Abstract;
using WsServer.Abstract.Messages;
using WsServer.Common;

namespace Game.ServerLogic.GameState.Events;

public class GameTickUpdateEvent : IServerEvent
{
    public static byte TypeId => 1;

    //keep structure to client code generator
    public MovementStateData[] MovementStates;
    public uint[] DestroyedBulletsIds;
    public uint[] RespawnedPlayerIds;
    public HitPlayerStateData[] HitPlayersState;

    //write directly to buffer to reduce allocations
    public void WriteToBuffer(MyBuffer buffer, IGameModel gameModel)
    {
        var game = (GameModel)gameModel;
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