using System;
using System.Collections.Generic;
using Game.Model.Common.Math;

namespace Game.Model;

public class Player
{
    public uint Id { get; set; }

    public static double Radius { get; set; } = 48;

    public Vector2D TargetPos = Vector2D.Zero;

    private static readonly Dictionary<int, int> ClassHp = new()
    {
        {0, 100}, {1, 200}, {2, 50}, {3, 80}, {4, 150}
    };

    public int Frags { get; set; }

    public PlayerMovementState MovementState { get; set; } = new();

    public byte Hp { get; set; }
    public byte MaxHp { get; set; }
    public float Speed { get; set; } = 200;
    public bool IsBot { get; set; }

    public string Name { get; set; }

    public long LastActivity { get; set; }
    public int BodyIndex { get; set; }

    public int WeaponIndex { get; set; }
    public int ArmorIndex { get; set; }

    public int AnimationState { get; set; }
    public bool IsDead => Hp <= 0;

    public double RespawnTime = 0;

    public void UpdateFrom(Player p)
    {
        MovementState = p.MovementState;

        BodyIndex = p.BodyIndex;
        WeaponIndex = p.WeaponIndex;
        ArmorIndex = p.ArmorIndex;

        MaxHp = p.MaxHp;
        Speed = p.Speed;

    }

    public void UpdateStats()
    {
        MaxHp = (byte) ClassHp[BodyIndex];
        Hp = MaxHp;
    }

    public bool Hit(int hitPoint)
    {
        Hp = (byte) Math.Max(Hp - hitPoint, 0);
        return Hp == 0;
    }

    public void AddFrag(int i)
    {
        Frags += i;
    }

    public void Move(Vector2D speed)
    {
        MovementState.Pos += speed;
    }
    public void Move(float dx, float dy)
    {
        MovementState.Pos = MovementState.Pos.Translate(dx,dy);
    }

    public virtual void MoveTarget(float dx, float dy)
    {
        TargetPos = TargetPos.Translate(dx, dy);
    }

    public void SetPos(float x, float y)
    {
        MovementState.Pos = new Vector2D(x, y);
    }

    public void UpdateActivity()
    {
        LastActivity = DateTime.Now.Ticks;
    }

    public virtual void Update(float dt)
    {
        if (IsDead)
        {
            if (RespawnTime > 0)
            {
                RespawnTime -= dt;
            }

            AnimationState = 2; //Death
            return;
        }

        CheckControls(dt);
        if (!IsTargetReached())
        {
            MoveToTarget(dt);
            AnimationState = 1; //walk
        }
        else
        {
            AnimationState = 0; // idle
            MovementState.Velocity = Vector2D.Zero;
        }
    }

    private void CheckControls(float dt)
    {
        var controls = this.MovementState.ControlsState;

        var isUpPressed = (controls & 0b0000_0001) > 0;
        var isDownPressed = (controls & 0b0000_0010) > 0;

        var isLeftPressed = (controls & 0b0000_0100) > 0;
        var isRightPressed = (controls & 0b0000_1000) > 0;

        var xDir = 0;
        if (isLeftPressed)
            xDir = -1;
        if (isRightPressed)
            xDir = 1;

        var yDir = 0;
        if (isDownPressed)
            yDir = 1;
        if (isUpPressed)
            yDir = -1;

        MoveTarget(Speed * xDir * dt, Speed * yDir * dt);
    }

    public void MoveToTarget(float dt)
    {
        var dir = (TargetPos - MovementState.Pos);
        var ds = Speed * 1.3f;
        MovementState.Velocity = dir.Normalize() * ds;

        if (dir.Length > (MovementState.Velocity * dt).Length)
        {
            Move(MovementState.Velocity * dt);
        }
        else
        {
            MovementState.Pos = TargetPos;
        }
    }

    public bool IsTargetReached() =>  (TargetPos - MovementState.Pos).Length < 3;


    public void SetTarget(float x, float y)
    {
        TargetPos = new Vector2D(x, y);
    }

}