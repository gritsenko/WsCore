using WsServer.Abstract.Messages;

namespace WsServer.Abstract;

public interface IGameMessenger
{
    void Broadcast<TEventMessage>(TEventMessage @event) where TEventMessage : IServerEvent;

    void Send<TEventMessage>(uint clientId, TEventMessage @event) where TEventMessage : IServerEvent;
}