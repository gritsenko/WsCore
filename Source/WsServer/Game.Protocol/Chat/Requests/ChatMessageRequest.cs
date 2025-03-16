using System.Runtime.InteropServices;
using WsServer.Abstract;

namespace Game.Protocol.Chat.Requests;

[ClientMessageType(ClientMessageType.ChatMessage)]
public struct ChatMessageRequest : IClientRequest
{
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
    public string Message;
}