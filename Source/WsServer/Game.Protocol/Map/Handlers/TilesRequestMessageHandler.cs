using Game.Core;
using Game.ServerLogic.Map.Requests;
using WsServer.Abstract;
using WsServer.Common;

namespace Game.ServerLogic.Map.Handlers;

public class TilesRequestMessageHandler(IGameMessenger messenger, GameModel gameModel) : MessageHandlerBase<GetTilesRequest>
{
    protected override void Handle(uint clientId, GetTilesRequest msg)
    {
        var tileBlock = gameModel.World.GetTileBlock(msg.MapX, msg.MapY);
        var tilesBuffer = MyBuffer.Create(TileBlock.Size + 1)
            .SetUint8(GetTilesRequest.TypeId)
            .SetInt32(tileBlock.X)
            .SetInt32(tileBlock.Y);

        Buffer.BlockCopy(tileBlock.Tiles.Cast<int>().ToArray(), 0, tilesBuffer.buffer, 9, tileBlock.Tiles.Length * sizeof(TileType));

        //messenger.Send(clientId, tilesBuffer);
    }
}