using System.Text.Json;
using Game.ServerLogic.Account.Events;
using Game.ServerLogic.Account.Requests;
using Game.ServerLogic.Chat.Events;
using Game.ServerLogic.Games.Events;
using Game.ServerLogic.Games.Requests;
using Game.ServerLogic.Presence.Events;
using Game.ServerLogic.Presence.Requests;
using Game.ServerLogic.Rooms.Requests;
using WsServer.Games;
using WsServer.Sessions;

namespace WsServer.Tests;

/// <summary>
/// Games' leaderboards, as the jam portal (and the Yandex SDK shape it copies) defines
/// them: created by the first score, one best row per player, ranks on read, hidden
/// players, the authors flagged — and the wire answers the vendored SDK reads.
/// </summary>
public class LeaderboardTests
{
    private const string Password = "correct horse";

    private static ServerHarness NewHarness(string? db = null) => new(o =>
    {
        o.AdminLogins = ["boss"];
        o.GamesOrigin = "https://play.example";
        o.LeaderboardWriteCooldownSeconds = 0;
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

    private static Task<GameView> Game(ServerHarness h, uint adminId) => h.Server.RunOnTickAsync(() =>
    {
        var catalog = h.Service<GameCatalog>();
        var admin = h.Service<UserDirectory>().FindById(adminId)!;
        return catalog.SetPublic(admin, catalog.Create(admin, new GameFields("Boards")).Id, true);
    });

    private static JsonElement J(LeaderboardReply reply)
    {
        Assert.True(reply.Ok, reply.Error);
        return JsonSerializer.SerializeToElement(reply.Result);
    }

    private static Task<LeaderboardReply> OnTick(ServerHarness h, Func<Leaderboards, UserDirectory, LeaderboardReply> f)
        => h.Server.RunOnTickAsync(() => f(h.Service<Leaderboards>(), h.Service<UserDirectory>()));

    private static Task<LeaderboardReply> Score(ServerHarness h, GameView g, uint userId, double score, string board = "best", string? extra = null)
        => OnTick(h, (b, u) => b.Submit(g, u.FindById(userId), board, score, extra));

    private static Task<LeaderboardReply> Entries(ServerHarness h, GameView g, uint? viewer, int top = 10, int around = 3, bool includeUser = true, string board = "best")
        => OnTick(h, (b, u) => b.Entries(g, viewer is { } id ? u.FindById(id) : null, board, top, around, includeUser));

    private static string[] Names(JsonElement entries) => entries.EnumerateArray().Select(e => e.GetProperty("name").GetString()!).ToArray();

    [Fact]
    public async Task The_first_score_creates_the_board_and_each_player_keeps_their_best()
    {
        await using var h = NewHarness();
        var (_, bossId) = await Join(h, "Boss", "boss");
        var (_, aliceId) = await Join(h, "Alice");
        var g = await Game(h, bossId);

        var first = J(await Score(h, g, aliceId, 100.7, extra: "{\"level\":3}"));
        Assert.True(first.GetProperty("ok").GetBoolean());
        Assert.True(first.GetProperty("improved").GetBoolean());
        Assert.Equal(100, first.GetProperty("best").GetInt64()); // integers: floored
        Assert.Equal(1, first.GetProperty("rank").GetInt32());

        var worse = J(await Score(h, g, aliceId, 50, extra: "{\"level\":1}"));
        Assert.False(worse.GetProperty("improved").GetBoolean());
        Assert.Equal(100, worse.GetProperty("best").GetInt64());

        var mine = J(await OnTick(h, (b, u) => b.Player(g, u.FindById(aliceId), "best"))).GetProperty("entry");
        Assert.Equal(100, mine.GetProperty("score").GetInt64());
        Assert.Equal("{\"level\":3}", mine.GetProperty("extraData").GetString()); // the best's payload
        Assert.Equal(2, mine.GetProperty("submissions").GetInt32());
        Assert.True(mine.GetProperty("isPlayer").GetBoolean());
        Assert.Equal("Alice", mine.GetProperty("player").GetProperty("publicName").GetString());
        Assert.Equal(aliceId.ToString(), mine.GetProperty("player").GetProperty("uniqueID").GetString());
    }

    [Fact]
    public async Task Ranks_follow_the_order_ties_go_to_who_got_there_first()
    {
        await using var h = NewHarness();
        var (_, bossId) = await Join(h, "Boss", "boss");
        var (_, a) = await Join(h, "A");
        var (_, b) = await Join(h, "B");
        var (_, c) = await Join(h, "C");
        var g = await Game(h, bossId);
        var now = 1_000_000L;
        h.Service<Leaderboards>().NowMs = () => now++;

        await Score(h, g, a, 300);
        await Score(h, g, b, 500);
        await Score(h, g, c, 300);
        Assert.Equal(["B", "A", "C"], Names(J(await Entries(h, g, null)).GetProperty("entries")));

        // Lower is better (a time): the order turns over.
        await h.Server.RunOnTickAsync(() => h.Service<Leaderboards>().Configure(g, "best", "Время", true, "time", null));
        var board = J(await Entries(h, g, null));
        Assert.Equal(["A", "C", "B"], Names(board.GetProperty("entries")));
        Assert.Equal("0:00.300", board.GetProperty("entries")[0].GetProperty("formattedScore").GetString());
        Assert.Equal("Время", board.GetProperty("leaderboard").GetProperty("titleText").GetString());
        Assert.True(board.GetProperty("leaderboard").GetProperty("description").GetProperty("invert_sort_order").GetBoolean());
    }

    [Fact]
    public async Task Entries_give_the_top_and_a_window_around_the_player_below_it()
    {
        await using var h = NewHarness();
        var (_, bossId) = await Join(h, "Boss", "boss");
        var g = await Game(h, bossId);
        var ids = new List<uint>();
        for (var i = 1; i <= 8; i++)
        {
            var (_, id) = await Join(h, $"P{i}");
            ids.Add(id);
            await Score(h, g, id, 1000 - i); // P1 best … P8 worst
        }

        var me = J(await Entries(h, g, ids[5], top: 2, around: 1)); // P6, rank 6
        Assert.Equal(6, me.GetProperty("userRank").GetInt32());
        Assert.Equal(["P1", "P2", "P5", "P6", "P7"], Names(me.GetProperty("entries")));
        Assert.Equal("[{\"start\":0,\"size\":2},{\"start\":4,\"size\":3}]", me.GetProperty("ranges").GetRawText());
        Assert.Equal([1, 2, 5, 6, 7], me.GetProperty("entries").EnumerateArray().Select(e => e.GetProperty("rank").GetInt32()));

        // In the top already: no second block. Not asked for: none either.
        Assert.Single(J(await Entries(h, g, ids[1], top: 3, around: 1)).GetProperty("ranges").EnumerateArray());
        Assert.Equal(0, J(await Entries(h, g, ids[5], top: 2, includeUser: false)).GetProperty("userRank").GetInt32());
        Assert.Equal(8, J(await Entries(h, g, null)).GetProperty("leaderboard").GetProperty("entryCount").GetInt32());
    }

    [Fact]
    public async Task A_board_nobody_scored_on_reads_empty_but_its_player_and_description_are_404()
    {
        await using var h = NewHarness();
        var (_, bossId) = await Join(h, "Boss", "boss");
        var g = await Game(h, bossId);

        var empty = J(await Entries(h, g, bossId, board: "nobody"));
        Assert.Equal(0, empty.GetProperty("entries").GetArrayLength());
        Assert.Equal("nobody", empty.GetProperty("leaderboard").GetProperty("name").GetString());
        Assert.Equal(404, (await OnTick(h, (b, u) => b.Player(g, u.FindById(bossId), "nobody"))).Status);
        Assert.Equal(404, (await OnTick(h, (b, _) => b.Description(g, null, "nobody"))).Status);
    }

    [Fact]
    public async Task Refusals_are_values_not_errors()
    {
        await using var h = NewHarness();
        var (_, bossId) = await Join(h, "Boss", "boss");
        var (_, aliceId) = await Join(h, "Alice");
        var g = await Game(h, bossId);

        string Reason(LeaderboardReply r) => J(r).GetProperty("reason").GetString()!;
        Assert.Equal("not_signed_in", Reason(await OnTick(h, (b, _) => b.Submit(g, null, "best", 1, null))));
        Assert.Equal("bad_name", Reason(await Score(h, g, aliceId, 1, "Bad Name")));
        Assert.Equal("bad_score", Reason(await Score(h, g, aliceId, double.NaN)));
        Assert.Equal("bad_score", Reason(await Score(h, g, aliceId, 2e15)));
        for (var i = 0; i < Leaderboards.MaxBoardsPerGame; i++)
            await Score(h, g, aliceId, 1, $"b{i}");
        Assert.Equal("board_limit", Reason(await Score(h, g, aliceId, 1, "one_too_many")));
    }

    [Fact]
    public async Task Writes_are_rate_limited_per_player_and_board()
    {
        await using var h = new ServerHarness(o =>
        {
            o.GamesOrigin = "https://play.example";
            o.AdminLogins = ["boss"];
        });
        var (_, bossId) = await Join(h, "Boss", "boss");
        var (_, aliceId) = await Join(h, "Alice");
        var g = await Game(h, bossId);
        await Score(h, g, aliceId, 1);
        Assert.Equal("too_fast", J(await Score(h, g, aliceId, 2)).GetProperty("reason").GetString());
        Assert.True(J(await Score(h, g, aliceId, 2, "other")).GetProperty("ok").GetBoolean());
    }

    [Fact]
    public async Task The_authors_scores_are_kept_and_flagged()
    {
        await using var h = NewHarness();
        var (_, bossId) = await Join(h, "Boss", "boss");
        var (_, aliceId) = await Join(h, "Alice");
        var g = await Game(h, bossId);
        await Score(h, g, bossId, 999);
        await Score(h, g, aliceId, 10);

        var entries = J(await Entries(h, g, null)).GetProperty("entries");
        Assert.True(entries[0].GetProperty("own").GetBoolean());
        Assert.False(entries[1].GetProperty("own").GetBoolean());
        var panel = JsonSerializer.SerializeToElement(await h.Server.RunOnTickAsync(() => h.Service<Leaderboards>().Panel(g, null)));
        Assert.Equal(1, panel[0].GetProperty("ownCount").GetInt32());
    }

    [Fact]
    public async Task A_hidden_player_is_left_out_for_others_but_sees_themself()
    {
        await using var h = NewHarness();
        var (_, bossId) = await Join(h, "Boss", "boss");
        var (alice, aliceId) = await Join(h, "Alice");
        var (_, bobId) = await Join(h, "Bob");
        var g = await Game(h, bossId);
        await Score(h, g, aliceId, 100);
        await Score(h, g, bobId, 50);

        await h.Request(alice, new SetLeaderboardHiddenRequest { RequestId = 1, Hidden = true });
        Assert.Equal("{\"hidden\":true}", h.Events<LeaderboardResultEvent>(alice).Last().ResultJson);

        var others = J(await Entries(h, g, bobId));
        Assert.Equal(["Bob"], Names(others.GetProperty("entries")));
        Assert.Equal(1, others.GetProperty("userRank").GetInt32()); // ranks close up
        Assert.Equal(1, others.GetProperty("leaderboard").GetProperty("entryCount").GetInt32());

        var self = J(await Entries(h, g, aliceId));
        Assert.Equal(["Alice", "Bob"], Names(self.GetProperty("entries")));
        Assert.True(self.GetProperty("entries")[0].GetProperty("hiddenFromOthers").GetBoolean());

        // Writes are untouched: the game cannot tell.
        Assert.True(J(await Score(h, g, aliceId, 200)).GetProperty("improved").GetBoolean());
    }

    [Fact]
    public async Task A_new_leader_is_announced_in_the_games_room_and_the_room_hears_of_changes()
    {
        await using var h = NewHarness();
        var (_, bossId) = await Join(h, "Boss", "boss");
        var (alice, aliceId) = await Join(h, "Alice", "alice");
        var (bob, bobId) = await Join(h, "Bob");
        var g = await Game(h, bossId);
        await h.Request(alice, new JoinRoomRequest { RoomId = g.RoomId });
        await h.Request(bob, new JoinRoomRequest { RoomId = g.RoomId });

        await Score(h, g, aliceId, 100);
        await Score(h, g, bobId, 50);  // second: no announcement
        await Score(h, g, aliceId, 120); // still first: no announcement
        await Score(h, g, bobId, 500); // takes the lead
        await Score(h, g, bossId, 9999); // the author on top: not announced
        await h.Settle();

        var lines = h.Events<ChatMessageEvent>(bob).Where(m => m.Name == Leaderboards.RecordAuthor).Select(m => m.Message).ToArray();
        Assert.Equal(["@alice — новый рекорд «best»: 100", "Bob — новый рекорд «best»: 500"], lines);
        Assert.True(h.Events<LeaderboardChangedEvent>(alice).Count(e => e.GameId == g.Id && e.Board == "best") >= 4);
    }

    [Fact]
    public async Task Over_the_socket_the_answer_is_the_json_the_sdk_reads()
    {
        await using var h = NewHarness();
        var (_, bossId) = await Join(h, "Boss", "boss");
        var (alice, _) = await Join(h, "Alice");
        var anonymous = await h.Connect();
        var g = await Game(h, bossId);

        await h.Request(alice, new LeaderboardRequest { RequestId = 7, GameId = g.Id, Board = "best", Op = "score", Score = 42 });
        var scored = h.Events<LeaderboardResultEvent>(alice).Last();
        Assert.Equal((7u, true), (scored.RequestId, scored.Ok));
        Assert.Contains("\"best\":42", scored.ResultJson);

        await h.Request(anonymous, new LeaderboardRequest { RequestId = 8, GameId = g.Id, Board = "best", Op = "entries", Top = 5 });
        var read = JsonDocument.Parse(h.Events<LeaderboardResultEvent>(anonymous).Last().ResultJson).RootElement;
        Assert.Equal("Alice", read.GetProperty("entries")[0].GetProperty("player").GetProperty("publicName").GetString());
        Assert.Equal(g.Id, read.GetProperty("leaderboard").GetProperty("appID").GetString());

        await h.Request(anonymous, new LeaderboardRequest { RequestId = 9, GameId = g.Id, Board = "none", Op = "description" });
        var missing = h.Events<LeaderboardResultEvent>(anonymous).Last();
        Assert.Equal((false, 404), (missing.Ok, missing.Status));

        await h.Request(anonymous, new LeaderboardRequest { RequestId = 10, GameId = "nosuchgame", Board = "best", Op = "entries" });
        Assert.Equal(404, h.Events<LeaderboardResultEvent>(anonymous).Last().Status);

        // Settings are the game's people's.
        await h.Request(alice, new LeaderboardConfigRequest { RequestId = 11, GameId = g.Id, Board = "best", Action = "reset" });
        Assert.Equal(403, h.Events<LeaderboardResultEvent>(alice).Last().Status);
    }

    [Fact]
    public async Task Reset_keeps_the_board_delete_removes_it()
    {
        await using var h = NewHarness();
        var (_, bossId) = await Join(h, "Boss", "boss");
        var (_, aliceId) = await Join(h, "Alice");
        var g = await Game(h, bossId);
        await Score(h, g, aliceId, 5);

        Assert.Equal(1, await h.Server.RunOnTickAsync(() => h.Service<Leaderboards>().Reset(g, "best")));
        Assert.Equal(0, J(await Entries(h, g, null)).GetProperty("entries").GetArrayLength());
        Assert.True((await OnTick(h, (b, _) => b.Description(g, null, "best"))).Ok);

        await h.Server.RunOnTickAsync(() => { h.Service<Leaderboards>().Delete(g, "best"); return 0; });
        Assert.Equal(404, (await OnTick(h, (b, _) => b.Description(g, null, "best"))).Status);
    }

    [Fact]
    public async Task Boards_scores_and_the_hidden_flag_survive_a_restart()
    {
        using var db = new TempDatabase();
        GameView g;
        uint aliceId;
        await using (var h = NewHarness(db.Path))
        {
            var (_, bossId) = await Join(h, "Boss", "boss");
            RecordingConnection alice;
            (alice, aliceId) = await Join(h, "Alice");
            var (_, bobId) = await Join(h, "Bob");
            g = await Game(h, bossId);
            await Score(h, g, aliceId, 70, extra: "x");
            await Score(h, g, bobId, 90);
            await h.Server.RunOnTickAsync(() => h.Service<Leaderboards>().Configure(g, "best", "Очки", null, null, 1));
            await h.Request(alice, new SetLeaderboardHiddenRequest { Hidden = true });
            await h.Storage.FlushAsync();
        }
        await using (var h = NewHarness(db.Path))
        {
            var (alice, _) = await Join(h, "Alice");
            Assert.True(h.Events<PresenceSnapshotEvent>(alice).Single().YourLeaderboardHidden);
            var game = h.Service<GameCatalog>().Find(g.Id)!;
            var self = J(await Entries(h, game, aliceId));
            Assert.Equal(["Bob", "Alice"], Names(self.GetProperty("entries")));
            Assert.Equal("7.0", self.GetProperty("entries")[1].GetProperty("formattedScore").GetString());
            Assert.Equal("x", self.GetProperty("entries")[1].GetProperty("extraData").GetString());
            Assert.Equal("Очки", self.GetProperty("leaderboard").GetProperty("titleText").GetString());
            Assert.Equal(["Bob"], Names(J(await Entries(h, game, null)).GetProperty("entries")));
        }
    }

    [Theory]
    [InlineData(1234, "numeric", 0, "1234")]
    [InlineData(1234, "numeric", 2, "12.34")]
    [InlineData(5, "numeric", 2, "0.05")]
    [InlineData(-1234, "numeric", 2, "-12.34")]
    [InlineData(67400, "time", 0, "1:07.400")]
    [InlineData(60000, "time", 0, "1:00")]
    [InlineData(3723000, "time", 0, "1:02:03")]
    [InlineData(-500, "time", 0, "-0:00.500")]
    public void Scores_are_formatted_like_the_jam(long score, string type, int offset, string expected)
        => Assert.Equal(expected, Leaderboards.FormatScore(score, type, offset));
}
