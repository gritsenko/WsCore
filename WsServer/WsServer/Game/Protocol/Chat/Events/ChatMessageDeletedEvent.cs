using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Chat.Events;

/// <summary>
/// A chat message was deleted. Sent to every connection, not only the room's members:
/// any client may have the room's history cached.
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class ChatMessageDeletedEvent : IServerEvent
{
    public static byte TypeId => 202;

    public string RoomId = string.Empty;
    public uint MessageId;
}
