using System;
using System.Threading.Tasks;
using WsServer.Abstract;
using WsServer.Common;

namespace WsServer;

public abstract class GameServerBase<TGameModel> : IGameServer<TGameModel>
    where TGameModel : class, IGameModel, new()
{
    public TGameModel GameModel { get; } = new();
    protected readonly IGameMessenger Messenger;

    private DateTime _lastTickTime = DateTime.Now;
    private readonly TimeSpan _updatePeriod = TimeSpan.FromMilliseconds(33);
    private const int CleanPeriod = 10000 / 33;
    private int _ticksToClean = CleanPeriod;
    private readonly long _cleanTimeout = TimeSpan.FromSeconds(600).Ticks;

    //private readonly Dictionary<ClientMessageType, IMessageHandler> _messageHandlers = new();

    protected GameServerBase(IGameMessenger messenger)
    {
        Messenger = messenger;
        //_movmentTimer = new Timer(OnTimerCallback, this, _updatePeriod, _updatePeriod);
        //RegisterMessageHandlers();

        StartGameLoop();
    }
    public abstract MyBuffer BuildTickState(TGameModel game);
    public abstract void SendGameState(uint clientId);


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
            Logger.Log(e);
        }
    }

    //private void RegisterMessageHandlers()
    //{
    //    RegisterHandler(new TilesRequestMessageHandler());
    //    RegisterHandler(new DefaultClientMessageHandler());
    //}

    //private void RegisterHandler(IMessageHandler messageHandler)
    //{
    //    messageHandler.Initialize(this, _messenger, Game);

    //    foreach (var clientMessageType in messageHandler.GetMessageTypes())
    //    {
    //        _messageHandlers[clientMessageType] = messageHandler;
    //    }
    //}


    private void Tick()
    {
        var time = DateTime.Now;
        var dt = time - _lastTickTime;
        _lastTickTime = time;
        GameModel.OnTick((float)dt.TotalSeconds);

        Messenger.Broadcast(BuildTickState(GameModel));

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

    public void NotifyMessageReceived(uint id, ref byte[] buffer, int count)
    {
        //var messageType = (ClientMessageType)buffer[0];
        //GetMessageHandlerFromId(messageType)?.Handle(id, buffer, count);
        //Debug.WriteLine("Handled by " + handler.GetType().Name);
    }

    //private IMessageHandler GetMessageHandlerFromId(ClientMessageType messageType) =>
    //    _messageHandlers.GetValueOrDefault(messageType);

    //public void BroadCastTop()
    //{
    //    Messenger.Broadcast(new PlayersTopServerMessage(GameModel));
    //}

    public virtual void RemovePlayer(uint clientId)
    {
        GameModel.RemovePlayer(clientId);
        var cnt = GameModel.PlayersCount;
        Logger.Log("Player left. Total count:" + cnt);
    }

    public virtual uint AddNewPlayer()
    {
        var id = GameModel.AddNewPlayer();
        var cnt = GameModel.PlayersCount;
        Logger.Log("Player joined. Total count:" + cnt);
        return id;
    }
}