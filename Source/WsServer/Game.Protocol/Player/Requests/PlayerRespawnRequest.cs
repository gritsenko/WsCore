using WsServer.Abstract;

namespace Game.Protocol.Player.Requests;

[ClientMessageType(ClientMessageType.RespawnPlayer)]
public struct PlayerRespawnRequest : IClientRequest
{
    public uint PlayerId;

}