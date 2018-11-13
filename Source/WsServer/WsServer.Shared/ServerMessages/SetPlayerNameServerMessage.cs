using System.Runtime.InteropServices;
using WsServer.Abstract;
using WsServer.Common;

namespace WsServer.ServerMessages
{
    [StructLayout(LayoutKind.Sequential)]
    [ServerMessageType(ServerMessageType.SetPlayerName)]
    public struct SetPlayerNameServerMessage : IServerMessage
    {
        public uint ClientId;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string Name;

        public SetPlayerNameServerMessage(uint clinetId, string name)
        {
            ClientId = clinetId;
            Name = name;
        }
    }
}