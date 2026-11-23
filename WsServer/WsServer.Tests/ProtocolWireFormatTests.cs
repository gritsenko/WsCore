using Game.ServerLogic.Account.Events;
using Game.ServerLogic.Account.Requests;
using Game.ServerLogic.Chat.Events;
using Game.ServerLogic.Chat.Requests;
using Game.ServerLogic.Connection.Events;
using Game.ServerLogic.Presence.Events;
using Game.ServerLogic.Presence.Requests;
using Game.ServerLogic.GameState.Events;
using Game.ServerLogic.GameState.Events.GameTickStateUpdateEventData;
using Game.ServerLogic.Rooms.Events;
using MemoryPack;

namespace WsServer.Tests;

/// <summary>
/// Pins the server-side MemoryPack encoding of messages added/changed in stages C and D to the
/// exact bytes WsCore.Client/src/network/protocol/protocol.test.ts pins for the generated
/// TS classes — so C# and TS are checked against the same wire format, not just each
/// against itself.
/// </summary>
public class ProtocolWireFormatTests
{
    private static RoomInfo GameRoom() => new()
    {
        Id = "game", Name = "G", UserCount = 2, SupportedModes = ["Spatial"], IsPersistent = true,
    };

    [Fact]
    public void HeartbeatEvent_IsAnEmptyObject()
        => Assert.Equal([0], MemoryPackSerializer.Serialize(new HeartbeatEvent()));

    [Fact]
    public void JoinRoomResultEvent_Success_MatchesPinnedBytes()
    {
        byte[] expected = [4, 251, 255, 255, 255, 4, 0, 0, 0, 103, 97, 109, 101, 1, 255, 255, 255, 255,
            7, 251, 255, 255, 255, 4, 0, 0, 0, 103, 97, 109, 101, 254, 255, 255, 255, 1, 0, 0, 0, 71,
            2, 0, 0, 0, 1, 0, 0, 0, 248, 255, 255, 255, 7, 0, 0, 0, 83, 112, 97, 116, 105, 97, 108, 1, 0, 0];
        Assert.Equal(expected, MemoryPackSerializer.Serialize(JoinRoomResultEvent.Joined(GameRoom())));
    }

    [Fact]
    public void JoinRoomResultEvent_Failure_MatchesPinnedBytes()
    {
        byte[] expected = [4, 254, 255, 255, 255, 1, 0, 0, 0, 120, 0, 253, 255, 255, 255, 2, 0, 0, 0, 110, 111, 255];
        Assert.Equal(expected, MemoryPackSerializer.Serialize(JoinRoomResultEvent.Failed("x", "no")));
    }

    [Fact]
    public void RoomListEvent_MatchesPinnedBytes()
    {
        byte[] expected = [1, 1, 0, 0, 0, 7, 251, 255, 255, 255, 4, 0, 0, 0, 103, 97, 109, 101, 254, 255,
            255, 255, 1, 0, 0, 0, 71, 2, 0, 0, 0, 1, 0, 0, 0, 248, 255, 255, 255, 7, 0, 0, 0, 83, 112, 97,
            116, 105, 97, 108, 1, 0, 0];
        Assert.Equal(expected, MemoryPackSerializer.Serialize(new RoomListEvent([GameRoom()])));
    }

    // ---- chat history + presence ----

    [Fact]
    public void ChatMessageEvent_MatchesPinnedBytes()
    {
        byte[] expected = [6, 7, 0, 0, 0, 253, 255, 255, 255, 2, 0, 0, 0, 104, 105, 42, 0, 0, 0, 3, 0, 0, 0, 253,
            255, 255, 255, 2, 0, 0, 0, 65, 108, 0, 0, 0, 0, 0, 64, 143, 64];
        var evt = new ChatMessageEvent(7, "hi") { Id = 42, UserId = 3, Name = "Al", SentAtMs = 1000 };
        Assert.Equal(expected, MemoryPackSerializer.Serialize(evt));
    }

    [Fact]
    public void ChatHistoryEvent_MatchesPinnedBytes()
    {
        byte[] expected = [6, 251, 255, 255, 255, 4, 0, 0, 0, 103, 97, 109, 101, 5, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1,
            0, 0, 0, 5, 42, 0, 0, 0, 3, 0, 0, 0, 253, 255, 255, 255, 2, 0, 0, 0, 65, 108, 253, 255, 255, 255, 2,
            0, 0, 0, 104, 105, 0, 0, 0, 0, 0, 64, 143, 64];
        var evt = new ChatHistoryEvent
        {
            RoomId = "game", Epoch = 5, Reset = true, HasMore = true,
            Messages = [new ChatMessageData { Id = 42, UserId = 3, Name = "Al", Text = "hi", SentAtMs = 1000 }],
        };
        Assert.Equal(expected, MemoryPackSerializer.Serialize(evt));
    }

