using Microsoft.Extensions.Logging;
using System;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using WsServer.Abstract;

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

    protected GameServerBase(
        TGameModel gameModel,
        IGameMessenger messenger,
        IClientConnectionManager connectionManager,
        IServerLogicProvider serverLogicProvider,
        ILogger<GameServerBase<TGameModel>> logger)
    {
        serverLogicProvider.Initialize();
        GameModel = gameModel;
        Messenger = messenger;
        _connectionManager = connectionManager;
        _serverLogicProvider = serverLogicProvider;
        _logger = logger;

        _timer = new PeriodicTimer(TimeSpan.FromMilliseconds(33));
        _ = RunGameLoopAsync(); // Start the game loop
    }

    private async Task RunGameLoopAsync()
    {
        try
        {
            while (await _timer.WaitForNextTickAsync(_cts.Token))
            {
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
        var message = Messenger.Deserialize(ref data, out var typeId);
        if (_serverLogicProvider.RequestHandlers.TryGetValue(typeId, out var handler))
            handler?.Handle(clientId, message);
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