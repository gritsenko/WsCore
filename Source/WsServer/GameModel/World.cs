using System;
using System.Collections.Generic;
using GameModel.Abstract;
using GameModel.Common;

namespace GameModel
{
    public class World
    {
        public const int BlockSize = 16;

        private readonly IWorldGenerator _worldGenerator;
        private IWorldStorage _storage;

        public World()
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
    }

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
            var block = new TileBlock(x, y, new TileType[World.BlockSize * World.BlockSize]);
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
            var xMax = x + World.BlockSize;
            var yMax = y + World.BlockSize;

            var objects = new List<GameObject>();
            for (var i = 0; i < count; i++)
            {
                objects.Add(new GameObject() { Id = _lastObjectId++, ObjectType = objectType, X = (float)_rnd.Next(x, xMax), Y = _rnd.Next(y, yMax) });
            }

            return objects;
        }
    }

    public class GameObject
    {
        public long Id;
        public float X;
        public float Y;
        public ObjectType ObjectType;
    }

    public class TileBlock
    {
        public const int Size = World.BlockSize * World.BlockSize * sizeof(TileType) + sizeof(int) + sizeof(int);

        public int X;
        public int Y;
        public TileType[] Tiles;

        public long Id
        {
            get { return (((long)X) << 32) + Y; }
            set
            {
                Y = (int)value;
                X = (int)value >> 32;
            }
        }

        public TileBlock()
        {

        }

        public TileBlock(int x, int y, TileType[] tiles)
        {
            if (tiles.Length != World.BlockSize * World.BlockSize) throw new ArgumentException("Invalid block size.");
            X = x;
            Y = y;
            Tiles = tiles;
        }
    }

    public enum TileType
    {
        Ground = 0
    }
}