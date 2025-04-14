using System.Collections.Generic;
using System.Linq;
using Game.Core.Abstract;
using Game.Core.Common;

namespace Game.Core.World;

public class GameWorld
{
    public const int BlockSize = 16;

    private readonly IWorldGenerator _worldGenerator;
    private readonly IWorldStorage _storage;

    public GameWorld()
    {
        _storage = new WorldStorage();
        _worldGenerator = new DumbWorldGenerator(_storage.GetLastObjectId());
    }

    public TileBlock GetTileBlock(int x, int y)
    {
        var (xAdj, yAdj) = GetAdjustedCoords(x, y);
        if (!_storage.GetTileBlock(xAdj, yAdj, out TileBlock block))
        {
            block = InitializeTileBlock(xAdj, yAdj).Item1;
        }

        return block;
    }

    public IEnumerable<GameObject> GetTileBlockObjects(int x, int y)
    {
        var (xAdj, yAdj) = GetAdjustedCoords(x, y);
        if (!_storage.GetTileBlockObjects(xAdj, yAdj, out IEnumerable<GameObject> objects))
        {
            objects = InitializeTileBlock(xAdj, yAdj).Item2;
        }

        return objects;
    }

    private (TileBlock, IEnumerable<GameObject>) InitializeTileBlock(int xAdj, int yAdj)
    {
        var (block, objects) = _worldGenerator.GenerateTileBlock(xAdj, yAdj);
        _storage.Save(block, objects);

        return (block, objects);
    }

    private (int, int) GetAdjustedCoords(int x, int y)
    {
        return (x - x % BlockSize, y - y % BlockSize);
    }

    public void SetMapObject(int mapX, int mapY, int objectType)
    {
        var gameObject = new GameObject
        {
            Id = _storage.GetLastObjectId() + 1, 
            ObjectType = WorldStorage.ObjectTypes[objectType], 
            X = mapX,
            Y = mapY
        };

        _storage.GetTileBlock(0, 0, out var block);

        _storage.AddObject(block, gameObject);
    }

    public void DestroyObjects(int mapX, int mapY)
    {
        _storage.GetTileBlock(0, 0, out var block);

        _storage.GetTileBlockObjects(0, 0, out var objs);

        var toRemove = objs.Where(o => o.X == mapX && o.Y == mapY).ToArray();

        _storage.RemoveObjects(block, toRemove);
    }
}