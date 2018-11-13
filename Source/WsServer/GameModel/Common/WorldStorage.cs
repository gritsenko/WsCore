using System.Collections.Generic;
using System.Linq;
using GameModel.Abstract;
using Lex.Db;
using Lex.Db.Serialization;

namespace GameModel.Common
{
    internal class WorldStorage : IWorldStorage
    {
        private DbInstance _blocksDb = new DbInstance("data/tiles");
        private DbInstance _objectsDb = new DbInstance("data/objects");

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

            _blocksDb.Map<TileBlock>().Automap(x => x.Id);
            _objectsDb.Map<GameObject>().Automap(x => x.Id);

            Extender.RegisterType<ObjectType, TypeSerializers>(1000);

            _blocksDb.Initialize();
            _objectsDb.Initialize();

            Load();
        }

        private void Load()
        {
            var blocks = _blocksDb.LoadAll<TileBlock>();
            foreach (var block in blocks)
            {
                _blocks[block.Id] = block;
            }

            var objects = _objectsDb.LoadAll<GameObject>();
            foreach (var obj in objects)
            {
                StoreObject(obj);
            }
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

            _blocksDb.Save(block);
            _objectsDb.Save(objects);
        }

        private long GetBlockId(int x, int y)
        {
            return (((long)x) << 32) + y;
        }
    }

    public class TypeSerializers
    {
        public static ObjectType ReadObjectType(DataReader reader)
        {
            return WorldStorage.ObjectTypes[reader.ReadInt64()];
        }

        public static void WriteObjectType(DataWriter writer, ObjectType objType)
        {
            writer.Write(objType.Id);
        }
    }
}