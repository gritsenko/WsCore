using System.Collections.Generic;
using System.Runtime.InteropServices;
using MemoryPack;
using WsServer.Abstract.Messages;
using WsServer.Rooms;

namespace Game.ServerLogic.Rooms.Events;

/// <summary>
/// Event containing the list of available rooms and their user counts
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class RoomListEvent : IServerEvent
{
    public static byte TypeId => 250;
    public string EventType => "RoomListEvent";
    
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
    
    [MemoryPackAllowSerialize]
    public List<string> SupportedModes { get; set; } = new();
}