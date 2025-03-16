using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using System;
using System.Net.WebSockets;
using System.Threading;
using System.Threading.Tasks;
using WsServer.Abstract;
using WsServer.Common;

namespace WsServer;

public class WebSocketHandler(
    WebSocket socket,
    GameServerFacade gameServerFacade,
    IMessageSerializer messageSerializer,
    IGameServer gameServer,
    IGameMessenger gameMessenger,
    ILogger<WebSocketHandler> logger)
    : IWebSocketClient
{
    public const int BufferSize = 4096;
    public uint ClientId { get; set; }

    private bool _isInitialized;
    private readonly CancellationTokenSource _cts = new();

    public static async Task HandleWebSocket(HttpContext context)
    {
        if (!context.WebSockets.IsWebSocketRequest)
            return;

        var socket = await context.WebSockets.AcceptWebSocketAsync();

        var handler = context.RequestServices.GetRequiredService<WebSocketHandlerFactory>()
            .CreateHandler(socket);

        await handler.EchoLoop();
    }

    private async Task EchoLoop()
    {
        try
        {
            var buffer = new byte[BufferSize];
            var seg = new ArraySegment<byte>(buffer);

            while (socket.State == WebSocketState.Open && !_cts.IsCancellationRequested)
            {
                var result = await socket.ReceiveAsync(seg, _cts.Token);

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    await socket.CloseAsync(WebSocketCloseStatus.NormalClosure,
                        "Closing",
                        CancellationToken.None);
                    break;
                }

                if (!_isInitialized)
                {
                    _isInitialized = true;
                    ClientId = RegisterNewClient();
                }

                if (result.MessageType == WebSocketMessageType.Binary)
                {
                    var message = messageSerializer.Deserialize(ref buffer);
                    gameServer.ProcessClientMessage(ClientId, message);
                }
            }
        }
        catch (OperationCanceledException)
        {
            logger.LogInformation("WebSocket connection was canceled");
        }
        catch (WebSocketException ex)
        {
            logger.LogError(ex, "WebSocket error");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "General error in WebSocket handler");
        }
        finally
        {
            if (ClientId != 0)
                RemoveClient(ClientId);

            _cts.Dispose();
        }
    }

    private uint RegisterNewClient()
    {
        var connection = gameServerFacade.Connections.Register(this);
        var playerId = gameServer.AddNewPlayer();
        var clientId = gameMessenger.RegisterClient(playerId, this);
        gameServer.SendGameState(playerId);
        return clientId;
    }

    private void RemoveClient(uint clientId)
    {
        gameMessenger.RemoveClient(clientId);
        gameServer.RemovePlayer(clientId);
    }

    public async Task SendMessage(MyBuffer buffer)
    {
        try
        {
            await buffer.SendAsync(socket);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error sending message to client");
        }
    }

    public void TryToCloseConnection()
    {
        _cts.Cancel();
    }
}

public class WebSocketHandlerFactory(IServiceProvider serviceProvider)
{
    public WebSocketHandler CreateHandler(WebSocket socket)
    {
        return ActivatorUtilities.CreateInstance<WebSocketHandler>(
            serviceProvider,
            socket);
    }
}