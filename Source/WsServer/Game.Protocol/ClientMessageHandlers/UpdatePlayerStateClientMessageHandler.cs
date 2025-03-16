using Game.Model.Common.Math;
using Game.Protocol.ClientMessages;
using WsServer.Common;

namespace Game.Protocol.ClientMessageHandlers;

public class UpdatePlayerStateClientMessageHandler() : MessageHandlerBase<UpdatePlayerStateClientMessage>
{
    protected override void Handle(uint clientId, UpdatePlayerStateClientMessage clientMessage)
    {
        Game.SetPlayerControls(clientId, new Vector2D(clientMessage.AimX, clientMessage.AimY), clientMessage.ControlsState);
    }
}