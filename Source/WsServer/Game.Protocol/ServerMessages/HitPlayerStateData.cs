using Game.Model;
using WsServer.Abstract;

namespace Game.Protocol.ServerMessages;

public struct HitPlayerStateData(HitInfo hitInfo) : IMessageData
{
    public uint PlayerId = hitInfo.PlayerId;
    public uint HitterId = hitInfo.HitterId;
    public int NewHp = hitInfo.NewHp;
}