using System.Numerics;

namespace Game.Core;

public class PlayerMovementState
{
    public Vector2 Pos { get; set; } = new();
    public Vector2 AimPos { get; set; } = new();

    public int BodyAngle { get; set; }

    public int ControlsState { get; set; }

    public Vector2 Velocity { get; set; } = new();
}