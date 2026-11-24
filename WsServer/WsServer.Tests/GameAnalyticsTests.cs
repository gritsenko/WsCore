using Game.ServerLogic.Account.Events;
using Game.ServerLogic.Account.Requests;
using Game.ServerLogic.Games.Events;
using Game.ServerLogic.Games.Requests;
using Game.ServerLogic.Presence.Events;
using Game.ServerLogic.Presence.Requests;
using WsServer.Games;
using WsServer.Persistence;
using WsServer.Sessions;

namespace WsServer.Tests;

/// <summary>
/// The games portal's numbers: plays (sessions past the threshold), attention time the
/// server clamps, launches and views, game events with their caps — never counting the
/// game's own people — and what the storage answers about a game's audience.
/// </summary>
public class GameAnalyticsTests
{
    private const string Password = "correct horse";
    private const long T0 = 1_800_000_000_000;

    private sealed class Clock
    {
        public long Now = T0;
    }

    private static ServerHarness NewHarness(string? db = null) => new(o =>
    {
        o.AdminLogins = ["boss"];
        o.GamesOrigin = "https://play.example";
        o.GameCatalogCountsFlushSeconds = 0;
        o.GameEventNamesPerGame = 3;
        o.GameEventsPerSession = 5;
        if (db != null)
            o.ChatDatabasePath = db;
    });

    private static async Task<(RecordingConnection Conn, uint UserId)> Join(ServerHarness h, string name, string? login = null)
    {
        var conn = await h.Connect();
        await h.Request(conn, new IdentifyRequest { UserKey = $"{name.ToLowerInvariant()}-key-0123456789abcdef", Name = name });
        var userId = h.Events<PresenceSnapshotEvent>(conn).Single().YourUserId;
        if (login != null)
        {
            await h.Request(conn, new ClaimAccountRequest { Login = login, Password = Password });
            await TestSupport.WaitUntil(() => h.Events<AccountResultEvent>(conn).Any(e => e.Success));
        }
        return (conn, userId);
    }

    private static async Task<(string GameId, Clock Clock)> PublishedGame(ServerHarness h, uint adminId)
    {
        var game = await h.Server.RunOnTickAsync(() =>
        {
            var catalog = h.Service<GameCatalog>();
            var admin = h.Service<UserDirectory>().FindById(adminId)!;
            var g = catalog.Create(admin, new GameFields("Counted"));
            return catalog.SetPublic(admin, g.Id, true);
        });
        var clock = new Clock();
        h.Service<GameAnalytics>().NowMs = () => clock.Now;
        return (game.Id, clock);
    }

    private static string Sid(int n) => n.ToString("x32");

    private static Task Beat(ServerHarness h, RecordingConnection conn, string gameId, string sessionId, double activeMs,
        bool ended = false, string visitor = "")
        => h.Request(conn, new GamePlayBeatRequest
        {
            GameId = gameId, SessionId = sessionId, ReleaseNo = 1, ActiveMs = activeMs, Device = "desktop",
            Source = "catalog", VisitorId = visitor, Ended = ended,
        });

    private static StoredGameCounters Counters(ServerHarness h, string gameId)
        => h.Service<GameAnalytics>().CountersOf(gameId);

    [Fact]
    public async Task A_session_becomes_a_play_after_15_seconds_of_attention()
    {
        await using var h = NewHarness();
        var (boss, bossId) = await Join(h, "Boss", "boss");
        var (alice, _) = await Join(h, "Alice");
        var (gameId, clock) = await PublishedGame(h, bossId);

        await Beat(h, alice, gameId, Sid(1), 0);
        Assert.Equal((1L, 0L), (Counters(h, gameId).Launches, Counters(h, gameId).Plays));

        clock.Now += 10_000;
        await Beat(h, alice, gameId, Sid(1), 10_000);
        Assert.Equal(0, Counters(h, gameId).Plays);

        clock.Now += 10_000;
        await Beat(h, alice, gameId, Sid(1), 16_000);
        Assert.Equal(1, Counters(h, gameId).Plays);
        Assert.Equal(16_000, Counters(h, gameId).ActiveMs);

        // Later beats of the same session do not count it again.
        clock.Now += 30_000;
        await Beat(h, alice, gameId, Sid(1), 40_000, ended: true);
        Assert.Equal(1, Counters(h, gameId).Plays);

        // The cards learn the count.
        await h.Settle();
        Assert.Equal(1u, h.Events<GameCatalogEvent>(boss).Last().Games.Single().Plays);
    }

