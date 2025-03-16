using System.Collections.Generic;

namespace Game.Model.Abstract;

internal interface IWorldGenerator
{
    (TileBlock, IEnumerable<GameObject>) GenerateTileBlock(int x, int y);
}