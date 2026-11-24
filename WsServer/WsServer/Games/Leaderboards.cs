using System.Text.RegularExpressions;
using WsServer.Persistence;
using WsServer.Sessions;

namespace WsServer.Games;

/// <summary>
/// The answer to a leaderboard operation: <see cref="Ok"/> false = the call itself failed
/// (<see cref="Status"/> 404: no such board yet), otherwise <see cref="Result"/> is the JSON
/// value the jam SDK expects (which may itself say <c>{ ok: false, reason }</c> for a score).
/// </summary>
public sealed record LeaderboardReply(bool Ok, int Status, string Error, object? Result)
{
    public static LeaderboardReply Of(object? result) => new(true, 200, string.Empty, result);
    public static LeaderboardReply Fail(int status, string error) => new(false, status, error, null);
}

/// <summary>
/// Games' leaderboards — the jam portal's (api/app/leaderboards.py), which are shaped like
/// the Yandex Games SDK's: a board is created by its first score; one row per board ×
/// player holding their best (<c>extraData</c> belongs to the best); ranks derived on read
/// (better score first, then whoever reached it earlier); a player who chose to be hidden
/// is left out of everybody else's reads (never out of the writes, nor their own reads).
/// Scores of the game's own people (owner, server admins) are kept and flagged <c>own</c>.
///
/// Everything lives in memory (tick thread; written behind to storage), so a read is a
/// walk over one sorted list — no I/O on the tick.
/// </summary>
public sealed class Leaderboards
{
    public const int MaxBoardsPerGame = 12;
    public const long MaxAbsScore = 1_000_000_000_000_000;
    public const int MaxExtraChars = 1024;
    public const int MaxTop = 100;
    public const int MaxAround = 10;
    public const int MaxDecimalOffset = 6;
    public const int MaxTitleLength = 120;
    public const string RecordAuthor = "Таблица рекордов";

    private static readonly Regex NamePattern = new("^[a-z0-9_]{1,64}$", RegexOptions.CultureInvariant);

    private sealed class Entry
    {
        public required uint UserId;
        public long Score;
        public string ExtraData = string.Empty;
        public int Submissions;
        public bool Own;
        public long CreatedMs;
        public long UpdatedMs;
    }

    private sealed class Board
    {
        public required StoredLeaderboard Stored;
        public readonly List<Entry> Entries = new(); // best first

        public void Sort() => Entries.Sort((a, b) =>
        {
            var byScore = Stored.InvertSortOrder ? a.Score.CompareTo(b.Score) : b.Score.CompareTo(a.Score);
            if (byScore != 0) return byScore;
            var byTime = a.UpdatedMs.CompareTo(b.UpdatedMs);
            return byTime != 0 ? byTime : a.UserId.CompareTo(b.UserId);
        });
    }

    private readonly IChatStorage _storage;
    private readonly UserDirectory _users;
    private readonly GameServerOptions _options;
    private readonly Dictionary<(string GameId, string Name), Board> _boards = new();
    private readonly Dictionary<(uint UserId, long BoardId), long> _lastWrite = new();
    private long _nextBoardId;

    /// <summary>Replaceable in tests.</summary>
    public Func<long> NowMs { get; set; } = () => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    /// <summary>A board's leader changed to a player others can see (the page announces it).</summary>
    public event Action<string, StoredLeaderboard, UserAccount, string>? NewLeader;

    /// <summary>A board's rows or settings changed (the game's room refreshes its boards).</summary>
    public event Action<string, string>? Changed;

