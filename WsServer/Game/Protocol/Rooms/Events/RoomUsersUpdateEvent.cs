using System.Collections.Generic;
using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Rooms.Events;

/// <summary>
/// Event containing the updated list of users in a room
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class RoomUsersUpdateEvent : IServerEvent
{
    public static byte TypeId => 251;
    public string EventType => "RoomUsersUpdateEvent";
    
    public string RoomId { get; set; } = string.Empty;
    
    [MemoryPackAllowSerialize]
    public List<RoomUserInfo> Users { get; set; } = new();

    public RoomUsersUpdateEvent()
    {
    }

    [MemoryPackConstructor]
    public RoomUsersUpdateEvent(string roomId, List<RoomUserInfo> users)
    {
        RoomId = roomId;
        Users = users;
    }
}

/// <summary>
/// Information about a user in a room
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class RoomUserInfo
{
    public uint ClientId { get; set; }
    public string Name { get; set; } = string.Empty;
}
