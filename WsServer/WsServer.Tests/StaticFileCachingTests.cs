namespace WsServer.Tests;

public class StaticFileCachingTests
{
    [Theory]
    // Vite's content-hashed chunks: cached forever.
    [InlineData("/assets/index-BisQn8nO.js", "index-BisQn8nO.js", StaticFileCaching.Immutable)]
    [InlineData("/assets/GameScene-DfXUp2bk.js", "GameScene-DfXUp2bk.js", StaticFileCaching.Immutable)]
    [InlineData("/assets/three-CiI1FoP6.js", "three-CiI1FoP6.js", StaticFileCaching.Immutable)]
    [InlineData("/assets/index-a1b2c3d4.css", "index-a1b2c3d4.css", StaticFileCaching.Immutable)]
    // index.html (also served for "/" via UseDefaultFiles): always revalidated.
    [InlineData("/index.html", "index.html", StaticFileCaching.NoCache)]
    [InlineData("/", "index.html", StaticFileCaching.NoCache)]
    // What open pages poll to notice a new build.
    [InlineData("/version.json", "version.json", StaticFileCaching.NoCache)]
    // Unhashed public assets: no explicit Cache-Control.
    [InlineData("/assets/logo.png", "logo.png", null)]
    [InlineData("/assets/Murlyka_icon.png", "Murlyka_icon.png", null)]
    [InlineData("/assets/ground-textures.png", "ground-textures.png", null)] // 8 lowercase letters, not a hash
    [InlineData("/assets/knight/01_idle_sword.png", "01_idle_sword.png", null)]
    [InlineData("/assets/knight/sprite-AbCd1234.png", "sprite-AbCd1234.png", null)] // not Vite's flat output
    [InlineData("/knight/01_idle_sword.png", "01_idle_sword.png", null)]
    [InlineData("/map/ground/Ground.png", "Ground.png", null)]
    [InlineData("/proto-client.html", "proto-client.html", null)]
    public void CacheControlFor_ClassifiesFiles(string path, string fileName, string? expected)
        => Assert.Equal(expected, StaticFileCaching.CacheControlFor(path, fileName));
}
