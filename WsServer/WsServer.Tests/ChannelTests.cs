using Game.ServerLogic.Account.Events;
using Game.ServerLogic.Account.Requests;
using Game.ServerLogic.Chat.Events;
using Game.ServerLogic.Chat.Requests;
using Game.ServerLogic.Moderation.Events;
using Game.ServerLogic.Moderation.Requests;
using Game.ServerLogic.Presence.Events;
using Game.ServerLogic.Presence.Requests;
using Game.ServerLogic.Rooms.Events;
using Game.ServerLogic.Rooms.Requests;
using WsServer.Abstract.Messages;
using WsServer.Sessions;

namespace WsServer.Tests;

/// <summary>
/// Channels (= rooms) created by server admins: public or private, renamed, deleted, and
/// access to a private one given / taken away; plus the game room being left out of
/// room lists.
/// </summary>
public class ChannelTests
{
    private const string Password = "correct horse";

    private static ServerHarness NewHarness(string? db = null) => new(o =>
    {
        o.AdminLogins = ["boss"];
        o.ModerationRequestCooldownSeconds = 0;
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

    private static async Task<ModerationResultEvent> Do(ServerHarness h, RecordingConnection conn, IClientRequest request)
    {
        var before = h.Events<ModerationResultEvent>(conn).Length;
        await h.Request(conn, request);
        await TestSupport.WaitUntil(() => h.Events<ModerationResultEvent>(conn).Length > before);
        return h.Events<ModerationResultEvent>(conn).Last();
    }

    private static async Task<string> Create(ServerHarness h, RecordingConnection admin, string name, bool isPrivate)
    {
        var result = await Do(h, admin, new CreateChannelRequest { Name = name, IsPrivate = isPrivate });
        Assert.True(result.Success, result.Error);
        Assert.Equal(ModerationAction.CreateChannel, result.Action);
        return result.RoomId!;
    }

    // The latest room list the connection was sent (pushed or asked for).
    private static RoomInfo[] Rooms(ServerHarness h, RecordingConnection conn)
        => h.Events<RoomListEvent>(conn).Last().Rooms.ToArray();

    private static async Task<JoinRoomResultEvent> Enter(ServerHarness h, RecordingConnection conn, string roomId)
    {
        await h.Request(conn, new JoinRoomRequest(roomId));
        return h.Events<JoinRoomResultEvent>(conn).Last();
    }

    private static string? RoomOf(ServerHarness h, RecordingConnection conn)
        => h.Server.GetRoomManager().GetClientRoom(conn.Id)?.Id;

    [Fact]
    public async Task OnlyAServerAdmin_CreatesChannels_AndTheNameIsChecked()
    {
        await using var h = NewHarness();
        var (boss, _) = await Join(h, "Boss", "boss");
        var (bob, _) = await Join(h, "Bob", "bob");

        Assert.Equal(ModerationError.Forbidden, (await Do(h, bob, new CreateChannelRequest { Name = "x" })).Error);
        Assert.Equal(ModerationError.BadName, (await Do(h, boss, new CreateChannelRequest { Name = "  \n " })).Error);

        var id = await Create(h, boss, "Новости", isPrivate: false);
        var room = Assert.Single(Rooms(h, bob), r => r.Id == id);
        Assert.Equal(("Новости", false, true), (room.Name, room.IsPrivate, room.IsCreated));
        Assert.True((await Enter(h, bob, id)).Success);
    }

    [Fact]
    public async Task APrivateChannel_IsSeenAndEnteredOnlyWithAccess()
    {
        await using var h = NewHarness();
        var (boss, _) = await Join(h, "Boss", "boss");
        var (bob, bobId) = await Join(h, "Bob");
        var anonymous = await h.Connect();

        var id = await Create(h, boss, "Штаб", isPrivate: true);
        Assert.Contains(Rooms(h, boss), r => r.Id == id && r.IsPrivate);
        Assert.DoesNotContain(Rooms(h, bob), r => r.Id == id);
        Assert.DoesNotContain(Rooms(h, anonymous), r => r.Id == id);
        // Its permissions never reach someone who may not see it.
        Assert.DoesNotContain(h.Events<ChannelPermissionsEvent>(bob).SelectMany(e => e.Channels), c => c.RoomId == id);

        var refused = await Enter(h, bob, id);
        Assert.Equal((false, ModerationError.NoAccess), (refused.Success, refused.Error));
        Assert.Equal(ModerationError.NoAccess, (await Enter(h, anonymous, id)).Error);

        // Access given: the room shows up, can be entered, its permissions arrive.
        Assert.True((await Do(h, boss, new SetChannelAccessRequest { RoomId = id, UserId = bobId, HasAccess = true })).Success);
        Assert.Contains(Rooms(h, bob), r => r.Id == id);
        var channel = h.Events<ChannelPermissionsEvent>(bob).SelectMany(e => e.Channels).Last(c => c.RoomId == id);
        Assert.True(channel.IsPrivate);
        Assert.Equal([bobId], channel.Members);
        Assert.True((await Enter(h, bob, id)).Success);
        // Presence does not tell where a private channel's members are.
        var seen = h.Events<PresenceUpdateEvent>(boss).Last(e => e.User.UserId == bobId).User;
        Assert.Null(seen.RoomId);

        // Access taken away while inside: back to the home room, the room is gone from the list.
        Assert.True((await Do(h, boss, new SetChannelAccessRequest { RoomId = id, UserId = bobId, HasAccess = false })).Success);
        Assert.Equal(SessionManager.DefaultRoomId, RoomOf(h, bob));
        Assert.DoesNotContain(Rooms(h, bob), r => r.Id == id);
    }

    [Fact]
    public async Task AccessIsGivenWithTheInviteRight_AndAChannelAdminSeesThePrivateChannel()
    {
        await using var h = NewHarness();
        var (boss, _) = await Join(h, "Boss", "boss");
        var (bob, bobId) = await Join(h, "Bob", "bob");
        var (_, cyId) = await Join(h, "Cy");
        var id = await Create(h, boss, "Штаб", isPrivate: true);

        // A channel admin sees the channel; without InviteUsers they cannot let others in.
        await Do(h, boss, new SetChannelAdminRequest { RoomId = id, UserId = bobId, Rights = ChannelRights.DeleteMessages });
        Assert.Contains(Rooms(h, bob), r => r.Id == id);
        Assert.Equal(ModerationError.Forbidden,
            (await Do(h, bob, new SetChannelAccessRequest { RoomId = id, UserId = cyId, HasAccess = true })).Error);

        await Do(h, boss, new SetChannelAdminRequest
        {
            RoomId = id, UserId = bobId, Rights = ChannelRights.DeleteMessages | ChannelRights.InviteUsers,
        });
        Assert.True((await Do(h, bob, new SetChannelAccessRequest { RoomId = id, UserId = cyId, HasAccess = true })).Success);

        // Demoted (and never given access): the channel disappears for them.
        await Do(h, boss, new SetChannelAdminRequest { RoomId = id, UserId = bobId, Rights = 0 });
        Assert.DoesNotContain(Rooms(h, bob), r => r.Id == id);
    }

    [Fact]
    public async Task MakingAChannelPrivate_SendsOutThoseWithoutAccess_AndItCanBeRenamed()
    {
        await using var h = NewHarness();
        var (boss, _) = await Join(h, "Boss", "boss");
        var (bob, _) = await Join(h, "Bob");
        var id = await Create(h, boss, "Общий 2", isPrivate: false);
        await Enter(h, bob, id);
        await Enter(h, boss, id);

        var result = await Do(h, boss, new UpdateChannelRequest { RoomId = id, Name = "Тайный", IsPrivate = true });
        Assert.True(result.Success, result.Error);
        Assert.Equal(SessionManager.DefaultRoomId, RoomOf(h, bob));
        Assert.Equal(id, RoomOf(h, boss)); // a server admin stays
        Assert.Contains(Rooms(h, boss), r => r.Id == id && r.Name == "Тайный" && r.IsPrivate);
        Assert.DoesNotContain(Rooms(h, bob), r => r.Id == id);

        // Public again: everyone sees it.
        await Do(h, boss, new UpdateChannelRequest { RoomId = id, Name = "Тайный", IsPrivate = false });
        Assert.Contains(Rooms(h, bob), r => r.Id == id && !r.IsPrivate);
    }

    [Fact]
    public async Task DeletingAChannel_SendsEveryoneHome_AndBuiltInRoomsCannotBeChanged()
    {
        await using var h = NewHarness();
        var (boss, _) = await Join(h, "Boss", "boss");
        var (bob, _) = await Join(h, "Bob");
        var id = await Create(h, boss, "Временный", isPrivate: false);
        await Enter(h, bob, id);
        await h.Request(bob, new ChatMessageRequest { Message = "hi" });

        Assert.Equal(ModerationError.Forbidden, (await Do(h, bob, new DeleteChannelRequest { RoomId = id })).Error);
        Assert.True((await Do(h, boss, new DeleteChannelRequest { RoomId = id })).Success);
        Assert.Equal(SessionManager.DefaultRoomId, RoomOf(h, bob));
        Assert.DoesNotContain(Rooms(h, bob), r => r.Id == id);
        Assert.Null(h.Server.GetRoomManager().GetRoom(id));
        Assert.Equal("Room not found", (await Enter(h, bob, id)).Error);

        Assert.Equal(ModerationError.BuiltIn, (await Do(h, boss, new DeleteChannelRequest { RoomId = "lobby" })).Error);
        Assert.Equal(ModerationError.BuiltIn,
            (await Do(h, boss, new UpdateChannelRequest { RoomId = "voice", Name = "x", IsPrivate = true })).Error);
    }

    [Fact]
    public async Task Channels_Access_AndHistory_SurviveARestart_AndADeletedChannelStaysGone()
    {
        using var db = new TempDatabase();
        string kept, deleted;
        uint bobId;
        await using (var first = NewHarness(db.Path))
        {
            var (boss, _) = await Join(first, "Boss", "boss");
            var (bob, id) = await Join(first, "Bob");
            bobId = id;
            kept = await Create(first, boss, "Штаб", isPrivate: true);
            deleted = await Create(first, boss, "Мусор", isPrivate: false);
            await Do(first, boss, new SetChannelAccessRequest { RoomId = kept, UserId = bobId, HasAccess = true });
            await Enter(first, bob, kept);
            await first.Request(bob, new ChatMessageRequest { Message = "секрет" });
            await Enter(first, bob, deleted);
            await first.Request(bob, new ChatMessageRequest { Message = "мусор" });
            await Do(first, boss, new DeleteChannelRequest { RoomId = deleted });
        }

        await using var second = NewHarness(db.Path);
        var (bob2, _) = await Join(second, "Bob");
        var (dee, _) = await Join(second, "Dee");
        await second.Request(bob2, new GetRoomListRequest());
        await second.Request(dee, new GetRoomListRequest());
        Assert.Contains(Rooms(second, bob2), r => r.Id == kept && r.Name == "Штаб" && r.IsPrivate && r.IsCreated);
        Assert.DoesNotContain(Rooms(second, dee), r => r.Id == kept);
        Assert.DoesNotContain(Rooms(second, bob2), r => r.Id == deleted);

        Assert.True((await Enter(second, bob2, kept)).Success);
        await second.Request(bob2, new ChatHistoryRequest());
        Assert.Contains(second.Events<ChatHistoryEvent>(bob2).Last().Messages, m => m.Text == "секрет");
    }
}
