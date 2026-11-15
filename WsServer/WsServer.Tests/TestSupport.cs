using System.Net.WebSockets;
using MemoryPack;
using Microsoft.Extensions.DependencyInjection;
using WsServer.Abstract;
using WsServer.Abstract.Messages;

namespace WsServer.Tests;

internal static class TestSupport
{
    public static async Task WaitUntil(Func<bool> condition, TimeSpan? timeout = null)
    {
        var deadline = DateTime.UtcNow + (timeout ?? TimeSpan.FromSeconds(5));
        while (!condition())
        {
            if (DateTime.UtcNow > deadline)
                throw new TimeoutException("condition not met");
            await Task.Delay(10);
        }
    }

    /// <summary>Sends a request over a real socket as a binary [TypeId][MemoryPack] frame.</summary>
    public static async Task SendRequest<T>(ClientWebSocket socket, T request, CancellationToken ct = default)
        where T : IClientRequest
    {
        var writer = new System.Buffers.ArrayBufferWriter<byte>(256);
        writer.GetSpan(1)[0] = T.TypeId;
        writer.Advance(1);
        MemoryPackSerializer.Serialize(writer, request);
        await socket.SendAsync(writer.WrittenMemory, WebSocketMessageType.Binary, true, ct);
    }

    // The production DI graph (AddGameServer) without a host: the GameServer is resolved
    // but not started, so tests control exactly when queued commands get drained.
    public static ServiceProvider BuildGameServices(Action<GameServerOptions>? configure = null)
        => new ServiceCollection()
            .AddLogging()
            .AddGameServer(configure: configure)
            .BuildServiceProvider();
}

/// <summary>In-process IClientConnection recording what the server queued for it.</summary>
internal sealed class RecordingConnection : IClientConnection
{
    private readonly List<byte[]> _messages = new();
    private int _terminated;

    public uint Id { get; set; }
    public bool Terminated => Volatile.Read(ref _terminated) == 1;

    public void Send(ArraySegment<byte> messageData)
    {
        lock (_messages) _messages.Add(messageData.ToArray());
    }

    public void Terminate() => Interlocked.Exchange(ref _terminated, 1);

    public void Clear()
    {
        lock (_messages) _messages.Clear();
    }

    public byte[][] Messages
    {
        get { lock (_messages) return _messages.ToArray(); }
    }
}
