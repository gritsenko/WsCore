using Game.Core;
using MemoryPack;
using Microsoft.Extensions.DependencyInjection;
using WsServer.Abstract;
using WsServer.Abstract.Messages;
using WsServer.Persistence;
using WsServer.Sessions;
using static WsServer.Tests.TestSupport;

namespace WsServer.Tests;

/// <summary>
/// The real DI graph and tick loop driven with in-process connections (the same shape as
/// the harness inside SessionTests), for the chat-history and presence tests.
/// </summary>
internal sealed class ServerHarness : IAsyncDisposable
{
    private readonly ServiceProvider _services;
    private readonly ReflectionServerLogicProvider _logic;
    public GameServer Server { get; }
    public SessionManager Sessions { get; }
    public IChatStorage Storage { get; }

    public ServerHarness(Action<GameServerOptions>? configure = null, Action<IServiceCollection>? services = null)
    {
        _services = BuildGameServices(o =>
        {
            o.TickIntervalMs = 5;
            o.ChatCooldownSeconds = 0;
            o.HeartbeatIntervalSeconds = 0;
            o.PresenceFlushIntervalSeconds = 0;
            o.AccountRequestCooldownSeconds = 0;
            o.PasswordHashIterations = 1000; // real hashing, test-speed cost
            configure?.Invoke(o);
        }, services);
        Server = _services.GetRequiredService<GameServer>();
        Sessions = _services.GetRequiredService<SessionManager>();
        Storage = _services.GetRequiredService<IChatStorage>();
        _logic = (ReflectionServerLogicProvider)_services.GetRequiredService<IServerLogicProvider>();
        Server.Start();
    }

    public T Service<T>() where T : notnull => _services.GetRequiredService<T>();

    public async Task<RecordingConnection> Connect()
    {
        var conn = new RecordingConnection();
        Server.OnClientConnected(conn, id => conn.Id = id);
        await Settle();
        return conn;
    }

    public async Task Disconnect(RecordingConnection conn)
    {
        Server.OnClientDisconnected(conn.Id);
        await Settle();
    }

    public async Task Request(RecordingConnection conn, IClientRequest request)
    {
        Server.ProcessClientRequest(conn.Id, request);
        await Settle();
    }

    // Waits for a full tick that started after this call (it drained everything queued).
    public async Task Settle()
    {
        var ticks = 0;
        void Handler() => Interlocked.Increment(ref ticks);
        Server.OnTick += Handler;
        try { await WaitUntil(() => Volatile.Read(ref ticks) >= 2); }
        finally { Server.OnTick -= Handler; }
    }

    public T[] Events<T>(RecordingConnection conn) where T : IServerEvent => conn.Messages
        .Select(m => MemoryPackSerializer.Deserialize(_logic.ServerEventTypes.FindTypeById(m[0])!, m.AsSpan(1))!)
        .OfType<T>()
        .ToArray();

    /// <summary>Waits until the connection has received an event of type T matching the predicate.</summary>
    public async Task<T> WaitFor<T>(RecordingConnection conn, Func<T, bool>? predicate = null) where T : IServerEvent
    {
        T? found = default;
        await WaitUntil(() =>
        {
            found = Events<T>(conn).LastOrDefault(e => predicate == null || predicate(e));
            return found != null;
        });
        return found!;
    }

    public async ValueTask DisposeAsync()
    {
        await Server.StopAsync(CancellationToken.None);
        await _services.DisposeAsync();
    }
}

/// <summary>A unique SQLite file path, removed (with its WAL files) on dispose.</summary>
internal sealed class TempDatabase : IDisposable
{
    public string Path { get; } =
        System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"wscore-test-{Guid.NewGuid():N}", "chat.db");

    public void Dispose()
    {
        try { Directory.Delete(System.IO.Path.GetDirectoryName(Path)!, recursive: true); }
        catch (IOException) { /* best effort */ }
        catch (UnauthorizedAccessException) { /* best effort */ }
    }
}
