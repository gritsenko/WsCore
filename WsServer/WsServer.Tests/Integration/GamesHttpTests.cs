using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using WsServer.Games;
using WsServer.Sessions;

namespace WsServer.Tests.Integration;

/// <summary>
/// The games portal over real HTTP: publishing with an API token (create → upload a build →
/// publish), the public catalog, and the games origin — a different Host on the same
/// server — serving the build with the jam bridge injected and nothing else.
/// </summary>
public sealed class GamesHttpTests : IAsyncLifetime
{
    private const string GamesHost = "games.test";
    private const string Portal = "https://portal.test";

    private readonly string _data = Path.Combine(Path.GetTempPath(), $"wscore-games-{Guid.NewGuid():N}");
    private WebApplication _app = null!;
    private HttpClient _http = null!;
    private string _adminToken = null!;
    private string _userToken = null!;

    public async Task InitializeAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.Logging.ClearProviders();
        builder.Services.AddGameServer(configure: o =>
        {
            o.GamesOrigin = $"http://{GamesHost}";
            o.PortalOrigins = [Portal];
            o.GamesDataPath = _data;
            o.GameMaxBuildMb = 1;
        });
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        _app = builder.Build();
        _app.UseGamesOrigin();
        _app.UseGameServer();
        await _app.StartAsync();

        var address = _app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.First();
        _http = new HttpClient { BaseAddress = new Uri(address) };

