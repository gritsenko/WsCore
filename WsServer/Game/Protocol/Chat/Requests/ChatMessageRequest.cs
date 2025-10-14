using System.Runtime.InteropServices;
using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Chat.Requests;

[GenerateTypeScript]
[MemoryPackable]
public partial class ChatMessageRequest : IClientRequest
{
    public static byte TypeId => 200;

    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
    public string Message;

}