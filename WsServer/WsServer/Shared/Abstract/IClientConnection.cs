using System;

namespace WsServer.Abstract;

public interface IClientConnection
{
    uint Id { get; }

    // Queues a message for delivery. Non-blocking: the connection owns a single send
    // loop so concurrent SendAsync on one socket can't happen (audit §1.6).
    void Send(ArraySegment<byte> messageData);
    void Terminate();
}