    public Leaderboards(IChatStorage storage, StorageSnapshot snapshot, UserDirectory users, GameServerOptions options)
    {
        _storage = storage;
        _users = users;
        _options = options;
        var byId = new Dictionary<long, Board>();
        foreach (var b in snapshot.Leaderboards)
        {
            var board = new Board { Stored = b };
            byId[b.Id] = board;
            _boards[(b.GameId, b.Name)] = board;
            _nextBoardId = Math.Max(_nextBoardId, b.Id);
        }
        foreach (var e in snapshot.LeaderboardEntries)
        {
            if (byId.TryGetValue(e.BoardId, out var board))
            {
                board.Entries.Add(new Entry
                {
                    UserId = e.UserId, Score = e.Score, ExtraData = e.ExtraData, Submissions = e.Submissions,
                    Own = e.Own, CreatedMs = e.CreatedMs, UpdatedMs = e.UpdatedMs,
                });
            }
        }
        foreach (var board in byId.Values)
            board.Sort();
    }

    public static bool IsValidName(string name) => NamePattern.IsMatch(name);

    public IReadOnlyList<StoredLeaderboard> BoardsOf(string gameId)
        => _boards.Values.Where(b => b.Stored.GameId == gameId)
            .OrderBy(b => b.Stored.CreatedMs).ThenBy(b => b.Stored.Id).Select(b => b.Stored).ToList();

    // ---- the jam SDK's four operations -------------------------------------------------

    /// <summary>
    /// <c>setLeaderboardScore</c>: upsert the player's best, creating the board on first
    /// use. Always a value: <c>{ ok, improved, best, rank, board }</c> or
    /// <c>{ ok: false, reason }</c> — scores come from game-over handlers that never catch.
    /// </summary>
    public LeaderboardReply Submit(GameView game, UserAccount? user, string name, double score, string? extraData)
    {
        if (user == null)
            return LeaderboardReply.Of(new { ok = false, reason = "not_signed_in" });
        if (!IsValidName(name))
            return LeaderboardReply.Of(new { ok = false, reason = "bad_name" });
        if (!double.IsFinite(score) || Math.Abs(Math.Floor(score)) > MaxAbsScore)
            return LeaderboardReply.Of(new { ok = false, reason = "bad_score" });
        var value = (long)Math.Floor(score);
        var now = NowMs();

        if (!_boards.TryGetValue((game.Id, name), out var board))
        {
            if (_boards.Values.Count(b => b.Stored.GameId == game.Id) >= MaxBoardsPerGame)
                return LeaderboardReply.Of(new { ok = false, reason = "board_limit" });
            board = new Board { Stored = new StoredLeaderboard(++_nextBoardId, game.Id, name, now) };
            _boards[(game.Id, name)] = board;
            _storage.SaveLeaderboard(board.Stored);
        }

        var key = (user.Id, board.Stored.Id);
        if (_lastWrite.TryGetValue(key, out var last) && now - last < _options.LeaderboardWriteCooldownSeconds * 1000)
            return LeaderboardReply.Of(new { ok = false, reason = "too_fast" });
        _lastWrite[key] = now;

        var leaderBefore = VisibleLeader(board);
        var own = user.IsAdmin || user.Id == game.Game.OwnerUserId;
        var extra = (extraData ?? string.Empty).Length > MaxExtraChars ? extraData![..MaxExtraChars] : extraData ?? string.Empty;
        var entry = board.Entries.FirstOrDefault(e => e.UserId == user.Id);
        bool improved;
        if (entry == null)
        {
            entry = new Entry { UserId = user.Id, Score = value, ExtraData = extra, Submissions = 1, Own = own, CreatedMs = now, UpdatedMs = now };
            board.Entries.Add(entry);
            improved = true;
        }
        else
        {
            improved = board.Stored.InvertSortOrder ? value < entry.Score : value > entry.Score;
            entry.Submissions++;
            entry.Own |= own; // an author stays flagged
            if (improved)
            {
                entry.Score = value;
                entry.ExtraData = extra;
                entry.UpdatedMs = now;
            }
        }
        if (improved)
            board.Sort();
        Save(board, entry);

        if (improved)
        {
            Changed?.Invoke(game.Id, name);
            var leaderAfter = VisibleLeader(board);
            if (leaderAfter == entry && leaderBefore != entry && !entry.Own && !user.LeaderboardHidden)
                NewLeader?.Invoke(game.Id, board.Stored, user, FormatScore(entry.Score, board.Stored));
        }
        return LeaderboardReply.Of(new
        {
            ok = true,
            improved,
            best = entry.Score,
            rank = RankOf(board, entry, user.Id),
            board = name,
        });
    }

