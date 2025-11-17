using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using System;
using System.Net.WebSockets;
using System.Threading;
using System.Threading.Tasks;
using WsServer.Abstract;
using System.Buffers;
using System.Text;
using System.Text.Json;

namespace WsServer;

public class WebSocketHandler(
    WebSocket socket,
    IGameServer gameServer,
    ILogger<WebSocketHandler> logger,
    IServerLogicProvider serverLogicProvider)
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
            // Use a reusable ArrayBufferWriter for accumulating frames
            var messageBuffer = new ArrayBufferWriter<byte>(BufferSize);

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
                    // Accumulate frames until EndOfMessage to reconstruct full payload
                    messageBuffer.Clear();
                    messageBuffer.Write(buffer.AsSpan(0, result.Count));

                    while (!result.EndOfMessage && socket.State == WebSocketState.Open)
                    {
                        result = await socket.ReceiveAsync(seg, _cts.Token);
                        if (result.MessageType != WebSocketMessageType.Binary)
                            break;
                        messageBuffer.Write(buffer.AsSpan(0, result.Count));
                    }

                    // Pass the written buffer to the game server
                    gameServer.ProcessClientMessageData(Id, messageBuffer.WrittenSpan.ToArray());
                }
                else if (result.MessageType == WebSocketMessageType.Text)
                {
                    // Accumulate text frames
                    var sb = new StringBuilder();
                    sb.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
                    while (!result.EndOfMessage && socket.State == WebSocketState.Open)
                    {
                        result = await socket.ReceiveAsync(seg, _cts.Token);
                        if (result.MessageType != WebSocketMessageType.Text)
                            break;
                        sb.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
                    }
                    var json = sb.ToString();
                    ProcessJsonRequest(json);
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

    private void ProcessJsonRequest(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            // Expect a field typeId (byte) OR messageTypeId OR type or TypeId etc.
            byte typeId = 0;
            if (root.TryGetProperty("typeId", out var p) && p.TryGetByte(out typeId) ||
                root.TryGetProperty("TypeId", out p) && p.TryGetByte(out typeId) ||
                root.TryGetProperty("messageTypeId", out p) && p.TryGetByte(out typeId))
            {
                // ok
            }
            else if (root.TryGetProperty("type", out p) && p.ValueKind == JsonValueKind.Number && p.TryGetByte(out typeId))
            {
                // numeric type fallback
            }
            else
            {
                logger.LogWarning("JSON request missing typeId: {Json}", json);
                return;
            }

            var reqType = serverLogicProvider.FindClientRequestTypeById(typeId);
            if (reqType == null)
            {
                logger.LogWarning("Unknown request type id {TypeId}", typeId);
                return;
            }
            var req = Activator.CreateInstance(reqType);
            if (req is null)
            {
                logger.LogWarning("Failed to instantiate request type {Type}", reqType.Name);
                return;
            }
            // Populate properties
            foreach (var prop in reqType.GetProperties())
            {
                var name = prop.Name;
                if (string.Equals(name, "TypeId", StringComparison.OrdinalIgnoreCase))
                    continue;
                if (root.TryGetProperty(name, out var val))
                {
                    object? converted = null;
                    try
                    {
                        converted = val.ValueKind switch
                        {
                            JsonValueKind.String => val.GetString(),
                            JsonValueKind.Number => prop.PropertyType == typeof(int) ? val.GetInt32() :
                                                    prop.PropertyType == typeof(uint) ? (uint)val.GetUInt32() :
                                                    prop.PropertyType == typeof(byte) ? val.GetByte() :
                                                    prop.PropertyType == typeof(double) ? val.GetDouble() :
                                                    val.GetRawText() is var raw ? Convert.ChangeType(raw, prop.PropertyType) : null,
                            JsonValueKind.True => true,
                            JsonValueKind.False => false,
                            _ => null
                        };
                        if (converted != null && prop.CanWrite)
                            prop.SetValue(req, converted);
                    }
                    catch (Exception e)
                    {
                        logger.LogWarning(e, "Failed to set property {Prop} on {Type}", name, reqType.Name);
                    }
                }
            }

            if (req is Abstract.Messages.IClientRequest clientReq)
            {
                if (serverLogicProvider.TryGetRequestHandler(reqType, out var handler) && handler != null)
                {
                    handler.Handle(Id, clientReq);
                }
                else
                {
                    logger.LogWarning("No handler found for request type {Type}", reqType.Name);
                }
            }
            else
            {
                logger.LogWarning("Instantiated request is not IClientRequest: {Type}", reqType.Name);
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to process JSON text message");
        }
    }

    public void Terminate()
    {
        _cts.Cancel();
    }

    public async Task Send(ArraySegment<byte> messageData)
    {
        try
        {
            await socket.SendAsync(messageData, WebSocketMessageType.Binary, true, _cts.Token);
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