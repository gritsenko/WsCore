using System;
using System.Collections.Generic;
using GameModel.Common.Math;

namespace GameModel
{
    public class Player
    {
        public Vector2D TargetPos = Vector2D.Zero;

        private static readonly Dictionary<int, int> ClassHp = new Dictionary<int, int>()
        {
            {0, 100}, {1, 200}, {2, 50}, {3, 80}, {4, 150}
        };

        public int Frags { get; set; }


        public uint Id { get; set; }

        public PlayerMovmentState Movment { get; set; } = new PlayerMovmentState();

        public byte Hp { get; set; }
        public byte Maxhp { get; set; }
        public float Speed { get; set; } = 200;
        public bool IsBot { get; set; }

        public string Name { get; set; }

        public long LastActivity { get; set; }
        public int BodyIndex { get; set; }

        public int WeaponIndex { get; set; }
        public int ArmorIndex { get; set; }

        public int AnimationState { get; set; }

        public void UpdateFrom(Player p)
        {
            Movment = p.Movment;

            BodyIndex = p.BodyIndex;
            WeaponIndex = p.WeaponIndex;
            ArmorIndex = p.ArmorIndex;

            Maxhp = p.Maxhp;
            Speed = p.Speed;

        }

        public void UpdateStats()
        {
            Maxhp = (byte) ClassHp[BodyIndex];
            Hp = Maxhp;
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
            Movment.Pos = Movment.Pos + speed;
        }
        public void Move(float dx, float dy)
        {
            Movment.Pos = Movment.Pos.Translate(dx,dy);
        }

        public void MoveTarget(float dx, float dy)
        {
            TargetPos = TargetPos.Translate(dx, dy);
        }

        public void SetPos(float x, float y)
        {
            Movment.Pos = new Vector2D(x, y);
        }

        public void UpdateActivity()
        {
            LastActivity = DateTime.Now.Ticks;
        }

        public virtual void Update(float dt)
        {
            CheckControls(dt);
            //Move((float)(_rnd.NextDouble() * 10 - 5), (float)(_rnd.NextDouble() * 10 - 5));
            if (!IsTargetReached())
                MoveToTarget(dt);
            else 
                Movment.Velocity = Vector2D.Zero;
        }

        private void CheckControls(float dt)
        {
            var contols = this.Movment.ControlsState;

            var isUpPressed = (contols & 0b0000_0001) > 0;
            var isDownPressed = (contols & 0b0000_0010) > 0;

            var isLeftPressed = (contols & 0b0000_0100) > 0;
            var isRightPressed = (contols & 0b0000_1000) > 0;

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
            var dir = (TargetPos - Movment.Pos);
            var ds = Speed * 1.3f;
            Movment.Velocity = dir.Normalize() * ds;

            if (dir.Length > (Movment.Velocity * dt).Length)
            {
                Move(Movment.Velocity * dt);
            }
            else
            {
                Movment.Pos = TargetPos;
            }
        }

        public bool IsTargetReached() =>  (TargetPos - Movment.Pos).Length < 3;


        public void SetTarget(float x, float y)
        {
            TargetPos = new Vector2D(x, y);
        }

    }
}