    /// <summary>
    /// <c>getLeaderboardEntries</c>: the top slice, plus a window around the viewer when
    /// they are below it; a board nobody scored on yet reads as empty (not an error).
    /// </summary>
    public LeaderboardReply Entries(GameView game, UserAccount? viewer, string name, int top, int around, bool includeUser)
    {
        if (!IsValidName(name))
            return LeaderboardReply.Fail(400, "bad name");
        if (!_boards.TryGetValue((game.Id, name), out var board))
        {
            var empty = new StoredLeaderboard(0, game.Id, name, 0);
            return LeaderboardReply.Of(new { leaderboard = Describe(empty, 0), ranges = Array.Empty<object>(), userRank = 0, entries = Array.Empty<object>() });
        }
        top = Math.Clamp(top, 0, MaxTop);
        around = Math.Clamp(around, 0, MaxAround);
        var viewerId = viewer?.Id ?? 0;
        var visible = Visible(board, viewerId);

        var topRows = visible.Take(top).ToList();
        var ranges = new List<object>();
        if (topRows.Count > 0)
            ranges.Add(new { start = 0, size = topRows.Count });
        var entries = topRows.Select((e, i) => Serialize(board, e, i + 1, viewerId)).ToList();

        var mine = includeUser && viewerId != 0 ? visible.FindIndex(e => e.UserId == viewerId) : -1;
        var myRank = mine >= 0 ? mine + 1 : 0;
        if (mine >= 0 && myRank > topRows.Count)
        {
            var start = Math.Max(topRows.Count, myRank - 1 - around);
            var size = Math.Min(around * 2 + 1, visible.Count - start);
            if (size > 0)
            {
                ranges.Add(new { start, size });
                entries.AddRange(visible.Skip(start).Take(size).Select((e, i) => Serialize(board, e, start + i + 1, viewerId)));
            }
        }
        return LeaderboardReply.Of(new { leaderboard = Describe(board.Stored, visible.Count), ranges, userRank = myRank, entries });
    }

    /// <summary>
    /// <c>getLeaderboardEntry</c>: <c>{ entry }</c> — null when the viewer has no score (or
    /// asks about a hidden player); a board that does not exist yet is a 404.
    /// </summary>
    public LeaderboardReply Player(GameView game, UserAccount? viewer, string name)
    {
        if (!_boards.TryGetValue((game.Id, name), out var board))
            return LeaderboardReply.Fail(404, "no such board");
        var viewerId = viewer?.Id ?? 0;
        var entry = viewerId == 0 ? null : board.Entries.FirstOrDefault(e => e.UserId == viewerId);
        return LeaderboardReply.Of(new
        {
            entry = entry == null ? null : Serialize(board, entry, RankOf(board, entry, viewerId), viewerId),
        });
    }

    /// <summary><c>getLeaderboardDescription</c>: the Yandex description; 404 for an unknown board.</summary>
    public LeaderboardReply Description(GameView game, UserAccount? viewer, string name)
        => _boards.TryGetValue((game.Id, name), out var board)
            ? LeaderboardReply.Of(Describe(board.Stored, Visible(board, viewer?.Id ?? 0).Count))
            : LeaderboardReply.Fail(404, "no such board");

