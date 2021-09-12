using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using GameModel.Common.Math;

namespace GameModel
{

    public class Game
    {
        private uint _lastPlayerId;
        private uint _lastBulletId;

        private readonly ConcurrentDictionary<uint, Bullet> _bullets = new();
        private readonly ConcurrentDictionary<uint, Player> _players = new();
        private readonly ConcurrentDictionary<string, int> _playersTop = new();

        private readonly ConcurrentBag<HitInfo> _tickHits = new();

        public World World;
        public int PlayersCount => _players.Count;
        public int HitsCount => _tickHits.Count;

        public string Top { get; set; }

        public Game()
        {
            World = new World();
            //_npcProcessor = new NpcProcessor();
            //_players = new Players();

            InitTestState();
        }

        private void InitTestState()
        {
            for (int i = 0; i < 0; i++)
            {
                var p = CreateNewPlayer(true);
                _players[p.Id] = p;
            }
        }

        public IEnumerable<Player> GetPlayers()
        {
            foreach (var player in _players)
            {
                yield return player.Value;
            }
        }

        public Player CreateNewPlayer(bool isBot = false)
        {
            var r = new Random();
            var p = isBot ? new SimpleBot() : new Player();

            p.Id = GetNewPlayerId();
            p.Movement = new PlayerMovementState()
            {
                Pos = new Vector2D((float)(r.NextDouble() * 800), (float)(r.NextDouble() * 600)),
                BodyAngle = (int)(r.NextDouble() * 360),
                AimPos = new Vector2D((float)(r.NextDouble() * 800), (float)(r.NextDouble() * 600)),
                ControlsState = 0
            };

            p.TargetPos = p.Movement.Pos;
            p.Hp = 100;
            p.Maxhp = 100;

            p.Name = "Player " + p.Id;

            if (isBot)
                p.Name = "@" + p.Name;
            return p;
        }

        public uint GetNewPlayerId() => ++_lastPlayerId;

        public void OnTick(float dt)
        {
            foreach (var bot in _players)
            {
                bot.Value.Update(dt);
            }

            foreach (var (_, bullet) in _bullets)
            {
                bullet.Update(dt);
                if (CheckBulletForCollisions(bullet, out var hitPlayer))
                {
                    var hitInfo = HitPlayer(hitPlayer.Id, bullet.HitPoints, bullet.SpawnerId);
                    _tickHits.Add(hitInfo);
                    bullet.IsDestroyed = true;
                }
            }
        }
        public void FlushTickData()
        {
            RemoveDestroyedBullets();
            _tickHits.Clear();
        }


        private bool CheckBulletForCollisions(Bullet bullet, out Player hitPlayer)
        {
            hitPlayer = default;
            if (bullet.IsDestroyed) return false;

            foreach (var (id, player) in _players)
            {
                if (id == bullet.SpawnerId)
                    continue;

                var dist = (player.Movement.Pos - bullet.Pos).Length;
                if (dist <= Player.Radius)
                {
                    hitPlayer = player;
                    return true;
                }
            }

            return false;
        }

        public void RemovePlayer(uint id)
        {
            _players.TryRemove(id, out _);
        }

        public void AddPlayer(Player player)
        {
            _players[player.Id] = player;
            if (!_playersTop.ContainsKey(player.Name))
                _playersTop[player.Name] = 0;
        }

        public HitInfo HitPlayer(uint playerId, int hitPoints, uint hitterId)
        {
            var p1 = GetPlayer(playerId);
            var p2 = GetPlayer(hitterId);

            if (p1.Hit(hitPoints))
            {
                AddFrag(p1, -1);

                if (playerId != hitterId)
                    AddFrag(p2, 2);
            }

            return new HitInfo(playerId, p1.Hp, hitterId);
        }

        public Player GetPlayer(uint id)
        {
            _players.TryGetValue(id, out var p);
            return p;
        }

        private void AddFrag(Player player, int value = 1)
        {
            player.AddFrag(value);

            if (!_playersTop.ContainsKey(player.Name))
                _playersTop[player.Name] = 0;

            _playersTop[player.Name] += value;
        }

        public Player RespawnPlayer(uint id)
        {
            var r = new Random();
            var p = GetPlayer(id);

            if (p != null)
            {
                p.Hp = 100;
                p.SetPos((float)(r.NextDouble() * 1700), (float)(r.NextDouble() * 960));
            }
            return p;
        }

        public void SetPlayerName(uint id, string name)
        {
            var p = GetPlayer(id);
            if (string.IsNullOrEmpty(name))
            {
                name = "Player " + p.Id;
            }

            p.Name = name;

            p.UpdateActivity();
        }

        public Player MovePlayer(uint id, float x, float y)
        {
            var p = GetPlayer(id);
            if (p != null)
            {
                p.SetPos(x, y);
                p.UpdateActivity();
            }
            return p;
        }
        public Player SetPlayerTarget(uint id, float x, float y)
        {
            var p = GetPlayer(id);
            if (p != null)
            {
                p.SetTarget(x, y);
                p.UpdateActivity();
            }
            return p;
        }

        public void UpdatePlayerActivity(uint id)
        {
            var p = GetPlayer(id);
            p.UpdateActivity();
        }

        public Player SetPlayerControls(uint id, Vector2D aim, int contols)
        {
            var p = GetPlayer(id);
            if (p != null)
            {
                p.Movement.ControlsState = contols;
                p.Movement.AimPos = aim;
                p.UpdateActivity();
            }
            return p;
        }

        public uint[] SpawnBullet(Vector2D pos, Vector2D aimPos, uint spawnerId)
        {
            var bullet = new Bullet()
            {
                Id = GetNewBulletId(),
                Pos = pos,
                Type = 0,
                Velocity = (aimPos-pos).Normalize() * 500f,
                SpawnerId = spawnerId
            };

            _bullets.TryAdd(bullet.Id, bullet);
            return new[] {bullet.Id};
        }

        public uint GetNewBulletId() => ++_lastBulletId;

        public IEnumerable<Bullet> GetDestroyedBullets()
        {
            return _bullets.Values.Where(x => x.IsDestroyed);
        }

        public void RemoveDestroyedBullets()
        {
            foreach (var bullet in _bullets.Values.Where(x => x.IsDestroyed).ToArray())
            {
                _bullets.TryRemove(bullet.Id, out _);
            }
        }

        public IEnumerable<HitInfo> GetHits()
        {
            return _tickHits;
        }
    }
}