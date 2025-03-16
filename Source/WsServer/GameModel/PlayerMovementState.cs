using Game.Core.Common.Math;

namespace Game.Core;

public class PlayerMovementState
{
    public Vector2D Pos { get; set; } = new();
    public Vector2D AimPos { get; set; } = new();

    public int BodyAngle { get; set; }

    public int ControlsState { get; set; }

    public Vector2D Velocity { get; set; } = new();
}