using Game.ServerLogic.Player.Requests;
using Microsoft.Extensions.Logging;
using WsServer;
using WsServer.Abstract.Messages;
using WsServer.Sessions;

namespace Game.ServerLogic.Player.Handlers;

public class SetPlayerNameRequestHandler(SessionManager sessions, GameServerOptions options, ILogger<SetPlayerNameRequestHandler> logger) : RequestHandlerBase<SetPlayerNameRequest>
{
    protected override void Handle(uint clientId, SetPlayerNameRequest request)
    {
        // Sanitize, then let the session resolve (empty -> default) and broadcast the name
        // it actually holds, so clients and server stay in sync (audit §2). Works with or
        // without an avatar; see SessionManager.SetName for who is told.
        var requested = InputSanitizer.Clean(request.Name, options.MaxNameLength);

        var resolved = sessions.SetName(clientId, requested);
        if (resolved == null) return; // client already gone

        logger.LogInformation("Client {ClientId} set name ({Length} chars)", clientId, resolved.Length);
    }
}
