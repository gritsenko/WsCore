using System.Runtime.InteropServices;
using WsServer.Abstract;

namespace Game.Protocol.Player.Requests;

[ClientMessageType(ClientMessageType.SetPlayerName)]
public struct SetPlayerNameRequest : IClientRequest
{
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
    public string Name;
}