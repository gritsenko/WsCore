using System.Runtime.InteropServices;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Chat.Events;

public struct ChatEventEvent(uint clientId, string message) : IServerEvent
{
    public static byte TypeId => 200;
    public uint ClientId = clientId;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
    public string Message = message;
}