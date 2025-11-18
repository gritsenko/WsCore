namespace WsServer.TestClient.Services;

/// <summary>
/// Model for server information
/// </summary>
public class ServerInfo
{
    public string Status { get; set; } = "Unknown";
    public int ActiveConnections { get; set; }
    public int ActiveRooms { get; set; }
    public DateTime StartTime { get; set; }
    public List<RoomInfo> Rooms { get; set; } = new();
}

/// <summary>
/// Model for room information
/// </summary>
public class RoomInfo
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public int ClientCount { get; set; }
    public List<string> Modes { get; set; } = new();
    public bool IsPersistent { get; set; }
}

/// <summary>
/// Service for tracking server and room state
/// </summary>
public class ServerStateService
{
    private readonly ServerInfo _serverInfo = new();
    
    public ServerInfo GetServerInfo() => _serverInfo;

    public void UpdateStatus(string status)
    {
        _serverInfo.Status = status;
    }

    public void UpdateConnections(int count)
    {
        _serverInfo.ActiveConnections = count;
    }

    public void UpdateRooms(List<RoomInfo> rooms)
    {
        _serverInfo.Rooms = rooms ?? new();
        _serverInfo.ActiveRooms = _serverInfo.Rooms.Count;
    }

    public void Initialize()
    {
        _serverInfo.Status = "Connected";
        _serverInfo.StartTime = DateTime.Now;
        
        // Initialize with default rooms
        _serverInfo.Rooms = new List<RoomInfo>
        {
            new() { Id = "lobby", Name = "Lobby", Modes = new() { "TextChat" }, IsPersistent = true },
            new() { Id = "voice", Name = "Voice Room", Modes = new() { "VoiceChat", "TextChat" }, IsPersistent = true },
            new() { Id = "2d-game", Name = "2D Game Room", Modes = new() { "Spatial", "TextChat" }, IsPersistent = true }
        };
        _serverInfo.ActiveRooms = _serverInfo.Rooms.Count;
    }
}
