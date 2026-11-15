using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Chat.Requests;

/// <summary>
/// Asks for chat history of the room the client is currently in.
///
///  * BeforeId != 0 — the page of messages right before that id (scrolling up).
///  * otherwise — catch up: everything after AfterId (0 = the client has nothing cached
///    for the room and gets the latest page).
///
/// Epoch is the id space the client's cached ids belong to (0 = none); on a mismatch the
/// server ignores the cursors and answers with a fresh latest page.
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class ChatHistoryRequest : IClientRequest
{
    public static byte TypeId => 201;

    public uint BeforeId;
    public uint AfterId;
    public uint Epoch;
}
