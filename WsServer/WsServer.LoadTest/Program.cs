using System.Diagnostics;
using System.Net.WebSockets;
using Game.Core;
using Game.ServerLogic.Chat.Events;
using Game.ServerLogic.Chat.Requests;
using Game.ServerLogic.Player.Requests;
using Game.ServerLogic.Rooms.Requests;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using WsServer;
using WsServer.Abstract;
using WsServer.Abstract.Messages;
using WsServer.Rooms;

// ---------------------------------------------------------------------------
// Stage 1 load test. Boots the real server in-process and hammers it with N
// WebSocket bots using the real binary protocol, then reports whether memory
// stays flat and connections survive. Three cohorts:
//   normal   - join the spatial room, move/aim/shoot/chat faster than the rate
//              limits (stresses the command queue, send queue, and throttling)
//   invalid  - valid TypeIds with bad payloads (NaN/Inf coords, out-of-range
//              slots, over-long chat) -> must be dropped silently, stay connected
//   garbage  - unknown TypeId / oversized frames -> must be disconnected by the
//              abuse policy without crashing the server
//
// Usage: dotnet run --project WsServer/WsServer.LoadTest -- --bots 40 --seconds 25 --port 5199
// ---------------------------------------------------------------------------

int botCount = GetArg("--bots", 40);
int durationSec = GetArg("--seconds", 25);
int port = GetArg("--port", 5199);

int garbageBots = Math.Max(1, botCount / 12);
int invalidBots = Math.Max(1, botCount / 12);
int oversizeBots = 1;
int normalBots = Math.Max(1, botCount - garbageBots - invalidBots - oversizeBots);
int total = normalBots + invalidBots + garbageBots + oversizeBots;

Console.WriteLine("=== WsCore Stage 1 load test ===");
Console.WriteLine($"bots={total} (normal={normalBots}, invalid={invalidBots}, garbage={garbageBots}, oversize={oversizeBots}) " +
                  $"duration={durationSec}s port={port}");
Console.WriteLine();

// ---- boot the real server in-process (mirrors Program.cs, minus static files / prototype) ----
var builder = WebApplication.CreateBuilder();
builder.Logging.ClearProviders();
builder.Logging.AddSimpleConsole(o => o.SingleLine = true);
builder.Logging.SetMinimumLevel(LogLevel.Warning); // hide per-player Info; keep Warning/Error

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

var app = builder.Build();
app.Urls.Add($"http://127.0.0.1:{port}");
app.UseWebSockets();
app.Map("/ws", WebSocketHandler.HandleWebSocket);
await app.StartAsync();

// Force-resolve the game server so the tick loop starts and the message registry
// is initialized before we build request frames.
_ = app.Services.GetRequiredService<IGameServer>();
var gameModel = app.Services.GetRequiredService<GameModel>();
var serializer = app.Services.GetRequiredService<IMessageSerializer>();

await Task.Delay(300);
int initialPlayers = gameModel.PlayersCount; // includes the 10 built-in bots
Console.WriteLine($"server up on ws://127.0.0.1:{port}/ws (initial players incl. built-in bots: {initialPlayers})");
Console.WriteLine();

// ---- build bots ----
var bots = new List<BotHandle>();
for (int i = 0; i < normalBots; i++) bots.Add(new BotHandle("normal", i));
for (int i = 0; i < invalidBots; i++) bots.Add(new BotHandle("invalid", i));
for (int i = 0; i < garbageBots; i++) bots.Add(new BotHandle("garbage", i));
for (int i = 0; i < oversizeBots; i++) bots.Add(new BotHandle("oversize", i));

using var cts = new CancellationTokenSource();
var ct = cts.Token;
var uri = new Uri($"ws://127.0.0.1:{port}/ws");

var tasks = bots.Select(b => b.Cohort switch
{
    "normal" => RunNormalBot(b, uri, serializer, ct),
    "invalid" => RunInvalidBot(b, uri, serializer, ct),
    "garbage" => RunGarbageBot(b, uri, ct),
    _ => RunOversizeBot(b, uri, ct),
}).ToList();

// ---- sample while running ----
// NOTE: connection counts must be read DURING the run. Cancelling the bots aborts their
// client sockets, so anything measured after cts.Cancel() would read 0.
int OpenIn(string cohort) => bots.Count(b => b.Cohort == cohort && b.Socket.State == WebSocketState.Open);

