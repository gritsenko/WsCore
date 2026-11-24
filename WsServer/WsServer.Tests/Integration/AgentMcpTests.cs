using System.Buffers.Binary;
using System.IO.Compression;
using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;
using WsServer.Games;
using WsServer.Sessions;

namespace WsServer.Tests.Integration;

/// <summary>
/// The agent's MCP tools over real Streamable HTTP with the SDK's own client — the jam
/// portal's tool names and flow: create → push_build → curl the chunks → complete_build,
/// pictures through push_media / attach_media, and the handbook.
/// </summary>
public sealed class AgentMcpTests : IAsyncLifetime
{
    private readonly string _data = Path.Combine(Path.GetTempPath(), $"wscore-agent-{Guid.NewGuid():N}");
    private WebApplication _app = null!;
    private HttpClient _http = null!;
    private string _address = null!;
    private string _adminToken = null!;
    private string _userToken = null!;

    public async Task InitializeAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.Logging.ClearProviders();
        builder.Services.AddGameServer(configure: o =>
        {
            o.GamesOrigin = "http://games.test";
            o.GamesDataPath = _data;
            o.AgentUploadChunkMb = 1;
        });
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        _app = builder.Build();
        _app.UseGamesOrigin();
        _app.UseGameServer();
        await _app.StartAsync();
        _address = _app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.First();
        // Upload URLs are built from the first portal origin: here, this server.
        _app.Services.GetRequiredService<GameServerOptions>().PortalOrigins = [_address];
        _http = new HttpClient { BaseAddress = new Uri(_address) };

