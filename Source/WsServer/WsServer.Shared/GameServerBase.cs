using System;
using System.Diagnostics;
using System.Threading;
using Microsoft.Extensions.Logging;
using WsServer.Abstract;

namespace WsServer;

public abstract class GameServerBase<TGameModel> : IGameServer<TGameModel>
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

    private readonly SemaphoreSlim _tickSemaphore = new SemaphoreSlim(1, 1);
    private readonly Timer _timer;

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

        _timer = new Timer(Tick, this, 33, 33);
    }

    private async void Tick(object? state)
    {
        try
        {
            var time = DateTime.Now;
            if (!await _tickSemaphore.WaitAsync(0))
                return;

            GameModel.UpdateGameState(time, () =>
            {
                OnTick?.Invoke();
            });
        }
        catch (Exception e)
        {
            _logger.LogError(e, "Error while updating game state");
        }
        finally
        {
            _tickSemaphore.Release();
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
}