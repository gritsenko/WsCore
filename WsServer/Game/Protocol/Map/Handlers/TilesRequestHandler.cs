using Game.Core;
using Game.ServerLogic.Map.Requests;
using WsServer.Abstract;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Map.Handlers;

public class TilesRequestHandler(GameModel gameModel) : RequestHandlerBase<GetTilesRequest>
{
    protected override void Handle(uint clientId, GetTilesRequest request)
    {
        var tileBlock = gameModel.World.GetTileBlock(request.MapX, request.MapY);
    }
}