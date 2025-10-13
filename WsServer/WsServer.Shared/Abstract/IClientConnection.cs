using System;
using System.Threading.Tasks;

namespace WsServer.Abstract;

public interface IClientConnection
{
    uint Id { get; }
    Task Send(ArraySegment<byte> messageData);
    void Terminate();
}