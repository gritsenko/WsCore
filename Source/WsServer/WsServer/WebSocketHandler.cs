using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using System;
using System.Net.WebSockets;
using System.Threading;
using System.Threading.Tasks;
using WsServer.Abstract;

namespace WsServer;

public class WebSocketHandler(
    WebSocket socket,
    IMessageSerializer messageSerializer,
    IGameServer gameServer,
    ILogger<WebSocketHandler> logger)
    : IClientConnection
{
    public const int BufferSize = 4096;
    public uint Id { get; private set; }

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
                    Id = gameServer.OnClientConnected();
                }

                if (result.MessageType == WebSocketMessageType.Binary)
                {
                    var message = messageSerializer.Deserialize(ref buffer);
                    gameServer.ProcessClientMessage(Id, message);
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
            if (Id != 0)
                gameServer.OnClientDisconnected(Id);

            _cts.Dispose();
        }
    }

    public void Terminate()
    {
        _cts.Cancel();
    }

    public async Task Send(IServerEvent @event)
    {
        try
        {
            var data = messageSerializer.Serialize(@event);
            await data.SendAsync(socket);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error sending message to client");
        }
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