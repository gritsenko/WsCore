using System.Text.Json;
using Game.ServerLogic.Games.Events;
using Game.ServerLogic.Games.Requests;
using WsServer.Abstract;
using WsServer.Chat;
using WsServer.Sessions;

namespace WsServer.Games;

/// <summary>
/// Leaderboard requests from the socket (the page relaying a game's jam SDK calls, the
/// game page's board block and settings, the profile's "hide me"), and what follows a
/// change: the game's room is told (<c>LeaderboardChangedEvent</c>), and a new leader is
/// announced in its chat.
/// </summary>
public sealed class LeaderboardRequests
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = null };

    private readonly Leaderboards _boards;
    private readonly GameCatalog _catalog;
    private readonly SessionManager _sessions;
    private readonly UserDirectory _users;
    private readonly IGameMessenger _messenger;
    private readonly ChatHistoryService _chat;

    public LeaderboardRequests(Leaderboards boards, GameCatalog catalog, SessionManager sessions, UserDirectory users,
        IGameMessenger messenger, ChatHistoryService chat)
    {
        _boards = boards;
        _catalog = catalog;
        _sessions = sessions;
        _users = users;
        _messenger = messenger;
        _chat = chat;
        boards.Changed += (gameId, board) =>
            _messenger.BroadcastToRoom(GameCatalog.RoomIdOf(gameId), new LeaderboardChangedEvent { GameId = gameId, Board = board });
        boards.NewLeader += AnnounceLeader;
    }

    public void Handle(uint clientId, LeaderboardRequest r)
    {
        var user = _sessions.Get(clientId)?.User;
        var game = Visible(user, r.GameId ?? string.Empty);
        var name = (r.Board ?? string.Empty).Trim().ToLowerInvariant();
        LeaderboardReply reply;
        if (game == null)
            reply = LeaderboardReply.Fail(404, "no such game");
        else
        {
            reply = r.Op switch
            {
                "score" => _boards.Submit(game, user, name, r.Score, r.ExtraData),
                "entries" => _boards.Entries(game, user, name, r.Top, r.Around, r.IncludeUser),
                "player" => _boards.Player(game, user, name),
                "description" => _boards.Description(game, user, name),
                "boards" => LeaderboardReply.Of(_boards.Panel(game, user, Math.Clamp(r.Top, 1, Leaderboards.MaxTop))),
                _ => LeaderboardReply.Fail(400, "unknown operation"),
            };
        }
        Reply(clientId, r.RequestId, reply);
    }

    public void Configure(uint clientId, LeaderboardConfigRequest r)
    {
        var user = _sessions.Get(clientId)?.User;
        var game = Visible(user, r.GameId ?? string.Empty);
        var name = r.Board ?? string.Empty;
        LeaderboardReply reply;
        try
        {
            if (game == null)
                throw new GameRequestException(404, "not_found", "No such game");
            if (user == null || !(user.IsAdmin || user.Id == game.Game.OwnerUserId))
                throw new GameRequestException(403, "forbidden", "Boards are set up by the game's owner and server admins");
            reply = r.Action switch
            {
                "configure" => LeaderboardReply.Of(_boards.Configure(game, name, r.Title ?? string.Empty, r.InvertSortOrder,
                    r.ScoreType, r.DecimalOffset)),
                "reset" => LeaderboardReply.Of(new { removed = _boards.Reset(game, name) }),
                "delete" => Deleted(game, name),
                _ => LeaderboardReply.Fail(400, "unknown action"),
            };
        }
        catch (GameRequestException e)
        {
            reply = LeaderboardReply.Fail(e.Status, e.Code);
        }
        Reply(clientId, r.RequestId, reply);
    }

    private LeaderboardReply Deleted(GameView game, string name)
    {
        _boards.Delete(game, name);
        return LeaderboardReply.Of(new { deleted = true });
    }

    public void SetHidden(uint clientId, SetLeaderboardHiddenRequest r)
    {
        var user = _sessions.Get(clientId)?.User;
        if (user == null)
        {
            Reply(clientId, r.RequestId, LeaderboardReply.Fail(403, "not_identified"));
            return;
        }
        if (user.LeaderboardHidden != r.Hidden)
        {
            user.LeaderboardHidden = r.Hidden;
            _users.Save(user);
        }
        Reply(clientId, r.RequestId, LeaderboardReply.Of(new { hidden = user.LeaderboardHidden }));
    }

    private GameView? Visible(UserAccount? user, string gameId)
    {
        var game = _catalog.Find(gameId);
        return game != null && game.Id == gameId && GameCatalog.CanSee(user, game) ? game : null;
    }

    private void Reply(uint clientId, uint requestId, LeaderboardReply reply)
        => _messenger.Send(clientId, new LeaderboardResultEvent
        {
            RequestId = requestId,
            Ok = reply.Ok,
            Status = reply.Status,
            Error = reply.Error,
            ResultJson = reply.Ok ? JsonSerializer.Serialize(reply.Result, Json) : string.Empty,
        });

    // A new first place on a board, by somebody others can see: a line in the game's chat.
    private void AnnounceLeader(string gameId, Persistence.StoredLeaderboard board, UserAccount user, string score)
    {
        var roomId = GameCatalog.RoomIdOf(gameId);
        var who = user.Login != null ? $"@{user.Login}" : user.Name;
        var title = board.Title.Length > 0 ? board.Title : board.Name;
        var text = $"{who} — новый рекорд «{title}»: {score}";
        _messenger.BroadcastToRoom(roomId, _chat.Append(roomId, 0, 0, Leaderboards.RecordAuthor, text));
    }
}
