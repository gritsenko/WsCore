using System.Runtime.InteropServices;
using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Rooms.Requests;

/// <summary>
/// Request to get the list of available rooms
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class GetRoomListRequest : IClientRequest
{
    public static byte TypeId => 250;
}