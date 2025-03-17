using System.Collections.Generic;
using WsServer.Abstract;

namespace WsServer;

public class ConnectionManager : IClientConnectionManager
{
    private readonly Dictionary<uint, IClientConnection> _connections = new();

    public IEnumerable<IClientConnection> Connections => _connections.Values;

    public IClientConnection? GetConnectionById(uint connectionId)
    {
        lock (_connections)
        {
            if (_connections.TryGetValue(connectionId, out var id))
                return id;
        }
        return null;
    }

    public void Register(IClientConnection connection)
    {
        lock (_connections)
        {
            _connections[connection.Id] = connection;
        }
    }

    public void Remove(uint clientId)
    {
        lock (_connections)
        {
            if (_connections.ContainsKey(clientId)) 
                _connections.Remove(clientId);
        }
    }
}