long startHeap = GC.GetTotalMemory(true);
var samples = new List<long>();
int peakBullets = 0;
int normalOpen = 0, invalidOpen = 0, garbageOpen = 0, oversizeOpen = 0;
int finalPlayers = initialPlayers;
Console.WriteLine($"{"t(s)",5} {"players",8} {"bullets",8} {"heapMB",8} {"open",6}");
var sw = Stopwatch.StartNew();
while (sw.Elapsed.TotalSeconds < durationSec)
{
    await Task.Delay(3000);
    long heap = GC.GetTotalMemory(true);
    samples.Add(heap);
    peakBullets = Math.Max(peakBullets, gameModel.BulletsCount);
    normalOpen = OpenIn("normal");
    invalidOpen = OpenIn("invalid");
    garbageOpen = OpenIn("garbage");
    oversizeOpen = OpenIn("oversize");
    finalPlayers = gameModel.PlayersCount;
    int open = normalOpen + invalidOpen + garbageOpen + oversizeOpen;
    Console.WriteLine($"{sw.Elapsed.TotalSeconds,5:0} {gameModel.PlayersCount,8} {gameModel.BulletsCount,8} " +
                      $"{heap / 1024.0 / 1024.0,8:0.0} {open,6}");
}
int finalBullets = peakBullets;
long endHeap = samples.Count > 0 ? samples[^1] : startHeap;

// ---- stop bots and server ----
cts.Cancel();
try { await Task.WhenAll(tasks).WaitAsync(TimeSpan.FromSeconds(5)); } catch { /* bots winding down */ }
await app.StopAsync();
foreach (var b in bots) b.Socket.Dispose();

// ---- verdict ----
Console.WriteLine();
Console.WriteLine("=== results ===");
Console.WriteLine($"connections still open  normal={normalOpen}/{normalBots}  invalid={invalidOpen}/{invalidBots}  " +
                  $"garbage={garbageOpen}/{garbageBots}  oversize={oversizeOpen}/{oversizeBots}");
Console.WriteLine($"heap  start={Mb(startHeap)}  end={Mb(endHeap)}  (samples: {string.Join(", ", samples.Select(Mb))})");
Console.WriteLine($"players last={finalPlayers} (started {initialPlayers})   bullets peak={finalBullets}");
Console.WriteLine();

var issues = new List<string>();

// Well-behaved cohorts must stay connected under load.
if (normalOpen < normalBots) issues.Add($"{normalBots - normalOpen} normal bot(s) dropped");
if (invalidOpen < invalidBots) issues.Add($"{invalidBots - invalidOpen} invalid-payload bot(s) dropped (should be tolerated)");

// Abusive cohorts must be disconnected.
if (garbageOpen > 0) issues.Add($"{garbageOpen} garbage bot(s) NOT dropped (abuse policy failed)");
if (oversizeOpen > 0) issues.Add($"{oversizeOpen} oversize bot(s) NOT dropped (size cap failed)");

// Bullet leak regression: with cleanup, alive bullets plateau near
// normalBots * (lifetime / cooldown) = normalBots * (2 / 0.25) = normalBots * 8.
int bulletCeiling = Math.Max(50, normalBots * 16);
if (finalBullets > bulletCeiling) issues.Add($"peak bullets={finalBullets} exceed ceiling {bulletCeiling} (possible leak)");

// Managed-heap growth: post-GC retained bytes should not balloon across the run.
if (samples.Count >= 2)
{
    long baseline = samples[0];
    long last = samples[^1];
    if (last > baseline * 2 && last - baseline > 20L * 1024 * 1024)
        issues.Add($"managed heap grew {Mb(baseline)}->{Mb(last)} (possible leak)");
}

if (issues.Count == 0)
{
    Console.WriteLine("VERDICT: PASS — connections stable, abuse dropped, memory flat, bullets bounded.");
    Environment.ExitCode = 0;
}
else
{
    Console.WriteLine("VERDICT: CONCERN —");
    foreach (var i in issues) Console.WriteLine($"  - {i}");
    Environment.ExitCode = 1;
}

// ===================== helpers =====================

int GetArg(string name, int def)
{
    for (int i = 0; i < args.Length - 1; i++)
        if (args[i] == name && int.TryParse(args[i + 1], out var v)) return v;
    return def;
}

static string Mb(long bytes) => $"{bytes / 1024.0 / 1024.0:0.0}MB";

byte[] Frame<T>(IMessageSerializer s, T req) where T : IClientRequest
    => s.SerializeClientRequest(req).ToArray();

static async Task Send(ClientWebSocket ws, byte[] frame, bool eom, CancellationToken ct)
{
    if (ws.State == WebSocketState.Open)
        await ws.SendAsync(frame, WebSocketMessageType.Binary, eom, ct);
}

// Drain incoming frames so the server's send queue / OS buffer never backs up.
static async Task Drain(ClientWebSocket ws, CancellationToken ct)
{
    var buf = new byte[16 * 1024];
    try
    {
        while (!ct.IsCancellationRequested && ws.State == WebSocketState.Open)
        {
            var r = await ws.ReceiveAsync(buf, ct);
            if (r.MessageType == WebSocketMessageType.Close) break;
        }
    }
    catch { /* closed / cancelled */ }
}

