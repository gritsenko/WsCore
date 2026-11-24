using System.Buffers.Binary;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging;
using WsServer.Games;
using WsServer.Sessions;

namespace WsServer.Tests.Integration;

/// <summary>
/// A game's pictures (cover, header, screenshots) over real HTTP — uploaded with a token or
/// the browser's user key, served immutable — and the game page's link-preview tags.
/// </summary>
public sealed class GameMediaTests : IAsyncLifetime
{
    private const string Portal = "https://portal.test";
    private readonly string _data = Path.Combine(Path.GetTempPath(), $"wscore-media-{Guid.NewGuid():N}");
    private WebApplication _app = null!;
    private HttpClient _http = null!;
    private string _token = null!;
    private const string AdminKey = "admin-key-0123456789abcdef";

    private const string IndexHtml = """
        <!DOCTYPE html><html><head>
        <title>TOX — общение</title>
        <meta name="description" content="Default." />
        <link rel="canonical" href="https://tox.test/" />
        <meta property="og:title" content="TOX" />
        <meta property="og:description" content="Default." />
        <meta property="og:url" content="https://tox.test/" />
        <meta property="og:image" content="https://tox.test/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="TOX" />
        </head><body></body></html>
        """;

    public async Task InitializeAsync()
    {
        Directory.CreateDirectory(Path.Combine(_data, "www"));
        await File.WriteAllTextAsync(Path.Combine(_data, "www", "index.html"), IndexHtml);
        var builder = WebApplication.CreateBuilder();
        builder.Logging.ClearProviders();
        builder.Services.AddGameServer(configure: o =>
        {
            o.GamesOrigin = "http://games.test";
            o.PortalOrigins = [Portal];
            o.GamesDataPath = Path.Combine(_data, "games");
            o.MaxGameScreenshots = 2;
            o.GameMaxMediaMb = 1;
        });
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        _app = builder.Build();
        _app.UseGamesOrigin();
        _app.UseGameServer();
        _app.MapGamePages(new PhysicalFileProvider(Path.Combine(_data, "www")));
        await _app.StartAsync();
        var address = _app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.First();
        _http = new HttpClient { BaseAddress = new Uri(address) };

        var server = _app.Services.GetRequiredService<GameServer>();
        var users = _app.Services.GetRequiredService<UserDirectory>();
        var tokens = _app.Services.GetRequiredService<ApiTokens>();
        _token = await server.RunOnTickAsync(() =>
        {
            var admin = users.Create(UserDirectory.HashKey(AdminKey), "Admin");
            admin.IsAdmin = true;
            return tokens.Create(admin.Id, "t")!.Value.Token;
        });
    }

    public async Task DisposeAsync()
    {
        _http.Dispose();
        await _app.StopAsync();
        try { Directory.Delete(_data, recursive: true); } catch (IOException) { }
    }

