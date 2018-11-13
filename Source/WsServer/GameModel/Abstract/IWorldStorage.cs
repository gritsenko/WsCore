using System.Collections.Generic;

namespace GameModel.Abstract
{
    internal interface IWorldStorage
    {
        long GetLastObjectId();
        bool GetTileBlock(int xAdj, int yAdj, out TileBlock block);
        bool GetTileBlockObjects(int xAdj, int yAdj, out IEnumerable<GameObject> objects);
        void Save(TileBlock block, IEnumerable<GameObject> objects);
    }
}