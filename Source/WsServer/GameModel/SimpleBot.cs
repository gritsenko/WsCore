using System;
using Game.Model.Common.Math;

namespace Game.Model;

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