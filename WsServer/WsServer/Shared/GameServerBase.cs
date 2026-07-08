using System.Collections.Concurrent;
using System.Diagnostics;
using WsServer.Abstract;
using WsServer.Abstract.Messages;

namespace WsServer;

public abstract class GameServerBase<TGameModel> : IGameServer<TGameModel>, IDisposable
    where TGameModel : class, IGameModel, new()
{
    public TGameModel GameModel { get; }
    protected readonly IGameMessenger Messenger;

    public event Action<uint>? OnPlayerAdded;
    public event Action<uint>? OnPlayerRemoved;
    public event Action? OnTick;

    private readonly IClientConnectionManager _connectionManager;
    private readonly IServerLogicProvider _serverLogicProvider;
    private readonly ILogger<GameServerBase<TGameModel>> _logger;

    private readonly PeriodicTimer _timer;
    private CancellationTokenSource _cts = new();

    // Client requests are deserialized on socket threads but their handlers run here,
    // drained on the tick thread, so all model mutation is single-threaded (audit §1.4).
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

        _timer = new PeriodicTimer(TimeSpan.FromMilliseconds(options.TickIntervalMs));
        _ = RunGameLoopAsync(); // Start the game loop
    }

    private async Task RunGameLoopAsync()
    {
        try
        {
            while (await _timer.WaitForNextTickAsync(_cts.Token))
            {
                DrainCommandQueue();
                var time = DateTime.Now;
                GameModel.UpdateGameState(time, () => OnTick?.Invoke());
            }
        }
        catch (OperationCanceledException)
        {
            // Normal shutdown
        }
        catch (Exception e)
        {
            _logger.LogError(e, "Game loop crashed");
        }
    }

    public void OnClientDisconnected(uint connectionId)
    {
        RemovePlayer(connectionId);
        Debug.WriteLine($"Disconnected {connectionId}!");
    }

    private void RemovePlayer(uint clientId)
    {
        GameModel.RemovePlayer(clientId);
        var cnt = GameModel.PlayersCount;
        _logger.LogInformation("Player left. Total count:" + cnt);
        _connectionManager.Remove(clientId);
        OnPlayerRemoved?.Invoke(clientId);
    }

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

    public void OnClientConnected(IClientConnection connection, Action<uint> onIdCreated)
    {
        var playerId = AddNewPlayer();
        onIdCreated(playerId);
        _connectionManager.Register(connection);
        OnPlayerAdded?.Invoke(playerId);
    }

    private uint AddNewPlayer()
    {
        var id = GameModel.AddNewPlayer();
        var cnt = GameModel.PlayersCount;
        _logger.LogInformation("Player joined. Total count:" + cnt);
        return id;
    }
    public void Dispose()
    {
        _cts.Cancel();
        _timer.Dispose();
    }
}