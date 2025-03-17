using System.Collections;
using System.Collections.Generic;

namespace WsServer.Abstract;

public interface IClientConnectionManager
{
    IEnumerable<IClientConnection> Connections { get; }
    IClientConnection? GetConnectionById(uint connectionId);
    void Register(IClientConnection connection);
    void Remove(uint clientId);
}