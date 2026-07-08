using Game.Core;
using Game.ServerLogic.Player.Events;
using Game.ServerLogic.Player.Requests;
using Microsoft.Extensions.Logging;
using WsServer;
using WsServer.Abstract;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Handlers;

public class SetPlayerNameRequestHandler(GameModel gameModel, IGameMessenger messenger, GameServerOptions options, ILogger<SetPlayerNameRequestHandler> logger) : RequestHandlerBase<SetPlayerNameRequest>
{
    protected override void Handle(uint clientId, SetPlayerNameRequest request)
    {
        // Sanitize, then broadcast the name the model actually resolved (empty -> default),
        // so clients and server stay in sync (audit §2).
        var requested = InputSanitizer.Clean(request.Name, options.MaxNameLength);

        var resolved = gameModel.SetPlayerName(clientId, requested);
        if (resolved == null) return; // player already gone

        messenger.Broadcast(new SetPlayerNameEvent(clientId, resolved));
        logger.LogInformation("Player {ClientId} set name ({Length} chars)", clientId, resolved.Length);
    }
}