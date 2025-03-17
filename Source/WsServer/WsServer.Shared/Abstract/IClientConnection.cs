using System.Threading.Tasks;
using WsServer.Common;

namespace WsServer.Abstract;

public interface IClientConnection
{
    uint Id { get; }
    Task Send(IServerEvent @event);
    void Terminate();
}