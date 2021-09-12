using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using GameModel;
using WsServer.Abstract;
using WsServer.ClientMessageHandlers;
using WsServer.ServerMessages;

namespace WsServer.Common
{
    public class GameServer : IGameServer
    {
        private readonly IGameMessenger _messenger;

        private readonly MyBuffer _tickStateBuffer = new MyBuffer(1024 * 100);

        private DateTime _lastTickTime = DateTime.Now;
        private Timer _movmentTimer;
        private readonly TimeSpan _updatePeriod = TimeSpan.FromMilliseconds(33);
        private const int CleanPeriod = 10000 / 33;
        private int _ticksToClean = CleanPeriod;
        private readonly long _cleanTimeout = TimeSpan.FromSeconds(600).Ticks;

        private readonly Dictionary<ClientMessageType, IMessageHandler> _messageHnadlers = new Dictionary<ClientMessageType, IMessageHandler>();



        public Game Game { get; set; } = new Game();

        public GameServer(IGameMessenger messenger)
        {
            _messenger = messenger;
            //_movmentTimer = new Timer(OnTimerCallback, this, _updatePeriod, _updatePeriod);
            RegisterMessageHandlers();

            StartGameLoop();
        }

        private async void StartGameLoop()
        {
            while (true)
            {
                Tick();
                await Task.Delay(_updatePeriod);
            }
        }

        private void RegisterMessageHandlers()
        {
            RegisterHandler(new TilesRequestMessageHandler());
            RegisterHandler(new DefaultClientMessageHandler());
        }

        private void RegisterHandler(IMessageHandler messageHandler)
        {
            messageHandler.Initialize(this, _messenger, Game);

            foreach (var clientMessageType in messageHandler.GetMessageTypes())
            {
                _messageHnadlers[clientMessageType] = messageHandler;
            }
        }

        private void OnTimerCallback(object state)
        {
        }

        private void Tick()
        {
            var time = DateTime.Now;
            var dt = time - _lastTickTime;
            _lastTickTime = time;
            Game.OnTick((float)dt.TotalSeconds);

            _messenger.Broadcast(BuildTickState(Game));

            //clean state
            Game.FlushTickData();

            _ticksToClean--;

            if (_ticksToClean <= 0)
            {
                _ticksToClean = CleanPeriod;
                //CleanZombieClinets(GameState);
            }
        }

        public MyBuffer BuildTickState(Game game)
        {
            var playersCount = Game.PlayersCount;

            //var buff = new MyBuffer();
            _tickStateBuffer.Clear();

            //write directly to buffer to reduce allocations
            //simulating GameTickStateServerMessage 

            _tickStateBuffer.SetUint8((byte)ServerMessageType.GameTickState);
            //first byte - count of players
            _tickStateBuffer.SetUint32((uint)playersCount);
            //serialize each player
            foreach (var player in Game.GetPlayers()) 
                _tickStateBuffer.SetData(new MovementStateData(player));

            //serialize bullets to be destroyed
            var bulletsToDestroy = game.GetDestroyedBullets().Select(x => x.Id).ToArray();
            _tickStateBuffer.SetData(new DestroyedBulletsStateData(bulletsToDestroy));

            //serialize player hit events
            var hitsInfos = game.GetHits();
            var hitsCount = game.HitsCount;
            _tickStateBuffer.SetUint32((uint)hitsCount);

            foreach (var hitInfo in hitsInfos)
            {
                _tickStateBuffer.SetData(new HitPlayerStateData(hitInfo));
            }
            return _tickStateBuffer;
        }

        private void CleanZombieClinets(Game state)
        {
            var now = DateTime.Now.Ticks;

            foreach (var player in state.GetPlayers())
            {
                if (now - player.LastActivity > _cleanTimeout)
                {
                    Logger.Log("Killing zombie player: " + player.Name + " " + player.Id);
                    _messenger.TerminateConnection(player.Id);
                }
            }
        }

        public void SendGameState(uint clientId)
        {
            _messenger.SendMessage(clientId, new GameStateServerMessage(Game));
        }

        public void NotifyMessageRecieved(uint id, ref byte[] buffer, int count)
        {
            var messageType = (ClientMessageType)buffer[0];

            var handler = GetMessavgeHandlerFromId(messageType);

            if (handler != null)
            {
                if (handler is CommonMessageHandler cmnMessageHandler)
                {
                    cmnMessageHandler.Handle(messageType, id, buffer, count);
                }
                else
                {
                    handler.Handle(id, buffer, count);
                }
                //Debug.WriteLine("Handled by " + handler.GetType().Name);
            }
        }

        private IMessageHandler GetMessavgeHandlerFromId(ClientMessageType messageType)
        {
            return _messageHnadlers.TryGetValue(messageType, out var result) ? result : null;
        }

        public void BroadCastTop()
        {
            _messenger.Broadcast(new PlayersTopServerMessage(Game));
        }

        public void RemovePlayer(uint clientId)
        {
            Game.RemovePlayer(clientId);

            var cnt = Game.PlayersCount;
            Logger.Log("Player left. Total count:" + cnt);
            _messenger.Broadcast(new PlayerLeftServerMessage(clientId));
        }

        public Player AddNewPlayer()
        {
            var p = Game.CreateNewPlayer();
            Game.AddPlayer(p);

            //notifying other players that new player joind
            _messenger.Broadcast(new PlayerJoinedServerMessage(p));

            var cnt = Game.PlayersCount;
            Logger.Log("Player joined. Total count:" + cnt);

            return p;
        }
    }
}