    /// <summary>
    /// Every board of the game with its top rows and the viewer's own standing — the game
    /// page's block (the jam's <c>panel_payload</c>).
    /// </summary>
    public object Panel(GameView game, UserAccount? viewer, int top = 5)
    {
        var viewerId = viewer?.Id ?? 0;
        return _boards.Values.Where(b => b.Stored.GameId == game.Id)
            .OrderBy(b => b.Stored.CreatedMs).ThenBy(b => b.Stored.Id)
            .Select(board =>
            {
                var visible = Visible(board, viewerId);
                var mine = viewerId == 0 ? -1 : visible.FindIndex(e => e.UserId == viewerId);
                return new
                {
                    description = Describe(board.Stored, visible.Count),
                    entries = visible.Take(Math.Clamp(top, 0, MaxTop)).Select((e, i) => Serialize(board, e, i + 1, viewerId)).ToList(),
                    myRank = mine + 1,
                    myEntry = mine >= 0 ? Serialize(board, visible[mine], mine + 1, viewerId) : null,
                    ownCount = visible.Count(e => e.Own),
                };
            }).ToList();
    }

    // ---- the game's people: settings, reset, delete ------------------------------------

    /// <summary>Changes a board's title / order / score format (only what is given).</summary>
    public object Configure(GameView game, string name, string? title, bool? invertSortOrder, string? scoreType, int? decimalOffset)
    {
        var board = Existing(game, name);
        var s = board.Stored;
        board.Stored = s with
        {
            Title = title != null ? InputSanitizer.Clean(title, MaxTitleLength).Trim() : s.Title,
            InvertSortOrder = invertSortOrder ?? s.InvertSortOrder,
            ScoreType = scoreType is "numeric" or "time" ? scoreType : s.ScoreType,
            DecimalOffset = decimalOffset is { } d ? Math.Clamp(d, 0, MaxDecimalOffset) : s.DecimalOffset,
        };
        board.Sort();
        _storage.SaveLeaderboard(board.Stored);
        Changed?.Invoke(game.Id, name);
        return Describe(board.Stored, board.Entries.Count);
    }

    /// <summary>Wipes the scores (the authors' testing), keeping the board and its settings.</summary>
    public int Reset(GameView game, string name)
    {
        var board = Existing(game, name);
        var removed = board.Entries.Count;
        board.Entries.Clear();
        _storage.DeleteLeaderboardEntries(board.Stored.Id);
        Changed?.Invoke(game.Id, name);
        return removed;
    }

    /// <summary>Deletes a board (a name a build reported by mistake).</summary>
    public void Delete(GameView game, string name)
    {
        var board = Existing(game, name);
        _boards.Remove((game.Id, name));
        _storage.DeleteLeaderboard(board.Stored.Id);
        Changed?.Invoke(game.Id, name);
    }

    private Board Existing(GameView game, string name)
        => _boards.TryGetValue((game.Id, name), out var board)
            ? board
            : throw new GameRequestException(404, "no_board", "No such leaderboard");

    // ---- reading helpers ----------------------------------------------------------------

    private bool IsHidden(uint userId) => _users.FindById(userId)?.LeaderboardHidden ?? false;

    // The rows this viewer sees: everybody but the hidden — except the viewer's own.
    private List<Entry> Visible(Board board, uint viewerId)
        => board.Entries.Where(e => e.UserId == viewerId || !IsHidden(e.UserId)).ToList();

    private Entry? VisibleLeader(Board board) => board.Entries.FirstOrDefault(e => !IsHidden(e.UserId));

    private int RankOf(Board board, Entry entry, uint viewerId) => Visible(board, viewerId).IndexOf(entry) + 1;

    private void Save(Board board, Entry e) => _storage.SaveLeaderboardEntry(new StoredLeaderboardEntry(board.Stored.Id, e.UserId, e.Score)
    {
        ExtraData = e.ExtraData, Submissions = e.Submissions, Own = e.Own, CreatedMs = e.CreatedMs, UpdatedMs = e.UpdatedMs,
    });

