using Game.Core;
using Game.ServerLogic.GameState.Events;
using Game.ServerLogic.Player.Events;
using Microsoft.Extensions.Logging;
using WsServer.Abstract;

namespace WsServer;

public class GameServer : GameServerBase<GameModel>
{
    private readonly GameTickUpdateEvent _gameStateEvent;

    public GameServer(
        GameModel gameModel,
        IGameMessenger messenger,
        IClientConnectionManager connectionManager,
        IServerLogicProvider serverLogicProvider,
        ILogger<GameServer> logger) : base(gameModel, messenger, connectionManager, serverLogicProvider, logger)
    {
        OnPlayerAdded += GameServer_OnPlayerAdded;
        OnPlayerRemoved += GameServer_OnPlayerRemoved;
        OnTick += GameServer_OnTick;

        _gameStateEvent = new GameTickUpdateEvent(gameModel);
    }

    private void GameServer_OnTick()
    {
        Messenger.Broadcast(_gameStateEvent);

        //if (GameModel.TopChanged)
        //    BroadCastTop();
    }

    private void GameServer_OnPlayerRemoved(uint clientId) => 
        Messenger.Broadcast(new PlayerLeftEvent(clientId));

    private void GameServer_OnPlayerAdded(uint clientId)
    {
        var player = GameModel.GetPlayer(clientId);
        //notifying new player client that it can be initialized
        Messenger.Send(clientId, new InitPlayerEvent(clientId));

        //notifying other players that new player joined
        Messenger.Broadcast(new PlayerJoinedEvent(player));
        //send game state to new client
        Messenger.Send(clientId, new GameStateUpdateEvent(GameModel));
    }
}