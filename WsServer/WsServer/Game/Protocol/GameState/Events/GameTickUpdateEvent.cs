using Game.Core;
using Game.ServerLogic.GameState.Events.GameTickStateUpdateEventData;
using MemoryPack;
using WsServer.Abstract.Messages;
using System.Collections.Generic;
using System;
using System.Numerics;

namespace Game.ServerLogic.GameState.Events;

/// <summary>
/// The tick snapshot, broadcast to spatial-room members through each connection's
/// unreliable latest-wins slot (a newer snapshot replaces an unsent older one).
///
/// Delta encoding: <see cref="MovementStates"/> holds only the avatars whose replicated
/// state (position, animation state) changed within the last
/// <c>repeatUnchanged + 1</c> snapshots — so a player that stops is sent in its stopped
/// state that many times before it drops out — plus EVERY avatar in a periodic full
/// snapshot (every <c>fullSnapshotEvery</c>-th one, the first one included). A client
/// treats an avatar missing from a snapshot as unchanged. Full snapshots are delivered
/// as keyframes: a pending full snapshot is never replaced by a delta in the send slot
/// (see IClientConnection.SendLatest), so every client converges within one
/// full-snapshot period even if it loses deltas.
///
/// The one-shot arrays (destroyed bullets, respawns, hits) are accumulated over all the
/// simulation ticks since the previous snapshot (<see cref="CollectTickEvents"/>), so a
/// send rate below the simulation rate loses none of them on the server side. They still
/// ride the lossy slot, though: a snapshot replaced before it reaches the socket takes
/// its one-shot entries with it.
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class GameTickUpdateEvent : IServerEvent
{
    public static byte TypeId => 1;

    //keep structure to client code generator
    // Simulation time of the snapshot in ms since the server's loop started (wraps after
    // ~49 days). Clients timestamp their interpolation samples with it.
    public uint ServerTimeMs;
    public MovementStateData[] MovementStates;
    public uint[] DestroyedBulletsIds;
    public uint[] RespawnedPlayerIds;
    public HitPlayerStateData[] HitPlayersState;

    // ---- server-side state (private / ignored => not serialized) ----------------------

    /// <summary>True if the last BuildTickSnapshot produced a full snapshot (every avatar).</summary>
    [MemoryPackIgnore]
    public bool IsFullSnapshot { get; private set; }

    [MemoryPackIgnore]
    public GameModel Game { get; }

    private readonly int _fullSnapshotEvery;
    private readonly int _repeatUnchanged;
    private long _snapshotIndex;

    // What each avatar looked like in the snapshots, keyed by player id.
    private sealed class Replica
    {
        public Vector2 Pos;
        public byte Anim;
        public int SnapshotsUnchanged;
        public long SeenAt;
    }
    private readonly Dictionary<uint, Replica> _replicas = new();
    private readonly List<uint> _staleReplicas = new();

    // Tick-thread-only scratch state, reused every snapshot. The public arrays above must
    // have exactly the element count MemoryPack should write, so an array is reused in
    // place when the count is unchanged and reallocated otherwise; the element objects
    // come from these pools and are overwritten each time. Safe because the snapshot is
    // serialized synchronously on the tick thread right after it's built, before the next
    // BuildTickSnapshot.
    private readonly List<Core.Player> _players = new();
    private readonly List<Core.Player> _included = new();
    private readonly List<MovementStateData> _movementPool = new();
    private readonly List<uint> _scratchIds = new();
    private readonly List<HitInfo> _scratchHits = new();
    private readonly List<uint> _destroyed = new();
    private readonly List<uint> _respawned = new();
    private readonly List<HitInfo> _hits = new();
    private readonly List<HitPlayerStateData> _hitPool = new();

    [MemoryPackConstructor]
    public GameTickUpdateEvent()
    {
    }

    /// <param name="game">The model to snapshot.</param>
    /// <param name="fullSnapshotEvery">Every Nth snapshot (and the first) carries every
    /// avatar; 1 = every snapshot is full (no delta encoding).</param>
    /// <param name="repeatUnchanged">How many further snapshots keep an avatar after its
    /// state last changed, so the final (e.g. stopped) state survives a few lost ones.</param>
    public GameTickUpdateEvent(GameModel game, int fullSnapshotEvery = 1, int repeatUnchanged = 2)
    {
        Game = game;
        _fullSnapshotEvery = Math.Max(1, fullSnapshotEvery);
        _repeatUnchanged = Math.Max(0, repeatUnchanged);
        MovementStates = [];
        DestroyedBulletsIds = [];
        RespawnedPlayerIds = [];
        HitPlayersState = [];
    }

    /// <summary>
    /// Call on every simulation tick that does not build a snapshot: remembers this tick's
    /// one-shot events (the model clears them after the tick) for the next snapshot.
    /// </summary>
    public void CollectTickEvents()
    {
        var game = Game;
        if (game == null) return;

        game.GetDestroyedBulletIds(_scratchIds);
        _destroyed.AddRange(_scratchIds);
        game.GetRespawnedPlayerIds(_scratchIds);
        _respawned.AddRange(_scratchIds);
        game.GetHits(_scratchHits);
        _hits.AddRange(_scratchHits);
        _scratchIds.Clear();
        _scratchHits.Clear();
    }

    /// <summary>Drops collected one-shot events (nobody is there to receive them).</summary>
    public void DiscardTickEvents()
    {
        _destroyed.Clear();
        _respawned.Clear();
        _hits.Clear();
    }

    /// <summary>Collects this tick's events and fills the public fields with the next snapshot.</summary>
    public void BuildTickSnapshot()
    {
        var game = Game;
        if (game == null) return;

        CollectTickEvents();

        var index = _snapshotIndex++;
        var full = index % _fullSnapshotEvery == 0;
        IsFullSnapshot = full;
        ServerTimeMs = unchecked((uint)(long)game.Time.TotalMilliseconds);

        // MovementStates: avatars that changed recently, or all of them in a full snapshot.
        game.ForEachPlayers(static p => p, _players);
        foreach (var player in _players)
        {
            var pos = player.MovementState.Pos;
            var anim = player.AnimationState;
            if (!_replicas.TryGetValue(player.Id, out var replica))
            {
                replica = new Replica { Pos = pos, Anim = anim };
                _replicas[player.Id] = replica;
            }
            else if (replica.Pos != pos || replica.Anim != anim)
            {
                replica.Pos = pos;
                replica.Anim = anim;
                replica.SnapshotsUnchanged = 0;
            }
            else if (replica.SnapshotsUnchanged < int.MaxValue)
            {
                replica.SnapshotsUnchanged++;
            }
            replica.SeenAt = index;

            if (full || replica.SnapshotsUnchanged <= _repeatUnchanged)
                _included.Add(player);
        }

        var movement = ExactLength(MovementStates, _included.Count);
        for (int i = 0; i < movement.Length; i++)
        {
            var item = Rent(_movementPool, i);
            item.CopyFrom(_included[i]);
            movement[i] = item;
        }
        MovementStates = movement;
        // Don't keep removed players reachable until the next snapshot.
        _players.Clear();
        _included.Clear();
        ForgetRemovedPlayers(index);

        // One-shot arrays: everything collected since the previous snapshot.
        DestroyedBulletsIds = CopyExact(DestroyedBulletsIds, _destroyed);
        RespawnedPlayerIds = CopyExact(RespawnedPlayerIds, _respawned);
        var hits = ExactLength(HitPlayersState, _hits.Count);
        for (int i = 0; i < hits.Length; i++)
        {
            var item = Rent(_hitPool, i);
            item.CopyFrom(_hits[i]);
            hits[i] = item;
        }
        HitPlayersState = hits;
        DiscardTickEvents();
    }

    // A player that left (and possibly rejoins later under the same id) must start over
    // as "new", and its bookkeeping must not accumulate.
    private void ForgetRemovedPlayers(long index)
    {
        if (_replicas.Count == 0) return;
        foreach (var (id, replica) in _replicas)
        {
            if (replica.SeenAt != index)
                _staleReplicas.Add(id);
        }
        foreach (var id in _staleReplicas)
            _replicas.Remove(id);
        _staleReplicas.Clear();
    }

    // Returns `current` if it already has exactly `count` elements, otherwise a new array.
    private static T[] ExactLength<T>(T[]? current, int count)
    {
        if (count == 0) return System.Array.Empty<T>();
        return current != null && current.Length == count ? current : new T[count];
    }

    private static uint[] CopyExact(uint[]? current, List<uint> source)
    {
        var result = ExactLength(current, source.Count);
        source.CopyTo(result);
        return result;
    }

    private static T Rent<T>(List<T> pool, int index) where T : new()
    {
        if (index == pool.Count)
            pool.Add(new T());
        return pool[index];
    }
}
