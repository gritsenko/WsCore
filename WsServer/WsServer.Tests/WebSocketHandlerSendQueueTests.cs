using System.Net.WebSockets;
using Game.ServerLogic.Chat.Events;
using Microsoft.Extensions.Logging.Abstractions;
using WsServer.Abstract;
using WsServer.Abstract.Messages;
using static WsServer.Tests.TestSupport;

namespace WsServer.Tests;

/// <summary>
/// The per-connection send path: reliable events in a never-dropping FIFO (overflow
/// disconnects), tick snapshots in a single latest-wins slot, relative order preserved.
/// Driven over a fake WebSocket whose sends block until released (a "slow client").
/// </summary>
public class WebSocketHandlerSendQueueTests
{
    private sealed class FakeGameServer : IGameServer
    {
        public readonly TaskCompletionSource<uint> Disconnected = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TimeSpan TimeSinceLastTick => TimeSpan.Zero;
        public void ProcessClientMessageData(uint connectionId, byte[] data) { }
        public void ProcessClientRequest(uint connectionId, IClientRequest request) { }
        public void OnClientConnected(IClientConnection connection, Action<uint> onIdCreated) => onIdCreated(42);
        public void OnClientDisconnected(uint connectionId) => Disconnected.TrySetResult(connectionId);
    }

    /// <summary>Open socket whose receive never yields data and whose sends wait for Unblock().</summary>
    private sealed class SlowSocket : WebSocket
    {
        private readonly TaskCompletionSource _unblocked = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly List<byte[]> _sent = new();
        private WebSocketState _state = WebSocketState.Open;

        public readonly TaskCompletionSource FirstSendStarted = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public void Unblock() => _unblocked.TrySetResult();

        public byte[][] Sent
        {
            get { lock (_sent) return _sent.ToArray(); }
        }

        public override async Task SendAsync(ArraySegment<byte> buffer, WebSocketMessageType messageType,
            bool endOfMessage, CancellationToken cancellationToken)
        {
            FirstSendStarted.TrySetResult();
            await _unblocked.Task.WaitAsync(cancellationToken);
            lock (_sent) _sent.Add(buffer.ToArray());
        }

        public override async Task<WebSocketReceiveResult> ReceiveAsync(ArraySegment<byte> buffer, CancellationToken cancellationToken)
        {
            await Task.Delay(Timeout.Infinite, cancellationToken);
            throw new InvalidOperationException("unreachable");
        }

        public override WebSocketCloseStatus? CloseStatus => null;
        public override string? CloseStatusDescription => null;
        public override WebSocketState State => _state;
        public override string? SubProtocol => null;
        public override void Abort() => _state = WebSocketState.Aborted;
        public override Task CloseAsync(WebSocketCloseStatus closeStatus, string? statusDescription, CancellationToken cancellationToken)
        {
            _state = WebSocketState.Closed;
            return Task.CompletedTask;
        }
        public override Task CloseOutputAsync(WebSocketCloseStatus closeStatus, string? statusDescription, CancellationToken cancellationToken)
            => CloseAsync(closeStatus, statusDescription, cancellationToken);
        public override void Dispose() { }
    }

    private static (WebSocketHandler handler, SlowSocket socket, FakeGameServer server) Create(int capacity = 16)
    {
        var socket = new SlowSocket();
        var server = new FakeGameServer();
        var handler = new WebSocketHandler(socket, server, NullLogger<WebSocketHandler>.Instance,
            new ReflectionServerLogicProvider(typeof(ChatMessageEvent).Assembly, null),
            new GameServerOptions { WebSocketSendQueueCapacity = capacity });
        return (handler, socket, server);
    }

    private static ArraySegment<byte> Msg(byte tag) => new([tag]);

    private static byte[] Tags(SlowSocket socket) => socket.Sent.Select(m => m[0]).ToArray();

    [Fact]
    public async Task Snapshots_NewerReplacesUnsent_ReliableOrderPreserved()
    {
        var (handler, socket, server) = Create();
        var run = handler.ProcessLoop();
        Assert.Equal(42u, handler.Id);

        handler.Send(Msg(1));                // R1: picked up by the send loop, stuck in SendAsync
        await socket.FirstSendStarted.Task.WaitAsync(TimeSpan.FromSeconds(5));

        handler.Send(Msg(2));                // R2
        handler.SendLatest(Msg(100));        // S1 (queued after R2) ...
        handler.SendLatest(Msg(101));        // ... replaced by S2 before it was sent
        handler.Send(Msg(3));                // R3 (queued after S2)

        socket.Unblock();
        await WaitUntil(() => socket.Sent.Length >= 4);
        await Task.Delay(50); // nothing else should trickle out

        // Stale S1 dropped; S2 keeps its place between R2 and R3.
        Assert.Equal(new byte[] { 1, 2, 101, 3 }, Tags(socket));

        handler.Terminate();
        await run.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Equal(42u, await server.Disconnected.Task);
    }

