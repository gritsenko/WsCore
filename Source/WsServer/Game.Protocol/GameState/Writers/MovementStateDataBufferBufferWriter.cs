using Game.ServerLogic.GameState.Events.GameTickStateUpdateEventData;
using WsServer.Abstract;
using WsServer.Abstract.Messages;
using WsServer.DataBuffer.Abstract;

namespace Game.ServerLogic.GameState.Writers;

public class MovementStateDataBufferBufferWriter : DataBufferBufferWriterBase<MovementStateData>
{
    public override void Write(IDataBuffer dest, MovementStateData data)
    {
        dest.SetUint32(data.PlayerId)
            .SetFloat(data.X)
            .SetFloat(data.Y)
            .SetFloat(data.AimX)
            .SetFloat(data.AimY)
            .SetFloat(data.TargetX)
            .SetFloat(data.TargetY)
            .SetInt32(data.BodyAngle)
            .SetInt32(data.ControlsState)
            .SetFloat(data.VelocityX)
            .SetFloat(data.VelocityY)
            .SetInt32(data.AnimationState);
    }
}