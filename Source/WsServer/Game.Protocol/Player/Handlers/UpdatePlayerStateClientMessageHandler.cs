using Game.Core;
using Game.Core.Common.Math;
using Game.ServerLogic.Player.Requests;
using WsServer.Common;

namespace Game.ServerLogic.Player.Handlers;

public class UpdatePlayerStateClientMessageHandler(GameModel gameModel) : MessageHandlerBase<UpdatePlayerStateRequest>
{
    protected override void Handle(uint clientId, UpdatePlayerStateRequest request)
    {
        gameModel.SetPlayerControls(clientId, new Vector2D(request.AimX, request.AimY), request.ControlsState);
    }
}