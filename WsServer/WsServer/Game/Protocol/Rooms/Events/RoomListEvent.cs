using System.Collections.Generic;
using System.Linq;
using MemoryPack;
using WsServer.Abstract.Messages;
using WsServer.Rooms;

namespace Game.ServerLogic.Rooms.Events;

/// <summary>
/// The list of rooms the server offers — the client's single source of truth for which
/// rooms exist, what they support and how many users are in each. Sent in reply to
/// GetRoomListRequest and pushed to every client in a non-spatial room whenever room
/// membership changes (so lobby user counts stay live).
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class RoomListEvent : IServerEvent
{
    public static byte TypeId => 250;

    [MemoryPackAllowSerialize]
    public List<RoomInfo> Rooms { get; set; } = new();

    public RoomListEvent()
    {
    }

    [MemoryPackConstructor]
    public RoomListEvent(List<RoomInfo> rooms)
    {
        Rooms = rooms;
    }

    /// <summary>Snapshot of the given rooms in creation order (stable for the UI).</summary>
    public static RoomListEvent From(IEnumerable<Room> rooms) =>
        new(rooms.OrderBy(r => r.Order).Select(RoomInfo.From).ToList());
}

/// <summary>
/// Information about a single room
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class RoomInfo
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int UserCount { get; set; }

    // RoomCompatibility names ("TextChat", "Spatial", "VoiceChat", "VideoChat").
    [MemoryPackAllowSerialize]
    public List<string> SupportedModes { get; set; } = new();

    // Persistent rooms are never removed when they become empty (lobby / voice / game).
    public bool IsPersistent { get; set; }

    public static RoomInfo From(Room room) => new()
    {
        Id = room.Id,
        Name = room.Name,
        UserCount = room.ClientCount,
        SupportedModes = room.SupportedModes.OrderBy(m => m).Select(m => m.ToString()).ToList(),
        IsPersistent = room.IsPersistent,
    };
}
