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

//init game server
builder.Services.AddSingleton<IClientConnectionManager, ConnectionManager>();
builder.Services.AddSingleton<IGameMessenger, GameMessenger>();

builder.Services.AddSingleton<GameModel>();
builder.Services.AddSingleton<IGameServer, GameServer>();

builder.Services.AddTransient<WebSocketHandlerFactory>();


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

app.Run();