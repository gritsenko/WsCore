using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Console;
using Microsoft.Extensions.Logging.Debug;
using WsServer;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddLogging(builder =>
{
	builder.AddConsole()
		.AddDebug()
		.AddFilter<ConsoleLoggerProvider>(category: null, level: LogLevel.Debug)
		.AddFilter<DebugLoggerProvider>(category: null, level: LogLevel.Debug);
});


//init game server
WsServerBootstrap.Initialize();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
	app.UseDeveloperExceptionPage();
}

app.UseDefaultFiles();
app.UseStaticFiles();

app.Map("/ws", SocketHandler.Map);

app.Run();