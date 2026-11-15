using Game.ServerLogic.Chat.Events;
using Game.ServerLogic.Chat.Requests;
using Game.ServerLogic.Presence.Events;
using Game.ServerLogic.Presence.Requests;
using Game.ServerLogic.Rooms.Events;
using Game.ServerLogic.Rooms.Requests;

namespace WsServer.Tests;

/// <summary>
/// The member list: a connection that identifies is a user; users are online / away /
/// offline and stay listed after they leave.
/// </summary>
public class PresenceTests
{
    private const string AnnKey = "ann-key-0123456789abcdef";
    private const string BobKey = "bob-key-0123456789abcdef";

    private static async Task<(RecordingConnection Conn, PresenceSnapshotEvent Snapshot)> Join(
        ServerHarness h, string key, string name)
    {
        var conn = await h.Connect();
        await h.Request(conn, new IdentifyRequest { UserKey = key, Name = name });
        return (conn, h.Events<PresenceSnapshotEvent>(conn).Single());
    }

    private static PresenceUserInfo LastUpdate(ServerHarness h, RecordingConnection conn, uint userId)
        => h.Events<PresenceUpdateEvent>(conn).Last(e => e.User.UserId == userId).User;

    [Fact]
    public async Task Identify_NamesTheSession_AndAnswersWithTheMemberList()
    {
        await using var h = new ServerHarness();

        var (ann, snapshot) = await Join(h, AnnKey, "Ann");

        Assert.Equal("Ann", h.Sessions.Get(ann.Id)!.Name);
        Assert.NotEqual(0u, snapshot.YourUserId);
        var me = Assert.Single(snapshot.Users);
        Assert.Equal(snapshot.YourUserId, me.UserId);
        Assert.Equal("Ann", me.Name);
        Assert.Equal(PresenceStatus.Online, me.Status);
        Assert.Equal("lobby", me.RoomId);

        // The room's user list now carries the user id.
        var users = h.Events<RoomUsersUpdateEvent>(ann).Last().Users;
        Assert.Equal(snapshot.YourUserId, users.Single(u => u.ClientId == ann.Id).UserId);
    }

    [Fact]
    public async Task ADisconnectedUser_StaysInTheMemberList_AsOffline()
    {
        await using var h = new ServerHarness();
        var (ann, annSnapshot) = await Join(h, AnnKey, "Ann");
        var (bob, bobSnapshot) = await Join(h, BobKey, "Bob");
        var bobId = bobSnapshot.YourUserId;

        // Ann was told that Bob came online…
        Assert.Equal(PresenceStatus.Online, LastUpdate(h, ann, bobId).Status);

        var before = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        await h.Disconnect(bob);

        // …and that he went offline — he is not removed.
        var gone = LastUpdate(h, ann, bobId);
        Assert.Equal(PresenceStatus.Offline, gone.Status);
        Assert.Null(gone.RoomId);
        Assert.Equal("Bob", gone.Name);
        Assert.True(gone.LastSeenMs >= before);

        // Someone arriving later still sees him, offline.
        var (_, late) = await Join(h, "cy-key-0123456789abcdef", "Cy");
        Assert.Equal(PresenceStatus.Offline, late.Users.Single(u => u.UserId == bobId).Status);
        Assert.Equal(PresenceStatus.Online, late.Users.Single(u => u.UserId == annSnapshot.YourUserId).Status);
    }

    [Fact]
    public async Task Reconnecting_WithTheSameKey_IsTheSameUser()
    {
        await using var h = new ServerHarness();
        var (observer, _) = await Join(h, AnnKey, "Ann");
        var (bob, first) = await Join(h, BobKey, "Bob");
        await h.Disconnect(bob);

        var (bobAgain, second) = await Join(h, BobKey, "Bobby");

        Assert.NotEqual(bob.Id, bobAgain.Id); // a new connection…
        Assert.Equal(first.YourUserId, second.YourUserId); // …the same user
        var back = LastUpdate(h, observer, first.YourUserId);
        Assert.Equal(PresenceStatus.Online, back.Status);
        Assert.Equal("Bobby", back.Name);
    }

