using System.IO.Compression;
using System.Text;
using WsServer.Games;

namespace WsServer.Tests;

/// <summary>
/// Unpacking an uploaded web build (GameBuild) and putting the jam bridge into its entry
/// (JamSdkInjector) — the rules of the jam portal's docs/web-build, plus refusing what an
/// untrusted archive may try.
/// </summary>
public sealed class GameBuildTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), $"wscore-build-{Guid.NewGuid():N}");

    public GameBuildTests() => Directory.CreateDirectory(_dir);

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch (IOException) { }
    }

    private string Zip(params (string Name, string Content)[] entries) => ZipWith(entries, null);

    private string ZipWith((string Name, string Content)[] entries, Action<ZipArchive>? extra)
    {
        var path = Path.Combine(_dir, Guid.NewGuid().ToString("N") + ".zip");
        using (var archive = ZipFile.Open(path, ZipArchiveMode.Create))
        {
            foreach (var (name, content) in entries)
            {
                var entry = archive.CreateEntry(name);
                using var writer = new StreamWriter(entry.Open());
                writer.Write(content);
            }
            extra?.Invoke(archive);
        }
        return path;
    }

    private string Target() => Path.Combine(_dir, "out-" + Guid.NewGuid().ToString("N")[..6]);

    private static UnpackedBuild Unpack(string upload, string target, string fileName = "game.zip",
        long maxBytes = 10_000_000, int maxFiles = 100)
        => GameBuild.Unpack(upload, fileName, target, maxBytes, maxFiles);

    [Fact]
    public void A_zip_with_one_top_folder_uses_its_index_html()
    {
        var target = Target();
        var build = Unpack(Zip(("mygame/index.html", "<html></html>"), ("mygame/js/game.js", "x"),
            ("mygame/docs/other.html", "")), target);

        Assert.Equal("mygame/index.html", build.EntryPath);
        Assert.Equal(3, build.Files);
        Assert.True(File.Exists(Path.Combine(target, "mygame", "js", "game.js")));
    }

    [Fact]
    public void The_shallowest_index_html_wins_then_any_html()
    {
        Assert.Equal("index.html", GameBuild.PickEntry(["a/b/index.html", "index.html", "page.html"]));
        Assert.Equal("a/index.html", GameBuild.PickEntry(["a/b/index.html", "a/index.html", "z.html"]));
        Assert.Equal("game.htm", GameBuild.PickEntry(["sub/x.html", "game.htm"]));
        Assert.Null(GameBuild.PickEntry([]));
    }

    [Fact]
    public void A_single_html_becomes_index_html()
    {
        var file = Path.Combine(_dir, "proto.html");
        File.WriteAllText(file, "<html><body>hi</body></html>");
        var target = Target();

        var build = Unpack(file, target, "proto.html");

        Assert.Equal("index.html", build.EntryPath);
        Assert.Equal(1, build.Files);
        Assert.Equal("<html><body>hi</body></html>", File.ReadAllText(Path.Combine(target, "index.html")));
    }

    [Theory]
    [InlineData("../evil.js")]
    [InlineData("a/../../evil.js")]
    [InlineData("/etc/evil.js")]
    [InlineData("C:/evil.js")]
    [InlineData("a//b.js")]
    public void Paths_climbing_out_are_refused_and_nothing_is_left_behind(string name)
    {
        var target = Target();
        var e = Assert.Throws<BuildRejectedException>(() => Unpack(Zip(("index.html", ""), (name, "x")), target));
        Assert.Contains("unsafe path", e.Message);
        Assert.False(Directory.Exists(target));
        Assert.False(File.Exists(Path.Combine(_dir, "evil.js")));
    }

    [Fact]
    public void Symlinks_and_mac_junk_are_skipped()
    {
        var target = Target();
        var build = Unpack(ZipWith([("index.html", ""), ("__MACOSX/._index.html", "junk"), ("assets/.DS_Store", "")],
            archive =>
            {
                var link = archive.CreateEntry("link");
                link.ExternalAttributes = unchecked((int)(0xA1FFu << 16)); // S_IFLNK | 0777
                using var writer = new StreamWriter(link.Open());
                writer.Write("/etc/passwd");
            }), target);

        Assert.Equal(1, build.Files);
        Assert.False(File.Exists(Path.Combine(target, "link")));
        Assert.False(Directory.Exists(Path.Combine(target, "__MACOSX")));
    }

    [Fact]
    public void An_archive_without_html_is_refused()
    {
        var e = Assert.Throws<BuildRejectedException>(() => Unpack(Zip(("game.js", "x")), Target()));
        Assert.Contains("no HTML entry", e.Message);
    }

    [Fact]
    public void Limits_count_files_and_the_bytes_actually_written()
    {
        Assert.Throws<BuildRejectedException>(() =>
            Unpack(Zip(("index.html", ""), ("a.js", ""), ("b.js", "")), Target(), maxFiles: 2));
        var big = new string('x', 5000);
        var e = Assert.Throws<BuildRejectedException>(() =>
            Unpack(Zip(("index.html", big), ("a.js", big)), Target(), maxBytes: 8000));
        Assert.Contains("larger than", e.Message);
    }

    [Fact]
    public void Other_file_types_and_broken_zips_are_refused()
    {
        var file = Path.Combine(_dir, "x.zip");
        File.WriteAllText(file, "not a zip");
        Assert.Throws<BuildRejectedException>(() => Unpack(file, Target()));
        Assert.Throws<BuildRejectedException>(() => Unpack(file, Target(), "game.exe"));
    }

    [Fact]
    public void Absolute_asset_paths_draw_a_warning()
    {
        var build = Unpack(Zip(("index.html", "<script src=\"/Build/game.js\"></script>")), Target());
        Assert.Single(build.Warnings);

        var fine = Unpack(Zip(("index.html", "<script src=\"Build/game.js\"></script><a href=\"//cdn.x/y\">")), Target());
        Assert.Empty(fine.Warnings);
    }

    // ---- the bridge tag -----------------------------------------------------------------

    private static readonly string[] Origins = ["https://tox.example", "http://localhost:5001"];
    private const string Tag =
        "<script src=\"/jam-sdk.js\" data-jam-portal-origins=\"https://tox.example,http://localhost:5001\"></script>\n";

    [Fact]
    public void The_tag_goes_before_the_first_script_keeping_meta_charset_first()
    {
        var html = "<html><head><meta charset=\"utf-8\"><title>x</title><script src=\"a.js\"></script></head></html>";
        Assert.Equal(
            "<html><head><meta charset=\"utf-8\"><title>x</title>" + Tag + "<script src=\"a.js\"></script></head></html>",
            JamSdkInjector.Inject(html, Origins));
    }

    [Fact]
    public void Without_scripts_it_goes_before_head_end_then_body_end_then_on_top()
    {
        Assert.Equal("<head>" + Tag + "</head>", JamSdkInjector.Inject("<head></head>", Origins));
        Assert.Equal("<body>" + Tag + "</body>", JamSdkInjector.Inject("<body></body>", Origins));
        Assert.Equal(Tag + "plain", JamSdkInjector.Inject("plain", Origins));
    }

    [Fact]
    public void A_bundled_copy_of_the_sdk_is_replaced_by_ours()
    {
        var html = "<head><script src=\"./lib/jam-sdk.js?v=2\"></script>\n<script src=\"game.js\"></script></head>";
        var result = JamSdkInjector.Inject(html, Origins);
        Assert.Equal("<head>" + Tag + "<script src=\"game.js\"></script></head>", result);
    }

    [Fact]
    public void Non_utf8_entries_are_left_alone_and_a_bom_is_kept()
    {
        Assert.Null(JamSdkInjector.InjectFile([0x3C, 0xFF, 0xFE, 0x3E], Origins));

        var withBom = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes("<head></head>")).ToArray();
        var injected = JamSdkInjector.InjectFile(withBom, Origins)!;
        Assert.Equal(Encoding.UTF8.GetPreamble(), injected[..3]);
        Assert.Contains("jam-sdk.js", Encoding.UTF8.GetString(injected));
    }

    [Fact]
    public void Origins_are_attribute_encoded()
    {
        Assert.Contains("data-jam-portal-origins=\"&quot;x\"", JamSdkInjector.Tag(["\"x"]));
    }

    [Theory]
    [InlineData("Космический Котик 2!", "kosmicheskiy-kotik-2")]
    [InlineData("  Block   Chpok ", "block-chpok")]
    [InlineData("!!!", "")]
    public void Titles_become_slugs(string title, string slug)
        => Assert.Equal(slug, GameCatalog.Slugify(title));
}