        var server = _app.Services.GetRequiredService<GameServer>();
        var users = _app.Services.GetRequiredService<UserDirectory>();
        var tokens = _app.Services.GetRequiredService<ApiTokens>();
        (_adminToken, _userToken) = await server.RunOnTickAsync(() =>
        {
            var admin = users.Create(UserDirectory.HashKey("admin-key-0123456789abcdef"), "Admin");
            admin.IsAdmin = true;
            var user = users.Create(UserDirectory.HashKey("user-key-0123456789abcdef"), "User");
            return (tokens.Create(admin.Id, "agent")!.Value.Token, tokens.Create(user.Id, "agent")!.Value.Token);
        });
    }

    public async Task DisposeAsync()
    {
        _http.Dispose();
        await _app.StopAsync();
        try { Directory.Delete(_data, recursive: true); } catch (IOException) { }
    }

    private Task<McpClient> Client(string token) => McpClient.CreateAsync(new HttpClientTransport(new HttpClientTransportOptions
    {
        Endpoint = new Uri(_address + "/agent/mcp"),
        TransportMode = HttpTransportMode.StreamableHttp,
        AdditionalHeaders = new Dictionary<string, string> { ["Authorization"] = $"Bearer {token}" },
    }));

    private static async Task<JsonElement> Call(McpClient client, string tool, Dictionary<string, object?>? args = null)
    {
        var result = await client.CallToolAsync(tool, args ?? new());
        var text = result.Content.OfType<TextContentBlock>().First().Text;
        Assert.False(result.IsError is true, $"{tool}: {text}");
        return text.TrimStart().StartsWith('{') || text.TrimStart().StartsWith('[')
            ? JsonDocument.Parse(text).RootElement.Clone()
            : JsonDocument.Parse(JsonSerializer.Serialize(text)).RootElement.Clone();
    }

    private static async Task<string> Refusal(McpClient client, string tool, Dictionary<string, object?> args)
    {
        var result = await client.CallToolAsync(tool, args);
        Assert.True(result.IsError, $"{tool} should have failed");
        return result.Content.OfType<TextContentBlock>().First().Text;
    }

    private static (string Url, string Ticket) Target(JsonElement upload)
    {
        var bash = upload.GetProperty("commands").GetProperty("bash").GetString()!;
        var m = Regex.Match(bash, "\"(http[^\"?$]+?)/(?:0|\\$i)\\?t=([0-9a-f]+)\"");
        Assert.True(m.Success, bash);
        return (m.Groups[1].Value, m.Groups[2].Value);
    }

    private async Task<HttpStatusCode> Put(string url, string ticket, int index, byte[] bytes)
    {
        using var response = await _http.PutAsync($"{url}/{index}?t={ticket}", new ByteArrayContent(bytes));
        return response.StatusCode;
    }

    private static byte[] Zip(int noiseBytes)
    {
        using var memory = new MemoryStream();
        using (var archive = new ZipArchive(memory, ZipArchiveMode.Create, leaveOpen: true))
        {
            using (var w = new StreamWriter(archive.CreateEntry("index.html").Open()))
                w.Write("<html><head><script src=\"game.js\"></script></head></html>");
            var noise = new byte[noiseBytes];
            Random.Shared.NextBytes(noise);
            using var s = archive.CreateEntry("noise.bin", CompressionLevel.NoCompression).Open();
            s.Write(noise);
        }
        return memory.ToArray();
    }

    private static byte[] Png(int w, int h)
    {
        var bytes = new byte[33];
        new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, (byte)'I', (byte)'H', (byte)'D', (byte)'R' }.CopyTo(bytes, 0);
        BinaryPrimitives.WriteUInt32BigEndian(bytes.AsSpan(16), (uint)w);
        BinaryPrimitives.WriteUInt32BigEndian(bytes.AsSpan(20), (uint)h);
        return bytes;
    }

    [Fact]
    public async Task Without_a_token_the_endpoint_says_so()
    {
        using var response = await _http.PostAsync("/agent/mcp", new StringContent("{}"));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.StartsWith("Bearer", response.Headers.WwwAuthenticate.ToString());
    }

    [Fact]
    public async Task The_tools_are_the_jam_portals()
    {
        await using var client = await Client(_adminToken);
        var names = (await client.ListToolsAsync()).Select(t => t.Name).ToHashSet();
        foreach (var name in new[] { "whoami", "list_scopes", "list_projects", "get_project", "create_project", "update_project",
                     "push_build", "upload_status", "complete_build", "update_release", "push_media", "attach_media",
                     "set_visibility", "docs" })
            Assert.Contains(name, names);

        var me = await Call(client, "whoami");
        Assert.Equal("Admin", me.GetProperty("name").GetString());
        Assert.True(me.GetProperty("canPublish").GetBoolean());
        Assert.Contains("complete_build", (await Call(client, "docs", new() { ["article"] = "agent" })).GetString());
        Assert.Contains("sdk-leaderboards", (await Call(client, "docs")).GetString());
        Assert.Contains("No article", await Refusal(client, "docs", new() { ["article"] = "nope" }));
        Assert.Contains("personal", await Refusal(client, "create_project", new() { ["title"] = "X", ["scope"] = "team:1" }));

        // Russian as itself, not \uXXXX.
        var raw = await client.CallToolAsync("create_project", new Dictionary<string, object?> { ["title"] = "Котик" });
        Assert.Contains("\"title\":\"Котик\"", raw.Content.OfType<TextContentBlock>().First().Text);
    }

    [Fact]
    public async Task Create_push_a_chunked_build_resume_complete_and_play()
    {
        await using var client = await Client(_adminToken);
        var project = await Call(client, "create_project", new() { ["title"] = "Agent Game", ["tagline"] = "From the agent", ["tags"] = new[] { "arcade" } });
        var id = project.GetProperty("id").GetString()!;
        Assert.Equal("team", project.GetProperty("visibility").GetString());

        // 2.5 MB in 1 MB chunks: three.
        var zip = Zip(2_500_000);
        var push = await Call(client, "push_build", new() { ["projectId"] = "agent-game", ["filename"] = "game.zip", ["size"] = zip.Length });
        Assert.Equal(3, push.GetProperty("chunks").GetInt32());
        Assert.Contains("split -b 1048576", push.GetProperty("commands").GetProperty("bash").GetString());
        var (url, ticket) = Target(push);
        var sessionId = push.GetProperty("sessionId").GetString()!;
        const int chunk = 1024 * 1024;

        Assert.Equal(HttpStatusCode.OK, await Put(url, ticket, 0, zip[..chunk]));
        Assert.Equal(HttpStatusCode.BadRequest, await Put(url, ticket, 1, zip[chunk..(chunk + 10)])); // wrong length
        Assert.Equal(HttpStatusCode.Forbidden, await Put(url, "0000", 1, zip[chunk..(2 * chunk)]));    // wrong ticket
        Assert.Equal(HttpStatusCode.OK, await Put(url, ticket, 2, zip[(2 * chunk)..]));

        var status = await Call(client, "upload_status", new() { ["sessionId"] = sessionId });
        Assert.Equal("[1]", status.GetProperty("missing").GetRawText());
        Assert.Contains("missing", await Refusal(client, "complete_build", new() { ["sessionId"] = sessionId }));

        Assert.Equal(HttpStatusCode.OK, await Put(url, ticket, 1, zip[chunk..(2 * chunk)])); // the resume
        var done = await Call(client, "complete_build", new() { ["sessionId"] = sessionId, ["version"] = "0.1", ["notes"] = "First **build**" });
        Assert.Equal(1, done.GetProperty("releaseId").GetInt32());
        var play = new Uri(done.GetProperty("links").GetProperty("play").GetString()!);
        var request = new HttpRequestMessage(HttpMethod.Get, play.PathAndQuery);
        request.Headers.Host = "games.test";
        using (var entry = await _http.SendAsync(request))
            Assert.Contains("jam-sdk.js", await entry.Content.ReadAsStringAsync());
        Assert.Contains("expired", await Refusal(client, "upload_status", new() { ["sessionId"] = sessionId })); // used up

        var renamed = await Call(client, "update_release", new() { ["projectId"] = id, ["releaseId"] = 1, ["notes"] = "Better notes" });
        Assert.Equal(("0.1", "Better notes"), (renamed.GetProperty("version").GetString(), renamed.GetProperty("notes").GetString()));

        var updated = await Call(client, "update_project", new() { ["projectId"] = id, ["description"] = "## How to play" });
        Assert.Equal("From the agent", updated.GetProperty("tagline").GetString()); // untouched
        Assert.Equal("public", (await Call(client, "set_visibility", new() { ["projectId"] = id, ["visibility"] = "public" }))
            .GetProperty("visibility").GetString());
        Assert.Single((await Call(client, "list_projects")).EnumerateArray(), p => p.GetProperty("id").GetString() == id);
    }

    [Fact]
    public async Task Pictures_go_up_through_push_media_and_attach_media()
    {
        await using var client = await Client(_adminToken);
        var id = (await Call(client, "create_project", new() { ["title"] = "Pictured" })).GetProperty("id").GetString()!;

        async Task<string> Upload(byte[] bytes, string name)
        {
            var push = await Call(client, "push_media", new()
            {
                ["projectId"] = id,
                ["files"] = new[] { new Dictionary<string, object> { ["filename"] = name, ["size"] = bytes.Length } },
            });
            var upload = push.GetProperty("uploads")[0];
            var (url, ticket) = Target(upload);
            Assert.Equal(HttpStatusCode.OK, await Put(url, ticket, 0, bytes));
            return upload.GetProperty("sessionId").GetString()!;
        }

        var cover = await Upload(Png(1200, 630), "cover.png");
        var shotA = await Upload(Png(10, 10), "a.png");
        var shotB = await Upload(Png(20, 20), "b.png");
        var attached = await Call(client, "attach_media", new()
        {
            ["projectId"] = id,
            ["cover"] = cover,
            ["screenshots"] = new[] { new Dictionary<string, object> { ["sessionId"] = shotA }, new Dictionary<string, object> { ["sessionId"] = shotB } },
        });
        Assert.Equal(1200, attached.GetProperty("cover").GetProperty("width").GetInt32());
        var ids = attached.GetProperty("screenshots").EnumerateArray().Select(s => s.GetProperty("id").GetString()!).ToArray();
        Assert.Equal(2, ids.Length);

        // The whole list: keep B first, drop A, add C.
        var shotC = await Upload(Png(30, 30), "c.png");
        var next = await Call(client, "attach_media", new()
        {
            ["projectId"] = id,
            ["screenshots"] = new[] { new Dictionary<string, object> { ["id"] = ids[1] }, new Dictionary<string, object> { ["sessionId"] = shotC } },
        });
        var shots = next.GetProperty("screenshots").EnumerateArray().ToArray();
        Assert.Equal(2, shots.Length);
        Assert.Equal(ids[1], shots[0].GetProperty("id").GetString());
        Assert.Equal(30, shots[1].GetProperty("width").GetInt32());
        Assert.NotNull(next.GetProperty("cover").GetProperty("id").GetString()); // the cover left alone

        Assert.Contains("pictures only", await Refusal(client, "push_media", new()
        {
            ["projectId"] = id,
            ["files"] = new[] { new Dictionary<string, object> { ["filename"] = "x.svg", ["size"] = 10 } },
        }));
    }

    [Fact]
    public async Task Somebody_who_may_not_publish_gets_refusals()
    {
        await using var client = await Client(_userToken);
        Assert.False((await Call(client, "whoami")).GetProperty("canPublish").GetBoolean());
        Assert.Contains("server admins", await Refusal(client, "create_project", new() { ["title"] = "Nope" }));
    }
}
