using System.Text.RegularExpressions;
using Game.ServerLogic.Games.Requests;
using WsServer.Persistence;
using WsServer.Sessions;

namespace WsServer.Games;

/// <summary>
/// The games portal's audience numbers — the jam portal's model (docs/engagement,
/// play.jsx usePlaySession) over our socket:
///  * <b>views</b> — a game's page opened; <b>launches</b> — a play session opened;
///  * <b>plays</b> — sessions with ≥ <see cref="GameServerOptions.GamePlayCountMinActiveSeconds"/>
///    of attention time (the number on the cards: a launch closed after three seconds is a
///    bounce, not a play);
///  * <b>attention time</b> — reported by the page (tab visible, window focused, no mock
///    ad) and never trusted as is: monotonic, never beyond the wall time the server itself
///    saw (+ a little slack), at most <see cref="GameServerOptions.GamePlayMaxSessionHours"/>;
///  * <b>events</b> the game reports through the bridge, with the jam portal's caps.
/// The game's own people (its owner, server admins) are kept apart: their sessions and
/// events are stored flagged <c>own</c> and their views and launches are not recorded, so
/// nobody inflates their own game and nobody's testing shows up as audience.
///
/// Tick thread only. A session belongs to the connection that opened it (a reconnect of
/// the same player takes it over); it ends with <see cref="GamePlayBeatRequest.Ended"/> or
/// silence (<see cref="GameServerOptions.GamePlaySessionTimeoutSeconds"/>).
/// </summary>
public sealed class GameAnalytics
{
    private const long WallSlackMs = 5_000;
    private const long MinBeatIntervalMs = 1_000;
    private const long ViewCooldownMs = 5_000;
    private const int MaxLevelLength = 64;
    private const int MaxParamsLength = 1024;
    public const string OtherEvent = "_other";

    private static readonly Regex SessionIdPattern = new("^[0-9a-f]{32}$", RegexOptions.CultureInvariant);
    private static readonly Regex VisitorIdPattern = new("^[A-Za-z0-9_-]{16,64}$", RegexOptions.CultureInvariant);
    private static readonly Regex EventNamePattern = new("^[a-z0-9_]{1,64}$", RegexOptions.CultureInvariant);

    private sealed class Counters
    {
        public long Views, Launches, Plays, ActiveMs;
    }

    private sealed class LiveSession
    {
        /// <summary>0 = orphaned: its connection is gone, a reconnect of the same player may resume it.</summary>
        public required uint ClientId;
        public required StoredPlaySession Stored;
        public long LastBeatMs;
        public int Events;
    }

    private readonly IChatStorage _storage;
    private readonly GameServerOptions _options;
    private readonly GameCatalog _catalog;
    private readonly SessionManager _sessions;
    private readonly ILogger<GameAnalytics> _logger;
    private readonly Dictionary<string, Counters> _counters = new();
    private readonly Dictionary<string, LiveSession> _live = new();
    private readonly Dictionary<string, HashSet<string>> _eventNames = new();
    private readonly Dictionary<(uint ClientId, string GameId), long> _lastView = new();
    private long _lastSweepMs;
    private long _lastCountsFlushMs;
    private bool _countsDirty;

    /// <summary>Replaceable in tests.</summary>
    public Func<long> NowMs { get; set; } = () => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    public GameAnalytics(IChatStorage storage, StorageSnapshot snapshot, GameServerOptions options,
        GameCatalog catalog, SessionManager sessions, ILogger<GameAnalytics> logger)
    {
        _storage = storage;
        _options = options;
        _catalog = catalog;
        _sessions = sessions;
        _logger = logger;
        foreach (var c in snapshot.GameCounters)
            _counters[c.GameId] = new Counters { Views = c.Views, Launches = c.Launches, Plays = c.Plays, ActiveMs = c.ActiveMs };
        catalog.PlaysOf = gameId => (uint)Math.Min(uint.MaxValue, _counters.GetValueOrDefault(gameId)?.Plays ?? 0);
    }

    /// <summary>All-time audience counters of a game (authors excluded).</summary>
    public StoredGameCounters CountersOf(string gameId)
    {
        var c = _counters.GetValueOrDefault(gameId) ?? new Counters();
        return new StoredGameCounters(gameId, c.Views, c.Launches, c.Plays, c.ActiveMs);
    }

    /// <summary>Sessions open right now (a diagnostic).</summary>
    public int LiveSessions => _live.Count;

