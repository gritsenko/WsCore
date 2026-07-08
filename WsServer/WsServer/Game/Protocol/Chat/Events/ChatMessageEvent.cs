using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Chat.Events;

[GenerateTypeScript]
[MemoryPackable]
public partial class ChatMessageEvent(uint clientId, string message) : IServerEvent
{
    public static byte TypeId => 200;
    public uint ClientId = clientId;
    public string Message = message;
}