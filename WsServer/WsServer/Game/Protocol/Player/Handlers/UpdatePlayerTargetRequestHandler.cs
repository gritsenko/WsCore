using Game.Core;
using Game.ServerLogic.Player.Requests;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Handlers;

public class UpdatePlayerTargetRequestHandler(GameModel gameModel) : RequestHandlerBase<UpdatePlayerTargetRequest>
{
    protected override void Handle(uint clientId, UpdatePlayerTargetRequest request)
    {
        var p = gameModel.SetPlayerTarget(clientId, request.AimX, request.AimY);
    }
}