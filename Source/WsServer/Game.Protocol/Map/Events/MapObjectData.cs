using Game.Core;
using WsServer.Abstract.Messages;
using WsServer.DataBuffer.Abstract;

namespace Game.ServerLogic.Map.Events;

public struct MapObjectData(GameObject obj) : IBufferSerializableData
{
    public uint ObjectId = (uint) obj.Id;
    public float X = obj.X;
    public float Y = obj.Y;
    public uint ObjectType = (uint) obj.ObjectType.Id;
}