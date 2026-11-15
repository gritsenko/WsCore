using Game.Core;
using Game.ServerLogic.Player.Events;
using Game.ServerLogic.Rooms.Requests;
using Microsoft.Extensions.DependencyInjection;
using WsServer.Abstract;
using WsServer.Rooms;
using static WsServer.Tests.TestSupport;

namespace WsServer.Tests;

/// <summary>
/// Connect/disconnect go through the tick thread's command queue: the id is reserved
/// synchronously, but the player, room membership and registration only appear when the
/// loop drains the queue — and always in connect → requests → disconnect order.
/// </summary>
public class ConnectionLifecycleTests
{
    private sealed record Ctx(ServiceProvider Services, GameServer Server, GameModel Model,
        RoomManager Rooms, IClientConnectionManager Connections) : IAsyncDisposable
    {
        public async ValueTask DisposeAsync()
        {
            await Server.StopAsync(CancellationToken.None);
            await Services.DisposeAsync();
        }
    }

    private static Ctx Create()
    {
        var sp = BuildGameServices(o => o.TickIntervalMs = 5);
        return new Ctx(sp, sp.GetRequiredService<GameServer>(), sp.GetRequiredService<GameModel>(),
            sp.GetRequiredService<RoomManager>(), sp.GetRequiredService<IClientConnectionManager>());
    }

    // Waits for a full tick that started after this call, i.e. one that drained everything
    // queued so far (OnTick fires after the drain within the same tick).
    private static async Task WaitForFreshTick(GameServer server)
    {
        var ticks = 0;
        void Handler() => Interlocked.Increment(ref ticks);
        server.OnTick += Handler;
        try { await WaitUntil(() => Volatile.Read(ref ticks) >= 2); }
        finally { server.OnTick -= Handler; }
    }

    [Fact]
    public async Task Connect_IdIsSynchronous_PlayerAppearsOnTick_InitPlayerIsFirstMessage()
    {
        await using var ctx = Create();
        var baseline = ctx.Model.PlayersCount;
        var conn = new RecordingConnection();

        ctx.Server.OnClientConnected(conn, id => conn.Id = id);
        // A request sent right after connecting is queued behind the connect command.
        ctx.Server.ProcessClientRequest(conn.Id, new JoinRoomRequest("game"));

        Assert.NotEqual(0u, conn.Id);
        // Loop not started: nothing has touched the model, rooms or registry yet.
        Assert.Equal(baseline, ctx.Model.PlayersCount);
        Assert.Null(ctx.Connections.GetConnectionById(conn.Id));
        Assert.Null(ctx.Rooms.GetClientRoom(conn.Id));
        Assert.Empty(conn.Messages);

        ctx.Server.Start();
        await WaitUntil(() => ctx.Rooms.GetClientRoom(conn.Id)?.Id == "game");

        Assert.Equal(baseline + 1, ctx.Model.PlayersCount);
        Assert.Same(conn, ctx.Connections.GetConnectionById(conn.Id));
        Assert.Equal(InitPlayerEvent.TypeId, conn.Messages[0][0]);
    }

    [Fact]
    public async Task Disconnect_BeforeConnectCommandRan_NoPlayerLeaked()
    {
        await using var ctx = Create();
        var baseline = ctx.Model.PlayersCount;
        var conn = new RecordingConnection();

        // The socket drops before the tick thread ever processed its connect.
        ctx.Server.OnClientConnected(conn, id => conn.Id = id);
        ctx.Server.OnClientDisconnected(conn.Id);

        ctx.Server.Start();
        await WaitForFreshTick(ctx.Server);

        Assert.Equal(baseline, ctx.Model.PlayersCount);
        Assert.Null(ctx.Model.GetPlayer(conn.Id));
        Assert.Null(ctx.Connections.GetConnectionById(conn.Id));
        Assert.Null(ctx.Rooms.GetClientRoom(conn.Id));
        Assert.DoesNotContain(conn.Id, ctx.Rooms.GetRoom("lobby")!.GetClientIds());
    }

    [Fact]
    public async Task ConcurrentConnectDisconnect_WhileTicking_LeavesNoTrace()
    {
        await using var ctx = Create();
        var baseline = ctx.Model.PlayersCount;
        ctx.Server.Start();

        // Many "sockets" connecting, sending and dropping in parallel with the running loop.
        var conns = Enumerable.Range(0, 200).Select(_ => new RecordingConnection()).ToArray();
        await Parallel.ForEachAsync(conns, async (conn, _) =>
        {
            ctx.Server.OnClientConnected(conn, id => conn.Id = id);
            ctx.Server.ProcessClientRequest(conn.Id, new JoinRoomRequest("game"));
            await Task.Yield();
            ctx.Server.OnClientDisconnected(conn.Id);
        });

        await WaitForFreshTick(ctx.Server);

        Assert.Equal(200, conns.Select(c => c.Id).Distinct().Count());
        Assert.DoesNotContain(0u, conns.Select(c => c.Id));
        Assert.Equal(baseline, ctx.Model.PlayersCount);
        Assert.Empty(ctx.Connections.Connections);
        Assert.All(ctx.Rooms.GetAllRooms(), room => Assert.True(room.IsEmpty, $"room {room.Id} not empty"));
        // Every connection saw InitPlayer first (connect ran before anything else for it).
        Assert.All(conns, c => Assert.Equal(InitPlayerEvent.TypeId, c.Messages[0][0]));
    }
}
