using System.Numerics;
using Game.Core;
using WsServer;

namespace WsServer.Tests;

public class GameModelTests
{
    private static GameModel NewModel() => new(new GameServerOptions());

    // The constructor auto-spawns 10 bots at random positions (InitTestState) as sample
    // data; strip them out when a test needs a bullet's flight path guaranteed clear.
    private static GameModel NewModelWithoutBots()
    {
        var model = NewModel();
        foreach (var p in model.GetPlayers().ToList())
            model.RemovePlayer(p.Id);
        return model;
    }

    [Fact]
    public void SpawnBullet_ExpiredLifetime_IsRemovedFromModel()
    {
        var model = NewModelWithoutBots();
        var playerId = model.AddNewPlayer();

        model.SpawnBullet(new Vector2(0, 0), new Vector2(1, 0), playerId);
        Assert.Equal(1, model.BulletsCount);

        // Advance in realistic ~33ms ticks — a single huge jump would be clamped to
        // MaxDeltaTimeSeconds (audit's dt-clamp fix), so simulate enough real ticks to
        // clear Bullet.MaxLifetime (2s) without hitting anyone.
        var t = DateTime.UtcNow;
        for (int i = 0; i < 80; i++)
        {
            t = t.AddMilliseconds(33);
            model.UpdateGameState(t, () => { });
        }

        Assert.Equal(0, model.BulletsCount);
    }

    [Fact]
    public void SpawnBullet_DegenerateDirection_IsNotSpawned()
    {
        var model = NewModel();
        var playerId = model.AddNewPlayer();

        var ids = model.SpawnBullet(new Vector2(5, 5), new Vector2(5, 5), playerId);

        Assert.Empty(ids);
        Assert.Equal(0, model.BulletsCount);
    }

    [Fact]
    public void SpawnBullet_HitsOtherPlayer_RegistersHitAndDestroysBullet()
    {
        var model = NewModelWithoutBots();
        var shooterId = model.AddNewPlayer();
        var targetId = model.AddNewPlayer();

        var shooter = model.GetPlayer(shooterId);
        var target = model.GetPlayer(targetId);
        shooter.SetPos(0, 0);
        target.SetPos(10, 0); // well within Player.Radius (48) of the bullet's spawn point

        model.SpawnBullet(new Vector2(0, 0), new Vector2(1, 0), shooterId);

        var hits = new List<HitInfo>();
        model.UpdateGameState(DateTime.UtcNow, () => model.GetHits(hits));

        Assert.Single(hits);
        Assert.Equal(targetId, hits[0].PlayerId);
        Assert.Equal(0, model.BulletsCount); // collided bullet is cleaned up same tick
    }

    [Fact]
    public void UpdateGameState_DeadPlayerWithNoRespawnTimer_RespawnsWithFullHp()
    {
        var model = NewModel();
        var playerId = model.AddNewPlayer();
        var player = model.GetPlayer(playerId);
        player.Hp = 0; // simulate death by any means; RespawnTime defaults to 0

        var respawned = new List<uint>();
        model.UpdateGameState(DateTime.UtcNow, () => model.GetRespawnedPlayerIds(respawned));

        Assert.Contains(playerId, respawned);
        Assert.Equal(player.MaxHp, model.GetPlayer(playerId).Hp);
    }

    [Fact]
    public void RemovePlayer_LastHolderOfAName_ClearsThemFromTop()
    {
        var model = NewModelWithoutBots();

        var id = model.AddNewPlayer();
        Assert.NotEqual(string.Empty, model.Top); // one entry present

        model.RemovePlayer(id);

        Assert.Equal(string.Empty, model.Top); // audit §1.3: no longer accumulates forever
    }

    [Fact]
    public void GetNewPlayerId_ConcurrentCalls_NeverProducesDuplicates()
    {
        var model = NewModel();
        var ids = new System.Collections.Concurrent.ConcurrentBag<uint>();

        Parallel.For(0, 500, _ => ids.Add(model.GetNewPlayerId()));

        Assert.Equal(500, ids.Distinct().Count());
    }
}
