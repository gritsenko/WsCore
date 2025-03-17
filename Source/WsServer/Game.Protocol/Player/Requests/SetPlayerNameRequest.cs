using System.Runtime.InteropServices;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Requests;

public struct SetPlayerNameRequest : IClientRequest
{
    public static byte TypeId => 100;

    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
    public string Name;
}