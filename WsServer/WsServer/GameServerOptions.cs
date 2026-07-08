namespace WsServer;

/// <summary>
/// Bound from the "GameServer" section of appsettings.json. Defaults match the values
/// that used to be hardcoded magic numbers throughout the server.
/// </summary>
public class GameServerOptions
{
    public int TickIntervalMs { get; set; } = 33;
    public float MaxDeltaTimeSeconds { get; set; } = 0.1f;

    public int WebSocketBufferSize { get; set; } = 4096;
    public int WebSocketMaxConsecutiveErrors { get; set; } = 10;
    public int WebSocketMaxMessageSizeBytes { get; set; } = 64 * 1024;
    public int WebSocketSendQueueCapacity { get; set; } = 256;

    public float ShootCooldownSeconds { get; set; } = 0.25f; // max ~4 shots/sec
    public float ChatCooldownSeconds { get; set; } = 0.5f;   // max ~2 messages/sec

    public int MaxChatLength { get; set; } = 256;
    public int MaxNameLength { get; set; } = 32;
}
