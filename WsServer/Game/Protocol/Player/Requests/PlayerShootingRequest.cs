using System.Runtime.InteropServices;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Requests;

[StructLayout(LayoutKind.Sequential)]
public struct PlayerShootingRequest : IClientRequest
{
    public static byte TypeId => 103;

    public int Weapon;
}