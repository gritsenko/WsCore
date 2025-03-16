using System.Runtime.InteropServices;
using WsServer.Abstract;

namespace Game.Protocol.ClientMessages;

[ClientMessageType(ClientMessageType.ChatMessage)]
public struct ChatClientMessage : IClientMessage
{
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
    public string Message;
}