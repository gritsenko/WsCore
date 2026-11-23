using System.Security.Cryptography;
using System.Text;
using Game.ServerLogic.Account.Events;
using Game.ServerLogic.Account.Requests;
using Game.ServerLogic.Moderation.Events;
using Game.ServerLogic.Moderation.Requests;
using Game.ServerLogic.Presence.Events;
using Game.ServerLogic.Presence.Requests;
using Game.ServerLogic.Rooms.Events;
using Game.ServerLogic.Rooms.Requests;
using Game.ServerLogic.Voice.Events;
using Game.ServerLogic.Voice.Requests;
using WsServer.Abstract.Messages;
using WsServer.Sessions;
using WsServer.Voice;

namespace WsServer.Tests;

/// <summary>
/// Voice channels: joining independently of the text room, the roster everyone sees,
/// signalling relayed only within a channel, the participant limit, one voice connection
/// per user, being taken out (ban, access, logout, deleted channel, disconnect), TURN
/// credentials and created voice channels.
/// </summary>
public class VoiceTests
{
    private const string Password = "correct horse";
    private const string Voice = GameServer.VoiceRoomId;

    private static ServerHarness NewHarness(Action<GameServerOptions>? configure = null, string? db = null) => new(o =>
    {
        o.AdminLogins = ["boss"];
        o.ModerationRequestCooldownSeconds = 0;
        o.VoiceRequestCooldownSeconds = 0;
        o.AccountRequestCooldownSeconds = 0;
        if (db != null)
            o.ChatDatabasePath = db;
        configure?.Invoke(o);
    });

    private static async Task<(RecordingConnection Conn, uint UserId)> Join(
        ServerHarness h, string name, string? login = null, string? key = null)
    {
        var conn = await h.Connect();
        await h.Request(conn, new IdentifyRequest { UserKey = key ?? $"{name.ToLowerInvariant()}-key-0123456789abcdef", Name = name });
        var userId = h.Events<PresenceSnapshotEvent>(conn).Single().YourUserId;
        if (login != null)
        {
            await h.Request(conn, new ClaimAccountRequest { Login = login, Password = Password });
            await TestSupport.WaitUntil(() => h.Events<AccountResultEvent>(conn).Any(e => e.Success));
        }
        return (conn, userId);
    }

    private static async Task<VoiceJoinResultEvent> JoinVoice(ServerHarness h, RecordingConnection conn, string roomId = Voice)
    {
        var before = h.Events<VoiceJoinResultEvent>(conn).Length;
        await h.Request(conn, new VoiceJoinRequest { RoomId = roomId });
        await TestSupport.WaitUntil(() => h.Events<VoiceJoinResultEvent>(conn).Length > before);
        return h.Events<VoiceJoinResultEvent>(conn).Last();
    }

    private static async Task<ModerationResultEvent> Do(ServerHarness h, RecordingConnection conn, IClientRequest request)
    {
        var before = h.Events<ModerationResultEvent>(conn).Length;
        await h.Request(conn, request);
        await TestSupport.WaitUntil(() => h.Events<ModerationResultEvent>(conn).Length > before);
        return h.Events<ModerationResultEvent>(conn).Last();
    }

    // Who the connection was last told is in the voice channel (client ids).
    private static uint[] Roster(ServerHarness h, RecordingConnection conn, string roomId = Voice)
    {
        foreach (var evt in h.Events<VoiceRosterEvent>(conn).Reverse())
        {
            var room = evt.Rooms.FirstOrDefault(r => r.RoomId == roomId);
            if (room != null)
                return room.Participants.Select(p => p.ClientId).ToArray();
            if (evt.Reset)
                return [];
        }
        return [];
    }

    private static string? VoiceRoom(ServerHarness h, RecordingConnection conn)
        => h.Service<VoiceService>().RoomOf(conn.Id);

