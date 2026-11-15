using Game.Core;
using Game.ServerLogic.Chat.Events;
using Game.ServerLogic.GameState.Events;
using Game.ServerLogic.GameState.Events.GameTickStateUpdateEventData;
using System.Numerics;

namespace WsServer.Tests;

public class GameTickUpdateEventTests
{
    private static MessageSerializer NewSerializer()
    {
        var provider = new ReflectionServerLogicProvider(typeof(ChatMessageEvent).Assembly, null);
        provider.Initialize();
        return new MessageSerializer(provider);
    }

    // Reference snapshot built the straightforward (allocating) way: fresh exact-length
    // arrays with fresh element objects, every avatar included.
    private static GameTickUpdateEvent Reference(GameModel model, List<HitInfo> hits, List<uint> destroyed, List<uint> respawned)
        => new()
        {
            ServerTimeMs = (uint)model.Time.TotalMilliseconds,
            MovementStates = model.GetPlayers().Select(p => new MovementStateData(p)).ToArray(),
            DestroyedBulletsIds = destroyed.ToArray(),
            RespawnedPlayerIds = respawned.ToArray(),
            HitPlayersState = hits.Select(h => new HitPlayerStateData(h)).ToArray(),
        };

    /// <summary>A model without the 10 built-in (always moving) bots, plus `count` idle players.</summary>
    private static (GameModel model, uint[] ids) IdleModel(int count)
    {
        var model = new GameModel(new GameServerOptions());
        foreach (var id in model.GetPlayers().Select(p => p.Id).ToList())
            model.RemovePlayer(id);
        var ids = Enumerable.Range(0, count).Select(_ => model.AddNewPlayer()).ToArray();
        return (model, ids);
    }

    private sealed class Driver(GameModel model, GameTickUpdateEvent snapshot)
    {
        private TimeSpan _t;
        public GameModel Model => model;

        /// <summary>One simulation tick that sends a snapshot; returns the ids in it.</summary>
        public uint[] Snapshot()
        {
            Tick(send: true);
            return snapshot.MovementStates.Select(m => m.PlayerId).OrderBy(id => id).ToArray();
        }

        public void Tick(bool send)
        {
            _t += TimeSpan.FromMilliseconds(33);
            model.UpdateGameState(_t, () =>
            {
                if (send) snapshot.BuildTickSnapshot();
                else snapshot.CollectTickEvents();
            });
        }
    }

    [Fact]
    public void BuildTickSnapshot_AllFull_ReusedBuffers_SerializeIdenticallyToFreshArrays()
    {
        var serializer = NewSerializer();
        var model = new GameModel(new GameServerOptions());
        var snapshot = new GameTickUpdateEvent(model, fullSnapshotEvery: 1);
        var t = TimeSpan.Zero;
        var sawHits = false;

        for (int tick = 0; tick < 20; tick++)
        {
            // Vary counts between ticks so arrays are both reused and resized.
            if (tick % 3 == 0) model.AddNewPlayer();
            if (tick % 5 == 4) model.RemovePlayer(model.GetPlayers().First().Id);
            if (tick % 2 == 0)
            {
                var shooter = model.GetPlayers().First();
                var target = model.GetPlayers().Skip(1).First();
                model.SpawnBullet(target.MovementState.Pos, target.MovementState.Pos + new Vector2(1, 0), shooter.Id);
            }

            t += TimeSpan.FromMilliseconds(33);
            byte[]? actual = null, expected = null;
            model.UpdateGameState(t, () =>
            {
                snapshot.BuildTickSnapshot();
                actual = serializer.Serialize(snapshot).ToArray();

                var hits = new List<HitInfo>(); model.GetHits(hits);
                sawHits |= hits.Count > 0;
                var destroyed = new List<uint>(); model.GetDestroyedBulletIds(destroyed);
                var respawned = new List<uint>(); model.GetRespawnedPlayerIds(respawned);
                expected = serializer.Serialize(Reference(model, hits, destroyed, respawned)).ToArray();
            });

            Assert.Equal(expected, actual);
            Assert.True(snapshot.IsFullSnapshot);
            Assert.Equal(model.PlayersCount, snapshot.MovementStates.Length);
            Assert.Equal((uint)t.TotalMilliseconds, snapshot.ServerTimeMs);
        }

        Assert.True(sawHits, "test setup should have produced at least one hit");
    }

    [Fact]
    public void NewSnapshot_BeforeAnyBuild_HasEmptyArraysNotNull()
    {
        var model = new GameModel(new GameServerOptions());
        var snapshot = new GameTickUpdateEvent(model);

        Assert.Empty(snapshot.MovementStates);
        Assert.Empty(snapshot.DestroyedBulletsIds);
        Assert.Empty(snapshot.RespawnedPlayerIds);
        Assert.Empty(snapshot.HitPlayersState);
    }

    [Fact]
    public void Delta_IdlePlayers_DropOutAfterRepeats_MovingPlayerStaysIn()
    {
        var (model, ids) = IdleModel(3);
        var d = new Driver(model, new GameTickUpdateEvent(model, fullSnapshotEvery: 1000, repeatUnchanged: 2));

        Assert.Equal(ids, d.Snapshot()); // first snapshot: full

        // Idle players: unchanged in the 2nd and 3rd snapshot (repeats 1 and 2), then gone.
        Assert.Equal(ids, d.Snapshot());
        Assert.Equal(ids, d.Snapshot());
        Assert.Empty(d.Snapshot());

        // One starts walking: it is in every snapshot while it moves, the others are not.
        var walker = model.GetPlayer(ids[1]);
        walker.SetTarget(walker.MovementState.Pos.X + 500, walker.MovementState.Pos.Y);
        for (int i = 0; i < 10; i++)
            Assert.Equal(new[] { ids[1] }, d.Snapshot());
    }

