using Game.Core;
using Game.ServerLogic.GameState.Events.GameTickStateUpdateEventData;
using Game.ServerLogic;
using MemoryPack;
using WsServer.Abstract.Messages;
using System.Collections.Generic;
using System.Linq;

namespace Game.ServerLogic.GameState.Events;

[GenerateTypeScript]
[MemoryPackable]
public partial class GameTickUpdateEvent : IServerEvent
{
    public static byte TypeId => 1;

    //keep structure to client code generator
    public MovementStateData[] MovementStates;
    public uint[] DestroyedBulletsIds;
    public uint[] RespawnedPlayerIds;
    public HitPlayerStateData[] HitPlayersState;
    
    [MemoryPackIgnore]
    public GameModel Game { get; }

    [MemoryPackConstructor]
    public GameTickUpdateEvent()
    {
    }

    public GameTickUpdateEvent(GameModel game)
    {
        Game = game;
        BuildTickSnapshot();
    }

    public void BuildTickSnapshot()
    {
        var game = Game;
        if (game == null) return;

        var movement = new List<MovementStateData>();
        game.ForEachPlayers(p => new MovementStateData(p), movement);
        MovementStates = movement.Count == 0 ? System.Array.Empty<MovementStateData>() : movement.ToArray();

        var destroyed = new List<uint>();
        game.GetDestroyedBulletIds(destroyed);
        DestroyedBulletsIds = destroyed.Count == 0 ? System.Array.Empty<uint>() : destroyed.ToArray();

        var respawned = new List<uint>();
        game.GetRespawnedPlayerIds(respawned);
        RespawnedPlayerIds = respawned.Count == 0 ? System.Array.Empty<uint>() : respawned.ToArray();

        var hits = new List<HitInfo>();
        game.GetHits(hits);
        if (hits.Count == 0)
        {
            HitPlayersState = System.Array.Empty<HitPlayerStateData>();
        }
        else
        {
            var arr = new HitPlayerStateData[hits.Count];
            for (int i = 0; i < hits.Count; i++) arr[i] = new HitPlayerStateData(hits[i]);
            HitPlayersState = arr;
        }
    }

}