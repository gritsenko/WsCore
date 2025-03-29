using Game.Core;
using Game.ServerLogic.GameState.Events;
using Game.ServerLogic.Player.Events;
using Microsoft.Extensions.Logging;
using WsServer.Abstract;
using WsServer.Abstract.Messages;

namespace WsServer;

public class GameServer : GameServerBase<GameModel>
{
    private IServerEvent _gameStateEvent;

    public GameServer(
        GameModel gameModel,
        IGameMessenger messenger,
        IClientConnectionManager connectionManager,
        IServerLogicProvider serverLogicProvider,
        ILogger<GameServer> logger) : base(gameModel, messenger, connectionManager, serverLogicProvider, logger)
    {
        OnPlayerAdded += GameServer_OnPlayerAdded;
        OnPlayerRemoved += GameServer_OnPlayerRemoved;

        _gameStateEvent = new GameTickUpdateEvent(gameModel);
    }

    private void GameServer_OnPlayerRemoved(uint clientId) => 
        Messenger.Broadcast(new PlayerLeftEvent(clientId));

    private void GameServer_OnPlayerAdded(uint clientId)
    {
        var player = GameModel.GetPlayer(clientId);
        //notifying other players that new player joined
        Messenger.Broadcast(new PlayerJoinedEvent(player));
        //send game state to new client
        Messenger.Send(clientId, new GameStateUpdateEvent(GameModel));
    }

    public override IServerEvent BuildTickState(GameModel game) =>
        _gameStateEvent;
}