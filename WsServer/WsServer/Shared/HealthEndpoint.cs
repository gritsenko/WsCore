using WsServer.Abstract;

namespace WsServer;

public static class HealthEndpoint
{
    /// <summary>
    /// Maps GET /health: 200 "healthy" while the game tick loop keeps completing ticks,
    /// 503 once no tick has succeeded for <see cref="GameServerOptions.HealthMaxTickAgeSeconds"/>
    /// (loop dead, stalled, or every tick throwing). The loop itself is started by the host
    /// (GameServer is a hosted service), not by this probe.
    /// </summary>
    public static IEndpointConventionBuilder MapGameHealth(this IEndpointRouteBuilder endpoints, string pattern = "/health")
        => endpoints.MapGet(pattern, (IGameServer gameServer, GameServerOptions options) =>
        {
            var age = gameServer.TimeSinceLastTick;
            if (age <= TimeSpan.FromSeconds(options.HealthMaxTickAgeSeconds))
                return Results.Ok("healthy");

            return Results.Json($"unhealthy: no game tick for {age.TotalSeconds:F1}s",
                statusCode: StatusCodes.Status503ServiceUnavailable);
        });
}