    // ---- requests ---------------------------------------------------------------------

    public void View(uint clientId, string gameId, string source, string visitorId)
    {
        if (Resolve(clientId, gameId) is not { } resolved || resolved.Own)
            return;
        var (game, user, _) = resolved;
        var now = NowMs();
        var key = (clientId, game.Id);
        if (_lastView.TryGetValue(key, out var last) && now - last < ViewCooldownMs)
            return;
        _lastView[key] = now;

        Count(game.Id).Views++;
        Daily(game.Id, now, views: 1);
        _storage.AppendGameHit(new StoredGameHit(game.Id, "view", user?.Id ?? 0, Visitor(clientId, user, visitorId),
            CleanSource(source), now));
        SaveCounters(game.Id);
    }

    public void Beat(uint clientId, GamePlayBeatRequest request)
    {
        var id = request.SessionId ?? string.Empty;
        if (!SessionIdPattern.IsMatch(id))
            return;
        var now = NowMs();

        if (!_live.TryGetValue(id, out var live))
        {
            if (Resolve(clientId, request.GameId ?? string.Empty) is not { } resolved)
                return;
            var (game, user, own) = resolved;
            live = new LiveSession
            {
                ClientId = clientId,
                Stored = new StoredPlaySession(id, game.Id, request.ReleaseNo, now)
                {
                    UserId = user?.Id ?? 0,
                    VisitorId = Visitor(clientId, user, request.VisitorId ?? string.Empty),
                    Own = own,
                    Device = request.Device is "mobile" or "desktop" ? request.Device : string.Empty,
                    Source = CleanSource(request.Source ?? string.Empty),
                    LastSeenMs = now,
                },
                LastBeatMs = now,
            };
            _live[id] = live;
            if (!own)
            {
                Count(game.Id).Launches++;
                Daily(game.Id, now, launches: 1);
                _storage.AppendGameHit(new StoredGameHit(game.Id, "launch", live.Stored.UserId, live.Stored.VisitorId,
                    live.Stored.Source, now));
            }
        }
        else if (live.ClientId != clientId)
        {
            // Somebody else's session id — unless it is ours from before a reconnect.
            if (live.ClientId != 0 || !SamePlayer(clientId, live.Stored, request.VisitorId ?? string.Empty))
                return;
            live.ClientId = clientId;
        }
        else if (!request.Ended && now - live.LastBeatMs < MinBeatIntervalMs)
        {
            return;
        }
        live.LastBeatMs = now;

        Credit(live, request.ActiveMs, now);
        if (request.Ended)
            End(live);
        else
            _storage.SavePlaySession(live.Stored);
    }

    public void Events(uint clientId, string sessionId, IReadOnlyList<GamePlayEventData> events)
    {
        if (!_live.TryGetValue(sessionId ?? string.Empty, out var live) || live.ClientId != clientId)
            return; // events only ride a live session of this connection
        var now = NowMs();
        var gameId = live.Stored.GameId;
        var names = _eventNames.TryGetValue(gameId, out var known) ? known : _eventNames[gameId] = new HashSet<string>();
        var stored = new List<StoredPlayEvent>();
        foreach (var e in events.Take(_options.GameEventsPerRequest))
        {
            if (live.Events >= _options.GameEventsPerSession)
                break; // a game logging from its update loop: dropped
            var name = (e?.Name ?? string.Empty).Trim().ToLowerInvariant();
            if (!EventNamePattern.IsMatch(name))
                continue;
            if (!names.Contains(name))
            {
                if (names.Count >= _options.GameEventNamesPerGame)
                    name = OtherEvent; // dynamic names would turn the breakdown into noise
                else
                    names.Add(name);
            }
            live.Events++;
            stored.Add(new StoredPlayEvent(live.Stored.Id, gameId, live.Stored.Own, name,
                Truncate(e!.Level, MaxLevelLength), Truncate(e.Params, MaxParamsLength), now));
        }
        if (stored.Count > 0)
            _storage.AppendPlayEvents(stored);
    }

    /// <summary>
    /// The connection is gone: its sessions are orphaned — a reconnect of the same player
    /// resumes them (the game kept running in the page); otherwise they end on the timeout.
    /// </summary>
    public void Disconnect(uint clientId)
    {
        foreach (var live in _live.Values.Where(s => s.ClientId == clientId))
            live.ClientId = 0;
        foreach (var key in _lastView.Keys.Where(k => k.ClientId == clientId).ToList())
            _lastView.Remove(key);
    }

