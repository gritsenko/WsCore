using System.Runtime.InteropServices;
using WsServer.Abstract;

namespace Game.Protocol.Chat.Events;

public struct ChatServerMessage(uint clientId, string message) : IServerMessage
{
    public static byte TypeId => 200;
    public uint ClientId = clientId;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
    public string Message = message;
}