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
//   normal   - join the spatial room (which gives them an avatar), move/aim/shoot/chat faster than the rate
//              limits (stresses the command queue, send queue, and throttling)
//   invalid  - valid TypeIds with bad payloads (NaN/Inf coords, out-of-range
//              slots, over-long chat) -> must be dropped silently, stay connected
//   garbage  - unknown TypeId / oversized frames -> must be disconnected by the
//              abuse policy without crashing the server
//
// Tick traffic: every normal bot counts the GameTickUpdateEvent (TypeId 1) frames it
// receives; the report prints snapshot bytes/sec and snapshots/sec per spatial client.
// `--idle 1` keeps the normal bots' avatars standing still (they still shoot and chat),
// so only the 10 built-in server bots move — the mostly-idle traffic scenario.
//
// Usage: dotnet run --project WsServer/WsServer.LoadTest -- --bots 40 --seconds 25 --port 5199 [--idle 1]
// ---------------------------------------------------------------------------

int botCount = GetArg("--bots", 40);
int durationSec = GetArg("--seconds", 25);
int port = GetArg("--port", 5199);
bool idleBots = GetArg("--idle", 0) != 0;
const byte TickTypeId = 1; // GameTickUpdateEvent.TypeId

int garbageBots = Math.Max(1, botCount / 12);
int invalidBots = Math.Max(1, botCount / 12);
int oversizeBots = 1;
int normalBots = Math.Max(1, botCount - garbageBots - invalidBots - oversizeBots);
int total = normalBots + invalidBots + garbageBots + oversizeBots;

Console.WriteLine("=== WsCore Stage 1 load test ===");
Console.WriteLine($"bots={total} (normal={normalBots}, invalid={invalidBots}, garbage={garbageBots}, oversize={oversizeBots}) " +
                  $"duration={durationSec}s port={port} normal-bots-move={!idleBots}");
Console.WriteLine();

// ---- boot the real server in-process (mirrors Program.cs, minus static files / prototype) ----
var builder = WebApplication.CreateBuilder();
builder.Logging.ClearProviders();
builder.Logging.AddSimpleConsole(o => o.SingleLine = true);
builder.Logging.SetMinimumLevel(LogLevel.Warning); // hide per-player Info; keep Warning/Error

builder.Services.AddGameServer();

var app = builder.Build();
app.Urls.Add($"http://127.0.0.1:{port}");
app.UseGameServer();
// The game server is a hosted service: StartAsync starts its tick loop and initializes
// the message registry before we build request frames.
await app.StartAsync();

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
var runClock = Stopwatch.StartNew(); // shared time base for the tick-traffic window
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
double measuredSeconds = runClock.Elapsed.TotalSeconds;
// Snapshot traffic per spatial client, sampled before the bots are cancelled.
var tickStats = bots.Where(b => b.Cohort == "normal")
    .Select(b => (bytes: Interlocked.Read(ref b.TickBytes), frames: Interlocked.Read(ref b.TickFrames), started: b.TicksSince))
    .ToList();

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
Console.WriteLine($"players last={finalPlayers} (started {initialPlayers}; expected {initialPlayers + normalOpen + invalidOpen} = built-in + game-room bots)   bullets peak={finalBullets}");
if (tickStats.Count > 0)
{
    // Rates use each bot's own window (first tick received -> end of the run).
    var rates = tickStats
        .Select(t => (t.bytes, t.frames, secs: Math.Max(0.001, measuredSeconds - t.started)))
        .Select(t => (bps: t.bytes / t.secs, fps: t.frames / t.secs, avg: t.frames > 0 ? (double)t.bytes / t.frames : 0))
        .ToList();
    double avgBps = rates.Average(r => r.bps);
    Console.WriteLine($"tick traffic ({tickStats.Count} spatial clients): per client avg={avgBps / 1024.0:0.0} KB/s " +
                      $"(min={rates.Min(r => r.bps) / 1024.0:0.0} max={rates.Max(r => r.bps) / 1024.0:0.0}), " +
                      $"snapshots/s={rates.Average(r => r.fps):0.0}, avg snapshot={rates.Average(r => r.avg):0} B, " +
                      $"total={rates.Sum(r => r.bps) / 1024.0:0.0} KB/s");
}
Console.WriteLine();

