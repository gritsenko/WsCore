using System.Runtime.InteropServices;
using WsServer.Abstract;
using WsServer.Common;

namespace WsServer.ServerMessages
{
    [ServerMessageType(ServerMessageType.ChatMessage)]
    public struct ChatServerMessage : IServerMessage
    {
        public uint ClientId;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string Message;

        public ChatServerMessage(uint clientId, string message)
        { 
            ClientId = clientId;
            Message = message;
        }
    }
}