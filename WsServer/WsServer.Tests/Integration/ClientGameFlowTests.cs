using Game.ServerLogic.Presence.Requests;
using Game.ServerLogic.Presence.Events;
using Game.ServerLogic.Account.Requests;
using System.Net;
using System.Collections.Concurrent;
using System.Net.Http.Json;
using System.Net.WebSockets;
using Game.ServerLogic.Chat.Events;
using Game.ServerLogic.Connection.Events;
using Game.ServerLogic.Chat.Requests;
using Game.ServerLogic.GameState.Events;
using Game.ServerLogic.Player.Events;
using Game.ServerLogic.Rooms.Events;
using Game.ServerLogic.Rooms.Requests;
using MemoryPack;
using WsServer.Abstract.Messages;
using WsServer.ServerInfo;

using static WsServer.Tests.TestSupport;

namespace WsServer.Tests.Integration;

/// <summary>
/// End-to-end over a real WebSocket against a real embedded server: connect, join a
/// room, chat, and observe the tick loop broadcasting — the flow CLAUDE.md's manual
/// browser smoke test exercises, automated here without a browser.
/// </summary>
public class ClientGameFlowTests(EmbeddedServerFixture fixture) : IClassFixture<EmbeddedServerFixture>
{
    private static readonly TimeSpan ReceiveTimeout = TimeSpan.FromSeconds(5);

    [Fact]
    public async Task ConnectJoinChatTick_FullFlow_ServerRespondsCorrectly()
    {
        using var socket = new ClientWebSocket();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        await socket.ConnectAsync(fixture.WsUri, cts.Token);

        // 1. connect — server auto-joins lobby and assigns a client id on connect.
        var init = await ReceiveUntil<InitPlayerEvent>(socket, cts.Token);
        Assert.True(init.ClientId > 0);

        // 2. join — switch into the game room.
        await Send(socket, new JoinRoomRequest("game"), cts.Token);
        var roomUpdate = await ReceiveUntil<RoomUsersUpdateEvent>(
            socket, cts.Token, e => e.RoomId == "game" && e.Users.Any(u => u.ClientId == init.ClientId));
        Assert.Contains(roomUpdate.Users, u => u.ClientId == init.ClientId);

        // 3. chat — broadcast reaches the sender too.
        const string message = "hello from the integration test";
        await Send(socket, new ChatMessageRequest { Message = message }, cts.Token);
        var chat = await ReceiveUntil<ChatMessageEvent>(socket, cts.Token, e => e.Message == message);
        Assert.Equal(init.ClientId, chat.ClientId);

        // 4. tick — the ~30Hz tick loop is running and broadcasting spatial state.
        var tick = await ReceiveUntil<GameTickUpdateEvent>(socket, cts.Token);
        Assert.NotNull(tick.MovementStates);

        await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", cts.Token);
    }

    /// <summary>
    /// The profile over the real transports: the avatar goes up through the WebSocket
    /// and comes back over HTTP, cacheable forever under its versioned URL.
    /// </summary>
    [Fact]
    public async Task Avatar_UploadedOverTheSocket_IsServedOverHttp()
    {
        using var socket = new ClientWebSocket();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        await socket.ConnectAsync(fixture.WsUri, cts.Token);
        await ReceiveUntil<InitPlayerEvent>(socket, cts.Token);

        await Send(socket, new IdentifyRequest { UserKey = "avatar-test-key-0123456789", Name = "Pic" }, cts.Token);
        var snapshot = await ReceiveUntil<PresenceSnapshotEvent>(socket, cts.Token);

        byte[] png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 42, 43, 44];
        await Send(socket, new SetAvatarRequest { Image = png }, cts.Token);
        var update = await ReceiveUntil<PresenceUpdateEvent>(
            socket, cts.Token, e => e.User.UserId == snapshot.YourUserId && e.User.AvatarVersion != 0);

        using var http = new HttpClient { BaseAddress = fixture.HttpUri };
        using var response = await http.GetAsync($"/avatars/{snapshot.YourUserId}?v={update.User.AvatarVersion}", cts.Token);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("image/png", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal(png, await response.Content.ReadAsByteArrayAsync(cts.Token));
        Assert.Contains("immutable", response.Headers.CacheControl?.ToString());
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());