    [Fact]
    public async Task The_games_own_people_are_never_counted()
    {
        await using var h = NewHarness();
        var (boss, bossId) = await Join(h, "Boss", "boss");
        var (gameId, clock) = await PublishedGame(h, bossId);

        await h.Request(boss, new GameViewRequest { GameId = gameId, Source = "catalog" });
        await Beat(h, boss, gameId, Sid(1), 0);
        clock.Now += 60_000;
        await Beat(h, boss, gameId, Sid(1), 60_000);

        Assert.Equal(new StoredGameCounters(gameId, 0, 0, 0, 0), Counters(h, gameId));
    }

    [Fact]
    public async Task Reported_time_is_clamped_monotonic_and_within_the_wall_clock()
    {
        await using var h = NewHarness();
        var (_, bossId) = await Join(h, "Boss", "boss");
        var (alice, _) = await Join(h, "Alice");
        var (gameId, clock) = await PublishedGame(h, bossId);

        await Beat(h, alice, gameId, Sid(1), 0);
        clock.Now += 10_000;
        await Beat(h, alice, gameId, Sid(1), 3_600_000); // an hour after ten seconds
        Assert.Equal(15_000, Counters(h, gameId).ActiveMs); // 10 s seen + 5 s slack
        Assert.Equal(1, Counters(h, gameId).Plays);

        clock.Now += 10_000;
        await Beat(h, alice, gameId, Sid(1), 1_000); // shrinking: ignored
        Assert.Equal(15_000, Counters(h, gameId).ActiveMs);

        await Beat(h, alice, gameId, Sid(1), double.NaN, ended: true);
        Assert.Equal(15_000, Counters(h, gameId).ActiveMs);
    }

    [Fact]
    public async Task A_session_belongs_to_its_connection_and_ends_with_it()
    {
        await using var h = NewHarness();
        var (_, bossId) = await Join(h, "Boss", "boss");
        var (alice, _) = await Join(h, "Alice");
        var (bob, _) = await Join(h, "Bob");
        var (gameId, clock) = await PublishedGame(h, bossId);

        await Beat(h, alice, gameId, Sid(7), 0);
        clock.Now += 20_000;
        await Beat(h, bob, gameId, Sid(7), 20_000); // Bob cannot credit Alice's session
        Assert.Equal(0, Counters(h, gameId).ActiveMs);

        // Alice's connection drops: the session waits for her (orphaned), Bob still cannot take it.
        await h.Disconnect(alice);
        Assert.Equal(1, h.Service<GameAnalytics>().LiveSessions);
        await Beat(h, bob, gameId, Sid(7), 20_000);
        Assert.Equal(0, Counters(h, gameId).ActiveMs);

        // Nonsense is ignored: a bad session id, an unknown game.
        await Beat(h, bob, gameId, "not-hex", 0);
        await Beat(h, bob, "nosuchgame", Sid(8), 0);
        Assert.Equal(1, Counters(h, gameId).Launches);
    }

    [Fact]
    public async Task A_reconnect_resumes_the_session_without_a_new_launch()
    {
        await using var h = NewHarness();
        var (_, bossId) = await Join(h, "Boss", "boss");
        var (alice, _) = await Join(h, "Alice");
        var (gameId, clock) = await PublishedGame(h, bossId);

        await Beat(h, alice, gameId, Sid(1), 0);
        clock.Now += 10_000;
        await Beat(h, alice, gameId, Sid(1), 10_000);
        await h.Disconnect(alice);

        clock.Now += 10_000;
        var (again, _) = await Join(h, "Alice"); // same key, new connection
        await Beat(h, again, gameId, Sid(1), 20_000);
        Assert.Equal((1L, 1L, 20_000L), (Counters(h, gameId).Launches, Counters(h, gameId).Plays, Counters(h, gameId).ActiveMs));

        // An anonymous visitor resumes by its visitor id.
        var visitor = await h.Connect();
        await Beat(h, visitor, gameId, Sid(2), 0, visitor: "visitor-0123456789abcdef");
        await h.Disconnect(visitor);
        var back = await h.Connect();
        clock.Now += 10_000;
        await Beat(h, back, gameId, Sid(2), 10_000, visitor: "visitor-0123456789abcdef");
        Assert.Equal((2L, 30_000L), (Counters(h, gameId).Launches, Counters(h, gameId).ActiveMs));
    }

