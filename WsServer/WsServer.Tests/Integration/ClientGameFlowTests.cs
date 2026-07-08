using System.Net.WebSockets;
using Game.ServerLogic.Chat.Events;
using Game.ServerLogic.Chat.Requests;
using Game.ServerLogic.GameState.Events;
using Game.ServerLogic.Player.Events;
using Game.ServerLogic.Rooms.Events;
using Game.ServerLogic.Rooms.Requests;
using MemoryPack;
using WsServer.Abstract.Messages;

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

    private static async Task Send<T>(ClientWebSocket socket, T request, CancellationToken ct) where T : IClientRequest
    {
        var writer = new System.Buffers.ArrayBufferWriter<byte>(256);
        writer.GetSpan(1)[0] = T.TypeId;
        writer.Advance(1);
        MemoryPackSerializer.Serialize(writer, request);
        await socket.SendAsync(writer.WrittenMemory, WebSocketMessageType.Binary, true, ct);
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
