using Game.ServerLogic.Connection.Events;
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
            5, 251, 255, 255, 255, 4, 0, 0, 0, 103, 97, 109, 101, 254, 255, 255, 255, 1, 0, 0, 0, 71,
            2, 0, 0, 0, 1, 0, 0, 0, 248, 255, 255, 255, 7, 0, 0, 0, 83, 112, 97, 116, 105, 97, 108, 1];
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
        byte[] expected = [1, 1, 0, 0, 0, 5, 251, 255, 255, 255, 4, 0, 0, 0, 103, 97, 109, 101, 254, 255,
            255, 255, 1, 0, 0, 0, 71, 2, 0, 0, 0, 1, 0, 0, 0, 248, 255, 255, 255, 7, 0, 0, 0, 83, 112, 97,
            116, 105, 97, 108, 1];
        Assert.Equal(expected, MemoryPackSerializer.Serialize(new RoomListEvent([GameRoom()])));
    }

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
