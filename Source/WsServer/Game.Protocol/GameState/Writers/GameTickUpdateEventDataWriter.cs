using Game.ServerLogic.GameState.Events;
using Game.ServerLogic.GameState.Events.GameTickStateUpdateEventData;
using WsServer.Abstract.Messages;
using WsServer.Common;

namespace Game.ServerLogic.GameState.Writers;

public class GameTickUpdateEventDataWriter : MessageDataWriterBase<GameTickUpdateEvent>
{
    public override void Write(MyBuffer dest, GameTickUpdateEvent data)
    {
        var game = data.Game;
        //MovementStates
        SetCollection(dest, game.ForEachPlayers(x => new MovementStateData(x)));
        //DestroyedBulletsIds
        SetCollection(dest, game.GetDestroyedBulletIds());
        //RespawnedPlayerIds
        SetCollection(dest, game.GetRespawnedPlayerIds());
        //HitPlayersState
        SetCollection(dest, game.GetHits());
    }
}