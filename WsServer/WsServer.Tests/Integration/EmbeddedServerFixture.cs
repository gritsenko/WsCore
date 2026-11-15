using Game.Core;
using Game.ServerLogic.Chat.Events;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using WsServer.Abstract;
using WsServer.Rooms;

namespace WsServer.Tests.Integration;

/// <summary>
/// Boots the real server in-process on an OS-assigned loopback port, the same way
/// WsServer.LoadTest does — a real Kestrel host + real WebSockets, not a mocked
/// transport. Shared across a test class via IClassFixture so the tick loop only
/// starts once per class.
/// </summary>
public sealed class EmbeddedServerFixture : IAsyncLifetime
{
    private WebApplication _app = null!;

    public Uri WsUri { get; private set; } = null!;
    public Uri HttpUri { get; private set; } = null!;
    public GameModel GameModel { get; private set; } = null!;
    public RoomManager Rooms { get; private set; } = null!;
    public ReflectionServerLogicProvider LogicProvider { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.Logging.ClearProviders();

        // Short heartbeat so the tests can observe it without waiting the default 5 s; no
        // chat cooldown so a test's back-to-back messages aren't rate-limited.
        builder.Services.AddGameServer(configure: o =>
        {
            o.HeartbeatIntervalSeconds = 0.3;
            o.ChatCooldownSeconds = 0;
        });

        builder.WebHost.UseUrls("http://127.0.0.1:0"); // OS picks a free port

        _app = builder.Build();
        _app.UseGameServer();
        await _app.StartAsync();

        var address = _app.Services.GetRequiredService<IServer>()
            .Features.Get<IServerAddressesFeature>()!.Addresses.First();
        WsUri = new Uri(address.Replace("http://", "ws://") + "/ws");
        HttpUri = new Uri(address);

        // The game server is a hosted service: StartAsync above started its tick loop.
        GameModel = _app.Services.GetRequiredService<GameModel>();
        Rooms = _app.Services.GetRequiredService<RoomManager>();
        LogicProvider = (ReflectionServerLogicProvider)_app.Services.GetRequiredService<IServerLogicProvider>();

        await Task.Delay(200); // let the first tick run
    }

    public async Task DisposeAsync()
    {
        await _app.StopAsync();
    }
}
