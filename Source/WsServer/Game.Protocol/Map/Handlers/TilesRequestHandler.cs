using Game.Core;
using Game.ServerLogic.Map.Requests;
using WsServer.Abstract;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Map.Handlers;

public class TilesRequestHandler(IGameMessenger messenger, GameModel gameModel) : RequestHandlerBase<GetTilesRequest>
{
    protected override void Handle(uint clientId, GetTilesRequest request)
    {
        var tileBlock = gameModel.World.GetTileBlock(request.MapX, request.MapY);
        //var tilesBuffer = new MyBuffer(TileBlock.Size + 1)
        //    .SetUint8(GetTilesRequest.TypeId)
        //    .SetInt32(tileBlock.X)
        //    .SetInt32(tileBlock.Y);

        //Buffer.BlockCopy(tileBlock.Tiles.Cast<int>().ToArray(), 0, tilesBuffer.buffer, 9, tileBlock.Tiles.Length * sizeof(TileType));

        //messenger.Send(clientId, tilesBuffer);
    }
}