        // An admin and a plain user, each with a token (made directly: the socket side of
        // tokens is covered by GamesPortalTests).
        var server = _app.Services.GetRequiredService<GameServer>();
        var users = _app.Services.GetRequiredService<UserDirectory>();
        var tokens = _app.Services.GetRequiredService<ApiTokens>();
        (_adminToken, _userToken) = await server.RunOnTickAsync(() =>
        {
            var admin = users.Create(ApiTokens.Hash("admin-key"), "Admin");
            admin.IsAdmin = true;
            var user = users.Create(ApiTokens.Hash("user-key"), "User");
            return (tokens.Create(admin.Id, "test")!.Value.Token, tokens.Create(user.Id, "test")!.Value.Token);
        });
    }

    public async Task DisposeAsync()
    {
        _http.Dispose();
        await _app.StopAsync();
        try { Directory.Delete(_data, recursive: true); } catch (IOException) { }
    }

    private HttpRequestMessage Api(HttpMethod method, string path, string? token, object? body = null)
    {
        var request = new HttpRequestMessage(method, path);
        if (token != null)
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (body != null)
            request.Content = JsonContent.Create(body);
        return request;
    }

    private async Task<(HttpStatusCode Status, JsonElement Json)> Send(HttpRequestMessage request)
    {
        using var response = await _http.SendAsync(request);
        var text = await response.Content.ReadAsStringAsync();
        return (response.StatusCode, text.Length > 0 ? JsonDocument.Parse(text).RootElement.Clone() : default);
    }

    private Task<HttpResponseMessage> FromGamesOrigin(string path)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Host = GamesHost;
        return _http.SendAsync(request);
    }

    private static byte[] ZipBytes(params (string Name, string Content)[] entries)
    {
        using var memory = new MemoryStream();
        using (var archive = new ZipArchive(memory, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var (name, content) in entries)
            {
                using var writer = new StreamWriter(archive.CreateEntry(name).Open());
                writer.Write(content);
            }
        }
        return memory.ToArray();
    }

    private async Task<(HttpStatusCode, JsonElement)> Upload(string game, byte[] bytes, string query, string? token = null)
    {
        var request = Api(HttpMethod.Put, $"/api/games/{game}/build?{query}", token ?? _adminToken);
        request.Content = new ByteArrayContent(bytes);
        // A refused upload is answered before its body is read; the server then closes the
        // connection — don't let the next request reuse it.
        request.Headers.ConnectionClose = true;
        return await Send(request);
    }

    private const string Entry =
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>Test</title>" +
        "<script src=\"game.js\"></script></head><body></body></html>";

    [Fact]
    public async Task Publish_with_a_token_then_play_from_the_games_origin()
    {
        // Creating needs a token, and an admin's.
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await Send(Api(HttpMethod.Post, "/api/games", null, new { title = "Block Chpok" }))).Status);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await Send(Api(HttpMethod.Post, "/api/games", _userToken, new { title = "Block Chpok" }))).Status);

        var (status, created) = await Send(Api(HttpMethod.Post, "/api/games", _adminToken,
            new { title = "Block Chpok", tagline = "Pop the blocks", tags = new[] { "puzzle" } }));
        Assert.Equal(HttpStatusCode.Created, status);
        var id = created.GetProperty("id").GetString()!;
        Assert.Equal("block-chpok", created.GetProperty("slug").GetString());
        Assert.Equal("team", created.GetProperty("visibility").GetString());
        Assert.Equal($"{Portal}/games/block-chpok", created.GetProperty("pageUrl").GetString());

        // A draft is not public.
        var (_, list) = await Send(Api(HttpMethod.Get, "/api/games", null));
        Assert.Equal(0, list.GetArrayLength());
        Assert.Equal(HttpStatusCode.NotFound, (await Send(Api(HttpMethod.Get, "/api/games/block-chpok", null))).Status);
        Assert.Equal(HttpStatusCode.OK, (await Send(Api(HttpMethod.Get, "/api/games/block-chpok", _adminToken))).Status);

        // Upload a build into a nested folder, by slug.
        var zip = ZipBytes(("chpok/index.html", Entry), ("chpok/game.js", "console.log('hi')"),
            ("chpok/assets/level.json", "{}"));
        var (uploaded, result) = await Upload("block-chpok", zip,
            "filename=chpok.zip&version=0.1&notes=" + Uri.EscapeDataString("First **playable**"));
        Assert.Equal(HttpStatusCode.Created, uploaded);
        var release = result.GetProperty("release");
        Assert.Equal(1u, release.GetProperty("no").GetUInt32());
        Assert.Equal("0.1", release.GetProperty("version").GetString());
        Assert.Equal("First **playable**", release.GetProperty("notes").GetString());
        var playUrl = new Uri(result.GetProperty("game").GetProperty("playUrl").GetString()!);
        Assert.Equal(GamesHost, playUrl.Host);
        Assert.Equal($"/g/{id}/r1/chpok/index.html", playUrl.AbsolutePath);

        // The entry, from the games origin: the bridge tag before the first script, with
        // the portal's origin; never cached; only the portal may frame it.
        using (var entry = await FromGamesOrigin(playUrl.AbsolutePath))
        {
            Assert.Equal(HttpStatusCode.OK, entry.StatusCode);
            var html = await entry.Content.ReadAsStringAsync();
            Assert.Contains(
                $"<title>Test</title><script src=\"/jam-sdk.js\" data-jam-portal-origins=\"{Portal}\"></script>\n<script src=\"game.js\">",
                html);
            Assert.Equal("no-cache", entry.Headers.CacheControl!.ToString());
            Assert.Equal($"frame-ancestors {Portal}", entry.Headers.GetValues("Content-Security-Policy").Single());
            Assert.Equal("nosniff", entry.Headers.GetValues("X-Content-Type-Options").Single());
        }

        // The release directory alone, too, serves the entry.
        using (var root = await FromGamesOrigin($"/g/{id}/r1/"))
            Assert.Contains("jam-sdk.js", await root.Content.ReadAsStringAsync());

        // Other files: as uploaded, cached forever.
        using (var js = await FromGamesOrigin($"/g/{id}/r1/chpok/game.js"))
        {
            Assert.Equal("console.log('hi')", await js.Content.ReadAsStringAsync());
            Assert.Contains("immutable", js.Headers.CacheControl!.ToString());
            Assert.StartsWith("text/javascript", js.Content.Headers.ContentType!.ToString());
        }

        // The bridge itself.
        using (var sdk = await FromGamesOrigin("/jam-sdk.js"))
        {
            Assert.Equal(HttpStatusCode.OK, sdk.StatusCode);
            Assert.Contains("window.Jam", await sdk.Content.ReadAsStringAsync());
        }

        // Publish: now everyone sees it.
        var (published, game) = await Send(Api(HttpMethod.Post, $"/api/games/{id}/visibility", _adminToken,
            new { visibility = "public" }));
        Assert.Equal(HttpStatusCode.OK, published);
        Assert.Equal("public", game.GetProperty("visibility").GetString());
        (_, list) = await Send(Api(HttpMethod.Get, "/api/games", null));
        Assert.Equal("Block Chpok", Assert.Single(list.EnumerateArray()).GetProperty("title").GetString());

        // Edit fields by PATCH: only what is named changes.
        var (_, patched) = await Send(Api(HttpMethod.Patch, $"/api/games/{id}", _adminToken, new { tagline = "Pop!" }));
        Assert.Equal("Pop!", patched.GetProperty("tagline").GetString());
        Assert.Equal("Block Chpok", patched.GetProperty("title").GetString());
    }

    [Fact]
    public async Task The_games_origin_serves_nothing_but_builds()
    {
        var (_, created) = await Send(Api(HttpMethod.Post, "/api/games", _adminToken, new { title = "Origin test" }));
        var id = created.GetProperty("id").GetString()!;
        await Upload(id, ZipBytes(("index.html", Entry)), "filename=g.zip");

        foreach (var path in new[] { "/", "/index.html", "/api/games", "/health", "/info", "/avatars/1",
                     $"/g/{id}/r2/index.html", $"/g/{id}/r1/missing.js", $"/g/{id}/r1/..%2F..%2Fsecret",
                     "/g/../../etc/passwd" })
        {
            using var response = await FromGamesOrigin(path);
            Assert.True(response.StatusCode == HttpStatusCode.NotFound, $"{path} → {response.StatusCode}");
        }

        var ws = new HttpRequestMessage(HttpMethod.Post, $"/g/{id}/r1/index.html");
        ws.Headers.Host = GamesHost;
        using (var post = await _http.SendAsync(ws))
            Assert.Equal(HttpStatusCode.MethodNotAllowed, post.StatusCode);

        // The main origin does not serve builds.
        using (var main = await _http.GetAsync($"/g/{id}/r1/index.html"))
            Assert.NotEqual(HttpStatusCode.OK, main.StatusCode);
    }

    [Fact]
    public async Task Bad_builds_are_refused_and_their_number_is_never_reused()
    {
        var (_, created) = await Send(Api(HttpMethod.Post, "/api/games", _adminToken, new { title = "Refusals" }));
        var id = created.GetProperty("id").GetString()!;

        var (noHtml, body) = await Upload(id, ZipBytes(("game.js", "x")), "filename=g.zip");
        Assert.Equal(HttpStatusCode.BadRequest, noHtml);
        Assert.Equal("bad_build", body.GetProperty("error").GetString());

        Assert.Equal(HttpStatusCode.BadRequest, (await Upload(id, ZipBytes(("index.html", "")), "filename=g.exe")).Item1);
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge,
            (await Upload(id, new byte[1024 * 1024 + 1], "filename=g.zip")).Item1);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await Upload(id, ZipBytes(("index.html", "")), "filename=g.zip", _userToken)).Item1);

        // A single .html works; it gets the next free number (the refused upload used 1).
        var (ok, result) = await Upload(id, "<html><body>solo</body></html>"u8.ToArray(), "filename=solo.html");
        Assert.Equal(HttpStatusCode.Created, ok);
        Assert.Equal(2u, result.GetProperty("release").GetProperty("no").GetUInt32());
        Assert.Equal(0, result.GetProperty("warnings").GetArrayLength());
        using var entry = await FromGamesOrigin($"/g/{id}/r2/index.html");
        Assert.Contains("solo<script src=\"/jam-sdk.js\"", await entry.Content.ReadAsStringAsync());

        // Nothing is left behind in the upload area.
        Assert.Empty(Directory.GetFiles(Path.Combine(_data, ".uploads")));
        Assert.Empty(Directory.GetDirectories(Path.Combine(_data, id), "*.tmp-*"));
    }

    [Fact]
    public async Task Stats_are_for_the_games_people_and_the_portals_for_admins()
    {
        var (_, created) = await Send(Api(HttpMethod.Post, "/api/games", _adminToken, new { title = "Stats test" }));
        var id = created.GetProperty("id").GetString()!;
        await Send(Api(HttpMethod.Post, $"/api/games/{id}/visibility", _adminToken, new { visibility = "public" }));

        var (status, stats) = await Send(Api(HttpMethod.Get, $"/api/games/{id}/stats?days=7", _adminToken));
        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(7, stats.GetProperty("days").GetInt32());
        Assert.Equal(0, stats.GetProperty("totals").GetProperty("plays").GetInt64());
        Assert.Equal(0, stats.GetProperty("sessions").GetProperty("sessions").GetInt32());

        Assert.Equal(HttpStatusCode.Forbidden, (await Send(Api(HttpMethod.Get, $"/api/games/{id}/stats", _userToken))).Status);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Send(Api(HttpMethod.Get, $"/api/games/{id}/stats", null))).Status);
        Assert.Equal(HttpStatusCode.OK, (await Send(Api(HttpMethod.Get, "/api/games/stats", _adminToken))).Status);
        Assert.Equal(HttpStatusCode.Forbidden, (await Send(Api(HttpMethod.Get, "/api/games/stats", _userToken))).Status);

        // "stats" can never be a game's slug.
        var (_, statsGame) = await Send(Api(HttpMethod.Post, "/api/games", _adminToken, new { title = "Stats" }));
        Assert.Equal("stats-2", statsGame.GetProperty("slug").GetString());
    }

    [Fact]
    public async Task Whoami_tells_who_the_token_acts_as()
    {
        var (status, me) = await Send(Api(HttpMethod.Get, "/api/me", _adminToken));
        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal("Admin", me.GetProperty("name").GetString());
        Assert.True(me.GetProperty("canPublish").GetBoolean());
        Assert.Equal(HttpStatusCode.Unauthorized, (await Send(Api(HttpMethod.Get, "/api/me", "tox_wrong"))).Status);
    }
}
