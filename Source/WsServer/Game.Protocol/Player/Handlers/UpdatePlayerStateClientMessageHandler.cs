using Game.Core.Common.Math;
using Game.ServerLogic.Player.Requests;
using WsServer.Common;

namespace Game.ServerLogic.Player.Handlers;

public class UpdatePlayerStateClientMessageHandler() : MessageHandlerBase<UpdatePlayerStateRequest>
{
    protected override void Handle(uint clientId, UpdatePlayerStateRequest request)
    {
        Game.SetPlayerControls(clientId, new Vector2D(request.AimX, request.AimY), request.ControlsState);
    }
}