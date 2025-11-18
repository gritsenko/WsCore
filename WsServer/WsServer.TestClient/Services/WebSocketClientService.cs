using System.Net.WebSockets;
using System.Text;

namespace WsServer.TestClient.Services;

/// <summary>
/// Service for managing WebSocket connection to the embedded server
/// </summary>
public class WebSocketClientService
{
    private ClientWebSocket? _client;
    private readonly List<string> _messageHistory = new();
    public event Action<string>? OnMessageReceived;
    public event Action<string>? OnErrorOccurred;

    public bool IsConnected => _client?.State == WebSocketState.Open;
    public IReadOnlyList<string> MessageHistory => _messageHistory.AsReadOnly();

    public async Task<bool> ConnectAsync(string serverUrl)
    {
        try
        {
            _client = new ClientWebSocket();
            await _client.ConnectAsync(new Uri(serverUrl), CancellationToken.None);
            
            // Start receiving messages in background
            _ = ReceiveMessagesAsync();
            
            return true;
        }
        catch (Exception ex)
        {
            OnErrorOccurred?.Invoke($"Connection failed: {ex.Message}");
            return false;
        }
    }

    public async Task DisconnectAsync()
    {
        if (_client?.State == WebSocketState.Open)
        {
            await _client.CloseAsync(WebSocketCloseStatus.NormalClosure, "Client closing", CancellationToken.None);
        }
        _client?.Dispose();
    }

    public async Task SendTextAsync(string message)
    {
        if (_client?.State != WebSocketState.Open)
        {
            OnErrorOccurred?.Invoke("WebSocket is not connected");
            return;
        }

        try
        {
            var data = Encoding.UTF8.GetBytes(message);
            await _client.SendAsync(new ArraySegment<byte>(data), WebSocketMessageType.Text, true, CancellationToken.None);
        }
        catch (Exception ex)
        {
            OnErrorOccurred?.Invoke($"Send failed: {ex.Message}");
        }
    }

    private async Task ReceiveMessagesAsync()
    {
        var buffer = new byte[4096];
        try
        {
            while (_client?.State == WebSocketState.Open)
            {
                var result = await _client.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
                
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    await _client.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", CancellationToken.None);
                    break;
                }

                string message = result.MessageType switch
                {
                    WebSocketMessageType.Text => Encoding.UTF8.GetString(buffer, 0, result.Count),
                    WebSocketMessageType.Binary => $"[Binary: {result.Count} bytes]",
                    _ => "[Unknown message type]"
                };

                _messageHistory.Add($"{DateTime.Now:HH:mm:ss} - {message}");
                OnMessageReceived?.Invoke(message);
            }
        }
        catch (Exception ex)
        {
            OnErrorOccurred?.Invoke($"Receive error: {ex.Message}");
        }
    }

    public void ClearHistory()
    {
        _messageHistory.Clear();
    }
}
