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
    IServerLogicProvider serverLogicProvider,
    GameServerOptions options)
    : IClientConnection
{
    private readonly int _bufferSize = options.WebSocketBufferSize;

    // A client that keeps sending frames we can't process (unknown TypeId, corrupt
    // payload, ...) is dropped after this many consecutive failures, so it can't hold
    // the socket open and flood the logs indefinitely (Copilot review).
    private readonly int _maxConsecutiveErrors = options.WebSocketMaxConsecutiveErrors;

    // Cap on a single reconstructed message. A client streaming endless non-final frames
    // would otherwise grow the accumulation buffer without bound (audit §2).
    private readonly int _maxMessageSize = options.WebSocketMaxMessageSizeBytes;

    public uint Id { get; private set; }

    private int _consecutiveErrors;
    private readonly CancellationTokenSource _cts = new();

    // ---- outgoing traffic -------------------------------------------------------------
    // One send loop per connection awaits each SendAsync in turn (WebSocket forbids
    // concurrent sends on a socket), fed from two sources (audit §1.6):
    //  * reliable events (chat, join/leave, room users, InitPlayer, ...) go to a bounded
    //    FIFO that never drops. If a client falls so far behind that it fills up, the
    //    connection is terminated — the client reconnects and resyncs, instead of silently
    //    losing an event and staying desynced forever.
    //  * the unreliable tick snapshot occupies a single "latest" slot: a newer snapshot
    //    replaces an unsent older one, so a slow client just skips stale frames.
    // Relative order is preserved: the slot remembers how many reliable events had been
    // queued before it, and the sender delivers exactly those first.
    private readonly Channel<ArraySegment<byte>> _reliableQueue =
        Channel.CreateBounded<ArraySegment<byte>>(new BoundedChannelOptions(Math.Max(1, options.WebSocketSendQueueCapacity))
        {
            FullMode = BoundedChannelFullMode.Wait, // TryWrite fails when full -> we terminate
            SingleReader = true,
            SingleWriter = false,
        });
    // Wake-up signal for the send loop; capacity 1, extra signals coalesce.
    private readonly Channel<bool> _sendSignal =
        Channel.CreateBounded<bool>(new BoundedChannelOptions(1) { FullMode = BoundedChannelFullMode.DropWrite });
    private readonly Lock _sendLock = new();
    private long _reliableEnqueued;          // guarded by _sendLock
    private bool _hasLatest;                 // guarded by _sendLock
    private ArraySegment<byte> _latest;      // guarded by _sendLock
    private bool _latestIsKeyframe;          // guarded by _sendLock
    private long _latestAfterReliable;       // guarded by _sendLock: reliable count when _latest was queued
    private long _reliableSent;              // send loop only
    private volatile bool _closed;
    private int _overflowed;
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

    // Public for tests, which drive a handler over a fake WebSocket.
    public async Task ProcessLoop()
    {
        try
        {
            var buffer = new byte[_bufferSize];
            var seg = new ArraySegment<byte>(buffer);
            // Use a reusable ArrayBufferWriter for accumulating frames
            var messageBuffer = new ArrayBufferWriter<byte>(_bufferSize);

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
                        if (messageBuffer.WrittenCount > _maxMessageSize)
                        {
                            logger.LogWarning("Dropping connection {ClientId}: incoming message exceeds {Max} bytes", Id, _maxMessageSize);
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
                            Id, _consecutiveErrors, _maxConsecutiveErrors);
                        if (_consecutiveErrors >= _maxConsecutiveErrors)
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
                        if (sb.Length > _maxMessageSize)
                        {
                            logger.LogWarning("Dropping connection {ClientId}: incoming text message exceeds {Max} bytes", Id, _maxMessageSize);
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
            MarkClosed();
            // Queued behind this connection's connect command on the tick thread, so it
            // can't overtake it (see GameServerBase.OnClientDisconnected).
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
        MarkClosed();
        try { _cts.Cancel(); } catch (ObjectDisposedException) { }
    }

    private void MarkClosed()
    {
        _closed = true;
        _reliableQueue.Writer.TryComplete();
    }

    /// <summary>Queues a reliable message. Never dropped: on overflow the connection is terminated.</summary>
    public void Send(ArraySegment<byte> messageData)
    {
        bool queued;
        lock (_sendLock)
        {
            queued = _reliableQueue.Writer.TryWrite(messageData);
            if (queued)
                _reliableEnqueued++;
        }

        if (queued)
        {
            _sendSignal.Writer.TryWrite(true);
            return;
        }

        if (_closed)
            return; // connection already shutting down; nothing to deliver to

        // Queue full: dropping a reliable event would desync the client permanently, so
        // disconnect it instead (it reconnects and gets a fresh InitPlayer + state).
        if (Interlocked.Exchange(ref _overflowed, 1) == 0)
            logger.LogWarning("Dropping connection {ClientId}: reliable send queue full ({Capacity} messages)",
                Id, options.WebSocketSendQueueCapacity);
        Terminate();
    }

    /// <summary>
    /// Queues an unreliable "latest state" message, replacing any unsent older one — except
    /// that a pending keyframe is only replaced by a newer keyframe (a non-keyframe arriving
    /// while a keyframe is pending is dropped).
    /// </summary>
    public void SendLatest(ArraySegment<byte> messageData, bool keyframe = false)
    {
        lock (_sendLock)
        {
            if (_closed)
                return;
            if (_hasLatest && _latestIsKeyframe && !keyframe)
                return; // keep the pending keyframe; it is already scheduled to go out
            _latest = messageData;
            _latestIsKeyframe = keyframe;
            _latestAfterReliable = _reliableEnqueued;
            _hasLatest = true;
        }
        _sendSignal.Writer.TryWrite(true);
    }

    // Picks the next frame to send: the latest snapshot once every reliable message queued
    // before it has gone out, otherwise the next reliable message.
    private bool TryTakeNext(out ArraySegment<byte> segment)
    {
        lock (_sendLock)
        {
            if (_hasLatest && _reliableSent >= _latestAfterReliable)
            {
                segment = _latest;
                _latest = default;
                _latestIsKeyframe = false;
                _hasLatest = false;
                return true;
            }
        }

        if (_reliableQueue.Reader.TryRead(out segment))
        {
            _reliableSent++;
            return true;
        }

        // A pending snapshot always becomes eligible: every reliable message counted
        // before it was written to the queue under the same lock, so it is readable
        // (even after the queue is completed).
        return false;
    }

    private async Task SendLoopAsync()
    {
        var ct = _cts.Token;
        try
        {
            while (!ct.IsCancellationRequested)
            {
                if (TryTakeNext(out var segment))
                {
                    await socket.SendAsync(segment, WebSocketMessageType.Binary, true, ct);
                    continue;
                }
                await _sendSignal.Reader.ReadAsync(ct);
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