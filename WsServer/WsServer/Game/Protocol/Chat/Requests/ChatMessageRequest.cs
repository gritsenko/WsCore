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

}