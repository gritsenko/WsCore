using System.Net.WebSockets;
using WsServer.Abstract;
using System.Buffers;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;

namespace WsServer;

public class WebSocketHandler(
    WebSocket socket,
    IGameServer gameServer,
    ILogger<WebSocketHandler> logger,
    IServerLogicProvider serverLogicProvider)
    : IClientConnection
{
    public const int BufferSize = 4096;

    // A client that keeps sending frames we can't process (unknown TypeId, corrupt
    // payload, ...) is dropped after this many consecutive failures, so it can't hold
    // the socket open and flood the logs indefinitely (Copilot review).
    private const int MaxConsecutiveErrors = 10;

    // Cap on a single reconstructed message. A client streaming endless non-final frames
    // would otherwise grow the accumulation buffer without bound (audit §2).
    private const int MaxMessageSize = 64 * 1024;

    public uint Id { get; private set; }

    private int _consecutiveErrors;
    private readonly CancellationTokenSource _cts = new();

    // One send loop per connection drains this queue and awaits each SendAsync in turn;
    // WebSocket forbids concurrent sends on a socket. A slow client sheds the oldest
    // queued frames (stale tick snapshots) instead of back-pressuring the broadcaster
    // or triggering overlapping SendAsync (audit §1.6).
    private const int SendQueueCapacity = 256;
    private readonly Channel<ArraySegment<byte>> _sendChannel =
        Channel.CreateBounded<ArraySegment<byte>>(new BoundedChannelOptions(SendQueueCapacity)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
            SingleWriter = false,
        });
    private Task? _sendLoop;

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

            // Start the send loop before connecting so InitPlayer/state events queued by
            // OnClientConnected are delivered.
            _sendLoop = SendLoopAsync();

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
                        if (messageBuffer.WrittenCount > MaxMessageSize)
                        {
                            logger.LogWarning("Dropping connection {ClientId}: incoming message exceeds {Max} bytes", Id, MaxMessageSize);
                            return;
                        }
                        result = await socket.ReceiveAsync(seg, _cts.Token);
                        if (result.MessageType != WebSocketMessageType.Binary)
                            break;
                        messageBuffer.Write(buffer.AsSpan(0, result.Count));
                    }

                    // Isolate per-message failures (corrupt payload, unknown TypeId,
                    // handler bug) so one bad frame doesn't tear down a healthy connection.
                    // But bound the abuse: a client spamming invalid frames would otherwise
                    // keep the socket open and flood the logs forever, so drop it after too
                    // many consecutive failures (Copilot review).
                    try
                    {
                        gameServer.ProcessClientMessageData(Id, messageBuffer.WrittenSpan.ToArray());
                        _consecutiveErrors = 0;
                    }
                    catch (Exception ex)
                    {
                        _consecutiveErrors++;
                        logger.LogWarning(ex, "Failed to process message from {ClientId} ({Errors}/{Max})",
                            Id, _consecutiveErrors, MaxConsecutiveErrors);
                        if (_consecutiveErrors >= MaxConsecutiveErrors)
                        {
                            logger.LogWarning("Dropping connection {ClientId}: too many consecutive invalid messages", Id);
                            break;
                        }
                    }
                }
                else if (result.MessageType == WebSocketMessageType.Text)
                {
                    // Accumulate text frames
                    var sb = new StringBuilder();
                    sb.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
                    while (!result.EndOfMessage && socket.State == WebSocketState.Open)
                    {
                        if (sb.Length > MaxMessageSize)
                        {
                            logger.LogWarning("Dropping connection {ClientId}: incoming text message exceeds {Max} bytes", Id, MaxMessageSize);
                            return;
                        }
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
            // Abrupt client disconnects (browser closed, network drop, client abort)
            // surface here — a normal lifecycle event, not a server error.
            logger.LogInformation("WebSocket connection {ClientId} closed: {Message}", Id, ex.Message);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "General error in WebSocket handler");
        }
        finally
        {
            _sendChannel.Writer.TryComplete();
            if (Id != 0)
                gameServer.OnClientDisconnected(Id);

            // Stop the send loop (cancel unblocks a SendAsync stuck on a dead socket) and
            // wait for it to finish before disposing the token source it observes.
            try { _cts.Cancel(); } catch (ObjectDisposedException) { }
            if (_sendLoop != null)
            {
                try { await _sendLoop; } catch { /* already logged in the loop */ }
            }
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
                // Route through the game server so it runs on the tick thread via the
                // command queue, same as binary requests (audit §1.4).
                gameServer.ProcessClientRequest(Id, clientReq);
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
        _sendChannel.Writer.TryComplete();
        try { _cts.Cancel(); } catch (ObjectDisposedException) { }
    }

    public void Send(ArraySegment<byte> messageData)
    {
        // Non-blocking enqueue; the send loop delivers it in order. DropOldest discards
        // stale frames for a slow client instead of blocking the broadcaster (audit §1.6).
        _sendChannel.Writer.TryWrite(messageData);
    }

    private async Task SendLoopAsync()
    {
        try
        {
            await foreach (var segment in _sendChannel.Reader.ReadAllAsync(_cts.Token))
            {
                await socket.SendAsync(segment, WebSocketMessageType.Binary, true, _cts.Token);
            }
        }
        catch (OperationCanceledException)
        {
            // Connection is shutting down.
        }
        catch (WebSocketException)
        {
            // Client went away mid-send (abrupt close/abort); the receive loop handles
            // teardown. This is a normal disconnect, not worth a warning.
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Send loop for client {ClientId} stopped unexpectedly", Id);
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