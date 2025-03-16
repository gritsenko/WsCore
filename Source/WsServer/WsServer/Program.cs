using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Console;
using Microsoft.Extensions.Logging.Debug;
using WsServer;
using WsServer.Abstract;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddLogging(builder =>
{
	builder.AddConsole()
		.AddDebug()
		.AddFilter<ConsoleLoggerProvider>(category: null, level: LogLevel.Debug)
		.AddFilter<DebugLoggerProvider>(category: null, level: LogLevel.Debug);
});

builder.Services.AddTransient<WebSocketHandlerFactory>();
builder.Services.AddScoped<WebSocketHandler>();

//init game server
builder.Services.AddSingleton<IMessageSerializer, MessageSerializer>();
builder.Services.AddSingleton<IClientConnectionManager, ClientConnectionManager>();
builder.Services.AddSingleton<IGameServer, GameServer>();
builder.Services.AddSingleton<IGameMessenger, GameMessenger>();
builder.Services.AddSingleton<GameServerFacade>();


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