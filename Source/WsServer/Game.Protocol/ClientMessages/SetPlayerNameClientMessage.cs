using System.Runtime.InteropServices;
using WsServer.Abstract;

namespace Game.Protocol.ClientMessages;

[ClientMessageType(ClientMessageType.SetPlayerName)]
public struct SetPlayerNameClientMessage : IClientMessage
{
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
    public string Name;
}