    [Fact]
    public async Task A_silent_session_is_closed()
    {
        await using var h = NewHarness();
        var (_, bossId) = await Join(h, "Boss", "boss");
        var (alice, _) = await Join(h, "Alice");
        var (gameId, clock) = await PublishedGame(h, bossId);

        await Beat(h, alice, gameId, Sid(1), 0);
        clock.Now += 120_000;
        await h.Settle();
        Assert.Equal(0, h.Service<GameAnalytics>().LiveSessions);
    }

    [Fact]
    public async Task Views_count_once_per_opening_and_anonymous_visitors_count_too()
    {
        await using var h = NewHarness();
        var (_, bossId) = await Join(h, "Boss", "boss");
        var anonymous = await h.Connect();
        var (gameId, clock) = await PublishedGame(h, bossId);

        await h.Request(anonymous, new GameViewRequest { GameId = gameId, Source = "link", VisitorId = "visitor-0123456789abcdef" });
        await h.Request(anonymous, new GameViewRequest { GameId = gameId, Source = "link" }); // a double fire
        Assert.Equal(1, Counters(h, gameId).Views);
        clock.Now += 10_000;
        await h.Request(anonymous, new GameViewRequest { GameId = gameId, Source = "catalog" });
        Assert.Equal(2, Counters(h, gameId).Views);

        await Beat(h, anonymous, gameId, Sid(1), 0, visitor: "visitor-0123456789abcdef");
        Assert.Equal(1, Counters(h, gameId).Launches);
    }

    [Fact]
    public async Task A_draft_is_not_counted_for_those_who_may_not_see_it()
    {
        await using var h = NewHarness();
        var (_, bossId) = await Join(h, "Boss", "boss");
        var (alice, _) = await Join(h, "Alice");
        var draft = await h.Server.RunOnTickAsync(() => h.Service<GameCatalog>()
            .Create(h.Service<UserDirectory>().FindById(bossId)!, new GameFields("Draft")));

        await h.Request(alice, new GameViewRequest { GameId = draft.Id, Source = "link" });
        await Beat(h, alice, draft.Id, Sid(1), 0);
        Assert.Equal(new StoredGameCounters(draft.Id, 0, 0, 0, 0), Counters(h, draft.Id));
    }

    [Fact]
    public async Task Events_ride_a_live_session_within_the_caps()
    {
        using var db = new TempDatabase();
        await using var h = NewHarness(db.Path);
        var (_, bossId) = await Join(h, "Boss", "boss");
        var (alice, _) = await Join(h, "Alice");
        var (gameId, clock) = await PublishedGame(h, bossId);

        // No session yet: dropped.
        await h.Request(alice, new GamePlayEventsRequest { SessionId = Sid(1), Events = [new() { Name = "early" }] });
        await Beat(h, alice, gameId, Sid(1), 0);
        await h.Request(alice, new GamePlayEventsRequest
        {
            SessionId = Sid(1),
            Events =
            [
                new() { Name = "level_complete", Level = "1" },
                new() { Name = "boss_defeated", Params = "{\"boss\":\"slime\"}" },
                new() { Name = "Bad Name" },
                new() { Name = "shop_opened" },
                new() { Name = "fourth_name" }, // over the 3 names per game: folded
                new() { Name = "level_complete", Level = "2" },
                new() { Name = "over_session_cap" },
            ],
        });
        clock.Now += 30_000;
        await Beat(h, alice, gameId, Sid(1), 30_000);
        await h.Storage.FlushAsync();

        var stats = await Query(h, gameId);
        Assert.Equal(
            [new NamedCount("_other", 1), new NamedCount("boss_defeated", 1), new NamedCount("shop_opened", 1)],
            stats.Events.OrderBy(e => e.Name).ToArray());
        Assert.Equal([new NamedCount("1", 1), new NamedCount("2", 1)], stats.Levels);
    }

    private static Task<GameStatsData> Query(ServerHarness h, string gameId, long sinceMs = 0)
    {
        var done = new TaskCompletionSource<GameStatsData>(TaskCreationOptions.RunContinuationsAsynchronously);
        h.Storage.QueryGameStats(gameId, sinceMs, d => done.TrySetResult(d));
        return done.Task;
    }

