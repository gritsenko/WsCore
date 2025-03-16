using System;
using Game.Core.Common.Math;

namespace Game.Core;

public class SimpleBot : Player
{
    private readonly Random _rnd = new();


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