    [Fact]
    public async Task Away_IsAnnounced_AndClearedByActivity()
    {
        await using var h = new ServerHarness();
        var (ann, _) = await Join(h, AnnKey, "Ann");
        var (bob, bobSnapshot) = await Join(h, BobKey, "Bob");
        var bobId = bobSnapshot.YourUserId;

        await h.Request(bob, new SetAwayRequest { Away = true });
        var away = LastUpdate(h, ann, bobId);
        Assert.Equal(PresenceStatus.Away, away.Status);
        Assert.Equal("lobby", away.RoomId); // away is not gone: still in the room

        ann.Clear();
        await h.Request(bob, new SetAwayRequest { Away = true }); // no change → no broadcast
        Assert.Empty(h.Events<PresenceUpdateEvent>(ann));

        await h.Request(bob, new SetAwayRequest { Away = false });
        Assert.Equal(PresenceStatus.Online, LastUpdate(h, ann, bobId).Status);
    }

    [Fact]
    public async Task AwayToggles_AreRateLimited_ButTheFinalStateIsAnnounced()
    {
        await using var h = new ServerHarness(o => o.PresenceFlushIntervalSeconds = 0.3);
        var (ann, _) = await Join(h, AnnKey, "Ann");
        var (bob, bobSnapshot) = await Join(h, BobKey, "Bob");
        await h.Request(bob, new SetAwayRequest { Away = true }); // flushed at once (first)
        ann.Clear();

        // A burst of toggles inside one flush interval…
        for (var i = 0; i < 10; i++)
            h.Server.ProcessClientRequest(bob.Id, new SetAwayRequest { Away = i % 2 == 0 ? false : true });
        h.Server.ProcessClientRequest(bob.Id, new SetAwayRequest { Away = false });
        await h.Settle();
        Assert.Empty(h.Events<PresenceUpdateEvent>(ann));

        // …collapses into one announcement of where it ended up.
        var update = await h.WaitFor<PresenceUpdateEvent>(ann);
        Assert.Equal(PresenceStatus.Online, update.User.Status);
        await Task.Delay(400);
        Assert.Single(h.Events<PresenceUpdateEvent>(ann));
        Assert.Equal(bobSnapshot.YourUserId, update.User.UserId);
    }

    [Fact]
    public async Task MovingRooms_AndRenaming_UpdateTheMemberList_EvenForClientsInOtherRooms()
    {
        await using var h = new ServerHarness();
        var (ann, _) = await Join(h, AnnKey, "Ann");
        var (bob, bobSnapshot) = await Join(h, BobKey, "Bob");
        var bobId = bobSnapshot.YourUserId;

        await h.Request(bob, new JoinRoomRequest("game"));
        Assert.Equal("game", LastUpdate(h, ann, bobId).RoomId);

        // Bob (in the game) is told about Ann (in the lobby) too.
        await h.Request(ann, new Game.ServerLogic.Player.Requests.SetPlayerNameRequest { Name = "Annie" });
        Assert.Equal("Annie", h.Events<PresenceUpdateEvent>(bob).Last().User.Name);
    }

    [Fact]
    public async Task ASecondConnectionOfTheSameUser_KeepsThemOnline()
    {
        await using var h = new ServerHarness();
        var (observer, _) = await Join(h, AnnKey, "Ann");
        var (tab1, first) = await Join(h, BobKey, "Bob");
        var (tab2, second) = await Join(h, BobKey, "Bob");
        Assert.Equal(first.YourUserId, second.YourUserId);

        // One tab idle, the other active → online. Both idle → away.
        await h.Request(tab1, new SetAwayRequest { Away = true });
        Assert.Equal(PresenceStatus.Online, LastUpdate(h, observer, first.YourUserId).Status);
        await h.Request(tab2, new SetAwayRequest { Away = true });
        Assert.Equal(PresenceStatus.Away, LastUpdate(h, observer, first.YourUserId).Status);

        // Closing one tab does not take the user offline; closing the last one does.
        await h.Disconnect(tab1);
        Assert.NotEqual(PresenceStatus.Offline, LastUpdate(h, observer, first.YourUserId).Status);
        await h.Disconnect(tab2);
        Assert.Equal(PresenceStatus.Offline, LastUpdate(h, observer, first.YourUserId).Status);
    }

