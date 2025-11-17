using Game.Core.World;
using System.Collections.Generic;

namespace Game.Core.Abstract;

internal interface IWorldStorage
{
    long GetLastObjectId();
    bool GetTileBlock(int xAdj, int yAdj, out TileBlock block);
    bool GetTileBlockObjects(int xAdj, int yAdj, out IEnumerable<GameObject> objects);
    void Save(TileBlock block, IEnumerable<GameObject> objects);

    void AddObject(TileBlock block, GameObject obj);
    void RemoveObjects(TileBlock block, IEnumerable<GameObject> objs);

}