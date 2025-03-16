using Game.Core;
using WsServer.Abstract;

namespace Game.ServerLogic.GameState.Events.GameTickStateUpdateEventData;

public struct HitPlayerStateData(HitInfo hitInfo) : IMessageData
{
    public uint PlayerId = hitInfo.PlayerId;
    public uint HitterId = hitInfo.HitterId;
    public int NewHp = hitInfo.NewHp;
}