    [Fact]
    public void Delta_StoppedState_IsTransmittedRepeatUnchangedPlusOneTimes_ThenDropped()
    {
        var (model, ids) = IdleModel(1);
        var snapshot = new GameTickUpdateEvent(model, fullSnapshotEvery: 1000, repeatUnchanged: 2);
        var d = new Driver(model, snapshot);
        for (int i = 0; i < 4; i++) d.Snapshot(); // settle: idle player dropped out
        Assert.Empty(d.Snapshot());

        var p = model.GetPlayer(ids[0]);
        var target = p.MovementState.Pos + new Vector2(30, 0); // reached within a few ticks
        p.SetTarget(target.X, target.Y);

        var sent = new List<MovementStateData>();
        for (int i = 0; i < 20; i++)
        {
            d.Snapshot();
            sent.AddRange(snapshot.MovementStates.Select(m => new MovementStateData { PlayerId = m.PlayerId, X = m.X, Y = m.Y, AnimationState = m.AnimationState }));
        }

        Assert.Contains(sent, m => m.AnimationState == 1); // walking was replicated
        // The final, stopped state (at the target, idle) is the last thing sent — 3 times —
        // and nothing follows it.
        var stopped = sent.TakeLast(3).ToList();
        Assert.All(stopped, m =>
        {
            Assert.Equal(target.X, m.X);
            Assert.Equal(target.Y, m.Y);
            Assert.Equal(0, m.AnimationState);
        });
        Assert.NotEqual((target.X, (byte)0), (sent[^4].X, sent[^4].AnimationState));
        Assert.Empty(d.Snapshot());
    }

    [Fact]
    public void FullSnapshot_EveryNth_ContainsEveryAvatar_AndIsFlagged()
    {
        var (model, ids) = IdleModel(4);
        var snapshot = new GameTickUpdateEvent(model, fullSnapshotEvery: 5, repeatUnchanged: 0);
        var d = new Driver(model, snapshot);

        var fullAt = new List<int>();
        for (int i = 0; i < 16; i++)
        {
            var sent = d.Snapshot();
            if (snapshot.IsFullSnapshot)
            {
                fullAt.Add(i);
                Assert.Equal(ids, sent);
            }
            else
            {
                Assert.Empty(sent); // all idle, repeatUnchanged 0
            }
        }
        Assert.Equal(new[] { 0, 5, 10, 15 }, fullAt);
    }

    [Fact]
    public void RemovedPlayer_IsForgotten_AndANewPlayerIsSentImmediately()
    {
        var (model, ids) = IdleModel(2);
        var d = new Driver(model, new GameTickUpdateEvent(model, fullSnapshotEvery: 1000, repeatUnchanged: 0));
        d.Snapshot();
        Assert.Empty(d.Snapshot());

        model.RemovePlayer(ids[0]);
        var added = model.AddNewPlayer();
        Assert.Equal(new[] { added }, d.Snapshot());
        Assert.Empty(d.Snapshot());
    }

    [Fact]
    public void OneShotEvents_FromTicksWithoutASnapshot_AreCarriedIntoTheNextSnapshot()
    {
        var (model, ids) = IdleModel(2);
        var snapshot = new GameTickUpdateEvent(model, fullSnapshotEvery: 1000);
        var d = new Driver(model, snapshot);
        d.Snapshot();

        // A bullet spawned right on top of the other player hits it on the next tick —
        // a tick that does NOT send a snapshot.
        var shooter = model.GetPlayer(ids[0]);
        var victim = model.GetPlayer(ids[1]);
        model.SpawnBullet(victim.MovementState.Pos, victim.MovementState.Pos + new Vector2(1, 0), shooter.Id);
        d.Tick(send: false);
        d.Tick(send: false);

        d.Snapshot();
        var hit = Assert.Single(snapshot.HitPlayersState);
        Assert.Equal(victim.Id, hit.PlayerId);
        Assert.Equal(shooter.Id, hit.HitterId);
        Assert.Single(snapshot.DestroyedBulletsIds);

        // ...and only once.
        d.Snapshot();
        Assert.Empty(snapshot.HitPlayersState);
        Assert.Empty(snapshot.DestroyedBulletsIds);
    }

    [Fact]
    public void DiscardTickEvents_DropsCollectedEvents()
    {
        var (model, ids) = IdleModel(2);
        var snapshot = new GameTickUpdateEvent(model, fullSnapshotEvery: 1000);
        var d = new Driver(model, snapshot);
        var victim = model.GetPlayer(ids[1]);
        model.SpawnBullet(victim.MovementState.Pos, victim.MovementState.Pos + new Vector2(1, 0), ids[0]);
        d.Tick(send: false);
        snapshot.DiscardTickEvents();

        d.Snapshot();
        Assert.Empty(snapshot.HitPlayersState);
        Assert.Empty(snapshot.DestroyedBulletsIds);
    }

    [Theory]
    [InlineData(33, 2, 1.0, 15)]
    [InlineData(33, 1, 1.0, 30)]
    [InlineData(33, 2, 2.0, 30)]
    [InlineData(33, 2, 0.0, 1)]
    [InlineData(33, 100, 0.5, 1)]
    public void FullSnapshotEverySnapshots_FromOptions(int tickMs, int sendEvery, double fullSeconds, int expected)
    {
        var options = new GameServerOptions
        {
            TickIntervalMs = tickMs, SnapshotSendEveryTicks = sendEvery, FullSnapshotIntervalSeconds = fullSeconds,
        };
        Assert.Equal(expected, options.FullSnapshotEverySnapshots());
    }
}