    /// <summary>Each tick: close silent sessions; re-send the catalog when play counts changed.</summary>
    public void Tick()
    {
        var now = NowMs();
        if (now - _lastSweepMs >= 5_000)
        {
            _lastSweepMs = now;
            var timeoutMs = (long)(_options.GamePlaySessionTimeoutSeconds * 1000);
            foreach (var live in _live.Values.Where(s => now - s.LastBeatMs > timeoutMs).ToList())
                End(live);
        }
        if (_countsDirty && now - _lastCountsFlushMs >= _options.GameCatalogCountsFlushSeconds * 1000)
        {
            _countsDirty = false;
            _lastCountsFlushMs = now;
            _catalog.BroadcastCatalog();
        }
    }

    // ---- internals --------------------------------------------------------------------

    private (GameView Game, UserAccount? User, bool Own)? Resolve(uint clientId, string gameId)
    {
        var session = _sessions.Get(clientId);
        if (session == null)
            return null;
        var game = _catalog.Find(gameId);
        if (game == null || game.Id != gameId)
            return null;
        var user = session.User;
        if (!GameCatalog.CanSee(user, game))
            return null;
        var own = user != null && (user.IsAdmin || user.Id == game.Game.OwnerUserId);
        return (game, user, own);
    }

    private bool SamePlayer(uint clientId, StoredPlaySession session, string visitorId)
    {
        var user = _sessions.Get(clientId)?.User;
        return session.UserId != 0
            ? user?.Id == session.UserId
            : user == null && session.VisitorId == Visitor(clientId, null, visitorId) && !session.VisitorId.StartsWith('c');
    }

    private void Credit(LiveSession live, double reportedMs, long now)
    {
        var s = live.Stored;
        var ceiling = Math.Min(now - s.StartedMs + WallSlackMs, (long)(_options.GamePlayMaxSessionHours * 3_600_000));
        var reported = double.IsFinite(reportedMs) ? (long)reportedMs : 0;
        var active = Math.Clamp(reported, s.ActiveMs, Math.Max(s.ActiveMs, ceiling));
        var delta = active - s.ActiveMs;
        var counted = s.Counted || active >= _options.GamePlayCountMinActiveSeconds * 1000;
        var newlyCounted = counted && !s.Counted;
        live.Stored = s with { ActiveMs = active, LastSeenMs = now, Counted = counted };

        if (s.Own || (delta == 0 && !newlyCounted))
            return;
        var c = Count(s.GameId);
        c.ActiveMs += delta;
        if (newlyCounted)
        {
            c.Plays++;
            _countsDirty = true;
        }
        Daily(s.GameId, now, plays: newlyCounted ? 1 : 0, activeMs: delta);
        SaveCounters(s.GameId);
    }

    private void End(LiveSession live)
    {
        live.Stored = live.Stored with { Ended = true };
        _storage.SavePlaySession(live.Stored);
        _live.Remove(live.Stored.Id);
    }

    private Counters Count(string gameId)
        => _counters.TryGetValue(gameId, out var c) ? c : _counters[gameId] = new Counters();

    private void SaveCounters(string gameId) => _storage.SaveGameCounters(CountersOf(gameId));

    // The game's row and the portal's (empty id) row of the day.
    private void Daily(string gameId, long now, long views = 0, long launches = 0, long plays = 0, long activeMs = 0)
    {
        var day = DayOf(now);
        _storage.AddGameDaily(new GameDailyDelta(gameId, day, views, launches, plays, activeMs));
        _storage.AddGameDaily(new GameDailyDelta(string.Empty, day, views, launches, plays, activeMs));
    }

    public static string DayOf(long ms) => DateTimeOffset.FromUnixTimeMilliseconds(ms).UtcDateTime.ToString("yyyy-MM-dd");

    // An identified user is counted as itself; an anonymous visitor by the random id its
    // browser keeps (or, without a usable one, this connection).
    private static string Visitor(uint clientId, UserAccount? user, string visitorId)
        => user != null ? string.Empty : VisitorIdPattern.IsMatch(visitorId) ? visitorId : $"c{clientId}";

    private static string CleanSource(string source)
        => source is "catalog" or "link" or "nav" or "chat" or "room" ? source : "other";

    private static string Truncate(string? value, int max)
    {
        value ??= string.Empty;
        return value.Length > max ? value[..max] : value;
    }
}