    [Theory]
    [InlineData("")]
    [InlineData("short")]
    [InlineData("has spaces in it 0123456789")]
    [InlineData("0123456789012345678901234567890123456789012345678901234567890123456789")]
    public async Task AMalformedKey_LeavesTheConnectionAnonymous(string key)
    {
        await using var h = new ServerHarness();
        var (ann, _) = await Join(h, AnnKey, "Ann");
        var anon = await h.Connect();
        ann.Clear();

        await h.Request(anon, new IdentifyRequest { UserKey = key, Name = "Mallory" });

        Assert.Null(h.Sessions.Get(anon.Id)!.User);
        Assert.Empty(h.Events<PresenceSnapshotEvent>(anon));
        Assert.Empty(h.Events<PresenceUpdateEvent>(ann));
        // Anonymous connections get no presence traffic at all.
        Assert.Empty(h.Events<PresenceUpdateEvent>(anon));
    }

    [Fact]
    public async Task ChatMessages_AreAttributedToTheUser()
    {
        await using var h = new ServerHarness();
        var (ann, snapshot) = await Join(h, AnnKey, "Ann");
        var anon = await h.Connect();

        await h.Request(ann, new ChatMessageRequest { Message = "from a user" });
        await h.Request(anon, new ChatMessageRequest { Message = "from a guest" });

        var live = h.Events<ChatMessageEvent>(anon);
        Assert.Equal(snapshot.YourUserId, live.Single(e => e.Message == "from a user").UserId);
        Assert.Equal("Ann", live.Single(e => e.Message == "from a user").Name);
        Assert.Equal(0u, live.Single(e => e.Message == "from a guest").UserId);
    }

    [Fact]
    public async Task Users_SurviveARestart_AsOffline_WithTheSameId()
    {
        using var db = new TempDatabase();
        uint bobId;
        await using (var first = new ServerHarness(o => o.ChatDatabasePath = db.Path))
        {
            var (_, snapshot) = await Join(first, BobKey, "Bob");
            bobId = snapshot.YourUserId;
        } // shutdown disconnects Bob: last-seen is stamped and flushed

        await using var second = new ServerHarness(o => o.ChatDatabasePath = db.Path);
        var (_, annSnapshot) = await Join(second, AnnKey, "Ann");

        var bob = annSnapshot.Users.Single(u => u.UserId == bobId);
        Assert.Equal("Bob", bob.Name);
        Assert.Equal(PresenceStatus.Offline, bob.Status);
        Assert.True(bob.LastSeenMs > 0);

        var (_, bobSnapshot) = await Join(second, BobKey, "Bob");
        Assert.Equal(bobId, bobSnapshot.YourUserId);
    }

    [Fact]
    public async Task TheSnapshot_ListsEveryoneOnline_ButOnlyTheMostRecentOfflineUsers()
    {
        await using var h = new ServerHarness(o => o.PresenceMaxOfflineUsers = 2);
        var keys = Enumerable.Range(0, 4).Select(i => $"user-{i}-0123456789abcdef").ToArray();
        var ids = new List<uint>();
        foreach (var key in keys)
        {
            var (conn, snapshot) = await Join(h, key, key[..6]);
            ids.Add(snapshot.YourUserId);
            await h.Disconnect(conn);
            await Task.Delay(5); // distinct last-seen times
        }
        var (_, online) = await Join(h, BobKey, "Bob");

        var (_, late) = await Join(h, AnnKey, "Ann");

        var offline = late.Users.Where(u => u.Status == PresenceStatus.Offline).Select(u => u.UserId);
        Assert.Equal([ids[3], ids[2]], offline); // newest first, capped at 2
        Assert.Contains(late.Users, u => u.UserId == online.YourUserId && u.Status == PresenceStatus.Online);
    }
}
