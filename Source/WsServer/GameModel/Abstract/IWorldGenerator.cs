using System.Collections.Generic;

namespace GameModel.Abstract
{
    internal interface IWorldGenerator
    {
        (TileBlock, IEnumerable<GameObject>) GenerateTileBlock(int x, int y);
    }
}