    [Fact]
    public async Task Joining_IsSeparateFromTheTextRoom_AndTheJoinerCallsWhoIsThere()
    {
        await using var h = NewHarness();
        var (ann, annId) = await Join(h, "Ann");
        var (bob, _) = await Join(h, "Bob");
        var (cy, _) = await Join(h, "Cy");

        var first = await JoinVoice(h, ann);
        Assert.True(first.Success, first.Error);
        Assert.Empty(first.Peers);
        Assert.NotEmpty(first.IceServers); // the default STUN server

        var second = await JoinVoice(h, bob);
        Assert.True(second.Success);
        Assert.Equal([ann.Id], second.Peers);

        // Still in the lobby as a text room; the roster reaches everyone, in voice or not.
        Assert.Equal(SessionManager.DefaultRoomId, h.Server.GetRoomManager().GetClientRoom(ann.Id)?.Id);
        Assert.Equal([ann.Id, bob.Id], Roster(h, cy));
        var annInfo = h.Events<VoiceRosterEvent>(cy).Last().Rooms.Single().Participants[0];
        Assert.Equal(annId, annInfo.UserId);

        // Switching text rooms keeps the voice.
        await h.Request(ann, new JoinRoomRequest(Voice));
        await h.Request(ann, new JoinRoomRequest(SessionManager.DefaultRoomId));
        Assert.Equal(Voice, VoiceRoom(h, ann));

        // Leaving: answered, and the others see it.
        await h.Request(bob, new VoiceLeaveRequest());
        Assert.Equal(VoiceError.Left, h.Events<VoiceLeftEvent>(bob).Single().Reason);
        Assert.Equal([ann.Id], Roster(h, cy));
    }

    [Fact]
    public async Task Signals_AreRelayed_OnlyBetweenParticipantsOfOneChannel()
    {
        await using var h = NewHarness();
        var (ann, _) = await Join(h, "Ann");
        var (bob, _) = await Join(h, "Bob");
        var (eve, _) = await Join(h, "Eve");
        await JoinVoice(h, ann);
        await JoinVoice(h, bob);

        await h.Request(bob, new VoiceSignalRequest { TargetClientId = ann.Id, Kind = VoiceSignalKind.Offer, Data = "v=0 offer" });
        var signal = h.Events<VoiceSignalEvent>(ann).Single();
        Assert.Equal((bob.Id, VoiceSignalKind.Offer, "v=0 offer"), (signal.FromClientId, signal.Kind, signal.Data));

        // Not in voice / a bad kind / too large / to oneself: dropped.
        await h.Request(eve, new VoiceSignalRequest { TargetClientId = ann.Id, Kind = VoiceSignalKind.Offer, Data = "x" });
        await h.Request(bob, new VoiceSignalRequest { TargetClientId = ann.Id, Kind = 9, Data = "x" });
        await h.Request(bob, new VoiceSignalRequest
        {
            TargetClientId = ann.Id, Kind = VoiceSignalKind.Candidate, Data = new string('a', 17 * 1024),
        });
        await h.Request(ann, new VoiceSignalRequest { TargetClientId = ann.Id, Kind = VoiceSignalKind.Answer, Data = "x" });
        // Ann in voice, Eve not: Ann cannot reach her.
        await h.Request(ann, new VoiceSignalRequest { TargetClientId = eve.Id, Kind = VoiceSignalKind.Answer, Data = "x" });
        await h.Settle();
        Assert.Single(h.Events<VoiceSignalEvent>(ann));
        Assert.Empty(h.Events<VoiceSignalEvent>(eve));
    }

    [Fact]
    public async Task Signals_AreRateLimited()
    {
        await using var h = NewHarness(o =>
        {
            o.VoiceSignalBurst = 3;
            o.VoiceSignalsPerSecond = 0.001;
        });
        var (ann, _) = await Join(h, "Ann");
        var (bob, _) = await Join(h, "Bob");
        await JoinVoice(h, ann);
        await JoinVoice(h, bob);

        for (var i = 0; i < 6; i++)
            await h.Request(bob, new VoiceSignalRequest { TargetClientId = ann.Id, Kind = VoiceSignalKind.Candidate, Data = "c" + i });
        Assert.Equal(3, h.Events<VoiceSignalEvent>(ann).Length);
    }

