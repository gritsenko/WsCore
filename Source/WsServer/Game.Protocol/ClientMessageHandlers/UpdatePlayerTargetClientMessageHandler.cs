using Game.Protocol.ClientMessages;
using WsServer.Common;

namespace Game.Protocol.ClientMessageHandlers;

public class UpdatePlayerTargetClientMessageHandler() : MessageHandlerBase<UpdatePlayerTargetClientMessage>
{
    protected override void Handle(uint clientId, UpdatePlayerTargetClientMessage msg)
    {
        var p = Game.SetPlayerTarget(clientId, msg.AimX, msg.AimY);
    }
}