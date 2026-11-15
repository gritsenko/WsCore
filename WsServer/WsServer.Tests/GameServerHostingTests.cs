using System.Net.WebSockets;
using Game.Core;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Game.ServerLogic.Rooms.Requests;
using WsServer.Abstract;
using WsServer.Rooms;
using static WsServer.Tests.TestSupport;

namespace WsServer.Tests;

public class GameServerHostingTests
{
    [Fact]
    public async Task HostedService_StartsWithHost_StopClosesConnectionsAndDropsRooms()
    {
        var builder = Host.CreateApplicationBuilder();
        builder.Logging.ClearProviders();
        builder.Services.AddGameServer(configure: o => o.TickIntervalMs = 5);
        using var host = builder.Build();

        var server = host.Services.GetRequiredService<GameServer>();
        // One instance serves as both IGameServer and the hosted service.
        Assert.Same(server, host.Services.GetRequiredService<IGameServer>());
        Assert.Contains(host.Services.GetServices<IHostedService>(), s => ReferenceEquals(s, server));
        Assert.False(server.IsRunning);

        await host.StartAsync();
        Assert.True(server.IsRunning);

        var conn = new RecordingConnection();
        server.OnClientConnected(conn, id => conn.Id = id);
        var connections = host.Services.GetRequiredService<IClientConnectionManager>();
        await WaitUntil(() => connections.GetConnectionById(conn.Id) != null); // the loop is ticking
        Assert.True(server.TimeSinceLastTick < TimeSpan.FromSeconds(1));

        await host.StopAsync();

        Assert.False(server.IsRunning);
        Assert.True(conn.Terminated);
        Assert.Empty(host.Services.GetRequiredService<RoomManager>().GetAllRooms());

        // A connection arriving mid-shutdown is refused, not registered.
        var late = new RecordingConnection();
        server.OnClientConnected(late, id => late.Id = id);
        Assert.True(late.Terminated);
        Assert.Equal(0u, late.Id);
    }

    [Fact]
    public async Task KeepAlive_UnansweredPings_DropHalfOpenConnectionAndItsPlayer()
    {
        var builder = WebApplication.CreateBuilder();
        builder.Logging.ClearProviders();
        builder.Services.AddGameServer(configure: o =>
        {
            o.WebSocketKeepAliveIntervalSeconds = 0.2;
            o.WebSocketKeepAliveTimeoutSeconds = 0.3;
        });
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        await using var app = builder.Build();
        app.UseGameServer();
        await app.StartAsync();

        var address = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.First();
        var wsUri = new Uri(address.Replace("http://", "ws://") + "/ws");
        var model = app.Services.GetRequiredService<GameModel>();
        var connections = app.Services.GetRequiredService<IClientConnectionManager>();
        var baseline = model.PlayersCount;

        // A healthy client keeps receiving (which answers pings); a half-open one never
        // reads, so its pings go unanswered — like a peer that vanished without a FIN.
        using var healthy = new ClientWebSocket();
        using var silent = new ClientWebSocket();
        healthy.Options.KeepAliveInterval = TimeSpan.Zero;
        silent.Options.KeepAliveInterval = TimeSpan.Zero;
        await healthy.ConnectAsync(wsUri, CancellationToken.None);
        await silent.ConnectAsync(wsUri, CancellationToken.None);
        using var drainCts = new CancellationTokenSource();
        var drain = Task.Run(async () =>
        {
            var buf = new byte[64 * 1024];
            try { while (true) await healthy.ReceiveAsync(buf, drainCts.Token); }
            catch { /* cancelled at the end */ }
        });

        // A connection alone has no avatar; entering the game room gives each one.
        await SendRequest(healthy, new JoinRoomRequest("game"));
        await SendRequest(silent, new JoinRoomRequest("game"));
        await WaitUntil(() => connections.Connections.Count() == 2 && model.PlayersCount == baseline + 2);

        // The silent connection is aborted by the server and its player removed...
        await WaitUntil(() => connections.Connections.Count() == 1, TimeSpan.FromSeconds(5));
        await WaitUntil(() => model.PlayersCount == baseline + 1);

        // ...while the responsive one survives well past several timeout windows.
        await Task.Delay(1000);
        Assert.Single(connections.Connections);
        Assert.Equal(WebSocketState.Open, healthy.State);

        drainCts.Cancel();
        await drain;
        await app.StopAsync();
    }
}