async Task RunNormalBot(BotHandle b, Uri u, IMessageSerializer s, CancellationToken token)
{
    try
    {
        await b.Socket.ConnectAsync(u, token);
        var recv = Drain(b.Socket, token);

        await Send(b.Socket, Frame(s, new JoinRoomRequest("game")), true, token);
        await Send(b.Socket, Frame(s, new SetPlayerNameRequest { Name = $"bot{b.Index}" }), true, token);
        await Send(b.Socket, Frame(s, new UpdatePlayerSlotsRequest { Body = b.Index % 5, Gun = b.Index % 5, Armor = b.Index % 5 }), true, token);

        var clock = Stopwatch.StartNew();
        long lastMove = 0, lastShot = 0, lastChat = 0;
        while (!token.IsCancellationRequested && b.Socket.State == WebSocketState.Open)
        {
            long t = clock.ElapsedMilliseconds;
            if (t - lastMove >= 50)
            {
                float x = Random.Shared.NextSingle() * 1600, y = Random.Shared.NextSingle() * 900;
                await Send(b.Socket, Frame(s, new UpdatePlayerTargetRequest { AimX = x, AimY = y }), true, token);
                await Send(b.Socket, Frame(s, new UpdatePlayerStateRequest { AimX = x, AimY = y, ControlsState = Random.Shared.Next(16) }), true, token);
                lastMove = t;
            }
            if (t - lastShot >= 100) // faster than the 0.25s cooldown -> exercises throttling
            {
                await Send(b.Socket, Frame(s, new PlayerShootingRequest { Weapon = 0 }), true, token);
                lastShot = t;
            }
            if (t - lastChat >= 300) // faster than the 0.5s cooldown
            {
                await Send(b.Socket, Frame(s, new ChatMessageRequest { Message = $"hi from {b.Index} @ {t}" }), true, token);
                lastChat = t;
            }
            await Task.Delay(15, token);
        }
        await recv;
    }
    catch { /* cancellation or socket teardown */ }
}

async Task RunInvalidBot(BotHandle b, Uri u, IMessageSerializer s, CancellationToken token)
{
    try
    {
        await b.Socket.ConnectAsync(u, token);
        var recv = Drain(b.Socket, token);
        await Send(b.Socket, Frame(s, new JoinRoomRequest("game")), true, token);

        while (!token.IsCancellationRequested && b.Socket.State == WebSocketState.Open)
        {
            // Valid TypeIds, hostile payloads: server must sanitize/reject and stay up.
            await Send(b.Socket, Frame(s, new UpdatePlayerTargetRequest { AimX = float.NaN, AimY = float.PositiveInfinity }), true, token);
            await Send(b.Socket, Frame(s, new UpdatePlayerStateRequest { AimX = float.NaN, AimY = float.NegativeInfinity, ControlsState = -1 }), true, token);
            await Send(b.Socket, Frame(s, new UpdatePlayerSlotsRequest { Body = 999, Gun = -5, Armor = int.MaxValue }), true, token);
            await Send(b.Socket, Frame(s, new ChatMessageRequest { Message = new string('x', 5000) + "\n\r\0injection" }), true, token);
            await Send(b.Socket, Frame(s, new PlayerShootingRequest { Weapon = 0 }), true, token);
            await Task.Delay(40, token);
        }
        await recv;
    }
    catch { }
}

async Task RunGarbageBot(BotHandle b, Uri u, CancellationToken token)
{
    try
    {
        await b.Socket.ConnectAsync(u, token);
        var recv = Drain(b.Socket, token);
        while (!token.IsCancellationRequested && b.Socket.State == WebSocketState.Open)
        {
            var junk = new byte[16];
            Random.Shared.NextBytes(junk);
            junk[0] = 254; // unregistered TypeId -> deserialization failure -> error counter
            await Send(b.Socket, junk, true, token);
            await Task.Delay(50, token);
        }
        await recv;
    }
    catch { }
}

async Task RunOversizeBot(BotHandle b, Uri u, CancellationToken token)
{
    try
    {
        await b.Socket.ConnectAsync(u, token);
        var recv = Drain(b.Socket, token);
        // Stream non-final frames past the 64 KB cap without ever ending the message.
        var chunk = new byte[8192];
        for (int i = 0; i < 20 && b.Socket.State == WebSocketState.Open && !token.IsCancellationRequested; i++)
            await Send(b.Socket, chunk, false, token);
        await recv;
    }
    catch { }
}

sealed class BotHandle
{
    public string Cohort { get; }
    public int Index { get; }
    public ClientWebSocket Socket { get; } = new();
    public BotHandle(string cohort, int index) { Cohort = cohort; Index = index; }
}