    [Fact]
    public async Task Refused_Anonymous_NotAVoiceChannel_Unknown_AndFull()
    {
        await using var h = NewHarness(o => o.VoiceMaxParticipants = 2);
        var anon = await h.Connect();
        Assert.Equal(VoiceError.NotIdentified, (await JoinVoice(h, anon)).Error);

        var (ann, _) = await Join(h, "Ann");
        Assert.Equal(VoiceError.NotVoice, (await JoinVoice(h, ann, SessionManager.DefaultRoomId)).Error);
        Assert.Equal(VoiceError.NoChannel, (await JoinVoice(h, ann, "nowhere")).Error);

        var (bob, _) = await Join(h, "Bob");
        var (cy, _) = await Join(h, "Cy");
        Assert.True((await JoinVoice(h, ann)).Success);
        Assert.True((await JoinVoice(h, bob)).Success);
        var full = await JoinVoice(h, cy);
        Assert.False(full.Success);
        Assert.Equal(VoiceError.Full, full.Error);
        Assert.True((await JoinVoice(h, bob)).Success); // already in it: a rejoin, not one more
        Assert.Null(VoiceRoom(h, cy));
    }

    [Fact]
    public async Task MuteAndDeafen_AreShownInTheRoster()
    {
        await using var h = NewHarness();
        var (ann, _) = await Join(h, "Ann");
        var (bob, _) = await Join(h, "Bob");
        await JoinVoice(h, ann);

        await h.Request(ann, new VoiceStateRequest { Muted = true });
        var info = h.Events<VoiceRosterEvent>(bob).Last().Rooms.Single().Participants.Single();
        Assert.Equal((true, false), (info.Muted, info.Deafened));

        // Deafened implies muted.
        await h.Request(ann, new VoiceStateRequest { Deafened = true });
        info = h.Events<VoiceRosterEvent>(bob).Last().Rooms.Single().Participants.Single();
        Assert.Equal((true, true), (info.Muted, info.Deafened));
    }

    [Fact]
    public async Task OneVoiceConnectionPerUser_AnotherTabMovesIt()
    {
        await using var h = NewHarness();
        var (tab1, _) = await Join(h, "Ann", key: "ann-key-0123456789abcdef");
        var (tab2, _) = await Join(h, "Ann", key: "ann-key-0123456789abcdef");
        await JoinVoice(h, tab1);
        await JoinVoice(h, tab2);

        Assert.Equal(VoiceError.Moved, h.Events<VoiceLeftEvent>(tab1).Single().Reason);
        Assert.Null(VoiceRoom(h, tab1));
        Assert.Equal([tab2.Id], Roster(h, tab1));
    }

    [Fact]
    public async Task Disconnect_LeavesVoice_AndANewlyIdentifiedConnectionGetsTheRoster()
    {
        await using var h = NewHarness();
        var (ann, _) = await Join(h, "Ann");
        var (bob, _) = await Join(h, "Bob");
        await JoinVoice(h, ann);
        await JoinVoice(h, bob);

        var (late, _) = await Join(h, "Late");
        var reset = h.Events<VoiceRosterEvent>(late).Single();
        Assert.True(reset.Reset);
        Assert.Equal([ann.Id, bob.Id], reset.Rooms.Single().Participants.Select(p => p.ClientId));

        await h.Disconnect(ann);
        await h.Settle();
        Assert.Equal([bob.Id], Roster(h, late));
        Assert.Equal(1, h.Service<VoiceService>().ParticipantCount);
    }

    [Fact]
    public async Task BanAndLogout_TakeAParticipantOut()
    {
        await using var h = NewHarness();
        var (boss, _) = await Join(h, "Boss", "boss");
        var (bob, bobId) = await Join(h, "Bob");
        var (cy, _) = await Join(h, "Cy", "cyril");
        await JoinVoice(h, bob);
        await JoinVoice(h, cy);

        Assert.True((await Do(h, boss, new SetChannelRestrictionRequest { RoomId = Voice, UserId = bobId, Banned = true })).Success);
        Assert.Equal(VoiceError.Removed, h.Events<VoiceLeftEvent>(bob).Single().Reason);
        Assert.Equal(VoiceError.Banned, (await JoinVoice(h, bob)).Error);

        await h.Request(cy, new LogoutRequest());
        await TestSupport.WaitUntil(() => h.Events<AccountResultEvent>(cy).Length == 2);
        Assert.True(h.Events<AccountResultEvent>(cy).Last().Success, h.Events<AccountResultEvent>(cy).Last().Error);
        Assert.Equal(VoiceError.Removed, h.Events<VoiceLeftEvent>(cy).Single().Reason);
        Assert.Empty(Roster(h, boss));
    }

