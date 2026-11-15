using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using WsServer.Abstract;
using WsServer.Abstract.Messages;

namespace WsServer.Tests;

public class HealthEndpointTests
{
    private sealed class FakeGameServer : IGameServer
    {
        public TimeSpan TimeSinceLastTick { get; set; }
        public void ProcessClientMessageData(uint connectionId, byte[] data) { }
        public void ProcessClientRequest(uint connectionId, IClientRequest request) { }
        public void OnClientConnected(IClientConnection connection, Action<uint> onIdCreated) { }
        public void OnClientDisconnected(uint connectionId) { }
    }

    private static async Task<HttpStatusCode> GetHealth(TimeSpan timeSinceLastTick)
    {
        var builder = WebApplication.CreateBuilder();
        builder.Logging.ClearProviders();
        builder.Services.AddSingleton<IGameServer>(new FakeGameServer { TimeSinceLastTick = timeSinceLastTick });
        builder.Services.AddSingleton(new GameServerOptions { HealthMaxTickAgeSeconds = 5 });
        builder.WebHost.UseUrls("http://127.0.0.1:0");

        await using var app = builder.Build();
        app.MapGameHealth();
        await app.StartAsync();

        var address = app.Services.GetRequiredService<IServer>()
            .Features.Get<IServerAddressesFeature>()!.Addresses.First();
        using var http = new HttpClient();
        var response = await http.GetAsync(address + "/health");
        await app.StopAsync();
        return response.StatusCode;
    }

    [Fact]
    public async Task Health_RecentTick_Returns200()
        => Assert.Equal(HttpStatusCode.OK, await GetHealth(TimeSpan.FromMilliseconds(30)));

    [Fact]
    public async Task Health_StaleTick_Returns503()
        => Assert.Equal(HttpStatusCode.ServiceUnavailable, await GetHealth(TimeSpan.FromSeconds(10)));
}
