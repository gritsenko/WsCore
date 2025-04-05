using Game.ServerLogic.GameState.Events.GameTickStateUpdateEventData;
using WsServer.Abstract.Messages;
using WsServer.Common;

namespace Game.ServerLogic.GameState.Writers;

public class MovementStateDataWriter : IMessageDataWriter<MovementStateData>
{
    public void Write(MyBuffer dest, MovementStateData data)
    {
        dest.SetUint32(data.PlayerId);
        dest.SetFloat(data.X);
        dest.SetFloat(data.Y);
        dest.SetFloat(data.AimX);
        dest.SetFloat(data.AimY);
        dest.SetFloat(data.TargetX);
        dest.SetFloat(data.TargetY);
        dest.SetInt32(data.BodyAngle);
        dest.SetInt32(data.ControlsState);
        dest.SetFloat(data.VelocityX);
        dest.SetFloat(data.VelocityY);
        dest.SetInt32(data.AnimationState);
    }
}