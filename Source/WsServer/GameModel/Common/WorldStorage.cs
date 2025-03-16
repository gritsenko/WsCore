using System.Collections.Generic;
using System.Linq;
using Game.Model.Abstract;

namespace Game.Model.Common;

internal class WorldStorage : IWorldStorage
{
    public static Dictionary<long, ObjectType> ObjectTypes = new Dictionary<long, ObjectType>()
    {
        { 0, new ObjectType { Id = 0, ObjectClass = ObjectClass.Tree }},
        { 1, new ObjectType { Id = 1, ObjectClass = ObjectClass.Rock }}
    };

    private Dictionary<long, TileBlock> _blocks;
    private Dictionary<long, List<GameObject>> _objects;

    public WorldStorage()
    {
        _blocks = new Dictionary<long, TileBlock>();
        _objects = new Dictionary<long, List<GameObject>>();

        Load();
    }

    private void Load()
    {
    }

    public void StoreObject(GameObject obj)
    {
        var xAdj = (int)obj.X - (int)obj.X % World.BlockSize;
        var yAdj = (int)obj.Y - (int)obj.Y % World.BlockSize;

        var blockId = (((long)xAdj) << 32) + yAdj;
        if (!_objects.ContainsKey(blockId)) _objects[blockId] = new List<GameObject>();

        _objects[blockId].Add(obj);
    }

    public long GetLastObjectId()
    {
        var max = 0L;
        foreach (var block in _objects.Values)
        {
            foreach (var obj in block)
            {
                if (max < obj.Id) max = obj.Id;
            }
        }
        return max;
    }

    public bool GetTileBlock(int xAdj, int yAdj, out TileBlock block)
    {
        var id = GetBlockId(xAdj, yAdj);
        if (_blocks.ContainsKey(id))
        {
            block = _blocks[id];
            return true;
        }

        block = null;
        return false;
    }

    public bool GetTileBlockObjects(int xAdj, int yAdj, out IEnumerable<GameObject> objects)
    {
        var id = GetBlockId(xAdj, yAdj);
        if (_objects.ContainsKey(id))
        {
            objects = _objects[id];
            return true;
        }

        objects = null;
        return false;
    }

    public void Save(TileBlock block, IEnumerable<GameObject> objects)
    {
        var index = block.Id;
        _blocks[index] = block;
        _objects[index] = objects.ToList();
    }

    public void AddObject(TileBlock block, GameObject obj)
    {
        var index = block.Id;
        _objects[index].Add(obj);
    }
    public void RemoveObjects(TileBlock block, IEnumerable<GameObject> objs)
    {
        var index = block.Id;
        foreach (var gameObject in objs)
        {
            _objects[index].Remove(gameObject);
        }
    }

    private long GetBlockId(int x, int y)
    {
        return (((long)x) << 32) + y;
    }
}