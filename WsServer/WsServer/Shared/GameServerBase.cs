using System.Collections.Concurrent;
using System.Diagnostics;
using Microsoft.Extensions.Hosting;
using WsServer.Abstract;
using WsServer.Abstract.Messages;

namespace WsServer;

public abstract class GameServerBase<TGameModel> : IGameServer<TGameModel>, IHostedLifecycleService, IDisposable
    where TGameModel : class, IGameModel, new()
{
    public TGameModel GameModel { get; }
    protected readonly IGameMessenger Messenger;

    // A connection was registered / unregistered (tick thread). A connection is not a
    // player: the derived server decides if and when a connection gets a game avatar.
    public event Action<uint>? OnClientAdded;
    public event Action<uint>? OnClientRemoved;
    public event Action? OnTick;

    private readonly IClientConnectionManager _connectionManager;
    private readonly IServerLogicProvider _serverLogicProvider;
    private readonly ILogger<GameServerBase<TGameModel>> _logger;

    private readonly TimeSpan _tickInterval;
    private readonly Action _onTickAction;

    // Loop lifecycle: started by the host (IHostedService.StartAsync), stopped by StopAsync.
    private readonly Lock _lifecycleLock = new();
    private CancellationTokenSource? _loopCts;
    private Task? _loopTask;
    private volatile bool _stopping;

    // Stopwatch timestamps (monotonic). Written on the tick thread / at start and read by
    // the /health endpoint, hence Volatile access.
    private long _loopStartTimestamp;
    private long _lastTickTimestamp;
    private int _consecutiveTickFailures;

    // Everything that mutates the model, rooms or the connection registry runs here,
    // drained on the tick thread, so all of that state is single-threaded (audit §1.4):
    // client requests (deserialized on socket threads), connects and disconnects. One
    // socket thread enqueues its connect, its requests and its disconnect in that program
    // order, and the queue is FIFO, so a connection's commands always run in that order.
    private readonly ConcurrentQueue<Action> _commandQueue = new();

    protected GameServerBase(
        TGameModel gameModel,
        IGameMessenger messenger,
        IClientConnectionManager connectionManager,
        IServerLogicProvider serverLogicProvider,
        GameServerOptions options,
        ILogger<GameServerBase<TGameModel>> logger)
    {
        serverLogicProvider.Initialize();
        GameModel = gameModel;
        Messenger = messenger;
        _connectionManager = connectionManager;
        _serverLogicProvider = serverLogicProvider;
        _logger = logger;

        _onTickAction = () => OnTick?.Invoke();
        _tickInterval = TimeSpan.FromMilliseconds(options.TickIntervalMs);
        _loopStartTimestamp = Stopwatch.GetTimestamp();
    }

    public bool IsRunning
    {
        get { lock (_lifecycleLock) return _loopTask is { IsCompleted: false }; }
    }

    // ---- hosting ----------------------------------------------------------------------

    /// <summary>Starts the tick loop. Idempotent. Called by the host via StartAsync.</summary>
    public void Start()
    {
        lock (_lifecycleLock)
        {
            if (_loopTask != null)
                return;
            _stopping = false;
            _loopCts = new CancellationTokenSource();
            Volatile.Write(ref _loopStartTimestamp, Stopwatch.GetTimestamp());
            Volatile.Write(ref _lastTickTimestamp, 0);
            _loopTask = RunGameLoopAsync(_loopCts.Token);
        }
        _logger.LogInformation("Game loop started ({TickMs} ms tick)", _tickInterval.TotalMilliseconds);
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        Start();
        return Task.CompletedTask;
    }

    public Task StartingAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    public Task StartedAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    // Runs before any hosted service's StopAsync — in particular before Kestrel's, which
    // would otherwise wait (up to the shutdown timeout) for the long-lived WebSocket
    // requests to finish on their own.
    public Task StoppingAsync(CancellationToken cancellationToken)
    {
        TerminateConnections();
        return Task.CompletedTask;
    }

    /// <summary>
    /// Graceful shutdown (audit §1.15): closes every open socket (if StoppingAsync didn't
    /// already), stops the tick loop and waits for it to exit, then lets the derived server
    /// release its own resources via <see cref="OnStopped"/>.
    /// </summary>
    public async Task StopAsync(CancellationToken cancellationToken)
    {
        TerminateConnections();

        Task? loop;
        lock (_lifecycleLock)
        {
            loop = _loopTask;
            _loopTask = null;
            _loopCts?.Cancel();
        }

        if (loop != null)
        {
            var exited = false;
            try
            {
                await loop.WaitAsync(cancellationToken);
                exited = true;
            }
            catch (OperationCanceledException) { /* host shutdown timeout elapsed */ }

            // The loop has exited, so this thread is now the only one touching the model:
            // run what's still queued (typically the disconnects of the connections closed
            // above) so the final state is consistent.
            if (exited)
                DrainCommandQueue();
            _logger.LogInformation("Graceful shutdown: game loop stopped");
        }

        lock (_lifecycleLock)
        {
            if (_loopTask == null)
            {
                _loopCts?.Dispose();
                _loopCts = null;
            }
        }

        OnStopped();
    }

    public Task StoppedAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    /// <summary>Called once the tick loop has exited during StopAsync.</summary>
    protected virtual void OnStopped() { }

    private void TerminateConnections()
    {
        // Set first so a connection accepted from here on is refused rather than registered.
        if (_stopping) return;
        _stopping = true;

        var connections = _connectionManager.Connections.ToList();
        _logger.LogInformation("Graceful shutdown: closing {Count} connection(s)", connections.Count);
        foreach (var connection in connections)
        {
            try { connection.Terminate(); }
            catch (Exception e) { _logger.LogWarning(e, "Failed to terminate connection {ClientId}", connection.Id); }
        }
    }

    // ---- tick loop --------------------------------------------------------------------

    private async Task RunGameLoopAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(_tickInterval);
        try
        {
            while (await timer.WaitForNextTickAsync(ct))
            {
                // Each tick is isolated: an exception in one tick is logged and the loop
                // carries on, instead of a single bad tick killing the simulation forever.
                try
                {
                    RunTick();
                    _consecutiveTickFailures = 0;
                    Volatile.Write(ref _lastTickTimestamp, Stopwatch.GetTimestamp());
                }
                catch (Exception e)
                {
                    var failures = ++_consecutiveTickFailures;
                    // Throttle: a persistently failing tick would otherwise log ~30x/sec.
                    if (failures == 1 || failures % 100 == 0)
                        _logger.LogError(e, "Game tick failed ({Failures} consecutive failure(s))", failures);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Normal shutdown
        }
    }

    private void RunTick()
    {
        DrainCommandQueue();
        // Monotonic time for dt: DateTime.Now jumps with wall-clock / DST / NTP changes.
        GameModel.UpdateGameState(Stopwatch.GetElapsedTime(Volatile.Read(ref _loopStartTimestamp)), _onTickAction);
    }

    /// <summary>
    /// Time since the last successfully completed tick (or since the loop started, if no
    /// tick has completed yet). Grows without bound if the loop is dead or every tick throws.
    /// </summary>
    public TimeSpan TimeSinceLastTick
    {
        get
        {
            var last = Volatile.Read(ref _lastTickTimestamp);
            return Stopwatch.GetElapsedTime(last != 0 ? last : Volatile.Read(ref _loopStartTimestamp));
        }
    }

    private void DrainCommandQueue()
    {
        while (_commandQueue.TryDequeue(out var command))
        {
            try
            {
                command();
            }
            catch (Exception e)
            {
                // Isolate a buggy handler so it can't break the tick loop for everyone.
                _logger.LogError(e, "Error executing queued client command");
            }
        }
    }

    // ---- connections ------------------------------------------------------------------

    /// <summary>
    /// Called on the connection's socket thread. The id is reserved atomically and handed
    /// back through <paramref name="onIdCreated"/> synchronously — before the caller starts
    /// its receive loop, so no request is ever tagged with id 0 — while the registration
    /// (and the derived server's session / room setup) happens later on the tick thread.
    /// The connection receives nothing until then, so InitPlayerEvent is still its first
    /// message.
    /// </summary>
    public void OnClientConnected(IClientConnection connection, Action<uint> onIdCreated)
    {
        if (_stopping)
        {
            // Shutting down: refuse instead of registering a connection nobody will close.
            connection.Terminate();
            return;
        }

        var id = GameModel.GetNewPlayerId();
        onIdCreated(id);
        _commandQueue.Enqueue(() => ConnectClient(id, connection));
    }

    /// <summary>
    /// Called on the connection's socket thread (after its OnClientConnected). Queued behind
    /// the connect command, so a connection that drops before its connect ran is still
    /// added and then removed in order — never leaked, never removed-before-added.
    /// </summary>
    public void OnClientDisconnected(uint connectionId)
        => _commandQueue.Enqueue(() => RemoveClient(connectionId));

    private void ConnectClient(uint id, IClientConnection connection)
    {
        _connectionManager.Register(connection);
        _logger.LogInformation("Client {ClientId} connected", id);
        OnClientAdded?.Invoke(id);
    }

    private void RemoveClient(uint clientId)
    {
        _connectionManager.Remove(clientId);
        _logger.LogInformation("Client {ClientId} disconnected", clientId);
        OnClientRemoved?.Invoke(clientId);
    }

    // ---- client requests --------------------------------------------------------------

    public void ProcessClientMessageData(uint clientId, byte[] data)
    {
        // Deserialize on the caller's (socket) thread — read-only, safe — then defer the
        // handler to the tick thread via the command queue (audit §1.4).
        var message = Messenger.Deserialize(ref data, out var type);
        EnqueueClientRequest(clientId, type, message);
    }

    // Entry point for already-deserialized requests (e.g. the JSON debug fallback).
    public void ProcessClientRequest(uint clientId, IClientRequest request)
        => EnqueueClientRequest(clientId, request.GetType(), request);

    private void EnqueueClientRequest(uint clientId, Type type, IClientRequest request)
    {
        if (_serverLogicProvider.TryGetRequestHandler(type, out var handler) && handler != null)
            _commandQueue.Enqueue(() => handler.Handle(clientId, request));
    }

    /// <summary>
    /// Runs <paramref name="action"/> on the tick thread (behind everything queued so far)
    /// and completes with its result — for callers off the tick thread (HTTP endpoints)
    /// that need to read or change single-threaded state. An exception thrown by the
    /// action faults the task. Never completes if the loop is not running.
    /// </summary>
    public Task<T> RunOnTickAsync<T>(Func<T> action)
    {
        var done = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        _commandQueue.Enqueue(() =>
        {
            try { done.TrySetResult(action()); }
            catch (Exception e) { done.TrySetException(e); }
        });
        return done.Task;
    }

    public void Dispose()
    {
        lock (_lifecycleLock)
        {
            _loopCts?.Cancel();
            _loopTask = null;
        }
    }
}
