using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Console;
using Microsoft.Extensions.Logging.Debug;
using WsServer;
using WsServer.Prototype; // added for prototype

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddLogging(b =>
{
    b.AddConsole()
        .AddDebug()
        .AddFilter<ConsoleLoggerProvider>(category: null, level: LogLevel.Information)
        .AddFilter<DebugLoggerProvider>(category: null, level: LogLevel.Debug);
});

// Game server + its dependencies (shared with LoadTest / TestClient / the test fixture).
// Tick rate, buffer sizes, rate-limit cooldowns, keep-alive and validation limits are
// configurable via the "GameServer" section of appsettings.json. The game server is a
// hosted service: its tick loop starts with the host, and the host's graceful shutdown
// (SIGTERM/Ctrl+C) closes every socket, stops the loop and drops room state (audit §1.15).
builder.Services.AddGameServer(builder.Configuration.GetSection("GameServer"));

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
// Hashed Vite chunks (/assets/name-HASH.js) are immutable; index.html is revalidated on
// every load so a deploy is picked up immediately (see StaticFileCaching).
app.UseStaticFiles(new StaticFileOptions { OnPrepareResponse = StaticFileCaching.Apply });

// WebSockets (with keep-alive) at /ws, /health for Docker/orchestration probes (503 if
// the tick loop stops ticking) and the /info dashboard JSON.
app.UseGameServer();

app.Run();