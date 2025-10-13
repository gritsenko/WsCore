using System.Runtime.InteropServices;
using Game.ServerLogic;
using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Requests;

[GenerateTypeScript]
[MemoryPackable]
public partial class SetPlayerNameRequest : IClientRequest
{
    public static byte TypeId => 100;

    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
    public string Name;
}