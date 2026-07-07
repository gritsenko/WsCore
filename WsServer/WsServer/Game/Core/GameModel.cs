using System.Numerics;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using Game.Core.World;
using WsServer.Abstract;

namespace Game.Core;

public class GameModel : IGameModel
{
    // Upper bound on a single tick's delta time. Guards physics against huge jumps
    // after a GC pause / lag spike / the very first tick (when _lastTickTime is default).
    private const float MaxDeltaTime = 0.1f;

    private DateTime _lastTickTime;
    private uint _lastPlayerId;
    private uint _lastBulletId;

    private readonly ConcurrentDictionary<uint, Bullet> _bullets = new();
    private readonly ConcurrentDictionary<uint, Player> _players = new();
    private readonly ConcurrentDictionary<string, int> _playersTop = new();

    private readonly List<HitInfo> _tickHits = [];
    private readonly Lock _tickHitsLock = new Lock();
    private readonly List<uint> _destroyedBulletIds = [];
    private readonly Lock _destroyedBulletIdsLock = new Lock();
    private readonly List<uint> _respawnedPlayerIds = [];
    private readonly Lock _respawnedPlayerIdsLock = new Lock();

    public GameWorld World;
    public int PlayersCount => _players.Count;
    public int BulletsCount => _bullets.Count;
    public int HitsCount => _tickHits.Count;

    public string Top { get; set; }
    public bool TopChanged { get; set; }

    public GameModel()
    {
        World = new GameWorld();
        //_npcProcessor = new NpcProcessor();

        InitTestState();
    }

    private void InitTestState()
    {
        for (int i = 0; i < 10; i++)
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

    public void ForEachPlayers<TItem>(Func<Player, TItem> processFunc, List<TItem> buffer)
    {
        buffer.Clear();
        var enumerator = _players.GetEnumerator();
        try
        {
            while (enumerator.MoveNext())
            {
                buffer.Add(processFunc(enumerator.Current.Value));
            }
        }
        finally
        {
            enumerator.Dispose();
        }
    }

    public Player CreateNewPlayer(bool isBot = false)
    {
        var r = new Random();
        var p = isBot ? new SimpleBot() : new Player();

        p.Id = GetNewPlayerId();
        p.MovementState = new PlayerMovementState()
        {
            Pos = new Vector2((float)(r.NextDouble() * 800), (float)(r.NextDouble() * 600)),
            BodyAngle = (int)(r.NextDouble() * 360),
            AimPos = new Vector2((float)(r.NextDouble() * 800), (float)(r.NextDouble() * 600)),
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

    // Handlers run concurrently on socket threads, so id generation must be atomic —
    // a plain ++ races and produces duplicate ids whose TryAdd silently drops (audit §1.2).
    public uint GetNewPlayerId() => Interlocked.Increment(ref _lastPlayerId);

    public void UpdateGameState(DateTime time, Action onUpdatedAction)
    {
        var dt = (float)(time - _lastTickTime).TotalSeconds;
        dt = Math.Clamp(dt, 0f, MaxDeltaTime);
        _lastTickTime = time;

        _destroyedBulletIds.Clear();

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
            // Bullet.Update flags IsDestroyed once its lifetime expires. Both timed-out and
            // collided bullets must be collected here, otherwise missed shots accumulate in
            // _bullets forever (memory leak + wasted collision checks every tick).
            if (bullet.IsDestroyed)
            {
                _destroyedBulletIds.Add(bullet.Id);
            }
            else if (CheckBulletForCollisions(bullet, out var hitPlayer))
            {
                _tickHits.Add(new HitInfo(hitPlayer.Id, (byte)bullet.HitPoints, bullet.SpawnerId));
                _destroyedBulletIds.Add(bullet.Id);
                bullet.IsDestroyed = true;
            }
        }

        onUpdatedAction.Invoke();

        foreach (var bulletId in _destroyedBulletIds)
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

            var dist = Vector2.Distance(player.MovementState.Pos, bullet.Pos);
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
        if (_players.TryRemove(id, out var player))
        {
            // Otherwise every unique name accumulates in _playersTop forever and the
            // whole dictionary is re-sorted on each frag (audit §1.3). _playersTop is
            // keyed by name and names aren't unique, so only drop the entry once no
            // remaining player still uses that name (Copilot review).
            if (_players.Values.All(p => p.Name != player.Name))
                _playersTop.TryRemove(player.Name, out _);
            UpdateTopString();
        }
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

    // Returns the resolved name actually assigned (a default is substituted for an empty
    // name), or null if the player no longer exists — so callers broadcast what the model
    // actually holds rather than the raw request.
    public string? SetPlayerName(uint id, string name)
    {
        var p = GetPlayer(id);
        if (p == null) return null;

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
        return p.Name;
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
        p?.UpdateActivity();
    }

    public Player SetPlayerControls(uint id, Vector2 aim, int contols)
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

    public uint[] SpawnBullet(Vector2 pos, Vector2 aimPos, uint spawnerId)
    {
        // A zero/degenerate direction would make Vector2.Normalize produce NaN and spawn a
        // bullet with a NaN position; skip it instead.
        var dir = aimPos - pos;
        if (dir.LengthSquared() < 1e-6f)
            return [];

        var bullet = new Bullet()
        {
            Id = GetNewBulletId(),
            Pos = pos,
            Type = 0,
            Velocity = Vector2.Normalize(dir) * 500f,
            SpawnerId = spawnerId
        };

        _bullets.TryAdd(bullet.Id, bullet);
        return [bullet.Id];
    }

    public uint GetNewBulletId() => Interlocked.Increment(ref _lastBulletId);

    public void GetDestroyedBulletIds(List<uint> buffer)
    {
        buffer.Clear();
        lock (_destroyedBulletIdsLock)
        {
            buffer.AddRange(_destroyedBulletIds);
        }
    }

    public void GetHits(List<HitInfo> buffer)
    {
        buffer.Clear();
        lock (_tickHitsLock)
        {
            buffer.AddRange(_tickHits);
        }
    }

    public void GetRespawnedPlayerIds(List<uint> buffer)
    {
        buffer.Clear();
        lock (_respawnedPlayerIdsLock)
        {
            buffer.AddRange(_respawnedPlayerIds);
        }
    }
}