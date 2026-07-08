using Game.ServerLogic.Chat.Events;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Console;
using Microsoft.Extensions.Logging.Debug;
using Game.Core;
using WsServer;
using WsServer.Abstract;
using WsServer.ServerInfo;
using WsServer.Prototype; // added for prototype

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddLogging(b =>
{
    b.AddConsole()
        .AddDebug()
        .AddFilter<ConsoleLoggerProvider>(category: null, level: LogLevel.Information)
        .AddFilter<DebugLoggerProvider>(category: null, level: LogLevel.Debug);
});

builder.Services.AddSingleton<IServerLogicProvider, ReflectionServerLogicProvider>(sc =>
    //pass our Game.ServerLogic assembly for parsing messages and handlers from it
    new ReflectionServerLogicProvider(typeof(ChatMessageEvent).Assembly, new ClientRequestHandlerFactory(sc)));

// Tick rate, buffer sizes, rate-limit cooldowns and validation limits — configurable via
// the "GameServer" section of appsettings.json instead of scattered magic numbers.
builder.Services.Configure<GameServerOptions>(builder.Configuration.GetSection("GameServer"));
builder.Services.AddSingleton(sp => sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<GameServerOptions>>().Value);

//init game server
builder.Services.AddSingleton<IClientConnectionManager, ConnectionManager>();
builder.Services.AddSingleton<IMessageSerializer, MessageSerializer>();
// Add RoomManager to DI container
builder.Services.AddSingleton<WsServer.Rooms.RoomManager>();
// Register unified GameMessenger with room awareness
builder.Services.AddSingleton<IGameMessenger>(sp =>
    new GameMessenger(
        sp.GetRequiredService<IClientConnectionManager>(),
        sp.GetRequiredService<IMessageSerializer>(),
        sp.GetRequiredService<WsServer.Rooms.RoomManager>()));
// server info provider for dashboard
builder.Services.AddSingleton<ServerInfoProvider>();

builder.Services.AddSingleton<GameModel>();
builder.Services.AddSingleton<IGameServer, GameServer>();

builder.Services.AddTransient<WebSocketHandlerFactory>();

// Prototype synthetic client: Development-only, and disabled there too unless WS_PROTO_CLIENT=1
if (builder.Environment.IsDevelopment())
{
    builder.Services.AddHostedService<PrototypeClientHostedService>();
}

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}

app.UseDefaultFiles();
app.UseStaticFiles();

// WebSocket handling
app.UseWebSockets();
app.Map("/ws", WebSocketHandler.HandleWebSocket);

// Simple server info endpoint for dashboard
app.MapGet("/info", (ServerInfoProvider provider) => provider.GetInfo());

// Lightweight health endpoint for Docker/orchestration probes
app.MapGet("/health", () => Results.Ok("healthy"));

app.Run();