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
            if (IsTargetReached())
            {
                TargetPos = new Vector2D(_rnd.Next(-1000, 2000), _rnd.Next(-1000, 2000));
            }

            base.Update(dt);
        }
    }
}