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
    public GameModel GameModel { get; private set; } = null!;
    public ReflectionServerLogicProvider LogicProvider { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.Logging.ClearProviders();

        builder.Services.AddSingleton<IServerLogicProvider, ReflectionServerLogicProvider>(sc =>
            new ReflectionServerLogicProvider(typeof(ChatMessageEvent).Assembly, new ClientRequestHandlerFactory(sc)));
        builder.Services.AddSingleton<IClientConnectionManager, ConnectionManager>();
        builder.Services.AddSingleton<IMessageSerializer, MessageSerializer>();
        builder.Services.AddSingleton<RoomManager>();
        builder.Services.AddSingleton<IGameMessenger>(sp => new GameMessenger(
            sp.GetRequiredService<IClientConnectionManager>(),
            sp.GetRequiredService<IMessageSerializer>(),
            sp.GetRequiredService<RoomManager>()));
        builder.Services.AddSingleton(new GameServerOptions());
        builder.Services.AddSingleton<GameModel>();
        builder.Services.AddSingleton<IGameServer, GameServer>();
        builder.Services.AddTransient<WebSocketHandlerFactory>();

        builder.WebHost.UseUrls("http://127.0.0.1:0"); // OS picks a free port

        _app = builder.Build();
        _app.UseWebSockets();
        _app.Map("/ws", WebSocketHandler.HandleWebSocket);
        await _app.StartAsync();

        var address = _app.Services.GetRequiredService<IServer>()
            .Features.Get<IServerAddressesFeature>()!.Addresses.First();
        WsUri = new Uri(address.Replace("http://", "ws://") + "/ws");

        // Resolving IGameServer starts the tick loop and initializes the message registry.
        _ = _app.Services.GetRequiredService<IGameServer>();
        GameModel = _app.Services.GetRequiredService<GameModel>();
        LogicProvider = (ReflectionServerLogicProvider)_app.Services.GetRequiredService<IServerLogicProvider>();

        await Task.Delay(200); // let the first tick run
    }

    public async Task DisposeAsync()
    {
        await _app.StopAsync();
    }
}