    [Fact]
    public async Task CreatedVoiceChannel_IsAVoiceRoom_Private_AndDeletedEmpty()
    {
        using var db = new TempDatabase();
        {
            string roomId;
            await using (var h = NewHarness(db: db.Path))
            {
                var (boss, _) = await Join(h, "Boss", "boss");
                var (bob, _) = await Join(h, "Bob");
                var created = await Do(h, boss, new CreateChannelRequest { Name = "Talk", IsPrivate = true, IsVoice = true });
                Assert.True(created.Success, created.Error);
                roomId = created.RoomId!;

                var info = h.Events<RoomListEvent>(boss).Last().Rooms.Single(r => r.Id == roomId);
                Assert.Contains("VoiceChat", info.SupportedModes);
                Assert.Contains("TextChat", info.SupportedModes);

                // Private: Bob does not see who talks there, nor may he join.
                Assert.True((await JoinVoice(h, boss, roomId)).Success);
                Assert.DoesNotContain(h.Events<VoiceRosterEvent>(bob), e => e.Rooms.Any(r => r.RoomId == roomId));
                Assert.Equal(VoiceError.NoAccess, (await JoinVoice(h, bob, roomId)).Error);

                // Given access: he gets the roster and may join.
                var bobId = h.Events<PresenceSnapshotEvent>(bob).Single().YourUserId;
                Assert.True((await Do(h, boss, new SetChannelAccessRequest { RoomId = roomId, UserId = bobId, HasAccess = true })).Success);
                Assert.Equal([boss.Id], Roster(h, bob, roomId));
                Assert.True((await JoinVoice(h, bob, roomId)).Success);

                // Access taken: out of voice too.
                Assert.True((await Do(h, boss, new SetChannelAccessRequest { RoomId = roomId, UserId = bobId, HasAccess = false })).Success);
                Assert.Equal(VoiceError.Removed, h.Events<VoiceLeftEvent>(bob).Single().Reason);
            }

            // Still a voice channel after a restart; deleting it empties its voice.
            await using (var h = NewHarness(db: db.Path))
            {
                var room = h.Server.GetRoomManager().GetRoom(roomId);
                Assert.NotNull(room);
                Assert.True(room.SupportsMode(Rooms.RoomCompatibility.VoiceChat));

                var (boss, _) = await Join(h, "Boss"); // the same key: the claimed admin
                Assert.True((await JoinVoice(h, boss, roomId)).Success);
                Assert.True((await Do(h, boss, new DeleteChannelRequest { RoomId = roomId })).Success);
                Assert.Equal(VoiceError.Removed, h.Events<VoiceLeftEvent>(boss).Single().Reason);
                Assert.Equal(0, h.Service<VoiceService>().ParticipantCount);
            }
        }
    }

    [Fact]
    public async Task TurnCredentials_AreHandedOut_WhenASecretIsConfigured()
    {
        await using var h = NewHarness(o =>
        {
            o.VoiceTurnUrls = ["turn:turn.example.com:3478"];
            o.VoiceTurnSecret = "s3cret";
            o.VoiceTurnCredentialTtlSeconds = 3600;
        });
        var (ann, annId) = await Join(h, "Ann");
        var result = await JoinVoice(h, ann);

        var turn = result.IceServers.Single(s => s.Urls.Contains("turn:turn.example.com:3478"));
        var parts = turn.Username.Split(':');
        Assert.Equal(annId.ToString(), parts[1]);
        var expires = long.Parse(parts[0]);
        Assert.InRange(expires - DateTimeOffset.UtcNow.ToUnixTimeSeconds(), 3500, 3700);
        var expected = Convert.ToBase64String(HMACSHA1.HashData(Encoding.UTF8.GetBytes("s3cret"), Encoding.UTF8.GetBytes(turn.Username)));
        Assert.Equal(expected, turn.Credential);
    }
}
