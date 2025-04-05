using System.Threading.Tasks;
using WsServer.Abstract.Messages;

namespace WsServer.Abstract;

public interface IClientConnection
{
    uint Id { get; }
    Task Send<TEventMessage>(TEventMessage @event) where TEventMessage : IServerEvent;
    void Terminate();
}