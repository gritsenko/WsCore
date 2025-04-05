using Game.ServerLogic.GameState.Events;
using Game.ServerLogic.GameState.Events.GameTickStateUpdateEventData;
using WsServer.Abstract.Messages;
using WsServer.Common;

namespace Game.ServerLogic.GameState.Writers;

public class GameTickUpdateEventDataWriter : IMessageDataWriter<GameTickUpdateEvent>
{
    public void Write(MyBuffer dest, GameTickUpdateEvent data)
    {
        var game = data.Game;
        //MovementStates
        dest.SetCollection(game.ForEachPlayers(x => new MovementStateData(x)));
        //DestroyedBulletsIds
        dest.SetCollection(game.GetDestroyedBulletIds());
        //RespawnedPlayerIds
        dest.SetCollection(game.GetRespawnedPlayerIds());
        //HitPlayersState
        dest.SetCollection(game.GetHits());
    }
}