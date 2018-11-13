using GameModel.Common.Math;

namespace GameModel
{
    public class PlayerMovmentState
    {
        public Vector2D Pos { get; set; } = new Vector2D();
        public Vector2D AimPos { get; set; } = new Vector2D();

        public int BodyAngle { get; set; }

        public int ControlsState { get; set; }

        public Vector2D Velocity { get; set; } = new Vector2D();
    }
}