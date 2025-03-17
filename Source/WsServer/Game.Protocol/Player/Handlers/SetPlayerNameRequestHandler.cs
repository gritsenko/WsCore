using Game.Core;
using Game.ServerLogic.Player.Events;
using Game.ServerLogic.Player.Requests;
using WsServer.Abstract;
using WsServer.Abstract.Messages;
using WsServer.Common;

namespace Game.ServerLogic.Player.Handlers;

public class SetPlayerNameRequestHandler(GameModel gameModel, IGameMessenger messenger) : RequestHandlerBase<SetPlayerNameRequest>
{
    protected override void Handle(uint clientId, SetPlayerNameRequest request)
    {
        gameModel.SetPlayerName(clientId, request.Name);
        messenger.Broadcast(new SetPlayerNameEvent(clientId, request.Name));
        Logger.Log($"Player {clientId} set name: {request.Name}");
    }
}