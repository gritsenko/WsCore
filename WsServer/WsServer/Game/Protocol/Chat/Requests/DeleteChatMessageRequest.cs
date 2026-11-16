using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Chat.Requests;

/// <summary>
/// Deletes a chat message: one's own, or anyone's with the DeleteMessages right in that
/// channel. Answered with a <c>ModerationResultEvent</c>; every connection is told with a
/// <c>ChatMessageDeletedEvent</c>.
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class DeleteChatMessageRequest : IClientRequest
{
    public static byte TypeId => 202;

    public string RoomId = string.Empty;
    public uint MessageId;
}
