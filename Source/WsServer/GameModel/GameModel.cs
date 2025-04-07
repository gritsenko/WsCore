using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using Game.Core.Common.Math;
using WsServer.Abstract;

namespace Game.Core;

public class GameModel : IGameModel
{
    private uint _lastPlayerId;
    private uint _lastBulletId;

    private readonly ConcurrentDictionary<uint, Bullet> _bullets = new();
    private readonly ConcurrentDictionary<uint, Player> _players = new();
    private readonly ConcurrentDictionary<string, int> _playersTop = new();

    private DateTime _lastTickTime;
    private readonly List<uint> _bulletsToDestroyCache = new(32);
    private readonly ConcurrentBag<HitInfo> _tickHits = new();
    private readonly ConcurrentBag<uint> _respawnedPlayerIds = new();

    public World World;
    public int PlayersCount => _players.Count;
    public int HitsCount => _tickHits.Count;

    public string Top { get; set; }
    public bool TopChanged { get; set; }

    public GameModel()
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

    public IEnumerable<TItem> ForEachPlayers<TItem>(Func<Player, TItem> processFunc)
    {
        foreach (var player in _players)
            yield return processFunc(player.Value);
    }

    public Player CreateNewPlayer(bool isBot = false)
    {
        var r = new Random();
        var p = isBot ? new SimpleBot() : new Player();

        p.Id = GetNewPlayerId();
        p.MovementState = new PlayerMovementState()
        {
            Pos = new Vector2D((float)(r.NextDouble() * 800), (float)(r.NextDouble() * 600)),
            BodyAngle = (int)(r.NextDouble() * 360),
            AimPos = new Vector2D((float)(r.NextDouble() * 800), (float)(r.NextDouble() * 600)),
            ControlsState = 0
        };

        p.TargetPos = p.MovementState.Pos;
        p.Hp = 100;
        p.MaxHp = 100;

        p.Name = "Player " + p.Id;

        if (isBot)
            p.Name = "@" + p.Name;
        return p;
    }

    public uint GetNewPlayerId() => ++_lastPlayerId;

    public void UpdateGameState(DateTime time, Action onUpdatedAction)
    {
        var dt = (time - _lastTickTime).Milliseconds * 0.001f;
        _lastTickTime = time;

        _bulletsToDestroyCache.Clear();

        foreach (var player in _players)
        {
            player.Value.Update(dt);
            if (player.Value.IsDead && player.Value.RespawnTime <= 0)
            {
                _respawnedPlayerIds.Add(player.Key);
                RespawnPlayer(player.Key);
            }
        }

        using var bulletEnumerator = _bullets.GetEnumerator();
        while (bulletEnumerator.MoveNext())
        {
            var bullet = bulletEnumerator.Current.Value;
            bullet.Update(dt);
            if (CheckBulletForCollisions(bullet, out var hitPlayer))
            {
                _tickHits.Add(new HitInfo(hitPlayer.Id, (byte)bullet.HitPoints, bullet.SpawnerId));
                _bulletsToDestroyCache.Add(bullet.Id);
                bullet.IsDestroyed = true;
            }
        }

        onUpdatedAction.Invoke();

        foreach (var bulletId in _bulletsToDestroyCache)
            _bullets.TryRemove(bulletId, out _);

        _tickHits.Clear();
        _respawnedPlayerIds.Clear();
        TopChanged = false;
    }

    private bool CheckBulletForCollisions(Bullet bullet, out Player collidedPlayer)
    {
        collidedPlayer = default;
        if (bullet.IsDestroyed) return false;

        foreach (var (id, player) in _players)
        {
            if (id == bullet.SpawnerId || player.IsDead)
                continue;

            var dist = (player.MovementState.Pos - bullet.Pos).Length;
            if (dist <= Player.Radius)
            {
                collidedPlayer = player;
                return true;
            }
        }

        return false;
    }

    public void RemovePlayer(uint id)
    {
        _players.TryRemove(id, out _);
    }

    public uint AddNewPlayer()
    {
        var p = CreateNewPlayer();
        AddPlayer(p);
        return p.Id;
    }

    public void AddPlayer(Player player)
    {
        _players[player.Id] = player;
        _playersTop.TryAdd(player.Name, 0);

        UpdateTopString();
    }

    private void UpdateTopString()
    {
        Top = string.Join('\n', _playersTop.OrderByDescending(x => x.Value).Select(x => x.Key + " : " + x.Value));
        TopChanged = true;
    }

    public HitInfo HitPlayer(uint playerId, int hitPoints, uint hitterId)
    {
        var p1 = GetPlayer(playerId);
        var p2 = GetPlayer(hitterId);

        if (p1.Hit(hitPoints))
        {
            p1.RespawnTime = 5;

            AddFrag(p1, -1);

            if (playerId != hitterId)
                AddFrag(p2, 1);
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

        _playersTop.TryAdd(player.Name, 0);
        _playersTop[player.Name] += value;

        UpdateTopString();
    }

    public Player RespawnPlayer(uint id)
    {
        var r = new Random();
        var p = GetPlayer(id);

        if (p != null)
        {
            p.Hp = p.MaxHp;
            p.SetPos((float)(r.NextDouble() * 1700), (float)(r.NextDouble() * 960));
            p.SetTarget(p.MovementState.Pos.X, p.MovementState.Pos.Y);
        }
        return p;
    }

    public void SetPlayerName(uint id, string name)
    {
        var p = GetPlayer(id);

        var oldName = p.Name;
        _playersTop.TryRemove(oldName, out var oldScore);

        if (string.IsNullOrEmpty(name))
        {
            name = "Player " + p.Id;
        }

        p.Name = name;

        _playersTop.TryAdd(p.Name, oldScore);

        p.UpdateActivity();

        TopChanged = true;
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
            p.MovementState.ControlsState = contols;
            p.MovementState.AimPos = aim;
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
            Velocity = (aimPos - pos).Normalize() * 500f,
            SpawnerId = spawnerId
        };

        _bullets.TryAdd(bullet.Id, bullet);
        return [bullet.Id];
    }

    public uint GetNewBulletId() => ++_lastBulletId;

    public IEnumerable<uint> GetDestroyedBulletIds()
    {
        foreach (var bullet in _bullets)
        {
            if (bullet.Value.IsDestroyed)
                yield return bullet.Key;
        }
    }

    public IEnumerable<HitInfo> GetHits()
    {
        return _tickHits;
    }

    public IEnumerable<uint> GetRespawnedPlayerIds() => _respawnedPlayerIds;

    public IEnumerable<PlayerMovementState> GetPlayersMovementStates()
    {
        foreach (var player in _players)
            yield return player.Value.MovementState;
    }
}