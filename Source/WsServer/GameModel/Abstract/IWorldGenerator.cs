using System.Collections.Generic;

namespace Game.Core.Abstract;

internal interface IWorldGenerator
{
    (TileBlock, IEnumerable<GameObject>) GenerateTileBlock(int x, int y);
}