    /// <summary>The Yandex <c>LeaderboardDescription</c> plus the jam's extras.</summary>
    public static object Describe(StoredLeaderboard b, int entryCount)
    {
        var label = b.Title.Length > 0 ? b.Title : b.Name;
        return new Dictionary<string, object?>
        {
            ["name"] = b.Name,
            ["appID"] = b.GameId,
            ["default"] = false,
            ["description"] = new Dictionary<string, object?>
            {
                ["invert_sort_order"] = b.InvertSortOrder,
                ["score_format"] = new Dictionary<string, object?>
                {
                    ["type"] = b.ScoreType,
                    ["options"] = new Dictionary<string, object?> { ["decimal_offset"] = b.DecimalOffset },
                },
                ["type"] = b.ScoreType,
            },
            ["title"] = new Dictionary<string, object?> { ["en"] = label, ["ru"] = label },
            ["titleText"] = label,
            ["titleRaw"] = b.Title,
            ["entryCount"] = entryCount,
            ["createdAt"] = b.CreatedMs > 0 ? Iso(b.CreatedMs) : null,
        };
    }

    // One row, Yandex-shaped (`player` with uniqueID / publicName / avatarUrl — the SDK
    // rebuilds getAvatarSrc() from it) plus the jam's flattened duplicates. The avatar URL
    // is a path: the page playing the game makes it absolute (it knows where avatars live).
    private object Serialize(Board board, Entry e, int rank, uint viewerId)
    {
        var user = _users.FindById(e.UserId);
        var name = user?.Name ?? "Игрок";
        var avatar = user is { AvatarVersion: > 0 } ? $"/avatars/{user.Id}?v={user.AvatarVersion}" : null;
        return new Dictionary<string, object?>
        {
            ["rank"] = rank,
            ["score"] = e.Score,
            ["formattedScore"] = FormatScore(e.Score, board.Stored),
            ["extraData"] = e.ExtraData.Length > 0 ? e.ExtraData : null,
            ["player"] = new Dictionary<string, object?>
            {
                ["uniqueID"] = e.UserId.ToString(),
                ["publicName"] = name,
                ["avatarUrl"] = avatar,
                ["lang"] = null,
                ["scopePermissions"] = new Dictionary<string, object?> { ["avatar"] = "allow", ["public_name"] = "allow" },
            },
            ["name"] = name,
            ["username"] = user?.Login,
            ["avatarUrl"] = avatar,
            ["color"] = null,
            ["studio"] = null,
            ["isPlayer"] = viewerId != 0 && e.UserId == viewerId,
            ["hiddenFromOthers"] = viewerId != 0 && e.UserId == viewerId && (user?.LeaderboardHidden ?? false),
            ["own"] = e.Own,
            ["submissions"] = e.Submissions,
            ["updatedAt"] = Iso(e.UpdatedMs),
        };
    }

    public static string FormatScore(long score, StoredLeaderboard board) => FormatScore(score, board.ScoreType, board.DecimalOffset);

    /// <summary>
    /// Yandex's <c>formattedScore</c> (the jam's <c>format_score</c>): <c>time</c> reads the
    /// integer as milliseconds (1:07.400, 1:02:03); <c>numeric</c> shifts the decimal point
    /// by <paramref name="decimalOffset"/> (1234 @ 2 → 12.34). No thousands separators.
    /// </summary>
    public static string FormatScore(long score, string scoreType, int decimalOffset)
    {
        var negative = score < 0;
        var n = Math.Abs(score);
        var sign = negative ? "-" : string.Empty;
        if (scoreType == "time")
        {
            var ms = n % 1000;
            var totalSeconds = n / 1000;
            var s = totalSeconds % 60;
            var m = totalSeconds / 60 % 60;
            var h = totalSeconds / 3600;
            var head = h > 0 ? $"{h}:{m:00}:{s:00}" : $"{m}:{s:00}";
            return sign + (ms > 0 ? $"{head}.{ms:000}" : head);
        }
        if (decimalOffset > 0)
        {
            var unit = (long)Math.Pow(10, decimalOffset);
            return $"{sign}{n / unit}.{(n % unit).ToString().PadLeft(decimalOffset, '0')}";
        }
        return score.ToString();
    }

    private static string Iso(long ms) => DateTimeOffset.FromUnixTimeMilliseconds(ms).ToString("O");
}
