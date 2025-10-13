using System;
using System.Collections.Generic;
using Game.Core.Abstract;
using Game.Core.Common;

namespace Game.Core.World;

internal class DumbWorldGenerator : IWorldGenerator
{
    private Random _rnd = new Random();
    private long _lastObjectId;

    public DumbWorldGenerator(long lastObjectId)
    {
        _lastObjectId = lastObjectId;
    }

    public (TileBlock, IEnumerable<GameObject>) GenerateTileBlock(int x, int y)
    {
        var block = new TileBlock(x, y, new TileType[GameWorld.BlockSize * GameWorld.BlockSize]);
        var objects = new List<GameObject>();
        objects.AddRange(GenerateTrees(x, y));
        objects.AddRange(GenerateRocks(x, y));

        return (block, objects);
    }

    private IEnumerable<GameObject> GenerateRocks(int x, int y)
    {
        return GenerateObjects(x, y, WorldStorage.ObjectTypes[1], 10);
    }

    private IEnumerable<GameObject> GenerateTrees(int x, int y)
    {
        return GenerateObjects(x, y, WorldStorage.ObjectTypes[0], 5);
    }

    private IEnumerable<GameObject> GenerateObjects(int x, int y, ObjectType objectType, int count)
    {
        var xMax = x + GameWorld.BlockSize;
        var yMax = y + GameWorld.BlockSize;

        var objects = new List<GameObject>();
        for (var i = 0; i < count; i++)
        {
            objects.Add(new GameObject() { Id = _lastObjectId++, ObjectType = objectType, X = _rnd.Next(x, xMax), Y = _rnd.Next(y, yMax) });
        }

        return objects;
    }
}