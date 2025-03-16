using WsServer.Abstract;

namespace Game.ServerLogic.Player.Events;

public struct PlayerLeftEvent(uint clientId) : IServerEvent
{
    public static byte TypeId => 3;

    public uint ClientId = clientId;
}