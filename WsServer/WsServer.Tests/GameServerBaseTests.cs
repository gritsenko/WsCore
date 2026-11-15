using Microsoft.Extensions.Logging.Abstractions;
using Game.ServerLogic.Chat.Events;
using WsServer.Abstract;

namespace WsServer.Tests;

public class GameServerBaseTests
{
    // Minimal model: counts ticks, throws while FailuresLeft > 0, records the times passed in.
    public sealed class FakeModel : IGameModel
    {
        public volatile int FailuresLeft;
        public int Ticks;
        public readonly List<TimeSpan> Times = new();

        public bool TopChanged => false;
        public int PlayersCount => 0;
        private uint _lastId;
        public uint GetNewPlayerId() => Interlocked.Increment(ref _lastId);

        public void UpdateGameState(TimeSpan time, Action onUpdatedAction)
        {
            lock (Times) Times.Add(time);
            if (FailuresLeft > 0)
            {
                FailuresLeft--;
                throw new InvalidOperationException("boom");
            }
            Interlocked.Increment(ref Ticks);
            onUpdatedAction();
        }
    }

    private sealed class TestServer(FakeModel model, GameServerOptions options) : GameServerBase<FakeModel>(
        model,
        new GameMessenger(new ConnectionManager(), new MessageSerializer(NewProvider())),
        new ConnectionManager(),
        NewProvider(),
        options,
        NullLogger<GameServerBase<FakeModel>>.Instance);

    private static ReflectionServerLogicProvider NewProvider()
        => new(typeof(ChatMessageEvent).Assembly, null);

    private static async Task WaitUntil(Func<bool> condition, TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (!condition())
        {
            if (DateTime.UtcNow > deadline)
                throw new TimeoutException("condition not met");
            await Task.Delay(10);
        }
    }

    [Fact]
    public async Task TickLoop_ThrowingTicks_LoopKeepsRunning()
    {
        var model = new FakeModel { FailuresLeft = 3 };
        using var server = new TestServer(model, new GameServerOptions { TickIntervalMs = 5 });
        server.Start();

        // The first three ticks throw; the loop must survive them and keep ticking.
        await WaitUntil(() => Volatile.Read(ref model.Ticks) >= 3, TimeSpan.FromSeconds(5));
        Assert.Equal(0, model.FailuresLeft);
        Assert.True(server.TimeSinceLastTick < TimeSpan.FromSeconds(1));
    }

    [Fact]
    public async Task TickLoop_PassesMonotonicIncreasingTime()
    {
        var model = new FakeModel();
        using var server = new TestServer(model, new GameServerOptions { TickIntervalMs = 5 });
        server.Start();

        await WaitUntil(() => Volatile.Read(ref model.Ticks) >= 5, TimeSpan.FromSeconds(5));
        server.Dispose();

        TimeSpan[] times;
        lock (model.Times) times = model.Times.ToArray();
        for (int i = 1; i < times.Length; i++)
            Assert.True(times[i] > times[i - 1], $"time went backwards at tick {i}");
    }

    [Fact]
    public async Task TimeSinceLastTick_PersistentlyFailingTicks_KeepsGrowing()
    {
        var model = new FakeModel { FailuresLeft = int.MaxValue };
        using var server = new TestServer(model, new GameServerOptions { TickIntervalMs = 5 });
        server.Start();

        await Task.Delay(300);

        // No tick ever succeeded, so the age is measured from loop start and keeps growing.
        Assert.Equal(0, Volatile.Read(ref model.Ticks));
        Assert.True(server.TimeSinceLastTick >= TimeSpan.FromMilliseconds(250));
    }
}
