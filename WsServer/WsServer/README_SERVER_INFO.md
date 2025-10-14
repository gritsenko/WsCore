Server Info endpoint
====================

A minimal HTTP endpoint is exposed at `/info` which returns JSON with basic server metrics useful for a dashboard.

Returned JSON fields (ServerInfoDto):

- `StartTime` - UTC time when the server started.
- `Uptime` - timespan since start.
- `WorkingSetBytes` - current process working set (memory) in bytes.
- `CpuUsagePercent` - approximate CPU usage of the process (percent across logical CPUs).
- `WebSocketConnections` - number of active websocket connections tracked by the server.
- `OSDescription` - OS description string.
- `DotnetVersion` - .NET runtime description.

Example:

```bash
curl -s http://localhost:5000/info | jq
```

Notes:
- The endpoint is implemented in `Program.cs` and relies on `ServerInfoProvider` in `WsServer.Shared/ServerInfo`.
- CPU sampling is approximate and is calculated from Process.TotalProcessorTime between requests; frequent polling will yield more accurate samples.
