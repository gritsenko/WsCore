using Game.Core;
using WsServer.Abstract.Messages;
using WsServer.DataBuffer.Abstract;

namespace Game.ServerLogic.GameState.Events.GameTickStateUpdateEventData;

public struct HitPlayerStateData(HitInfo hitInfo) : IBufferSerializableData
{
    public uint PlayerId = hitInfo.PlayerId;
    public uint HitterId = hitInfo.HitterId;
    public int NewHp = hitInfo.NewHp;
}