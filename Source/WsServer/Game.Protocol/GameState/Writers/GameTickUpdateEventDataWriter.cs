using Game.Core;
using Game.ServerLogic.GameState.Events;
using Game.ServerLogic.GameState.Events.GameTickStateUpdateEventData;
using WsServer.Abstract;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.GameState.Writers;

public class GameTickUpdateEventDataWriter : MessageDataWriterBase<GameTickUpdateEvent>
{
    private static MovementStateData ProcessPlayerMovement(Core.Player player) => new(player);
    
    private readonly List<MovementStateData> _movementBuffer = [];
    private readonly List<uint> _destroyedBulletsBuffer = [];
    private readonly List<uint> _respawnedPlayersBuffer = [];
    private readonly List<HitInfo> _hitsBuffer = [];
    
    public override void Write(IWriteDestination dest, GameTickUpdateEvent data)
    {
        var game = data.Game; 
        game.ForEachPlayers(ProcessPlayerMovement, _movementBuffer);
        game.GetDestroyedBulletIds(_destroyedBulletsBuffer);
        game.GetRespawnedPlayerIds(_respawnedPlayersBuffer);
        game.GetHits(_hitsBuffer);

        dest.SetCollection(_movementBuffer) //MovementStates
            .SetCollection(_destroyedBulletsBuffer)
            .SetCollection(_respawnedPlayersBuffer) //RespawnedPlayerIds
            .SetCollection(_hitsBuffer); //HitPlayersState
    }
}