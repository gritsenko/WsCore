using Game.ServerLogic.Chat.Events;
using Game.Core;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using WsServer;
using WsServer.Abstract;
using WsServer.Rooms;
using RazorConsole.Core;
using WsServer.TestClient.Components;
using System.Text;

// Enable UTF-8 encoding for console output to display emojis
Console.OutputEncoding = Encoding.UTF8;

Console.WriteLine("🎮 WebSocket Test Client with Embedded Server\n");

// Start embedded server in background thread
var serverTask = StartEmbeddedServer();
await Task.Delay(2000); // Wait for server to start

Console.WriteLine("✅ Embedded server started on ws://localhost:5000/ws\n");

// Start RazorConsole UI
var hostBuilder = Host.CreateDefaultBuilder(args)
    .UseRazorConsole<App>();

var host = hostBuilder.Build();
Console.Clear();
await host.RunAsync();

// ============ Helper Functions ============

async Task<WebApplication> StartEmbeddedServer()
{
    var builder = WebApplication.CreateBuilder();
    
    builder.Services.AddLogging(b =>
    {
        b.AddConsole()
            .AddFilter(level => level >= LogLevel.Information);
    });

    builder.Services.AddSingleton<IServerLogicProvider, ReflectionServerLogicProvider>(sc =>
        new ReflectionServerLogicProvider(typeof(ChatMessageEvent).Assembly, new ClientRequestHandlerFactory(sc)));

    builder.Services.AddSingleton<IClientConnectionManager, ConnectionManager>();
    builder.Services.AddSingleton<IMessageSerializer, MessageSerializer>();
    builder.Services.AddSingleton<RoomManager>();
    builder.Services.AddSingleton<IGameMessenger>(sp =>
        new GameMessenger(
            sp.GetRequiredService<IClientConnectionManager>(),
            sp.GetRequiredService<IMessageSerializer>(),
            sp.GetRequiredService<RoomManager>()));
    
    builder.Services.AddSingleton<GameModel>();
    builder.Services.AddSingleton<IGameServer, GameServer>();
    builder.Services.AddTransient<WebSocketHandlerFactory>();

    var app = builder.Build();

    app.UseWebSockets();
    app.Map("/ws", WebSocketHandler.HandleWebSocket);

    // Start server
    _ = app.RunAsync("http://localhost:5000");
    
    return app;
}
