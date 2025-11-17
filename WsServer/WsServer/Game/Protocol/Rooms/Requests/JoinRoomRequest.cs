using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Rooms.Requests;

/// <summary>
/// Request to join a specific room
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class JoinRoomRequest : IClientRequest
{
    public static byte TypeId => 251;
    public string EventType => "JoinRoomRequest";

    public string RoomId { get; set; } = string.Empty;

    public JoinRoomRequest()
    {
    }

    [MemoryPackConstructor]
    public JoinRoomRequest(string roomId)
    {
        RoomId = roomId;
    }
}
