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
using WsServer.Moderation;

namespace WsServer.Tests;

/// <summary>
/// Roles and permissions per channel (Telegram-style): server admins (configured or
/// appointed), channel admins with rights and a title, default member permissions,
/// restrictions (mute / no links / ban, timed or not) and message deletion.
/// </summary>
public class ModerationTests
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

    private static ChannelPermissionsInfo Channel(ServerHarness h, RecordingConnection conn, string roomId)
        => h.Events<ChannelPermissionsEvent>(conn).SelectMany(e => e.Channels).Last(c => c.RoomId == roomId);

    private static PresenceUserInfo Presence(ServerHarness h, RecordingConnection conn, uint userId)
        => h.Events<PresenceUpdateEvent>(conn).Select(e => e.User)
            .Concat(h.Events<PresenceSnapshotEvent>(conn).SelectMany(s => s.Users))
            .Last(u => u.UserId == userId);

    private static async Task<ChatMessageEvent?> Say(ServerHarness h, RecordingConnection conn, string text)
    {
        var before = h.Events<ChatMessageEvent>(conn).Length;
        await h.Request(conn, new ChatMessageRequest { Message = text });
        return h.Events<ChatMessageEvent>(conn).Skip(before).LastOrDefault();
    }

    [Fact]
    public async Task AConfiguredLogin_BecomesServerAdmin_AndPresenceCarriesLoginAndRole()
    {
        await using var h = NewHarness();
        var (bob, bobId) = await Join(h, "Bob", "bob");
        var (boss, bossId) = await Join(h, "Boss", "boss");

        var seen = Presence(h, bob, bossId);
        Assert.Equal(("boss", true), (seen.Login, seen.IsAdmin));
        Assert.Equal(("bob", false), (Presence(h, boss, bobId).Login, Presence(h, boss, bobId).IsAdmin));

        // Every identified connection gets every channel's permissions.
        var snapshot = h.Events<ChannelPermissionsEvent>(boss).First();
        Assert.True(snapshot.Reset);
        Assert.Equal(["lobby", "voice", "game"], snapshot.Channels.Select(c => c.RoomId));
        Assert.All(snapshot.Channels, c => Assert.Equal(MemberPermissions.All, c.DefaultPermissions));
    }

    [Fact]
    public async Task ChannelAdmins_GrantOnlyWhatTheyHave_AndOnlyToClaimedAccounts()
    {
        await using var h = NewHarness();
        var (boss, _) = await Join(h, "Boss", "boss");
        var (bob, bobId) = await Join(h, "Bob", "bob");
        var (cy, cyId) = await Join(h, "Cy", "cyrus");
        var (_, guestId) = await Join(h, "Guest");

        var promote = await Do(h, boss, new SetChannelAdminRequest
        {
            RoomId = "lobby", UserId = bobId, Rights = ChannelRights.DeleteMessages | ChannelRights.AddAdmins, Title = "модератор",
        });
        Assert.True(promote.Success);
        var admin = Assert.Single(Channel(h, cy, "lobby").Admins);
        Assert.Equal((bobId, (byte)5, "модератор"), (admin.UserId, admin.Rights, admin.Title));

        // More than Bob has / for himself / for a guest / where he is nobody: refused.
        Assert.Equal(ModerationError.Forbidden, (await Do(h, bob, new SetChannelAdminRequest
            { RoomId = "lobby", UserId = cyId, Rights = ChannelRights.RestrictMembers })).Error);
        Assert.Equal(ModerationError.Self, (await Do(h, bob, new SetChannelAdminRequest
            { RoomId = "lobby", UserId = bobId, Rights = ChannelRights.All })).Error);
        Assert.Equal(ModerationError.NotClaimed, (await Do(h, bob, new SetChannelAdminRequest
            { RoomId = "lobby", UserId = guestId, Rights = ChannelRights.DeleteMessages })).Error);
        Assert.Equal(ModerationError.Forbidden, (await Do(h, bob, new SetChannelAdminRequest
            { RoomId = "voice", UserId = cyId, Rights = ChannelRights.DeleteMessages })).Error);

        Assert.True((await Do(h, bob, new SetChannelAdminRequest
            { RoomId = "lobby", UserId = cyId, Rights = ChannelRights.DeleteMessages })).Success);
        Assert.Equal(2, Channel(h, boss, "lobby").Admins.Count);

        // Cy cannot touch Bob, who has a right Cy lacks; the server admin demotes Bob.
        Assert.False((await Do(h, cy, new SetChannelAdminRequest { RoomId = "lobby", UserId = bobId, Rights = 0 })).Success);
        Assert.True((await Do(h, boss, new SetChannelAdminRequest { RoomId = "lobby", UserId = bobId, Rights = 0 })).Success);
        Assert.Equal([cyId], Channel(h, boss, "lobby").Admins.Select(a => a.UserId));
    }

    [Fact]
    public async Task AMutedMember_CannotWrite_UntilLifted_AndLinksFollowTheChannelDefaults()
    {
        await using var h = NewHarness();
        var (boss, _) = await Join(h, "Boss", "boss");
        var (cy, cyId) = await Join(h, "Cy");

        Assert.True((await Do(h, boss, new SetChannelRestrictionRequest
            { RoomId = "lobby", UserId = cyId, Denied = MemberPermissions.SendMessages })).Success);
        Assert.Single(Channel(h, cy, "lobby").Restrictions);

        Assert.Null(await Say(h, cy, "hello"));
        var refused = h.Events<ModerationResultEvent>(cy).Last();
        Assert.Equal((ModerationAction.SendMessage, ModerationError.Muted), (refused.Action, refused.Error));

        await Do(h, boss, new SetChannelRestrictionRequest { RoomId = "lobby", UserId = cyId });
        Assert.Empty(Channel(h, cy, "lobby").Restrictions);
        Assert.NotNull(await Say(h, cy, "hello"));

        // No links for members; admins are not restricted.
        await Do(h, boss, new SetChannelDefaultsRequest { RoomId = "lobby", DefaultPermissions = MemberPermissions.SendMessages });
        Assert.Equal(MemberPermissions.SendMessages, Channel(h, cy, "lobby").DefaultPermissions);
        Assert.Null(await Say(h, cy, "see https://example.org"));
        Assert.Equal(ModerationError.LinksForbidden, h.Events<ModerationResultEvent>(cy).Last().Error);
        Assert.Null(await Say(h, cy, "example.com rocks"));
        Assert.NotNull(await Say(h, cy, "no link here."));
        Assert.NotNull(await Say(h, boss, "https://example.org"));
    }

    [Fact]
    public async Task ARestriction_ExpiresByItself()
    {
        await using var h = NewHarness();
        var (boss, _) = await Join(h, "Boss", "boss");
        var (cy, cyId) = await Join(h, "Cy");
        var permissions = h.Service<ChannelPermissions>();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        permissions.NowMs = () => now;

        await Do(h, boss, new SetChannelRestrictionRequest
            { RoomId = "lobby", UserId = cyId, Denied = MemberPermissions.SendMessages, DurationSeconds = 60 });
        Assert.Equal(now + 60_000, Channel(h, cy, "lobby").Restrictions.Single().UntilMs);
        Assert.Null(await Say(h, cy, "hi"));

        now += 61_000;
        Assert.NotNull(await Say(h, cy, "hi"));
    }

    [Fact]
    public async Task ABan_MovesTheMemberOut_AndKeepsThemOut_ButNeverInTheHomeRoom()
    {
        await using var h = NewHarness();
        var (boss, bossId) = await Join(h, "Boss", "boss");
        var (cy, cyId) = await Join(h, "Cy");
        await h.Request(cy, new JoinRoomRequest("voice"));
        Assert.Equal("voice", h.Events<JoinRoomResultEvent>(cy).Last().RoomId);

        Assert.True((await Do(h, boss, new SetChannelRestrictionRequest { RoomId = "voice", UserId = cyId, Banned = true })).Success);
        var moved = h.Events<JoinRoomResultEvent>(cy).Last();
        Assert.Equal(("lobby", true), (moved.RoomId, moved.Success));

        await h.Request(cy, new JoinRoomRequest("voice"));
        var refused = h.Events<JoinRoomResultEvent>(cy).Last();
        Assert.Equal(("voice", false, ModerationError.Banned), (refused.RoomId, refused.Success, refused.Error));

        Assert.Equal(ModerationError.HomeRoom, (await Do(h, boss, new SetChannelRestrictionRequest
            { RoomId = "lobby", UserId = cyId, Banned = true })).Error);
        // Admins cannot be restricted; nobody restricts themselves; members cannot restrict.
        var (bob, bobId) = await Join(h, "Bob", "bob");
        await Do(h, boss, new SetChannelAdminRequest { RoomId = "voice", UserId = bobId, Rights = ChannelRights.DeleteMessages });
        Assert.Equal(ModerationError.TargetIsAdmin, (await Do(h, boss, new SetChannelRestrictionRequest
            { RoomId = "voice", UserId = bobId, Banned = true })).Error);
        Assert.Equal(ModerationError.Forbidden, (await Do(h, cy, new SetChannelRestrictionRequest
            { RoomId = "lobby", UserId = bossId, Denied = 1 })).Error);
        Assert.Equal(ModerationError.Forbidden, (await Do(h, bob, new SetChannelRestrictionRequest
            { RoomId = "voice", UserId = cyId })).Error);
    }

    [Fact]
    public async Task Messages_AreDeletedByTheirAuthor_OrAModerator_ForEveryone()
    {
        await using var h = NewHarness();
        var (boss, _) = await Join(h, "Boss", "boss");
        var (bob, _) = await Join(h, "Bob");
        var (cy, _) = await Join(h, "Cy");
        var fromBob = (await Say(h, bob, "bob's"))!;
        var fromCy = (await Say(h, cy, "cy's"))!;

        Assert.Equal(ModerationError.Forbidden, (await Do(h, cy, new DeleteChatMessageRequest
            { RoomId = "lobby", MessageId = fromBob.Id })).Error);
        Assert.True((await Do(h, cy, new DeleteChatMessageRequest { RoomId = "lobby", MessageId = fromCy.Id })).Success);
        Assert.True((await Do(h, boss, new DeleteChatMessageRequest { RoomId = "lobby", MessageId = fromBob.Id })).Success);

        Assert.Equal([fromCy.Id, fromBob.Id], h.Events<ChatMessageDeletedEvent>(bob).Select(e => e.MessageId));

        // Gone from the history too.
        await h.Request(bob, new ChatHistoryRequest());
        var page = h.Events<ChatHistoryEvent>(bob).Last();
        Assert.DoesNotContain(page.Messages, m => m.Id == fromBob.Id || m.Id == fromCy.Id);
    }

    [Fact]
    public async Task ServerAdmins_AppointOthers_ButNotThemselves_NorDemoteConfiguredOnes()
    {
        await using var h = NewHarness();
        var (boss, bossId) = await Join(h, "Boss", "boss");
        var (bob, bobId) = await Join(h, "Bob", "bob");
        var (_, guestId) = await Join(h, "Guest");

        Assert.Equal(ModerationError.Forbidden, (await Do(h, bob, new SetServerAdminRequest { UserId = bobId, IsAdmin = true })).Error);
        Assert.Equal(ModerationError.NotClaimed, (await Do(h, boss, new SetServerAdminRequest { UserId = guestId, IsAdmin = true })).Error);

        Assert.True((await Do(h, boss, new SetServerAdminRequest { UserId = bobId, IsAdmin = true })).Success);
        Assert.True(Presence(h, boss, bobId).IsAdmin);
        // The new admin can moderate anywhere, but not demote the configured one.
        Assert.Equal(ModerationError.Configured, (await Do(h, bob, new SetServerAdminRequest { UserId = bossId, IsAdmin = false })).Error);
        Assert.Equal(ModerationError.Self, (await Do(h, bob, new SetServerAdminRequest { UserId = bobId, IsAdmin = false })).Error);

        Assert.True((await Do(h, boss, new SetServerAdminRequest { UserId = bobId, IsAdmin = false })).Success);
        Assert.False(Presence(h, boss, bobId).IsAdmin);
    }

    [Fact]
    public async Task Roles_Restrictions_AndDeletions_SurviveARestart()
    {
        using var db = new TempDatabase();
        uint bobId, cyId, deletedId;
        await using (var first = NewHarness(db.Path))
        {
            var (boss, _) = await Join(first, "Boss", "boss");
            (_, bobId) = await Join(first, "Bob", "bob");
            var (cy, id) = await Join(first, "Cy");
            cyId = id;
            await Do(first, boss, new SetServerAdminRequest { UserId = bobId, IsAdmin = true });
            await Do(first, boss, new SetChannelAdminRequest { RoomId = "voice", UserId = bobId, Rights = ChannelRights.All, Title = "хозяин" });
            await Do(first, boss, new SetChannelRestrictionRequest { RoomId = "voice", UserId = cyId, Banned = true });
            await Do(first, boss, new SetChannelDefaultsRequest { RoomId = "game", DefaultPermissions = 0 });
            deletedId = (await Say(first, cy, "oops"))!.Id;
            await Do(first, cy, new DeleteChatMessageRequest { RoomId = "lobby", MessageId = deletedId });
        }

        await using var second = NewHarness(db.Path);
        var (someone, _) = await Join(second, "Dee");
        Assert.True(Presence(second, someone, bobId).IsAdmin);
        var voice = Channel(second, someone, "voice");
        Assert.Equal((bobId, "хозяин"), (voice.Admins.Single().UserId, voice.Admins.Single().Title));
        Assert.Equal((cyId, true), (voice.Restrictions.Single().UserId, voice.Restrictions.Single().Banned));
        Assert.Equal(0, Channel(second, someone, "game").DefaultPermissions);

        await second.Request(someone, new ChatHistoryRequest());
        Assert.DoesNotContain(second.Events<ChatHistoryEvent>(someone).Last().Messages, m => m.Id == deletedId);
    }

    [Theory]
    [InlineData("go to https://x.y", true)]
    [InlineData("www.site", true)]
    [InlineData("сайт.рф", true)]
    [InlineData("example.COM", true)]
    [InlineData("end of sentence. Next one", false)]
    [InlineData("v1.2 released", false)]
    public void Links_AreRecognised(string text, bool isLink)
        => Assert.Equal(isLink, ModerationService.ContainsLink(text));
}
