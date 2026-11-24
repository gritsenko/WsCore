using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Chat.Requests;

[GenerateTypeScript]
[MemoryPackable]
public partial class ChatMessageRequest : IClientRequest
{
    public static byte TypeId => 200;

    // Length is enforced server-side in the handler; MemoryPack ignores [MarshalAs].
    public string Message;

    // An ASCII art from the client's catalog, sent like a sticker: only its id (slug,
    // [a-z0-9-]{1,40}) travels and is stored; Message is ignored then. Empty = plain text.
    public string ArtId = string.Empty;
}