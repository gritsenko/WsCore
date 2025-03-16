using WsServer.Abstract;

namespace Game.Protocol.Player.Events;

public struct PlayerLeftServerMessage(uint clientId) : IServerMessage
{
    public static byte TypeId => 3;

    public uint ClientId = clientId;
}