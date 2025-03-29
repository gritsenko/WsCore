using System;
using System.Diagnostics;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using WsServer.Abstract;
using WsServer.Abstract.Messages;

namespace WsServer;

public abstract class GameServerBase<TGameModel> : IGameServer<TGameModel>
    where TGameModel : class, IGameModel, new()
{
    public TGameModel GameModel { get; }
    protected readonly IGameMessenger Messenger;

    public event Action<uint> OnPlayerAdded;
    public event Action<uint> OnPlayerRemoved;

    private readonly IClientConnectionManager _connectionManager;
    private readonly IServerLogicProvider _serverLogicProvider;
    private readonly ILogger<GameServerBase<TGameModel>> _logger;

    private DateTime _lastTickTime = DateTime.Now;
    private readonly TimeSpan _updatePeriod = TimeSpan.FromMilliseconds(33);
    private const int CleanPeriod = 10000 / 33;
    private int _ticksToClean = CleanPeriod;
    private readonly long _cleanTimeout = TimeSpan.FromSeconds(600).Ticks;
    public abstract IServerEvent BuildTickState(TGameModel game);

    protected GameServerBase(
        IGameModel gameModel,
        IGameMessenger messenger,
        IClientConnectionManager connectionManager,
        IServerLogicProvider serverLogicProvider,
        ILogger<GameServerBase<TGameModel>> logger)
    {
        GameModel = gameModel as TGameModel;
        Messenger = messenger;
        _connectionManager = connectionManager;
        _serverLogicProvider = serverLogicProvider;
        _logger = logger;

        StartGameLoop();
    }

    private async void StartGameLoop()
    {
        try
        {
            while (true)
            {
                Tick();
                await Task.Delay(_updatePeriod);
            }
        }
        catch (Exception e)
        {
            _logger.LogError(e, $"Can't start game loop! {e.Message}");
        }
    }


    private void Tick()
    {
        var time = DateTime.Now;
        var dt = time - _lastTickTime;
        _lastTickTime = time;
        GameModel.OnTick((float)dt.TotalSeconds);

        var stateEvent = BuildTickState(GameModel);
        Messenger.Broadcast(stateEvent);

        //if (GameModel.TopChanged)
        //    BroadCastTop();

        //clean state
        GameModel.FlushTickData();

        _ticksToClean--;

        if (_ticksToClean <= 0)
        {
            _ticksToClean = CleanPeriod;
            //CleanZombieClinets(GameState);
        }
    }


    private void CleanZombieClinets(IGameModel state)
    {
        //var now = DateTime.Now.Ticks;

        //foreach (var player in state.GetPlayers())
        //{
        //    if (now - player.LastActivity > _cleanTimeout)
        //    {
        //        Logger.Log("Killing zombie player: " + player.Name + " " + player.Id);
        //        _messenger.TerminateConnection(player.Id);
        //    }
        //}
    }

    //public void BroadCastTop()
    //{
    //    Messenger.Broadcast(new PlayersTopServerMessage(GameModel));
    //}
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

    public void ProcessClientMessage(uint clientId, byte typeId, IClientRequest request)
    {
        if (_serverLogicProvider.RequestHandlers.TryGetValue(typeId, out var handler))
            handler?.Handle(clientId, request);
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