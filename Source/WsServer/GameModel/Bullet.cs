﻿using Game.Core.Common.Math;

namespace Game.Core;

public class Bullet
{
    public uint Id { get; set; }
    public uint Type { get; set; }
    public Vector2D Pos { get; set; }
    public Vector2D Velocity { get; set; }

    public static double MaxLifetime = 2;
    public double LifeTime = 0;

    public bool IsDestroyed { get; set; }
    public uint SpawnerId { get; set; }
    public int HitPoints { get; set; } = 10;

    public virtual void Update(float dt)
    {
        Pos += Velocity * dt;
        LifeTime += dt;
        if (LifeTime > MaxLifetime)
        {
            IsDestroyed = true;
        }
    }
}