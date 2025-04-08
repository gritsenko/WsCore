using Game.ServerLogic.GameState.Events;
using Game.ServerLogic.GameState.Events.GameTickStateUpdateEventData;
using WsServer.Abstract;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.GameState.Writers;

public class GameTickUpdateEventDataWriter : MessageDataWriterBase<GameTickUpdateEvent>
{
    public override void Write(IWriteDestination dest, GameTickUpdateEvent data)
    {
        var game = data.Game;
        dest.SetCollection(game.ForEachPlayers(x => new MovementStateData(x))) //MovementStates
            .SetCollection(game.GetDestroyedBulletIds()) //DestroyedBulletsIds
            .SetCollection(game.GetRespawnedPlayerIds()) //RespawnedPlayerIds
            .SetCollection(game.GetHits()); //HitPlayersState
    }
}