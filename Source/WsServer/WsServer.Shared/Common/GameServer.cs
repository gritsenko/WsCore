using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading;
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



        public GameState GameState { get; set; } = new GameState();

        public GameServer(IGameMessenger messenger)
        {
            _messenger = messenger;
            _movmentTimer = new Timer(OnTimerCallback, this, _updatePeriod, _updatePeriod);

            RegisterMessageHandlers();
        }

        private void RegisterMessageHandlers()
        {
            RegisterHandler(new TilesRequestMessageHandler());
            RegisterHandler(new DefaultClientMessageHandler());
        }

        private void RegisterHandler(IMessageHandler messageHandler)
        {
            messageHandler.Initialize(this, _messenger, GameState);

            foreach (var clientMessageType in messageHandler.GetMessageTypes())
            {
                _messageHnadlers[clientMessageType] = messageHandler;
            }
        }

        private void OnTimerCallback(object state)
        {
            var time = DateTime.Now;
            var dt = time - _lastTickTime;
            _lastTickTime = time;
            GameState.ProcessGameState((float)dt.TotalSeconds);

            _messenger.Broadcast(BuildTickState(GameState));

            //clean state
            GameState.RemoveDestroyedBullets();

            _ticksToClean--;

            if (_ticksToClean <= 0)
            {
                _ticksToClean = CleanPeriod;
                //CleanZombieClinets(GameState);
            }
        }

        public MyBuffer BuildTickState(GameState state)
        {
            var players = state.GetPlayers();
            var playersCount = players.Length;

            //var buff = new MyBuffer();
            _tickStateBuffer.Clear();

            //write directly to buffer to reduce allocations
            //simulating GameTickStateServerMessage 

            _tickStateBuffer.SetUint8((byte)ServerMessageType.GameTickState);
            //first byte - count of players
            _tickStateBuffer.SetUint32((uint)playersCount);
            //serialize each player
            for (var i = 0; i < playersCount; i++)
            {
                _tickStateBuffer.SetData(new MovementStateData(players[i]));
            }

            var bulletsToDestroy = state.GetDestroyedBullets().Select(x=>x.Id).ToArray();

            _tickStateBuffer.SetData(new DestroyedBulletsStateData(bulletsToDestroy));

            return _tickStateBuffer;
        }

        private void CleanZombieClinets(GameState state)
        {
            var ps = state.GetPlayers();
            var cnt = ps.Length;

            var now = DateTime.Now.Ticks;

            for (var i = 0; i < cnt; i++)
                if (now - ps[i].LastActivity > _cleanTimeout)
                {
                    Logger.Log("Killing zombie player: " + ps[i].Name + " " + ps[i].Id);
                    _messenger.TerminateConnection(ps[i].Id);
                }
        }

        public void SendGameState(uint clientId)
        {
            _messenger.SendMessage(clientId, new GameStateServerMessage(GameState));
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
            _messenger.Broadcast(new PlayersTopServerMessage(GameState));
        }

        public void RemovePlayer(uint clientId)
        {
            GameState.RemovePlayer(clientId);

            var cnt = GameState.PlayersCount;
            Logger.Log("Player left. Total count:" + cnt);
            _messenger.Broadcast(new PlayerLeftServerMessage(clientId));
        }

        public Player AddNewPlayer()
        {
            var p = GameState.CreateNewPlayer();
            GameState.AddPlayer(p);

            //notifying other players that new player joind
            _messenger.Broadcast(new PlayerJoinedServerMessage(p));

            var cnt = GameState.PlayersCount;
            Logger.Log("Player joined. Total count:" + cnt);

            return p;
        }
    }
}
