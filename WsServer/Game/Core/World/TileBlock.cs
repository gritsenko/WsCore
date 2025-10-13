using System;

namespace Game.Core.World;

public class TileBlock
{
    public const int Size = GameWorld.BlockSize * GameWorld.BlockSize * sizeof(TileType) + sizeof(int) + sizeof(int);

    public int X;
    public int Y;
    public TileType[] Tiles;

    public long Id
    {
        get => ((long)X << 32) + Y;
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
        if (tiles.Length != GameWorld.BlockSize * GameWorld.BlockSize) throw new ArgumentException("Invalid block size.");
        X = x;
        Y = y;
        Tiles = tiles;
    }
}