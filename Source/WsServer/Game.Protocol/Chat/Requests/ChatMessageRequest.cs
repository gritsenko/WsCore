using System.Runtime.InteropServices;
using WsServer.Abstract;

namespace Game.ServerLogic.Chat.Requests;

public struct ChatMessageRequest : IClientRequest
{
    public static byte TypeId => 200;

    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
    public string Message;

}