using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Requests;

public struct PlayerRespawnRequest : IClientRequest
{
    public static byte TypeId => 105;

    public uint PlayerId;
}