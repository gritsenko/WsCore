using Game.Core;
using Game.ServerLogic.Player.Events;
using Game.ServerLogic.Player.Requests;
using Microsoft.Extensions.Logging;
using WsServer.Abstract;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Handlers;

public class SetPlayerNameRequestHandler(GameModel gameModel, IGameMessenger messenger, ILogger<SetPlayerNameRequestHandler> logger) : RequestHandlerBase<SetPlayerNameRequest>
{
    protected override void Handle(uint clientId, SetPlayerNameRequest request)
    {
        gameModel.SetPlayerName(clientId, request.Name);
        messenger.Broadcast(new SetPlayerNameEvent(clientId, request.Name));
        logger.LogInformation($"Player {clientId} set name: {request.Name}");
    }
}