    [Fact]
    public void ChatHistoryRequest_IdentifyRequest_SetAwayRequest_DecodeFromPinnedBytes()
    {
        var history = MemoryPackSerializer.Deserialize<ChatHistoryRequest>([3, 10, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0])!;
        Assert.Equal((10u, 0u, 5u), (history.BeforeId, history.AfterId, history.Epoch));

        var identify = MemoryPackSerializer.Deserialize<IdentifyRequest>([2, 239, 255, 255, 255, 16, 0, 0, 0, 97, 98,
            99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 253, 255, 255, 255, 2, 0, 0, 0, 65, 108])!;
        Assert.Equal(("abcdefghijklmnop", "Al"), (identify.UserKey, identify.Name));

        Assert.True(MemoryPackSerializer.Deserialize<SetAwayRequest>([1, 1])!.Away);
    }

    private static readonly byte[] PresenceUserBytes = [9, 3, 0, 0, 0, 253, 255, 255, 255, 2, 0, 0, 0, 65, 108, 2,
        251, 255, 255, 255, 4, 0, 0, 0, 103, 97, 109, 101, 0, 0, 0, 0, 0, 64, 143, 64,
        253, 255, 255, 255, 2, 0, 0, 0, 104, 105, 9, 0, 0, 0, 253, 255, 255, 255, 2, 0, 0, 0, 97, 108, 1];

    private static PresenceUserInfo PresenceUser() => new()
    {
        UserId = 3, Name = "Al", Status = PresenceStatus.Away, RoomId = "game", LastSeenMs = 1000,
        About = "hi", AvatarVersion = 9, Login = "al", IsAdmin = true,
    };

    [Fact]
    public void PresenceUpdateEvent_MatchesPinnedBytes()
        => Assert.Equal([1, .. PresenceUserBytes],
            MemoryPackSerializer.Serialize(new PresenceUpdateEvent { User = PresenceUser() }));

    [Fact]
    public void PresenceSnapshotEvent_MatchesPinnedBytes()
        => Assert.Equal([3, 3, 0, 0, 0, 1, 0, 0, 0, .. PresenceUserBytes, 253, 255, 255, 255, 2, 0, 0, 0, 97, 108],
            MemoryPackSerializer.Serialize(
                new PresenceSnapshotEvent { YourUserId = 3, Users = [PresenceUser()], YourLogin = "al" }));

    // ---- accounts ----

    [Fact]
    public void AccountResultEvent_MatchesPinnedBytes()
    {
        byte[] expected = [4, 2, 1, 255, 255, 255, 255, 253, 255, 255, 255, 2, 0, 0, 0, 97, 108];
        Assert.Equal(expected, MemoryPackSerializer.Serialize(
            new AccountResultEvent { Action = AccountAction.Login, Success = true, Login = "al" }));
    }

    [Fact]
    public void LoginRequest_MatchesPinnedBytes()
    {
        byte[] expected = [3, 253, 255, 255, 255, 2, 0, 0, 0, 97, 108, 253, 255, 255, 255, 2, 0, 0, 0, 112, 119,
            254, 255, 255, 255, 1, 0, 0, 0, 107];
        Assert.Equal(expected, MemoryPackSerializer.Serialize(
            new LoginRequest { Login = "al", Password = "pw", UserKey = "k" }));
    }

    [Fact]
    public void SetAvatarRequest_MatchesPinnedBytes()
        => Assert.Equal([1, 3, 0, 0, 0, 1, 2, 3],
            MemoryPackSerializer.Serialize(new SetAvatarRequest { Image = [1, 2, 3] }));

    // ---- stage D: the tick snapshot ----

    private static MovementStateData Movement() => new() { PlayerId = 7, X = 1.5f, Y = -2f, AnimationState = 1 };

    [Fact]
    public void MovementStateData_MatchesPinnedBytes()
    {
        // header(4) | PlayerId u32 | X f32 | Y f32 | AnimationState u8 — 14 bytes (was 49).
        byte[] expected = [4, 7, 0, 0, 0, 0, 0, 192, 63, 0, 0, 0, 192, 1];
        Assert.Equal(expected, MemoryPackSerializer.Serialize(Movement()));
    }

    [Fact]
    public void GameTickUpdateEvent_MatchesPinnedBytes()
    {
        var tick = new GameTickUpdateEvent
        {
            ServerTimeMs = 1000,
            MovementStates = [Movement()],
            DestroyedBulletsIds = [3],
            RespawnedPlayerIds = [],
            HitPlayersState = [new HitPlayerStateData { PlayerId = 7, HitterId = 9, NewHp = 50 }],
        };
        byte[] expected = [5, 232, 3, 0, 0, 1, 0, 0, 0, 4, 7, 0, 0, 0, 0, 0, 192, 63, 0, 0, 0, 192, 1, 1, 0, 0,
            0, 3, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 3, 7, 0, 0, 0, 9, 0, 0, 0, 50, 0, 0, 0];
        Assert.Equal(expected, MemoryPackSerializer.Serialize(tick));
    }
}
