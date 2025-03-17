using System.Collections.Generic;
using WsServer.Abstract;

namespace WsServer;

public class ConnectionManager : IClientConnectionManager
{
    public Dictionary<uint, IClientConnection> Clients = new();

    public void Register(IClientConnection connection)
    {
        lock (Clients)
        {
            Clients[connection.Id] = connection;
        }
    }

    public void Remove(uint clientId)
    {
        lock (Clients)
        {
            if (Clients.ContainsKey(clientId)) 
                Clients.Remove(clientId);
        }
    }
}