using Game.ServerLogic.Presence.Requests;
using WsServer;
using WsServer.Abstract.Messages;
using WsServer.Sessions;

namespace Game.ServerLogic.Presence.Handlers;

public class IdentifyRequestHandler(SessionManager sessions, GameServerOptions options) : RequestHandlerBase<IdentifyRequest>
{
    protected override void Handle(uint clientId, IdentifyRequest request)
    {
        var name = InputSanitizer.Clean(request.Name, options.MaxNameLength);
        sessions.Identify(clientId, request.UserKey ?? string.Empty, name);
    }
}

public class SetAwayRequestHandler(SessionManager sessions) : RequestHandlerBase<SetAwayRequest>
{
    protected override void Handle(uint clientId, SetAwayRequest request)
        => sessions.SetAway(clientId, request.Away);
}
