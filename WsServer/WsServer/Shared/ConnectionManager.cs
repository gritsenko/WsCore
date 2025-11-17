using System.Collections.Concurrent;
using System.Collections.Generic;
using WsServer.Abstract;

namespace WsServer;

public class ConnectionManager : IClientConnectionManager
{
    private readonly ConcurrentDictionary<uint, IClientConnection> _connections = new();

    public IEnumerable<IClientConnection> Connections => _connections.Values;

    public IClientConnection? GetConnectionById(uint connectionId)
    {
        return _connections.GetValueOrDefault(connectionId);
    }

    public void Register(IClientConnection connection)
    {
        _connections.TryAdd(connection.Id, connection);
    }

    public void Remove(uint clientId)
    {
        _connections.TryRemove(clientId, out _);
    }
}