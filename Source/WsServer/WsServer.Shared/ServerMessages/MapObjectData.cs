using GameModel;
using WsServer.Abstract;
using WsServer.Common;

namespace WsServer.ServerMessages
{
    public struct MapObjectData : IMessageData
    {
        public uint ObjectId;
        public float X;
        public float Y;
        public uint ObjectType;

        public MapObjectData(GameObject obj)
        {
            ObjectId = (uint) obj.Id;
            X = obj.X;
            Y = obj.Y;
            ObjectType = (uint) obj.ObjectType.Id;
        }
    }
}