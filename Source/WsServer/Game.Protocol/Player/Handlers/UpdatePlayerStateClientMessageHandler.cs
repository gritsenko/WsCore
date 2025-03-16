using Game.Model.Common.Math;
using Game.Protocol.Player.Requests;
using WsServer.Common;

namespace Game.Protocol.Player.Handlers;

public class UpdatePlayerStateClientMessageHandler() : MessageHandlerBase<UpdatePlayerStateRequest>
{
    protected override void Handle(uint clientId, UpdatePlayerStateRequest request)
    {
        Game.SetPlayerControls(clientId, new Vector2D(request.AimX, request.AimY), request.ControlsState);
    }
}