    private static byte[] Png(int width, int height, int padding = 0)
    {
        var bytes = new byte[33 + padding];
        new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, (byte)'I', (byte)'H', (byte)'D', (byte)'R' }.CopyTo(bytes, 0);
        BinaryPrimitives.WriteUInt32BigEndian(bytes.AsSpan(16), (uint)width);
        BinaryPrimitives.WriteUInt32BigEndian(bytes.AsSpan(20), (uint)height);
        return bytes;
    }

    private async Task<(HttpStatusCode Status, JsonElement Json)> Send(HttpMethod method, string path, HttpContent? content = null,
        bool key = false, bool auth = true)
    {
        var request = new HttpRequestMessage(method, path) { Content = content };
        if (key) request.Headers.Add("X-User-Key", AdminKey);
        else if (auth) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);
        using var response = await _http.SendAsync(request);
        var text = await response.Content.ReadAsStringAsync();
        return (response.StatusCode, text.Length > 0 && text.TrimStart().StartsWith('{') ? JsonDocument.Parse(text).RootElement.Clone() : default);
    }

    private async Task<(string Id, string Slug)> NewGame(string title, bool isPublic)
    {
        var (_, game) = await Send(HttpMethod.Post, "/api/games", JsonContent.Create(new { title, tagline = "Pop the blocks & win" }));
        var id = game.GetProperty("id").GetString()!;
        if (isPublic)
            await Send(HttpMethod.Post, $"/api/games/{id}/visibility", JsonContent.Create(new { visibility = "public" }));
        return (id, game.GetProperty("slug").GetString()!);
    }

    [Fact]
    public void Picture_sizes_are_read_from_their_headers()
    {
        Assert.Equal(("image/png", 640, 360), ImageInfo.Read(Png(640, 360)));
        byte[] gif = [.. "GIF89a"u8, 0x20, 0x03, 0x58, 0x02, 0, 0];
        Assert.Equal(("image/gif", 800, 600), ImageInfo.Read(gif));
        // A baseline JPEG: SOI, an APP0 segment, then SOF0 with height 480 / width 640.
        byte[] jpeg = [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x04, 0x00, 0x00, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x01, 0xE0, 0x02, 0x80, 0x03, 0, 0, 0, 0];
        Assert.Equal(("image/jpeg", 640, 480), ImageInfo.Read(jpeg));
        var webp = new byte[30];
        "RIFF"u8.CopyTo(webp); "WEBP"u8.CopyTo(webp.AsSpan(8)); "VP8X"u8.CopyTo(webp.AsSpan(12));
        webp[24] = 0xFF; webp[25] = 0x03; webp[27] = 0x7F; webp[28] = 0x02; // 1024 × 640
        Assert.Equal(("image/webp", 1024, 640), ImageInfo.Read(webp));
        Assert.Null(ImageInfo.Read("<svg/>"u8));
    }

    [Fact]
    public async Task A_cover_replaces_the_old_one_and_is_served_immutable()
    {
        var (id, _) = await NewGame("Covered", isPublic: true);
        var (s1, first) = await Send(HttpMethod.Put, $"/api/games/{id}/media?kind=cover", new ByteArrayContent(Png(1200, 630)));
        Assert.Equal(HttpStatusCode.Created, s1);
        var firstUrl = new Uri(first.GetProperty("media").GetProperty("url").GetString()!);
        Assert.Equal("portal.test", firstUrl.Host);
        Assert.Equal(1200, first.GetProperty("game").GetProperty("cover").GetProperty("width").GetInt32());

        using (var served = await _http.GetAsync(firstUrl.PathAndQuery))
        {
            Assert.Equal(HttpStatusCode.OK, served.StatusCode);
            Assert.Equal("image/png", served.Content.Headers.ContentType!.MediaType);
            Assert.Contains("immutable", served.Headers.CacheControl!.ToString());
        }

        var (_, second) = await Send(HttpMethod.Put, $"/api/games/{id}/media?kind=cover", new ByteArrayContent(Png(800, 600)), key: true);
        Assert.NotEqual(firstUrl.ToString(), second.GetProperty("game").GetProperty("cover").GetProperty("url").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await _http.GetAsync(firstUrl.PathAndQuery)).StatusCode);
        Assert.Single(Directory.GetFiles(Path.Combine(_data, "games", id, "media")));

        // The socket catalog carries the path.
        var info = _app.Services.GetRequiredService<GameCatalog>().ToInfo(_app.Services.GetRequiredService<GameCatalog>().Find(id)!);
        Assert.StartsWith($"/game-media/{id}/", info.CoverUrl);
    }

    [Fact]
    public async Task Screenshots_are_a_capped_ordered_list()
    {
        var (id, _) = await NewGame("Shots", isPublic: false);
        var (_, a) = await Send(HttpMethod.Put, $"/api/games/{id}/media?kind=screenshot", new ByteArrayContent(Png(10, 10)));
        var (_, b) = await Send(HttpMethod.Put, $"/api/games/{id}/media?kind=screenshot", new ByteArrayContent(Png(20, 20)));
        var aId = a.GetProperty("media").GetProperty("id").GetString()!;
        var bId = b.GetProperty("media").GetProperty("id").GetString()!;
        var (tooMany, _) = await Send(HttpMethod.Put, $"/api/games/{id}/media?kind=screenshot", new ByteArrayContent(Png(30, 30)));
        Assert.Equal(HttpStatusCode.Conflict, tooMany);

        var (_, reordered) = await Send(HttpMethod.Put, $"/api/games/{id}/screenshots", JsonContent.Create(new { ids = new[] { bId, aId } }));
        Assert.Equal([bId, aId], reordered.GetProperty("screenshots").EnumerateArray().Select(m => m.GetProperty("id").GetString()));
        var (_, shorter) = await Send(HttpMethod.Put, $"/api/games/{id}/screenshots", JsonContent.Create(new { ids = new[] { aId } }));
        Assert.Equal(1, shorter.GetProperty("screenshots").GetArrayLength());
        Assert.Equal(HttpStatusCode.BadRequest,
            (await Send(HttpMethod.Put, $"/api/games/{id}/screenshots", JsonContent.Create(new { ids = new[] { "nope" } }))).Status);

        var (_, removed) = await Send(HttpMethod.Delete, $"/api/games/{id}/media/{aId}");
        Assert.Equal(0, removed.GetProperty("screenshots").GetArrayLength());
        Assert.Empty(Directory.GetFiles(Path.Combine(_data, "games", id, "media")));
    }

    [Fact]
    public async Task Not_a_picture_too_large_or_without_rights_is_refused()
    {
        var (id, _) = await NewGame("Refusals", isPublic: true);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await Send(HttpMethod.Put, $"/api/games/{id}/media?kind=cover", new ByteArrayContent("<svg/>"u8.ToArray()))).Status);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await Send(HttpMethod.Put, $"/api/games/{id}/media?kind=banner", new ByteArrayContent(Png(1, 1)))).Status);
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge,
            (await Send(HttpMethod.Put, $"/api/games/{id}/media?kind=cover", new ByteArrayContent(Png(1, 1, 1024 * 1024)))).Status);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await Send(HttpMethod.Put, $"/api/games/{id}/media?kind=cover", new ByteArrayContent(Png(1, 1)), auth: false)).Status);
        Assert.False(Directory.Exists(Path.Combine(_data, "games", id, "media"))
            && Directory.GetFiles(Path.Combine(_data, "games", id, "media")).Length > 0);
    }

    [Fact]
    public async Task The_portal_origin_may_call_the_api_others_may_not()
    {
        var preflight = new HttpRequestMessage(HttpMethod.Options, "/api/games");
        preflight.Headers.Add("Origin", Portal);
        preflight.Headers.Add("Access-Control-Request-Method", "PUT");
        preflight.Headers.Add("Access-Control-Request-Headers", "x-user-key");
        using (var ok = await _http.SendAsync(preflight))
            Assert.Equal(Portal, ok.Headers.GetValues("Access-Control-Allow-Origin").Single());

        var foreign = new HttpRequestMessage(HttpMethod.Options, "/api/games");
        foreign.Headers.Add("Origin", "https://evil.test");
        foreign.Headers.Add("Access-Control-Request-Method", "PUT");
        using (var refused = await _http.SendAsync(foreign))
            Assert.False(refused.Headers.Contains("Access-Control-Allow-Origin"));
    }

    [Fact]
    public async Task A_public_games_page_carries_its_preview_tags_a_draft_does_not()
    {
        var (id, slug) = await NewGame("Блок <Чпок>", isPublic: true);
        await Send(HttpMethod.Put, $"/api/games/{id}/media?kind=cover", new ByteArrayContent(Png(1200, 630)));
        var html = await _http.GetStringAsync($"/games/{slug}");
        Assert.Contains("<title>Блок &lt;Чпок&gt; — игра в TOX</title>", html);
        Assert.Contains("<meta property=\"og:title\" content=\"Блок &lt;Чпок&gt;\" />", html);
        Assert.Contains("<meta property=\"og:description\" content=\"Pop the blocks &amp; win\" />", html);
        Assert.Contains($"<meta property=\"og:url\" content=\"{Portal}/games/{slug}\" />", html);
        Assert.Contains($"<link rel=\"canonical\" href=\"{Portal}/games/{slug}\" />", html);
        Assert.Matches($"<meta property=\"og:image\" content=\"{Portal}/game-media/{id}/[0-9a-f]+\\.png\" />", html);
        Assert.Contains("<meta property=\"og:image:width\" content=\"1200\" />", html);
        Assert.Contains("<meta name=\"twitter:title\" content=\"Блок &lt;Чпок&gt;\" />", html);
        Assert.Contains("og:image:alt", html); // added where the template had none

        var (_, draftSlug) = await NewGame("Secret", isPublic: false);
        var draft = await _http.GetStringAsync($"/games/{draftSlug}");
        Assert.Equal(IndexHtml, draft);
        Assert.Equal(IndexHtml, await _http.GetStringAsync("/games/no-such-game"));
    }
}
