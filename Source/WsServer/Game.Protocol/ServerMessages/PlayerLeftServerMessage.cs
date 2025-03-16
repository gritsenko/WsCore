using WsServer.Abstract;

namespace Game.Protocol.ServerMessages;

[ServerMessageType(ServerMessageType.PlayerLeft)]
public struct PlayerLeftServerMessage(uint clientId) : IServerMessage
{
    public uint ClientId = clientId;
}