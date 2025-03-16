using WsServer.Abstract;

namespace Game.Protocol.ClientMessages;

[ClientMessageType(ClientMessageType.RespawnPlayer)]
public struct PlayerRespawnClientMessage : IClientMessage
{
    public uint PlayerId;

}