using Game.Core;
using Game.ServerLogic.GameState.Events;
using Game.ServerLogic.Player.Events;
using Microsoft.Extensions.Logging;
using WsServer.Abstract;
using WsServer.Abstract.Messages;
using WsServer.Common;

namespace WsServer;

public class GameServer(
    GameModel gameModel,
    IGameMessenger messenger,
    IClientConnectionManager connectionManager,
    IServerLogicProvider serverLogicProvider,
    ILogger<GameServer> logger)
    : GameServerBase<GameModel>(gameModel, messenger, connectionManager, serverLogicProvider, logger)
{
    private GameTickUpdateEvent _tickUpdateEvent;
    private readonly MyBuffer _tickStateBuffer = new(1024 * 100);

    public override void BuildTickState(GameModel game)
    {
        _tickStateBuffer.Clear();
        _tickStateBuffer.SetUint8(GameTickUpdateEvent.TypeId);
        _tickUpdateEvent.WriteToBuffer(_tickStateBuffer, game);
        return _tickStateBuffer;
    }

    public override uint AddNewPlayer()
    {
        var id = base.AddNewPlayer();
        var player = GameModel.GetPlayer(id);
        //notifying other players that new player joined
        Messenger.Broadcast(new PlayerJoinedEvent(player));
        return id;
    }

    public override void SendGameState(uint clientId)
    {
        Messenger.Send(clientId, new GameStateUpdateEvent(GameModel));
    }

    public override void RemovePlayer(uint clientId)
    {
        base.RemovePlayer(clientId);
        Messenger.Broadcast(new PlayerLeftEvent(clientId));
    }
}