using Game.ServerLogic.Chat.Events;
using Game.ServerLogic.Chat.Requests;
using Game.ServerLogic.Rooms.Requests;

namespace WsServer.Tests;

/// <summary>
/// Chat history end to end on the server: live messages carry ids, a room's history is
/// paged from the in-memory window and (beyond it) from the database, and it survives a
/// restart.
/// </summary>
public class ChatHistoryTests
{
    private static async Task Say(ServerHarness h, RecordingConnection conn, int count, string prefix = "m")
    {
        for (var i = 1; i <= count; i++)
            await h.Request(conn, new ChatMessageRequest { Message = $"{prefix}{i}" });
    }

    private static async Task<ChatHistoryEvent> History(
        ServerHarness h, RecordingConnection conn, uint beforeId = 0, uint afterId = 0, uint? epoch = null)
    {
        conn.Clear();
        epoch ??= h.Events<ChatHistoryEvent>(conn).LastOrDefault()?.Epoch;
        await h.Request(conn, new ChatHistoryRequest { BeforeId = beforeId, AfterId = afterId, Epoch = epoch ?? 0 });
        return await h.WaitFor<ChatHistoryEvent>(conn);
    }

    [Fact]
    public async Task LiveMessages_CarryIncreasingIds_Author_AndTimestamp()
    {
        await using var h = new ServerHarness();
        var a = await h.Connect();
        var before = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        await Say(h, a, 2);

        var live = h.Events<ChatMessageEvent>(a);
        Assert.Equal(["m1", "m2"], live.Select(e => e.Message));
        Assert.True(live[1].Id > live[0].Id && live[0].Id > 0);
        Assert.All(live, e =>
        {
            Assert.Equal(a.Id, e.ClientId);
            Assert.Equal(h.Sessions.Get(a.Id)!.Name, e.Name);
            Assert.InRange(e.SentAtMs, before, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        });
    }

    [Fact]
    public async Task ANewcomer_GetsTheLatestPage_AndPagesBackToTheStart()
    {
        await using var h = new ServerHarness(o => o.ChatHistoryPageSize = 4);
        var writer = await h.Connect();
        await Say(h, writer, 10);

        var late = await h.Connect();
        var latest = await History(h, late);

        Assert.True(latest.Reset);
        Assert.Equal("lobby", latest.RoomId);
        Assert.Equal(["m7", "m8", "m9", "m10"], latest.Messages.Select(m => m.Text));
        Assert.True(latest.HasMore);

        var older = await History(h, late, beforeId: latest.Messages[0].Id, epoch: latest.Epoch);
        Assert.False(older.Reset);
        Assert.Equal(latest.Messages[0].Id, older.BeforeId);
        Assert.Equal(["m3", "m4", "m5", "m6"], older.Messages.Select(m => m.Text));
        Assert.True(older.HasMore);

        var oldest = await History(h, late, beforeId: older.Messages[0].Id, epoch: latest.Epoch);
        Assert.Equal(["m1", "m2"], oldest.Messages.Select(m => m.Text));
        Assert.False(oldest.HasMore);
    }

    [Fact]
    public async Task CatchUp_ReturnsOnlyWhatWasMissed_OrResetsWhenTheGapIsTooLarge()
    {
        await using var h = new ServerHarness(o => o.ChatHistoryPageSize = 4);
        var writer = await h.Connect();
        var reader = await h.Connect();
        await Say(h, writer, 3);
        var known = await History(h, reader);
        var lastKnown = known.Messages[^1].Id;

        // Nothing new: an empty incremental answer, not a re-send of the page.
        var nothing = await History(h, reader, afterId: lastKnown, epoch: known.Epoch);
        Assert.False(nothing.Reset);
        Assert.Empty(nothing.Messages);

        await Say(h, writer, 2, "n");
        var missed = await History(h, reader, afterId: lastKnown, epoch: known.Epoch);
        Assert.False(missed.Reset);
        Assert.Equal(["n1", "n2"], missed.Messages.Select(m => m.Text));

        // More than a page behind: patching would leave a hole → the latest page instead.
        await Say(h, writer, 6, "x");
        var reset = await History(h, reader, afterId: lastKnown, epoch: known.Epoch);
        Assert.True(reset.Reset);
        Assert.Equal(["x3", "x4", "x5", "x6"], reset.Messages.Select(m => m.Text));
        Assert.True(reset.HasMore);
    }

    [Fact]
    public async Task AStaleEpoch_IsAnsweredWithAFreshLatestPage()
    {
        await using var h = new ServerHarness();
        var a = await h.Connect();
        await Say(h, a, 2);
        var current = await History(h, a);

        // Cursors from another id space (a server that lost its history) mean nothing here.
        var wrongEpoch = current.Epoch + 1;
        var after = await History(h, a, afterId: 999, epoch: wrongEpoch);
        var before = await History(h, a, beforeId: 1, epoch: wrongEpoch);

        Assert.All(new[] { after, before }, e =>
        {
            Assert.True(e.Reset);
            Assert.Equal(current.Epoch, e.Epoch);
            Assert.Equal(["m1", "m2"], e.Messages.Select(m => m.Text));
        });
    }

    [Fact]
    public async Task History_IsPerRoom()
    {
        await using var h = new ServerHarness();
        var lobby = await h.Connect();
        var game = await h.Connect();
        await h.Request(game, new JoinRoomRequest("game"));
        await Say(h, lobby, 2, "lobby");
        await Say(h, game, 1, "game");

        Assert.Equal(["lobby1", "lobby2"], (await History(h, lobby)).Messages.Select(m => m.Text));
        var gameHistory = await History(h, game);
        Assert.Equal("game", gameHistory.RoomId);
        Assert.Equal(["game1"], gameHistory.Messages.Select(m => m.Text));

        // Moving rooms moves which history a request reads.
        await h.Request(lobby, new JoinRoomRequest("game"));
        Assert.Equal(["game1"], (await History(h, lobby)).Messages.Select(m => m.Text));
    }

    [Fact]
    public async Task WithoutPersistence_HistoryIsTheInMemoryWindow()
    {
        await using var h = new ServerHarness(o =>
        {
            o.ChatHistoryPageSize = 4;
            o.ChatHistoryCacheSize = 8;
        });
        Assert.False(h.Storage.IsPersistent);
        var a = await h.Connect();
        await Say(h, a, 40);

        var latest = await History(h, a);
        Assert.Equal(["m37", "m38", "m39", "m40"], latest.Messages.Select(m => m.Text));

        // Page back until the server says there is nothing older: the window, never more.
        var seen = latest.Messages.Count;
        var page = latest;
        while (page.HasMore)
        {
            page = await History(h, a, beforeId: page.Messages[0].Id, epoch: latest.Epoch);
            seen += page.Messages.Count;
        }
        Assert.InRange(seen, 8, 8 + 16); // cache size + trim slack
    }

    [Fact]
    public async Task WithADatabase_DeepScrollBackReadsBeyondTheWindow()
    {
        using var db = new TempDatabase();
        await using var h = new ServerHarness(o =>
        {
            o.ChatDatabasePath = db.Path;
            o.ChatHistoryPageSize = 5;
            o.ChatHistoryCacheSize = 5;
        });
        Assert.True(h.Storage.IsPersistent);
        var a = await h.Connect();
        await Say(h, a, 60);

        // Walk the whole history backwards: window first, then the database.
        var texts = new List<string>();
        var page = await History(h, a);
        var epoch = page.Epoch;
        texts.InsertRange(0, page.Messages.Select(m => m.Text));
        while (page.HasMore)
        {
            page = await History(h, a, beforeId: page.Messages[0].Id, epoch: epoch);
            Assert.InRange(page.Messages.Count, 1, 5);
            texts.InsertRange(0, page.Messages.Select(m => m.Text));
        }

        Assert.Equal(Enumerable.Range(1, 60).Select(i => $"m{i}"), texts);
    }

    [Fact]
    public async Task History_SurvivesARestart()
    {
        using var db = new TempDatabase();
        uint epoch, lastId;
        await using (var first = new ServerHarness(o => o.ChatDatabasePath = db.Path))
        {
            var a = await first.Connect();
            await Say(first, a, 3);
            var page = await History(first, a);
            epoch = page.Epoch;
            lastId = page.Messages[^1].Id;
        } // graceful shutdown flushes the write-behind queue

        await using var second = new ServerHarness(o => o.ChatDatabasePath = db.Path);
        var b = await second.Connect();

        var restored = await History(second, b);
        Assert.Equal(epoch, restored.Epoch);
        Assert.Equal(["m1", "m2", "m3"], restored.Messages.Select(m => m.Text));

        // A client that was connected before the restart only needs what is new…
        var nothingNew = await History(second, b, afterId: lastId, epoch: epoch);
        Assert.False(nothingNew.Reset);
        Assert.Empty(nothingNew.Messages);

        // …and new messages continue the same id sequence.
        await Say(second, b, 1, "after");
        Assert.True(second.Events<ChatMessageEvent>(b).Single(e => e.Message == "after1").Id > lastId);
    }
}
