using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using WsServer.Abstract;

namespace WsServer.ServerInfo;

public record ServerInfoDto
(
    DateTime StartTime,
    TimeSpan Uptime,
    long WorkingSetBytes,
    double CpuUsagePercent,
    int WebSocketConnections,
    string OSDescription,
    string DotnetVersion
);

public class ServerInfoProvider
{
    private readonly IClientConnectionManager _connectionManager;
    private readonly Process _process;
    private readonly DateTime _startTime;
    private TimeSpan _lastTotalProcessorTime;
    private DateTime _lastSampleTime;

    public ServerInfoProvider(IClientConnectionManager connectionManager)
    {
        _connectionManager = connectionManager;
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
