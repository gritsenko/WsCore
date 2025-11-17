using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using WsServer.Abstract;

namespace WsServer.Prototype;

/// <summary>
/// In-process synthetic client for scripted interactions (load / behavior prototyping).
/// Enabled when env var WS_PROTO_CLIENT=="1".
/// </summary>
public sealed class PrototypeClientHostedService : BackgroundService
{
    private readonly ILogger<PrototypeClientHostedService> _log;
    private readonly IServerLogicProvider _logicProvider;
    private readonly IGameServer _gameServer;

    public PrototypeClientHostedService(
        ILogger<PrototypeClientHostedService> log,
        IServerLogicProvider logicProvider,
        IGameServer gameServer)
    {
        _log = log;
        _logicProvider = logicProvider;
        _gameServer = gameServer;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!ShouldRun())
        {
            _log.LogInformation("Prototype synthetic client disabled (WS_PROTO_CLIENT != 1).");
            return;
        }
        _log.LogInformation("Starting prototype synthetic client...");

        // Create a fake connection implementing IClientConnection so GameServer can treat it normally.
        var fakeConnection = new InProcessClientConnection();
        _gameServer.OnClientConnected(fakeConnection, newId => fakeConnection.IdInternal = newId);

        // Simple scripted sequence
        await SendJoinRoom(fakeConnection.Id, "lobby", stoppingToken);
        await Task.Delay(500, stoppingToken);
        await SendSetName(fakeConnection.Id, "SyntheticBot" + fakeConnection.Id, stoppingToken);
        for (int i = 0; i < 5 && !stoppingToken.IsCancellationRequested; i++)
        {
            await SendChat(fakeConnection.Id, $"Hello tick #{i}", stoppingToken);
            await Task.Delay(1000, stoppingToken);
        }

        _log.LogInformation("Synthetic client finished script.");
    }

    private bool ShouldRun() => Environment.GetEnvironmentVariable("WS_PROTO_CLIENT") == "1";

    private Task SendJoinRoom(uint clientId, string roomId, CancellationToken ct)
        => DispatchJson(clientId, JsonSerializer.Serialize(new { typeId = 251, RoomId = roomId }), ct);

    private Task SendSetName(uint clientId, string name, CancellationToken ct)
        => DispatchJson(clientId, JsonSerializer.Serialize(new { typeId = 100, Name = name }), ct);

    private Task SendChat(uint clientId, string msg, CancellationToken ct)
        => DispatchJson(clientId, JsonSerializer.Serialize(new { typeId = 200, Message = msg }), ct);

    private Task DispatchJson(uint clientId, string json, CancellationToken ct)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (!root.TryGetProperty("typeId", out var p) || !p.TryGetByte(out var typeId))
            {
                _log.LogWarning("Synthetic payload missing typeId: {Json}", json);
                return Task.CompletedTask;
            }
            var reqType = _logicProvider.FindClientRequestTypeById(typeId);
            var obj = Activator.CreateInstance(reqType);
            if (obj == null) return Task.CompletedTask;
            foreach (var prop in reqType.GetProperties())
            {
                if (prop.Name.Equals("TypeId", StringComparison.OrdinalIgnoreCase)) continue;
                if (root.TryGetProperty(prop.Name, out var val))
                {
                    try
                    {
                        object? converted = val.ValueKind switch
                        {
                            JsonValueKind.String => val.GetString(),
                            JsonValueKind.Number => Convert.ChangeType(val.GetRawText(), prop.PropertyType),
                            JsonValueKind.True => true,
                            JsonValueKind.False => false,
                            _ => null
                        };
                        if (converted != null && prop.CanWrite) prop.SetValue(obj, converted);
                    }
                    catch (Exception e)
                    {
                        _log.LogWarning(e, "Failed to set property {Prop}", prop.Name);
                    }
                }
            }
            if (obj is Abstract.Messages.IClientRequest req && _logicProvider.TryGetRequestHandler(reqType, out var handler) && handler != null)
            {
                handler.Handle(clientId, req);
                _log.LogInformation("Synthetic sent {Type} -> {Json}", reqType.Name, json);
            }
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Synthetic dispatch failed for {Json}", json);
        }
        return Task.CompletedTask;
    }

    private sealed class InProcessClientConnection : IClientConnection
    {
        public uint Id => IdInternal;
        public uint IdInternal { get; set; }
        public Task Send(ArraySegment<byte> messageData) => Task.CompletedTask; // no-op
        public void Terminate() { }
    }
}
