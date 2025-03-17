using Game.Core;
using Game.ServerLogic.GameState.Events;
using Game.ServerLogic.Player.Events;
using WsServer.Abstract;
using WsServer.Abstract.Messages;
using WsServer.Common;

namespace WsServer;

public class GameServer(
    GameModel gameModel,
    IGameMessenger messenger,
    IClientConnectionManager connectionManager,
    IServerLogicProvider serverLogicProvider,
    IRequestHandlerFactory requestHandlerFactory)
    : GameServerBase<GameModel>(gameModel, messenger, connectionManager, serverLogicProvider, requestHandlerFactory)
{
    private GameTickStateUpdateEvent _tickStateUpdateEvent;
    private readonly MyBuffer _tickStateBuffer = new(1024 * 100);

    public override MyBuffer BuildTickState(GameModel game)
    {
        _tickStateBuffer.Clear();
        _tickStateBuffer.SetUint8(GameTickStateUpdateEvent.TypeId);
        _tickStateUpdateEvent.WriteToBuffer(_tickStateBuffer, game);
        return _tickStateBuffer;
    }

    public override uint AddNewPlayer()
    {
        var id = base.AddNewPlayer();
        //notifying other players that new player joined
        var player = GameModel.GetPlayer(id);
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