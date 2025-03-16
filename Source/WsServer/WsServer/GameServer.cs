using Game.Protocol;
using Game.Protocol.ServerMessages;
using WsServer.Abstract;
using WsServer.Common;

namespace WsServer;

public class GameServer(IGameMessenger messenger) : GameServerBase<Game.Model.Game>(messenger)
{
    private GameTickStateServerMessage _tickStateServerMessage;
    private readonly MyBuffer _tickStateBuffer = new(1024 * 100);

    public override MyBuffer BuildTickState(Game.Model.Game game)
    {
        _tickStateBuffer.Clear();
        _tickStateBuffer.SetUint8((byte)ServerMessageType.GameTickState);
        _tickStateServerMessage.WriteToBuffer(_tickStateBuffer, game);
        return _tickStateBuffer;
    }
    public override uint AddNewPlayer()
    {
        var id = base.AddNewPlayer();
        //notifying other players that new player joind
        var player = GameModel.GetPlayer(id);
        Messenger.Broadcast(new PlayerJoinedServerMessage(player));
        return id;
    }
    public override void SendGameState(uint clientId)
    {
        Messenger.SendMessage(clientId, new GameStateServerMessage(GameModel));
    }

    public override void RemovePlayer(uint clientId)
    {
        base.RemovePlayer(clientId);
        Messenger.Broadcast(new PlayerLeftServerMessage(clientId));
    }
}