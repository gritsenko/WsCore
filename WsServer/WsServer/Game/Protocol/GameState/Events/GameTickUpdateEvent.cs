using System.Buffers;
using Game.Core;
using Game.ServerLogic.GameState.Events.GameTickStateUpdateEventData;
using MemoryPack;
using WsServer.Abstract.Messages;
using System.Collections.Generic;
using System;

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

    private MovementStateData[] _movementStatesBuffer;
    private uint[] _destroyedBulletsBuffer;
    private uint[] _respawnedPlayersBuffer;
    private HitPlayerStateData[] _hitPlayersStateBuffer;

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

        // MovementStates
        var movement = new List<MovementStateData>();
        game.ForEachPlayers(p => new MovementStateData(p), movement);
        if (movement.Count == 0)
        {
            MovementStates = System.Array.Empty<MovementStateData>();
        }
        else
        {
            if (_movementStatesBuffer == null || _movementStatesBuffer.Length < movement.Count)
            {
                if (_movementStatesBuffer != null)
                    ArrayPool<MovementStateData>.Shared.Return(_movementStatesBuffer, clearArray: true);
                _movementStatesBuffer = ArrayPool<MovementStateData>.Shared.Rent(movement.Count);
            }
            movement.CopyTo(_movementStatesBuffer);
            MovementStates = _movementStatesBuffer.AsSpan(0, movement.Count).ToArray();
        }

        // DestroyedBulletsIds
        var destroyed = new List<uint>();
        game.GetDestroyedBulletIds(destroyed);
        if (destroyed.Count == 0)
        {
            DestroyedBulletsIds = System.Array.Empty<uint>();
        }
        else
        {
            if (_destroyedBulletsBuffer == null || _destroyedBulletsBuffer.Length < destroyed.Count)
            {
                if (_destroyedBulletsBuffer != null)
                    ArrayPool<uint>.Shared.Return(_destroyedBulletsBuffer, clearArray: true);
                _destroyedBulletsBuffer = ArrayPool<uint>.Shared.Rent(destroyed.Count);
            }
            destroyed.CopyTo(_destroyedBulletsBuffer);
            DestroyedBulletsIds = _destroyedBulletsBuffer.AsSpan(0, destroyed.Count).ToArray();
        }

        // RespawnedPlayerIds
        var respawned = new List<uint>();
        game.GetRespawnedPlayerIds(respawned);
        if (respawned.Count == 0)
        {
            RespawnedPlayerIds = System.Array.Empty<uint>();
        }
        else
        {
            if (_respawnedPlayersBuffer == null || _respawnedPlayersBuffer.Length < respawned.Count)
            {
                if (_respawnedPlayersBuffer != null)
                    ArrayPool<uint>.Shared.Return(_respawnedPlayersBuffer, clearArray: true);
                _respawnedPlayersBuffer = ArrayPool<uint>.Shared.Rent(respawned.Count);
            }
            respawned.CopyTo(_respawnedPlayersBuffer);
            RespawnedPlayerIds = _respawnedPlayersBuffer.AsSpan(0, respawned.Count).ToArray();
        }

        // HitPlayersState
        var hits = new List<HitInfo>();
        game.GetHits(hits);
        if (hits.Count == 0)
        {
            HitPlayersState = System.Array.Empty<HitPlayerStateData>();
        }
        else
        {
            if (_hitPlayersStateBuffer == null || _hitPlayersStateBuffer.Length < hits.Count)
            {
                if (_hitPlayersStateBuffer != null)
                    ArrayPool<HitPlayerStateData>.Shared.Return(_hitPlayersStateBuffer, clearArray: true);
                _hitPlayersStateBuffer = ArrayPool<HitPlayerStateData>.Shared.Rent(hits.Count);
            }
            for (int i = 0; i < hits.Count; i++)
                _hitPlayersStateBuffer[i] = new HitPlayerStateData(hits[i]);
            HitPlayersState = _hitPlayersStateBuffer.AsSpan(0, hits.Count).ToArray();
        }
    }
}