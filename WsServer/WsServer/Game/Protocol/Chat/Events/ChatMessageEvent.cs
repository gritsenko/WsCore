using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Chat.Events;

/// <summary>
/// A chat message, live: sent to the members of the sender's room as it is written. The
/// same message is later served from the history (<see cref="ChatHistoryEvent"/>) under
/// the same <see cref="Id"/>, which is what lets a client merge the two without duplicates.
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class ChatMessageEvent : IServerEvent
{
    public static byte TypeId => 200;

    // The sender's connection (0 for a history item re-sent live; not stored).
    public uint ClientId;
    public string Message = string.Empty;

    // Global, strictly increasing message id (the history cursor).
    public uint Id;
    // The sender's stable user id; 0 if the connection never identified itself.
    public uint UserId;
    // The sender's display name at the time of writing.
    public string Name = string.Empty;
    // Unix time in milliseconds (a double so the TS client reads a plain number).
    public double SentAtMs;

    [MemoryPackConstructor]
    public ChatMessageEvent() { }

    public ChatMessageEvent(uint clientId, string message)
    {
        ClientId = clientId;
        Message = message;
    }
}
