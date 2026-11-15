using System.Numerics;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using Game.Core.World;
using WsServer;
using WsServer.Abstract;

namespace Game.Core;

public class GameModel : IGameModel
{
    // Upper bound on a single tick's delta time. Guards physics against huge jumps
    // after a GC pause / lag spike / the very first tick (when _lastTickTime is default).
    private readonly float _maxDeltaTime;
    private readonly float _shootCooldownSeconds;

    private TimeSpan _lastTickTime;
    private uint _lastPlayerId;
    private uint _lastBulletId;
    private int _playersCount;
    private int _bulletsCount;

    // Threading model: every mutation and every read of these collections happens on the
    // tick thread — client requests, connects and disconnects all arrive through
    // GameServerBase's command queue — so they are plain, lock-free collections. The only
    // members safe to call from other threads are the id generators (Interlocked) and the
    // PlayersCount/BulletsCount diagnostics (a possibly-stale int read, used by LoadTest).
    private readonly Dictionary<uint, Bullet> _bullets = new();
    private readonly Dictionary<uint, Player> _players = new();
    private readonly Dictionary<string, int> _playersTop = new();

    private readonly List<HitInfo> _tickHits = [];
    private readonly List<uint> _destroyedBulletIds = [];
    private readonly List<uint> _respawnedPlayerIds = [];

    public GameWorld World;

    /// <summary>Simulation time of the latest UpdateGameState (monotonic, since loop start).</summary>
    public TimeSpan Time => _lastTickTime;
    public int PlayersCount => Volatile.Read(ref _playersCount);
    public int BulletsCount => Volatile.Read(ref _bulletsCount);
    public int HitsCount => _tickHits.Count;

    public string Top { get; set; }
    public bool TopChanged { get; set; }

    public GameModel() : this(new GameServerOptions())
    {
    }

    public GameModel(GameServerOptions options)
    {
        _maxDeltaTime = options.MaxDeltaTimeSeconds;
        _shootCooldownSeconds = options.ShootCooldownSeconds;

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
        UpdateCounts();
    }

    // Mirrors the collection sizes into plain ints so cross-thread diagnostic readers
    // never touch the (non-thread-safe) dictionaries themselves.
    private void UpdateCounts()
    {
        Volatile.Write(ref _playersCount, _players.Count);
        Volatile.Write(ref _bulletsCount, _bullets.Count);
    }

    public IEnumerable<Player> GetPlayers()
    {
        foreach (var player in _players.Values)
        {
            yield return player;
        }
    }

    public void ForEachPlayers<TItem>(Func<Player, TItem> processFunc, List<TItem> buffer)
    {
        buffer.Clear();
        foreach (var player in _players.Values)
            buffer.Add(processFunc(player));
    }

    public Player CreateNewPlayer(bool isBot = false) => CreateNewPlayer(GetNewPlayerId(), isBot);

    public Player CreateNewPlayer(uint id, bool isBot = false)
    {
        var r = Random.Shared;
        var p = isBot ? new SimpleBot() : new Player();

        p.Id = id;
        p.MovementState = new PlayerMovementState()
        {
            Pos = new Vector2((float)(r.NextDouble() * 800), (float)(r.NextDouble() * 600)),
            AimPos = new Vector2((float)(r.NextDouble() * 800), (float)(r.NextDouble() * 600)),
            ControlsState = 0
        };

        p.TargetPos = p.MovementState.Pos;
        p.Hp = 100;
        p.MaxHp = 100;
        p.ShootCooldownDuration = _shootCooldownSeconds;

        p.Name = "Player " + p.Id;

        if (isBot)
            p.Name = "@" + p.Name;
        return p;
    }

    // Ids are reserved on socket threads (GameServerBase.OnClientConnected) before the
    // player is added on the tick thread, so generation must be atomic — a plain ++ races
    // and produces duplicate ids (audit §1.2).
    public uint GetNewPlayerId() => Interlocked.Increment(ref _lastPlayerId);

    public void UpdateGameState(TimeSpan time, Action onUpdatedAction)
    {
        var dt = (float)(time - _lastTickTime).TotalSeconds;
        dt = Math.Clamp(dt, 0f, _maxDeltaTime);
        _lastTickTime = time;

        _destroyedBulletIds.Clear();

        foreach (var (id, player) in _players)
        {
            player.Update(dt);
            if (player.IsDead && player.RespawnTime <= 0)
            {
                _respawnedPlayerIds.Add(id);
                RespawnPlayer(id);
            }
        }

        foreach (var bullet in _bullets.Values)
        {
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
            _bullets.Remove(bulletId);
        UpdateCounts();

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
        if (_players.Remove(id, out var player))
        {
            UpdateCounts();
            // Otherwise every unique name accumulates in _playersTop forever and the
            // whole dictionary is re-sorted on each frag (audit §1.3). _playersTop is
            // keyed by name and names aren't unique, so only drop the entry once no
            // remaining player still uses that name (Copilot review).
            if (_players.Values.All(p => p.Name != player.Name))
                _playersTop.Remove(player.Name);
            UpdateTopString();
        }
    }

    public uint AddNewPlayer()
    {
        var id = GetNewPlayerId();
        AddNewPlayer(id);
        return id;
    }

    public void AddNewPlayer(uint id) => AddPlayer(CreateNewPlayer(id));

    /// <summary>
    /// Creates the avatar of a connected client entering the game world (id == its
    /// clientId), carrying over the identity the client set while it had no avatar.
    /// </summary>
    public Player SpawnPlayer(uint id, string name, int bodyIndex, int weaponIndex, int armorIndex)
    {
        var p = CreateNewPlayer(id);
        p.Name = name;
        p.BodyIndex = bodyIndex;
        p.WeaponIndex = weaponIndex;
        p.ArmorIndex = armorIndex;
        AddPlayer(p);
        return p;
    }

    public void AddPlayer(Player player)
    {
        _players[player.Id] = player;
        _playersTop.TryAdd(player.Name, 0);
        UpdateCounts();

        UpdateTopString();
    }

    private void UpdateTopString()
    {
        Top = string.Join('\n', _playersTop.OrderByDescending(x => x.Value).Select(x => x.Key + " : " + x.Value));
        TopChanged = true;
    }

    public Player GetPlayer(uint id)
    {
        _players.TryGetValue(id, out var p);
        return p;
    }

    public Player RespawnPlayer(uint id)
    {
        var r = Random.Shared;
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
        _playersTop.Remove(oldName, out var oldScore);

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
        UpdateCounts();
        return [bullet.Id];
    }

    public uint GetNewBulletId() => Interlocked.Increment(ref _lastBulletId);

    public void GetDestroyedBulletIds(List<uint> buffer)
    {
        buffer.Clear();
        buffer.AddRange(_destroyedBulletIds);
    }

    public void GetHits(List<HitInfo> buffer)
    {
        buffer.Clear();
        buffer.AddRange(_tickHits);
    }

    public void GetRespawnedPlayerIds(List<uint> buffer)
    {
        buffer.Clear();
        buffer.AddRange(_respawnedPlayerIds);
    }
}