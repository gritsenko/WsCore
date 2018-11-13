using System;
using GameModel.Common.Math;

namespace GameModel
{
    public class SimpleBot : Player
    {
        readonly Random _rnd = new Random();


        public SimpleBot()
        {
            IsBot = true;
        }

        public override void Update(float dt)
        {
            //Move((float)(_rnd.NextDouble() * 10 - 5), (float)(_rnd.NextDouble() * 10 - 5));
            if (IsTargetReached())
                TargetPos = new Vector2D(_rnd.Next(-1000, 2000), _rnd.Next(-1000, 2000));
            
            MoveToTarget(dt);
        }

        public void MoveToTarget(float dt)
        {
            Movment.Velocity = (TargetPos - Movment.Pos).Normalize() * Speed;

            Move(Movment.Velocity * dt);
        }

        public bool IsTargetReached() => (TargetPos - Movment.Pos).Length < 3;
    }
}