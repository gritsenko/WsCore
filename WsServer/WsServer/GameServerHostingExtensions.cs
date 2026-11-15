using Game.Core;
using Game.ServerLogic.Chat.Events;
using Microsoft.Extensions.Options;
using WsServer.Abstract;
using WsServer.Chat;
using WsServer.Persistence;
using WsServer.Rooms;
using WsServer.ServerInfo;
using WsServer.Sessions;

namespace WsServer;

/// <summary>
/// The one place the game server is wired up, shared by every host (WsServer, LoadTest,
/// TestClient, the integration-test fixture) so they can't drift apart.
/// </summary>
public static class GameServerHostingExtensions
{
    /// <summary>
    /// Registers the game server and its dependencies. <see cref="GameServer"/> is a single
    /// singleton exposed both as <see cref="IGameServer"/> and as a hosted service, so the
    /// tick loop starts with the host (not lazily on first use) and is stopped — connections
    /// closed, loop exited, rooms dropped — by the host's graceful shutdown.
    /// </summary>
    /// <param name="configuration">Optional "GameServer" section to bind; defaults otherwise.</param>
    /// <param name="configure">Optional overrides applied after binding (tests, load test).</param>
    public static IServiceCollection AddGameServer(
        this IServiceCollection services,
        IConfiguration? configuration = null,
        Action<GameServerOptions>? configure = null)
    {
        var options = services.AddOptions<GameServerOptions>();
        if (configuration != null)
            options.Bind(configuration);
        if (configure != null)
            options.Configure(configure);
        services.AddSingleton(sp => sp.GetRequiredService<IOptions<GameServerOptions>>().Value);

        services.AddSingleton<IServerLogicProvider, ReflectionServerLogicProvider>(sp =>
            // pass the Game.ServerLogic assembly for discovering messages and handlers
            new ReflectionServerLogicProvider(typeof(ChatMessageEvent).Assembly, new ClientRequestHandlerFactory(sp)));
        services.AddSingleton<IClientConnectionManager, ConnectionManager>();
        services.AddSingleton<IMessageSerializer, MessageSerializer>();
        services.AddSingleton<RoomManager>();
        services.AddSingleton<IGameMessenger>(sp => new GameMessenger(
            sp.GetRequiredService<IClientConnectionManager>(),
            sp.GetRequiredService<IMessageSerializer>(),
            sp.GetRequiredService<RoomManager>()));
        services.AddSingleton<ServerInfoProvider>();

        // Chat history + known users. Storage is opened (and read) once, on first use at
        // startup; the snapshot seeds both the history window and the user directory.
        services.AddSingleton<IChatStorage>(sp => ChatStorageFactory.Create(
            sp.GetRequiredService<GameServerOptions>(),
            sp.GetRequiredService<ILoggerFactory>().CreateLogger("WsServer.Persistence.ChatStorage")));
        services.AddSingleton(sp => sp.GetRequiredService<IChatStorage>()
            .Load(Math.Max(sp.GetRequiredService<GameServerOptions>().ChatHistoryPageSize,
                sp.GetRequiredService<GameServerOptions>().ChatHistoryCacheSize)));
        services.AddSingleton<ChatHistoryService>();
        services.AddSingleton<UserDirectory>();

        services.AddSingleton<GameModel>();
        services.AddSingleton<SessionManager>();
        services.AddSingleton<GameServer>();
        services.AddSingleton<IGameServer>(sp => sp.GetRequiredService<GameServer>());
        services.AddHostedService(sp => sp.GetRequiredService<GameServer>());

        services.AddTransient<WebSocketHandlerFactory>();
        return services;
    }

    /// <summary>
    /// Adds the WebSocket middleware (with keep-alive pings so half-open connections are
    /// detected and dropped) and maps the /ws, /health and /info endpoints.
    /// </summary>
    public static WebApplication UseGameServer(this WebApplication app, string wsPath = "/ws")
    {
        var options = app.Services.GetRequiredService<GameServerOptions>();
        app.UseWebSockets(CreateWebSocketOptions(options));
        app.Map(wsPath, WebSocketHandler.HandleWebSocket);
        app.MapGameHealth();
        // Dashboard JSON: connections, game-world players, room occupancy, process stats.
        app.MapGet("/info", (ServerInfoProvider provider) => provider.GetInfo());
        app.MapAvatars();
        return app;
    }

    public static WebSocketOptions CreateWebSocketOptions(GameServerOptions options) => new()
    {
        KeepAliveInterval = TimeSpan.FromSeconds(options.WebSocketKeepAliveIntervalSeconds),
        // Abort the socket (faulting the pending ReceiveAsync, which tears down the
        // connection and its player) when a ping goes unanswered this long.
        KeepAliveTimeout = TimeSpan.FromSeconds(options.WebSocketKeepAliveTimeoutSeconds),
    };
}
