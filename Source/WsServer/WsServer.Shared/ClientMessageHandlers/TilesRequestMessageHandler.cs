using System;
using System.Linq;
using GameModel;
using WsServer.ClientMessages;
using WsServer.Common;
using WsServer.ServerMessages;

namespace WsServer.ClientMessageHandlers
{
    public class TilesRequestMessageHandler : CommonMessageHandler
    {
        public void OnGetTiles(uint clientId, GetTilesClientMessage msg)
        {
            var tileBlock = GameState.World.GetTileBlock(msg.MapX, msg.MapY);
            var tilesBuffer = MyBuffer.Create(TileBlock.Size + 1)
                .SetUint8((byte)ServerMessageType.MapTiles)
                .SetInt32(tileBlock.X)
                .SetInt32(tileBlock.Y);

            Buffer.BlockCopy(tileBlock.Tiles.Cast<int>().ToArray(), 0, tilesBuffer.buffer, 9, tileBlock.Tiles.Length * sizeof(TileType));

            Messenger.SendMessage(clientId, tilesBuffer);
        }

        public void OnGetMapObjects(uint clientId, GetMapObjectsClientMessage msg)
        {
            var objects = GameState.World.GetTileBlockObjects(msg.MapX, msg.MapY).ToArray();
            var mapObjectsMessage = new MapObjectsServerMessage(objects);

            Messenger.SendMessage(clientId, mapObjectsMessage);
        }
    }
}