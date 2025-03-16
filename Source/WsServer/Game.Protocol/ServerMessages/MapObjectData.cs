using Game.Model;
using WsServer.Abstract;

namespace Game.Protocol.ServerMessages;

public struct MapObjectData(GameObject obj) : IMessageData
{
    public uint ObjectId = (uint) obj.Id;
    public float X = obj.X;
    public float Y = obj.Y;
    public uint ObjectType = (uint) obj.ObjectType.Id;
}