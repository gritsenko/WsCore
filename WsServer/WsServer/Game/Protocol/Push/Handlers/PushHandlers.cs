using Game.ServerLogic.Push.Requests;
using WsServer;
using WsServer.Abstract.Messages;
using WsServer.Push;
using WsServer.Sessions;

namespace Game.ServerLogic.Push.Handlers;

public class PushSubscribeRequestHandler(SessionManager sessions, PushService push, GameServerOptions options)
    : RequestHandlerBase<PushSubscribeRequest>
{
    protected override void Handle(uint clientId, PushSubscribeRequest request)
    {
        var session = sessions.Get(clientId);
        if (session?.User is not { } user || !session.TryConsumePushCooldown(options.PushRequestCooldownSeconds))
            return;
        push.Subscribe(user, session.KeyHash, request.Endpoint ?? string.Empty,
            request.P256dh ?? string.Empty, request.Auth ?? string.Empty);
    }
}

public class PushUnsubscribeRequestHandler(SessionManager sessions, PushService push, GameServerOptions options)
    : RequestHandlerBase<PushUnsubscribeRequest>
{
    protected override void Handle(uint clientId, PushUnsubscribeRequest request)
    {
        var session = sessions.Get(clientId);
        if (session?.User is not { } user || !session.TryConsumePushCooldown(options.PushRequestCooldownSeconds))
            return;
        push.Unsubscribe(user, request.Endpoint ?? string.Empty);
    }
}
