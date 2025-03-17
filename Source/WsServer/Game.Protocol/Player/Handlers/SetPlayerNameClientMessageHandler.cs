using Game.Core;
using Game.ServerLogic.Player.Events;
using Game.ServerLogic.Player.Requests;
using WsServer.Common;

namespace Game.ServerLogic.Player.Handlers;

public class SetPlayerNameClientMessageHandler(GameModel gameModel) : MessageHandlerBase<SetPlayerNameRequest>
{
    protected override void Handle(uint clientId, SetPlayerNameRequest request)
    {
        gameModel.SetPlayerName(clientId, request.Name);
        Messenger.Broadcast(new SetPlayerNameEvent(clientId, request.Name));
        Logger.Log($"Player {clientId} set name: {request.Name}");
    }
}