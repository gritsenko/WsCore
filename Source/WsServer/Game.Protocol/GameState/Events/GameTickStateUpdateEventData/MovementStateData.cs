using System.Runtime.InteropServices;
using WsServer.Abstract.Messages;
using WsServer.DataBuffer.Abstract;

namespace Game.ServerLogic.GameState.Events.GameTickStateUpdateEventData;

[StructLayout(LayoutKind.Sequential)]
public struct MovementStateData : IBufferSerializableData
{
    public uint PlayerId;
    public float X;
    public float Y;
    public float AimX;
    public float AimY;
    public float TargetX;
    public float TargetY;
    public int BodyAngle;
    public int ControlsState;
    public float VelocityX;
    public float VelocityY;
    public int AnimationState;

    public MovementStateData(Core.Player player)
    {
        PlayerId = player.Id;
        var ms = player.MovementState;
        X = ms.Pos.X;
        Y = ms.Pos.Y;
        AimX = ms.AimPos.X;
        AimY = ms.AimPos.Y;
        BodyAngle = ms.BodyAngle;
        ControlsState = ms.ControlsState;
        VelocityX = ms.Velocity.X;
        VelocityY = ms.Velocity.Y;

        TargetX = player.TargetPos.X;
        TargetY = player.TargetPos.Y;
        AnimationState = player.AnimationState;
    }
}