    [Fact]
    public async Task The_storage_answers_days_sessions_players_and_sources()
    {
        using var db = new TempDatabase();
        await using var h = NewHarness(db.Path);
        var (_, bossId) = await Join(h, "Boss", "boss");
        var (alice, _) = await Join(h, "Alice");
        var anonymous = await h.Connect();
        var (gameId, clock) = await PublishedGame(h, bossId);

        // Day 1: Alice plays 20 s, a visitor 5 s; day 2: Alice again 2 min.
        await h.Request(alice, new GameViewRequest { GameId = gameId, Source = "catalog" });
        await h.Request(anonymous, new GameViewRequest { GameId = gameId, Source = "link", VisitorId = "visitor-0123456789abcdef" });
        await Beat(h, alice, gameId, Sid(1), 0);
        await Beat(h, anonymous, gameId, Sid(2), 0, visitor: "visitor-0123456789abcdef");
        clock.Now += 20_000;
        await Beat(h, alice, gameId, Sid(1), 20_000, ended: true);
        await Beat(h, anonymous, gameId, Sid(2), 5_000, ended: true, visitor: "visitor-0123456789abcdef");
        clock.Now += 86_400_000;
        await Beat(h, alice, gameId, Sid(3), 0);
        clock.Now += 120_000;
        await Beat(h, alice, gameId, Sid(3), 120_000, ended: true);
        await h.Storage.FlushAsync();

        var stats = await Query(h, gameId);
        Assert.Equal(2, stats.Days.Count);
        Assert.Equal((2L, 2L, 1L, 25_000L, 2L), (stats.Days[0].Views, stats.Days[0].Launches, stats.Days[0].Plays,
            stats.Days[0].ActiveMs, stats.Days[0].Players));
        Assert.Equal((0L, 1L, 1L, 120_000L, 1L), (stats.Days[1].Views, stats.Days[1].Launches, stats.Days[1].Plays,
            stats.Days[1].ActiveMs, stats.Days[1].Players));
        Assert.Equal([5_000L, 20_000L, 120_000L], stats.SessionActiveMs.OrderBy(x => x).ToArray());
        Assert.Equal((2L, 1L), (stats.Players, stats.ReturningPlayers)); // Alice came back
        Assert.Equal([new NamedCount("catalog", 1), new NamedCount("link", 1)], stats.Sources.OrderBy(s => s.Name).ToArray());

        // The portal as a whole has the same numbers here (one game).
        var portal = await Query(h, string.Empty);
        Assert.Equal(stats.Days.Select(d => d.Plays), portal.Days.Select(d => d.Plays));
        Assert.Equal(2, portal.Players);

        var summary = Games.GamesHttp.Summarize(stats.SessionActiveMs);
        Assert.Equal((3, 20_000L, 120_000L, 1, 0, 0), (summary.Sessions, summary.MedianMs, summary.LongestMs,
            summary.AtLeast1Min, summary.AtLeast3Min, summary.AtLeast10Min));
    }

    [Fact]
    public async Task Counters_survive_a_restart()
    {
        using var db = new TempDatabase();
        string gameId;
        await using (var h = NewHarness(db.Path))
        {
            var (_, bossId) = await Join(h, "Boss", "boss");
            var (alice, _) = await Join(h, "Alice");
            Clock clock;
            (gameId, clock) = await PublishedGame(h, bossId);
            await h.Request(alice, new GameViewRequest { GameId = gameId, Source = "catalog" });
            await Beat(h, alice, gameId, Sid(1), 0);
            clock.Now += 30_000;
            await Beat(h, alice, gameId, Sid(1), 30_000, ended: true);
            // An edit of the game afterwards must not reset the counters on its row.
            await h.Server.RunOnTickAsync(() => h.Service<GameCatalog>()
                .Update(h.Service<UserDirectory>().FindById(bossId)!, gameId, new GameFields(Tagline: "edited")));
            await h.Storage.FlushAsync();
        }
        await using (var h = NewHarness(db.Path))
        {
            Assert.Equal(new StoredGameCounters(gameId, 1, 1, 1, 30_000), Counters(h, gameId));
            var (alice, _) = await Join(h, "Alice");
            Assert.Equal(1u, h.Events<GameCatalogEvent>(alice).Last().Games.Single().Plays);
        }
    }
}
