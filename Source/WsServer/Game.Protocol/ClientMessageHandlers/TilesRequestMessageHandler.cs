using Game.Model;
using Game.Protocol.ClientMessages;
using WsServer.Common;

namespace Game.Protocol.ClientMessageHandlers;

public class TilesRequestMessageHandler : MessageHandlerBase<GetTilesClientMessage>
{
    protected override void Handle(uint clientId, GetTilesClientMessage msg)
    {
        var tileBlock = Game.World.GetTileBlock(msg.MapX, msg.MapY);
        var tilesBuffer = MyBuffer.Create(TileBlock.Size + 1)
            .SetUint8((byte)ServerMessageType.MapTiles)
            .SetInt32(tileBlock.X)
            .SetInt32(tileBlock.Y);

        Buffer.BlockCopy(tileBlock.Tiles.Cast<int>().ToArray(), 0, tilesBuffer.buffer, 9, tileBlock.Tiles.Length * sizeof(TileType));

        Messenger.SendMessage(clientId, tilesBuffer);
    }
}