        using var missing = await http.GetAsync("/avatars/999999", cts.Token);
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);

        await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", cts.Token);
    }

    /// <summary>
    /// A connection is not a player: a lobby-only client (A) gets heartbeats, the room
    /// list and lobby chat, but no game-world traffic and no avatar; a game client (B)
    /// gets the world; when B goes back to the lobby its avatar is gone and A/B chat.
    /// </summary>
    [Fact]
    public async Task LobbyClientAndGameClient_TrafficIsScopedByRoom()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        await using var a = await Collector.Connect(fixture, cts.Token);
        await using var b = await Collector.Connect(fixture, cts.Token);
        using var http = new HttpClient { BaseAddress = fixture.HttpUri };

        var initA = await a.WaitFor<InitPlayerEvent>(cts.Token);
        var initB = await b.WaitFor<InitPlayerEvent>(cts.Token);
        await a.WaitFor<JoinRoomResultEvent>(cts.Token, e => e.RoomId == "lobby" && e.Success);
        var playersBefore = (await GetInfo(http)).GamePlayers;

        // A: room list on request, from the server.
        await SendRequest(a.Socket, new GetRoomListRequest(), cts.Token);
        var list = await a.WaitFor<RoomListEvent>(cts.Token);
        Assert.Contains(list.Rooms, r => r.Id == "lobby");
        Assert.DoesNotContain(list.Rooms, r => r.Id == "game"); // hidden from lists, joinable by id

        // B enters the game: confirmed, then the whole world (itself included), then ticks.
        await SendRequest(b.Socket, new JoinRoomRequest("game"), cts.Token);
        await b.WaitFor<JoinRoomResultEvent>(cts.Token, e => e.RoomId == "game" && e.Success);
        var state = await b.WaitFor<GameStateUpdateEvent>(cts.Token);
        Assert.Contains(state.PlayerStateData, p => p.Id == initB.ClientId);
        await b.WaitFor<GameTickUpdateEvent>(cts.Token);
        Assert.Equal(playersBefore + 1, (await GetInfo(http)).GamePlayers);

        // Chats are per room.
        await SendRequest(a.Socket, new ChatMessageRequest { Message = "lobby-1" }, cts.Token);
        await SendRequest(b.Socket, new ChatMessageRequest { Message = "game-1" }, cts.Token);
        await a.WaitFor<ChatMessageEvent>(cts.Token, e => e.Message == "lobby-1");
        await b.WaitFor<ChatMessageEvent>(cts.Token, e => e.Message == "game-1");

        // A is alive (heartbeats) yet saw nothing of the world.
        await a.WaitFor<HeartbeatEvent>(cts.Token);
        await Task.Delay(300, cts.Token);
        Assert.Empty(a.All<GameTickUpdateEvent>());
        Assert.Empty(a.All<PlayerJoinedEvent>());
        Assert.Empty(a.All<GameStateUpdateEvent>());
        Assert.DoesNotContain(a.All<ChatMessageEvent>(), e => e.Message == "game-1");
        Assert.DoesNotContain(b.All<ChatMessageEvent>(), e => e.Message == "lobby-1");

        // B back to the lobby: its avatar is removed from the world...
        b.Clear(); // forget B's connect-time lobby JoinRoomResult
        await SendRequest(b.Socket, new JoinRoomRequest("lobby"), cts.Token);
        await b.WaitFor<JoinRoomResultEvent>(cts.Token, e => e.RoomId == "lobby" && e.Success);
        Assert.Equal(playersBefore, (await GetInfo(http)).GamePlayers);
        await using (var observer = await Collector.Connect(fixture, cts.Token))
        {
            await observer.WaitFor<InitPlayerEvent>(cts.Token);
            await SendRequest(observer.Socket, new JoinRoomRequest("game"), cts.Token);
            var seen = await observer.WaitFor<GameStateUpdateEvent>(cts.Token);
            Assert.DoesNotContain(seen.PlayerStateData, p => p.Id == initB.ClientId || p.Id == initA.ClientId);
        }

        // ...and A and B now share the lobby chat.
        await SendRequest(b.Socket, new ChatMessageRequest { Message = "lobby-2" }, cts.Token);
        await a.WaitFor<ChatMessageEvent>(cts.Token, e => e.Message == "lobby-2" && e.ClientId == initB.ClientId);
        await b.WaitFor<ChatMessageEvent>(cts.Token, e => e.Message == "lobby-2");
    }

    private static async Task<ServerInfoDto> GetInfo(HttpClient http)
        => (await http.GetFromJsonAsync<ServerInfoDto>("/info"))!;

    [Fact]
    public async Task Health_RunningTickLoop_ReturnsHealthy()
    {
        using var http = new HttpClient { BaseAddress = fixture.HttpUri };
        var response = await http.GetAsync("/health");
        Assert.Equal(System.Net.HttpStatusCode.OK, response.StatusCode);
    }

    private static Task Send<T>(ClientWebSocket socket, T request, CancellationToken ct) where T : IClientRequest
        => SendRequest(socket, request, ct);

    /// <summary>A real client socket whose every incoming event is decoded and kept.</summary>
    private sealed class Collector : IAsyncDisposable
    {
        private readonly ConcurrentQueue<object> _events = new();
        private readonly CancellationTokenSource _stop = new();
        private Task _receive = Task.CompletedTask;
        public ClientWebSocket Socket { get; } = new();

        public static async Task<Collector> Connect(EmbeddedServerFixture fixture, CancellationToken ct)
        {
            var c = new Collector();
            await c.Socket.ConnectAsync(fixture.WsUri, ct);
            c._receive = c.ReceiveLoop(fixture);
            return c;
        }

        private async Task ReceiveLoop(EmbeddedServerFixture fixture)
        {
            var buffer = new byte[256 * 1024];
            try
            {
                while (Socket.State == WebSocketState.Open)
                {
                    var result = await Socket.ReceiveAsync(buffer.AsMemory(), _stop.Token);
                    var count = result.Count;
                    while (!result.EndOfMessage)
                    {
                        result = await Socket.ReceiveAsync(buffer.AsMemory(count), _stop.Token);
                        count += result.Count;
                    }
                    if (result.MessageType != WebSocketMessageType.Binary || count == 0)
                        continue;
                    var type = fixture.LogicProvider.ServerEventTypes.FindTypeById(buffer[0]);
                    if (type != null)
                        _events.Enqueue(MemoryPackSerializer.Deserialize(type, buffer.AsSpan(1, count - 1))!);
                }
            }
            catch { /* closed / stopped */ }
        }

        public void Clear() => _events.Clear();

        public T[] All<T>() where T : IServerEvent => _events.OfType<T>().ToArray();

        public async Task<T> WaitFor<T>(CancellationToken ct, Func<T, bool>? predicate = null) where T : IServerEvent
        {
            var deadline = DateTime.UtcNow + ReceiveTimeout;
            while (true)
            {
                var match = _events.OfType<T>().FirstOrDefault(e => predicate is null || predicate(e));
                if (match != null)
                    return match;
                if (DateTime.UtcNow > deadline)
                    throw new TimeoutException($"no {typeof(T).Name} received");
                await Task.Delay(10, ct);
            }
        }

        public async ValueTask DisposeAsync()
        {
            try { await Socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", CancellationToken.None); }
            catch { /* already closed */ }
            _stop.Cancel();
            try { await _receive; } catch { }
            Socket.Dispose();
            _stop.Dispose();
        }
    }

    /// <summary>
    /// Reads frames until one decodes to a T satisfying <paramref name="predicate"/>,
    /// skipping unrelated broadcasts (e.g. other players' tick/room events) in between.
    /// </summary>
    private async Task<T> ReceiveUntil<T>(
        ClientWebSocket socket, CancellationToken ct, Func<T, bool>? predicate = null) where T : IServerEvent
    {
        var buffer = new byte[64 * 1024];
        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeoutCts.CancelAfter(ReceiveTimeout);

        while (true)
        {
            var result = await socket.ReceiveAsync(buffer, timeoutCts.Token);
            if (result.MessageType != WebSocketMessageType.Binary || result.Count == 0)
                continue;

            var typeId = buffer[0];
            var eventType = fixture.LogicProvider.ServerEventTypes.FindTypeById(typeId);
            if (eventType is null) continue;

            var payload = new ReadOnlySpan<byte>(buffer, 1, result.Count - 1);
            var decoded = MemoryPackSerializer.Deserialize(eventType, payload);

            if (decoded is T typed && (predicate is null || predicate(typed)))
                return typed;
        }
    }
}