var issues = new List<string>();

// Well-behaved cohorts must stay connected under load.
if (normalOpen < normalBots) issues.Add($"{normalBots - normalOpen} normal bot(s) dropped");
if (invalidOpen < invalidBots) issues.Add($"{invalidBots - invalidOpen} invalid-payload bot(s) dropped (should be tolerated)");

// Abusive cohorts must be disconnected.
if (garbageOpen > 0) issues.Add($"{garbageOpen} garbage bot(s) NOT dropped (abuse policy failed)");
if (oversizeOpen > 0) issues.Add($"{oversizeOpen} oversize bot(s) NOT dropped (size cap failed)");

// A connection is not a player: only bots that joined the game room have an avatar
// (normal + invalid cohorts); garbage/oversize bots never leave the lobby.
int expectedPlayers = initialPlayers + normalOpen + invalidOpen;
if (finalPlayers != expectedPlayers)
    issues.Add($"players={finalPlayers}, expected {expectedPlayers} (built-in bots + game-room bots only)");

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

// Drain incoming frames so the server's send queue / OS buffer never backs up. With a
// stats handle, tick-snapshot messages (first byte = TickTypeId) are counted, whole
// messages (a message may arrive in several ReceiveAsync chunks).
async Task Drain(ClientWebSocket ws, CancellationToken ct, BotHandle? stats = null)
{
    var buf = new byte[16 * 1024];
    var startOfMessage = true;
    var isTick = false;
    long messageBytes = 0;
    try
    {
        while (!ct.IsCancellationRequested && ws.State == WebSocketState.Open)
        {
            var r = await ws.ReceiveAsync(buf, ct);
            if (r.MessageType == WebSocketMessageType.Close) break;
            if (stats == null) continue;
            if (startOfMessage)
            {
                isTick = r.Count > 0 && buf[0] == TickTypeId;
                messageBytes = 0;
            }
            messageBytes += r.Count;
            startOfMessage = r.EndOfMessage;
            if (r.EndOfMessage && isTick)
            {
                if (Interlocked.Increment(ref stats.TickFrames) == 1)
                    stats.TicksSince = runClock.Elapsed.TotalSeconds;
                Interlocked.Add(ref stats.TickBytes, messageBytes);
            }
        }
    }
    catch { /* closed / cancelled */ }
}

async Task RunNormalBot(BotHandle b, Uri u, IMessageSerializer s, CancellationToken token)
{
    try
    {
        await b.Socket.ConnectAsync(u, token);
        var recv = Drain(b.Socket, token, b);

        await Send(b.Socket, Frame(s, new JoinRoomRequest("game")), true, token);
        await Send(b.Socket, Frame(s, new SetPlayerNameRequest { Name = $"bot{b.Index}" }), true, token);
        await Send(b.Socket, Frame(s, new UpdatePlayerSlotsRequest { Body = b.Index % 5, Gun = b.Index % 5, Armor = b.Index % 5 }), true, token);

        var clock = Stopwatch.StartNew();
        long lastMove = 0, lastShot = 0, lastChat = 0;
        while (!token.IsCancellationRequested && b.Socket.State == WebSocketState.Open)
        {
            long t = clock.ElapsedMilliseconds;
            if (!idleBots && t - lastMove >= 50)
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
    // Tick-snapshot traffic received (normal bots only); written by the bot's receive loop.
    public long TickBytes;
    public long TickFrames;
    public double TicksSince; // run time (s) of the first tick received
    public BotHandle(string cohort, int index) { Cohort = cohort; Index = index; }
}
