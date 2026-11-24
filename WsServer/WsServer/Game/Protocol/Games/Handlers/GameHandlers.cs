using Game.ServerLogic.Games.Events;
using Game.ServerLogic.Games.Requests;
using WsServer.Abstract;
using WsServer.Abstract.Messages;
using WsServer.Games;
using WsServer.Persistence;
using WsServer.Sessions;

namespace Game.ServerLogic.Games.Handlers;

/// <summary>
/// API tokens over the socket: the profile's "agent access" section. Only users who may
/// publish games (server admins) get tokens — a token can do nothing else.
/// </summary>
public sealed class ApiTokenRequests(SessionManager sessions, ApiTokens tokens, IGameMessenger messenger)
{
    public void Create(uint clientId, string name)
    {
        if (Publisher(clientId) is not { } user)
            return;
        var created = tokens.Create(user.Id, name);
        Reply(clientId, user.Id, created?.Token ?? string.Empty, created == null ? "limit" : string.Empty);
    }

    public void Revoke(uint clientId, string id)
    {
        if (Publisher(clientId) is not { } user)
            return;
        var revoked = tokens.Revoke(user.Id, id ?? string.Empty);
        Reply(clientId, user.Id, string.Empty, revoked ? string.Empty : "not_found");
    }

    public void List(uint clientId)
    {
        if (Publisher(clientId) is { } user)
            Reply(clientId, user.Id, string.Empty, string.Empty);
    }

    private UserAccount? Publisher(uint clientId)
    {
        var user = sessions.Get(clientId)?.User;
        if (GameCatalog.CanPublish(user))
            return user;
        messenger.Send(clientId, new ApiTokensEvent { Error = "forbidden" });
        return null;
    }

    private void Reply(uint clientId, uint userId, string newToken, string error)
        => messenger.Send(clientId, new ApiTokensEvent
        {
            Tokens = tokens.ListFor(userId).Select(ToInfo).ToList(),
            NewToken = newToken,
            Error = error,
        });

    private static ApiTokenInfo ToInfo(StoredApiToken t) => new()
    {
        Id = ApiTokens.IdOf(t.Hash),
        Name = t.Name,
        CreatedMs = t.CreatedMs,
        LastUsedMs = t.LastUsedMs,
    };
}

public class CreateApiTokenRequestHandler(SessionManager sessions, ApiTokens tokens, IGameMessenger messenger)
    : RequestHandlerBase<CreateApiTokenRequest>
{
    protected override void Handle(uint clientId, CreateApiTokenRequest request)
        => new ApiTokenRequests(sessions, tokens, messenger).Create(clientId, request.Name ?? string.Empty);
}

public class RevokeApiTokenRequestHandler(SessionManager sessions, ApiTokens tokens, IGameMessenger messenger)
    : RequestHandlerBase<RevokeApiTokenRequest>
{
    protected override void Handle(uint clientId, RevokeApiTokenRequest request)
        => new ApiTokenRequests(sessions, tokens, messenger).Revoke(clientId, request.Id ?? string.Empty);
}

public class ListApiTokensRequestHandler(SessionManager sessions, ApiTokens tokens, IGameMessenger messenger)
    : RequestHandlerBase<ListApiTokensRequest>
{
    protected override void Handle(uint clientId, ListApiTokensRequest request)
        => new ApiTokenRequests(sessions, tokens, messenger).List(clientId);
}

public class GameViewRequestHandler(GameAnalytics analytics) : RequestHandlerBase<GameViewRequest>
{
    protected override void Handle(uint clientId, GameViewRequest request)
        => analytics.View(clientId, request.GameId ?? string.Empty, request.Source ?? string.Empty,
            request.VisitorId ?? string.Empty);
}

public class GamePlayBeatRequestHandler(GameAnalytics analytics) : RequestHandlerBase<GamePlayBeatRequest>
{
    protected override void Handle(uint clientId, GamePlayBeatRequest request) => analytics.Beat(clientId, request);
}

public class GamePlayEventsRequestHandler(GameAnalytics analytics) : RequestHandlerBase<GamePlayEventsRequest>
{
    protected override void Handle(uint clientId, GamePlayEventsRequest request)
        => analytics.Events(clientId, request.SessionId ?? string.Empty, request.Events ?? []);
}