    [Fact]
    public async Task Snapshots_DoNotCountAgainstReliableCapacity()
    {
        var (handler, socket, server) = Create(capacity: 2);
        var run = handler.ProcessLoop();

        handler.Send(Msg(1));
        await socket.FirstSendStarted.Task.WaitAsync(TimeSpan.FromSeconds(5));
        for (var i = 0; i < 1000; i++)
            handler.SendLatest(Msg((byte)(i % 200 + 10)));
        handler.Send(Msg(2));

        Assert.False(server.Disconnected.Task.IsCompleted);
        socket.Unblock();
        await WaitUntil(() => socket.Sent.Length >= 3);
        await Task.Delay(50);

        // Only the very last snapshot survives; R2 was queued after it.
        Assert.Equal(new byte[] { 1, (byte)(999 % 200 + 10), 2 }, Tags(socket));
        Assert.False(server.Disconnected.Task.IsCompleted);

        handler.Terminate();
        await run.WaitAsync(TimeSpan.FromSeconds(5));
    }

    [Fact]
    public async Task Snapshots_PendingKeyframe_IsNotReplacedByDelta_OnlyByNewerKeyframe()
    {
        var (handler, socket, _) = Create();
        var run = handler.ProcessLoop();

        handler.Send(Msg(1));                          // stuck in SendAsync
        await socket.FirstSendStarted.Task.WaitAsync(TimeSpan.FromSeconds(5));

        handler.SendLatest(Msg(100), keyframe: true);  // K1 (full snapshot) pending
        handler.SendLatest(Msg(101));                  // delta: dropped, K1 stays
        handler.SendLatest(Msg(102));                  // delta: dropped, K1 stays
        handler.Send(Msg(2));

        socket.Unblock();
        await WaitUntil(() => socket.Sent.Length >= 3);
        await Task.Delay(50);
        Assert.Equal(new byte[] { 1, 100, 2 }, Tags(socket));

        // Once K1 went out, deltas use the slot normally again; a newer keyframe replaces
        // an older pending one.
        handler.SendLatest(Msg(103));
        await WaitUntil(() => socket.Sent.Length >= 4);
        Assert.Equal(103, socket.Sent[3][0]);

        handler.Terminate();
        await run.WaitAsync(TimeSpan.FromSeconds(5));
    }

    [Fact]
    public async Task Snapshots_NewerKeyframe_ReplacesPendingKeyframe()
    {
        var (handler, socket, _) = Create();
        var run = handler.ProcessLoop();

        handler.Send(Msg(1));
        await socket.FirstSendStarted.Task.WaitAsync(TimeSpan.FromSeconds(5));
        handler.SendLatest(Msg(100), keyframe: true);
        handler.SendLatest(Msg(101));                  // dropped
        handler.SendLatest(Msg(102), keyframe: true);  // replaces K1
        handler.SendLatest(Msg(103));                  // dropped, K2 pending

        socket.Unblock();
        await WaitUntil(() => socket.Sent.Length >= 2);
        await Task.Delay(50);
        Assert.Equal(new byte[] { 1, 102 }, Tags(socket));

        handler.Terminate();
        await run.WaitAsync(TimeSpan.FromSeconds(5));
    }

    [Fact]
    public async Task ReliableQueueOverflow_TerminatesConnection_InsteadOfDropping()
    {
        var (handler, socket, server) = Create(capacity: 3);
        var run = handler.ProcessLoop();

        handler.Send(Msg(0));                // in flight, blocked
        await socket.FirstSendStarted.Task.WaitAsync(TimeSpan.FromSeconds(5));
        handler.Send(Msg(1));
        handler.Send(Msg(2));
        handler.Send(Msg(3));                // queue now full (3)
        Assert.False(server.Disconnected.Task.IsCompleted);

        handler.Send(Msg(4));                // overflow -> connection torn down

        // The receive loop exits and reports the disconnect (player cleanup on the server).
        await run.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Equal(42u, await server.Disconnected.Task.WaitAsync(TimeSpan.FromSeconds(5)));
        Assert.Empty(socket.Sent);

        // Sends after teardown are ignored, not thrown.
        handler.Send(Msg(5));
        handler.SendLatest(Msg(6));
    }
}
