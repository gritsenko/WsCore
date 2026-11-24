using Game.ServerLogic.Account.Events;
using Game.ServerLogic.Account.Requests;
using Game.ServerLogic.Games.Events;
using Game.ServerLogic.Games.Requests;
using Game.ServerLogic.Presence.Events;
using Game.ServerLogic.Presence.Requests;
using Game.ServerLogic.Rooms.Events;
using Game.ServerLogic.Rooms.Requests;
using WsServer.Games;
using WsServer.Moderation;
using WsServer.Sessions;

namespace WsServer.Tests;

/// <summary>
/// The games portal on the server side: the catalog each connection sees (drafts only for
/// their owner and server admins), the hidden room every game is played in, releases, the
/// API tokens an agent publishes with — and all of it across a restart.
/// </summary>
public class GamesPortalTests
{
    private const string Password = "correct horse";

    private static ServerHarness NewHarness(string? db = null, Action<GameServerOptions>? configure = null) => new(o =>
    {
        o.AdminLogins = ["boss"];
        o.GamesOrigin = "https://play.example";
        o.PortalOrigins = ["https://tox.example"];
        if (db != null)
            o.ChatDatabasePath = db;
        configure?.Invoke(o);
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

    private static Task<T> OnTick<T>(ServerHarness h, Func<GameCatalog, UserAccount, T> action, uint userId)
        => h.Server.RunOnTickAsync(() =>
            action(h.Service<GameCatalog>(), h.Service<UserDirectory>().FindById(userId)!));

    private static Task<GameView> CreateGame(ServerHarness h, uint adminId, string title)
        => OnTick(h, (c, u) => c.Create(u, new GameFields(title, "One line", "A *game*", ["Arcade", "arcade", "puzzle"])), adminId);

    private static GameInfo[] Catalog(ServerHarness h, RecordingConnection conn)
        => h.Events<GameCatalogEvent>(conn).Last().Games.ToArray();

    [Fact]
    public async Task A_new_game_is_a_draft_seen_by_admins_only_until_published()
    {
        await using var h = NewHarness();
        var (boss, bossId) = await Join(h, "Boss", "boss");
        var (alice, _) = await Join(h, "Alice");
        var anonymous = await h.Connect();

        var game = await CreateGame(h, bossId, "Космический Котик");
        await h.Settle();

        Assert.Equal("kosmicheskiy-kotik", game.Game.Slug);
        Assert.Equal(["arcade", "puzzle"], game.Game.Tags);
        var draft = Assert.Single(Catalog(h, boss));
        Assert.False(draft.IsPublic);
        Assert.Equal("g-" + game.Id, draft.RoomId);
        Assert.Empty(Catalog(h, alice));
        Assert.Empty(Catalog(h, anonymous));

        await OnTick(h, (c, u) => c.SetPublic(u, game.Game.Slug, true), bossId);
        await h.Settle();

        Assert.True(Assert.Single(Catalog(h, alice)).IsPublic);
        Assert.Single(Catalog(h, anonymous));
    }

    [Fact]
    public async Task A_connection_gets_the_catalog_on_connect_and_again_after_identifying()
    {
        await using var h = NewHarness();
        var (_, bossId) = await Join(h, "Boss", "boss");
        await CreateGame(h, bossId, "Draft");

        var conn = await h.Connect();
        Assert.Empty(Catalog(h, conn)); // nobody yet: the public catalog

        await h.Request(conn, new IdentifyRequest { UserKey = "boss-key-0123456789abcdef", Name = "Boss" });
        Assert.Single(Catalog(h, conn)); // the admin sees the draft
    }

    [Fact]
    public async Task Only_server_admins_may_publish()
    {
        await using var h = NewHarness();
        var (_, aliceId) = await Join(h, "Alice", "alice");

        var e = await Assert.ThrowsAsync<GameRequestException>(() => CreateGame(h, aliceId, "Mine"));
        Assert.Equal(403, e.Status);
    }

    [Fact]
    public async Task The_game_room_is_hidden_and_private_while_the_game_is_a_draft()
    {
        await using var h = NewHarness();
        var (boss, bossId) = await Join(h, "Boss", "boss");
        var (alice, _) = await Join(h, "Alice");
        var game = await CreateGame(h, bossId, "Room test");

        await h.Request(alice, new JoinRoomRequest { RoomId = game.RoomId });
        Assert.False(h.Events<JoinRoomResultEvent>(alice).Last().Success);

        await h.Request(boss, new JoinRoomRequest { RoomId = game.RoomId });
        Assert.True(h.Events<JoinRoomResultEvent>(boss).Last().Success);
        Assert.DoesNotContain(h.Events<RoomListEvent>(boss).Last().Rooms, r => r.Id == game.RoomId);

        await OnTick(h, (c, u) => c.SetPublic(u, game.Id, true), bossId);
        await h.Request(alice, new JoinRoomRequest { RoomId = game.RoomId });
        Assert.True(h.Events<JoinRoomResultEvent>(alice).Last().Success);

        // Back to a draft: Alice is moved out to the lobby.
        await OnTick(h, (c, u) => c.SetPublic(u, game.Id, false), bossId);
        await h.Settle();
        Assert.Equal("lobby", h.Events<JoinRoomResultEvent>(alice).Last(e => e.Success).RoomId);
    }

    [Fact]
    public async Task Releases_get_increasing_numbers_and_the_last_one_is_played()
    {
        await using var h = NewHarness();
        var (boss, bossId) = await Join(h, "Boss", "boss");
        var game = await CreateGame(h, bossId, "Releases");

        var first = await OnTick(h, (c, u) => c.ReserveRelease(u, game.Id), bossId);
        var second = await OnTick(h, (c, u) => c.ReserveRelease(u, game.Id), bossId);
        Assert.Equal(1u, first.No);
        Assert.Equal(2u, second.No); // the first may still be uploading — never the same number
        Assert.EndsWith(Path.Combine(game.Id, "r2"), second.Directory);

        // The second one finishes first; the first is then committed too.
        await OnTick(h, (c, u) => c.CommitRelease(u, game.Id, 2, new UnpackedBuild("game/index.html", 3, 10, []),
            "0.2", "Faster\r\nfixes"), bossId);
        var (view, release) = await OnTick(h, (c, u) => c.CommitRelease(u, game.Id, 1,
            new UnpackedBuild("index.html", 1, 5, []), "", null), bossId);
        await h.Settle();

        Assert.Equal("v1", release.Version);
        Assert.Equal(2u, view.Current!.No);
        var info = Assert.Single(Catalog(h, boss));
        Assert.Equal(2u, info.ReleaseNo);
        Assert.Equal("0.2", info.Version);
        Assert.Equal($"https://play.example/g/{game.Id}/r2/game/index.html", info.PlayUrl);
        Assert.Equal("Faster\nfixes", view.Releases[1].Notes);
    }

    [Fact]
    public async Task Old_releases_beyond_the_kept_number_are_offered_for_deletion()
    {
        await using var h = NewHarness(configure: o => o.GameKeepReleases = 2);
        var (_, bossId) = await Join(h, "Boss", "boss");
        var game = await CreateGame(h, bossId, "Keep");
        for (var i = 0; i < 3; i++)
        {
            var r = await OnTick(h, (c, u) => c.ReserveRelease(u, game.Id), bossId);
            await OnTick(h, (c, u) => c.CommitRelease(u, game.Id, r.No, new UnpackedBuild("index.html", 1, 1, []), null, null), bossId);
        }

        var stale = await OnTick(h, (c, _) => c.StaleReleaseDirectories(game.Id), bossId);
        Assert.EndsWith(Path.Combine(game.Id, "r1"), Assert.Single(stale));
    }

    [Fact]
    public async Task Slugs_are_unique_and_validated()
    {
        await using var h = NewHarness();
        var (_, bossId) = await Join(h, "Boss", "boss");
        var a = await CreateGame(h, bossId, "Same");
        var b = await CreateGame(h, bossId, "Same");
        Assert.Equal("same", a.Game.Slug);
        Assert.Equal("same-2", b.Game.Slug);

        var bad = await Assert.ThrowsAsync<GameRequestException>(() =>
            OnTick(h, (c, u) => c.Update(u, b.Id, new GameFields(Slug: "Bad Slug")), bossId));
        Assert.Equal("bad_slug", bad.Code);
        var taken = await Assert.ThrowsAsync<GameRequestException>(() =>
            OnTick(h, (c, u) => c.Update(u, b.Id, new GameFields(Slug: "same")), bossId));
        Assert.Equal("slug_taken", taken.Code);

        var renamed = await OnTick(h, (c, u) => c.Update(u, "same-2", new GameFields(Title: "New title", Slug: "new-one")), bossId);
        Assert.Equal("New title", h.Service<WsServer.Rooms.RoomManager>().GetRoom(renamed.RoomId)!.Name);
        Assert.Same(renamed, h.Service<GameCatalog>().Find("new-one"));
    }

    [Fact]
    public async Task The_portal_is_off_without_a_games_origin()
    {
        await using var h = NewHarness(configure: o => o.GamesOrigin = string.Empty);
        var (boss, bossId) = await Join(h, "Boss", "boss");

        Assert.Empty(h.Events<GameCatalogEvent>(boss));
        var e = await Assert.ThrowsAsync<GameRequestException>(() => CreateGame(h, bossId, "Off"));
        Assert.Equal(503, e.Status);
    }

    // ---- API tokens ---------------------------------------------------------------------

    [Fact]
    public async Task An_admin_makes_lists_and_revokes_tokens_others_are_refused()
    {
        await using var h = NewHarness(configure: o => o.ApiTokensPerUser = 2);
        var (boss, bossId) = await Join(h, "Boss", "boss");
        var (alice, _) = await Join(h, "Alice", "alice");
        var tokens = h.Service<ApiTokens>();

        await h.Request(alice, new CreateApiTokenRequest { Name = "agent" });
        Assert.Equal("forbidden", h.Events<ApiTokensEvent>(alice).Last().Error);

        await h.Request(boss, new CreateApiTokenRequest { Name = "claude" });
        var created = h.Events<ApiTokensEvent>(boss).Last();
        Assert.StartsWith("tox_", created.NewToken);
        var info = Assert.Single(created.Tokens);
        Assert.Equal("claude", info.Name);
        Assert.Equal(bossId, tokens.Authenticate(created.NewToken));
        Assert.Null(tokens.Authenticate(created.NewToken + "x"));
        Assert.Null(tokens.Authenticate("not-a-token"));

        await h.Request(boss, new CreateApiTokenRequest { Name = "second" });
        await h.Request(boss, new CreateApiTokenRequest { Name = "third" });
        Assert.Equal("limit", h.Events<ApiTokensEvent>(boss).Last().Error);

        await h.Request(boss, new ListApiTokensRequest());
        var listed = h.Events<ApiTokensEvent>(boss).Last();
        Assert.Equal(2, listed.Tokens.Count);
        Assert.Empty(listed.NewToken);

        await h.Request(boss, new RevokeApiTokenRequest { Id = info.Id });
        Assert.Single(h.Events<ApiTokensEvent>(boss).Last().Tokens);
        Assert.Null(tokens.Authenticate(created.NewToken));
    }

    [Fact]
    public async Task A_token_unused_for_too_long_stops_working()
    {
        await using var h = NewHarness(configure: o => o.ApiTokenIdleDays = 1);
        var (_, bossId) = await Join(h, "Boss", "boss");
        var tokens = h.Service<ApiTokens>();
        var now = 1_000_000_000_000L;
        tokens.NowMs = () => now;
        var (token, _) = tokens.Create(bossId, "t")!.Value;

        now += 20 * 3600_000L;
        Assert.Equal(bossId, tokens.Authenticate(token)); // a use restarts the idle clock
        now += 20 * 3600_000L;
        Assert.Equal(bossId, tokens.Authenticate(token));
        now += 25 * 3600_000L;
        Assert.Null(tokens.Authenticate(token));
    }

    // ---- persistence --------------------------------------------------------------------

    [Fact]
    public async Task Games_releases_and_tokens_survive_a_restart()
    {
        using var db = new TempDatabase();
        string gameId, token;
        uint bossId;
        await using (var h = NewHarness(db.Path))
        {
            (_, bossId) = await Join(h, "Boss", "boss");
            var game = await CreateGame(h, bossId, "Persistent");
            gameId = game.Id;
            var r = await OnTick(h, (c, u) => c.ReserveRelease(u, gameId), bossId);
            await OnTick(h, (c, u) => c.CommitRelease(u, gameId, r.No, new UnpackedBuild("web/index.html", 4, 1234, []), "1.0", "First"), bossId);
            await OnTick(h, (c, u) => c.ReserveRelease(u, gameId), bossId); // reserved, never committed
            await OnTick(h, (c, u) => c.SetPublic(u, gameId, true), bossId);
            token = h.Service<ApiTokens>().Create(bossId, "agent")!.Value.Token;
            await h.Storage.FlushAsync();
        }

        await using (var h = NewHarness(db.Path))
        {
            var game = h.Service<GameCatalog>().Find(gameId)!;
            Assert.True(game.Game.IsPublic);
            Assert.Equal(["arcade", "puzzle"], game.Game.Tags);
            Assert.Equal(3u, game.Game.NextReleaseNo); // the reserved number stays used
            var release = Assert.Single(game.Releases);
            Assert.Equal(("1.0", "First", "web/index.html", 4, 1234L), (release.Version, release.Notes, release.EntryPath, release.Files, release.Bytes));
            Assert.Equal(bossId, h.Service<ApiTokens>().Authenticate(token));

            // The room is back, and public.
            var (alice, _) = await Join(h, "Alice");
            Assert.Single(Catalog(h, alice));
            await h.Request(alice, new JoinRoomRequest { RoomId = game.RoomId });
            Assert.True(h.Events<JoinRoomResultEvent>(alice).Last().Success);
        }
    }

    [Fact]
    public async Task A_draft_room_stays_private_after_a_restart()
    {
        using var db = new TempDatabase();
        string roomId;
        await using (var h = NewHarness(db.Path))
        {
            var (_, bossId) = await Join(h, "Boss", "boss");
            roomId = (await CreateGame(h, bossId, "Hidden")).RoomId;
            await h.Storage.FlushAsync();
        }
        await using (var h = NewHarness(db.Path))
        {
            Assert.True(h.Service<ChannelPermissions>().IsPrivate(roomId));
            var (alice, _) = await Join(h, "Alice");
            await h.Request(alice, new JoinRoomRequest { RoomId = roomId });
            Assert.False(h.Events<JoinRoomResultEvent>(alice).Last().Success);
        }
    }
}
