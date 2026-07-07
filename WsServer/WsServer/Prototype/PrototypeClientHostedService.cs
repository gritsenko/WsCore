using System;
using Game.ServerLogic.Chat.Requests;
using Game.ServerLogic.Player.Requests;
using Game.ServerLogic.Rooms.Requests;
// using System.Text.Json; // previously used for JSON-based prototype dispatch
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
    private readonly IMessageSerializer _messageSerializer;

    public PrototypeClientHostedService(
        ILogger<PrototypeClientHostedService> log,
        IServerLogicProvider logicProvider,
        IGameServer gameServer,
        IMessageSerializer messageSerializer)
    {
        _log = log;
        _logicProvider = logicProvider;
        _gameServer = gameServer;
        _messageSerializer = messageSerializer;
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
    {
        var request = new JoinRoomRequest(roomId);
        return DispatchBinary(clientId, request, ct);
    }

    private Task SendSetName(uint clientId, string name, CancellationToken ct)
    {
        var request = new SetPlayerNameRequest { Name = name };
        return DispatchBinary(clientId, request, ct);
    }

    private Task SendChat(uint clientId, string msg, CancellationToken ct)
    {
        var request = new ChatMessageRequest { Message = msg };
        return DispatchBinary(clientId, request, ct);
    }

    private Task DispatchBinary<TRequest>(uint clientId, TRequest request, CancellationToken ct) where TRequest : Abstract.Messages.IClientRequest
    {
        try
        {
            var segment = _messageSerializer.SerializeClientRequest(request);
            _gameServer.ProcessClientMessageData(clientId, segment.ToArray());
            _log.LogInformation("Synthetic client {ClientId} sent {Type} (len={Len})", clientId, request.GetType().Name, segment.Count);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Synthetic dispatch failed for request {Type}", request?.GetType().Name);
        }
        return Task.CompletedTask;
    }

    private sealed class InProcessClientConnection : IClientConnection
    {
        public uint Id => IdInternal;
        public uint IdInternal { get; set; }
        public void Send(ArraySegment<byte> messageData) { } // no-op
        public void Terminate() { }
    }
}
