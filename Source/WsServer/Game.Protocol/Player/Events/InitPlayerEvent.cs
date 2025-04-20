using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Events;

public struct InitPlayerEvent(uint clientId) : IServerEvent
{
    public static byte TypeId => 255;
    public uint ClientId = clientId;
}
