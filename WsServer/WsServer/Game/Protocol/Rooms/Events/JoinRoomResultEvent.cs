using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Rooms.Events;

/// <summary>
/// The server's answer to a <c>JoinRoomRequest</c> (and to the automatic lobby join on
/// connect), sent to the joiner only, before any room-specific state (RoomUsersUpdate,
/// GameStateUpdate). The client changes its room membership only on Success = true.
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class JoinRoomResultEvent : IServerEvent
{
    public static byte TypeId => 252;

    public string RoomId = string.Empty;
    public bool Success;
    // Human-readable reason on failure; null on success.
    public string? Error;
    // The joined room (modes, persistence, user count) on success; null on failure.
    public RoomInfo? Room;

    [MemoryPackConstructor]
    public JoinRoomResultEvent() { }

    public static JoinRoomResultEvent Joined(RoomInfo room) =>
        new() { RoomId = room.Id, Success = true, Room = room };

    public static JoinRoomResultEvent Failed(string roomId, string error) =>
        new() { RoomId = roomId, Success = false, Error = error };
}
