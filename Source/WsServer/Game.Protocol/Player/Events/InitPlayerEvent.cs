using System.Runtime.InteropServices;
using WsServer.Abstract;

namespace Game.ServerLogic.Player.Events;

[StructLayout(LayoutKind.Sequential)] 
public readonly struct InitPlayerEvent(uint clientId) : IServerEvent
{
    public static byte TypeId => 255;
    public uint ClientId { get; } = clientId;
}
