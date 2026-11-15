using System.Diagnostics;
using System.Runtime.InteropServices;
using Game.Core;
using WsServer.Abstract;
using WsServer.Rooms;

namespace WsServer.ServerInfo;

public record ServerInfoDto
(
    DateTime StartTime,
    TimeSpan Uptime,
    long WorkingSetBytes,
    double CpuUsagePercent,
    int WebSocketConnections,
    // Avatars in the game world (built-in bots + clients in a spatial room). Clients in
    // the lobby have a connection but no avatar.
    int GamePlayers,
    IReadOnlyList<RoomUsageDto> Rooms,
    string OSDescription,
    string DotnetVersion
);

public record RoomUsageDto(string Id, int Users);

public class ServerInfoProvider
{
    private readonly IClientConnectionManager _connectionManager;
    private readonly GameModel _gameModel;
    private readonly RoomManager _roomManager;
    private readonly Process _process;
    private readonly DateTime _startTime;
    private TimeSpan _lastTotalProcessorTime;
    private DateTime _lastSampleTime;

    public ServerInfoProvider(IClientConnectionManager connectionManager, GameModel gameModel, RoomManager roomManager)
    {
        _connectionManager = connectionManager;
        _gameModel = gameModel;
        _roomManager = roomManager;
        _process = Process.GetCurrentProcess();
        _startTime = DateTime.UtcNow;
        _lastTotalProcessorTime = _process.TotalProcessorTime;
        _lastSampleTime = DateTime.UtcNow;
    }

    public ServerInfoDto GetInfo()
    {
        var now = DateTime.UtcNow;
        var totalProc = _process.TotalProcessorTime;
        var elapsed = now - _lastSampleTime;
        double cpuPercent = 0;

        if (elapsed.TotalMilliseconds > 1)
        {
            var cpuDelta = (totalProc - _lastTotalProcessorTime).TotalMilliseconds;
            // CPU percent across all logical processors
            var processorCount = Environment.ProcessorCount;
            cpuPercent = (cpuDelta / (elapsed.TotalMilliseconds * processorCount)) * 100.0;
        }

        // update sample
        _lastSampleTime = now;
        _lastTotalProcessorTime = totalProc;

        var info = new ServerInfoDto(
            StartTime: _startTime,
            Uptime: now - _startTime,
            WorkingSetBytes: _process.WorkingSet64,
            CpuUsagePercent: Math.Round(cpuPercent, 2),
            WebSocketConnections: CountConnections(),
            // Volatile mirror / concurrent collections: safe to read off the tick thread.
            GamePlayers: _gameModel.PlayersCount,
            Rooms: _roomManager.GetAllRooms().OrderBy(r => r.Order).Select(r => new RoomUsageDto(r.Id, r.ClientCount)).ToList(),
            OSDescription: RuntimeInformation.OSDescription,
            DotnetVersion: RuntimeInformation.FrameworkDescription
        );

        return info;
    }

    private int CountConnections()
    {
        try
        {
            return _connectionManager.Connections is System.Collections.ICollection c ? c.Count : System.Linq.Enumerable.Count(_connectionManager.Connections);
        }
        catch
        {
            return 0;
        }
    }
}
