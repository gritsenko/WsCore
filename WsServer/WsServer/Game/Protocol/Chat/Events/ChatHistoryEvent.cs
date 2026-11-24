using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Chat.Events;

/// <summary>
/// One page of a room's chat history, in answer to a <c>ChatHistoryRequest</c>.
///
///  * <see cref="Reset"/> = true — <see cref="Messages"/> is the room's latest page and
///    replaces whatever the client had cached for the room (first visit, a gap too large
///    to patch, or a different <see cref="Epoch"/>).
///  * <see cref="BeforeId"/> != 0 — an older page: the messages right before that id.
///  * otherwise — an incremental catch-up: every message after the client's AfterId.
///
/// <see cref="HasMore"/> says whether anything older than the first message of the page
/// exists (not meaningful for an incremental catch-up).
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class ChatHistoryEvent : IServerEvent
{
    public static byte TypeId => 201;

    public string RoomId = string.Empty;
    // Identifies the id space: changes when the server's history was wiped / restarted
    // without persistence, so ids cached by a client are no longer comparable.
    public uint Epoch;
    public uint BeforeId;
    public bool Reset;
    public bool HasMore;

    // Oldest first.
    [MemoryPackAllowSerialize]
    public List<ChatMessageData> Messages = new();
}

/// <summary>A stored chat message as sent in a history page.</summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class ChatMessageData
{
    public uint Id;
    public uint UserId;
    public string Name = string.Empty;
    public string Text = string.Empty;
    public double SentAtMs;
    // An ASCII art by its catalog id; empty = a text message.
    public string ArtId = string.Empty;
}
