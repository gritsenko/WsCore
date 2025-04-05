using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using System;
using System.Net.WebSockets;
using System.Threading;
using System.Threading.Tasks;
using WsServer.Abstract;
using WsServer.Abstract.Messages;

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

    private readonly CancellationTokenSource _cts = new();

    public static async Task HandleWebSocket(HttpContext context)
    {
        if (!context.WebSockets.IsWebSocketRequest)
            return;

        var socket = await context.WebSockets.AcceptWebSocketAsync();

        var webSocketHandler = context.RequestServices.GetRequiredService<WebSocketHandlerFactory>()
            .CreateHandler(socket);

        await webSocketHandler.ProcessLoop();
    }

    private async Task ProcessLoop()
    {
        try
        {
            var buffer = new byte[BufferSize];
            var seg = new ArraySegment<byte>(buffer);

            if(socket.State == WebSocketState.Open)
                gameServer.OnClientConnected(this, newId => Id = newId);

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

                if (result.MessageType == WebSocketMessageType.Binary)
                {
                    var message = messageSerializer.Deserialize(ref buffer, out var typeId);
                    gameServer.ProcessClientMessage(Id, typeId, message);
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

    public async Task Send<TEventMessage>(TEventMessage @event) where TEventMessage : IServerEvent
    {
        try
        {
            var data = messageSerializer.Serialize(@event);
            await socket.SendAsync(data.AsArraySegment(), WebSocketMessageType.Binary, true, _cts.Token);
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