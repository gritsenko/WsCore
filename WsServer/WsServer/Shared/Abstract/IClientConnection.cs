using System;

namespace WsServer.Abstract;

public interface IClientConnection
{
    uint Id { get; }

    // Queues a reliable message for delivery, in order. Non-blocking: the connection owns
    // a single send loop so concurrent SendAsync on one socket can't happen (audit §1.6).
    // Never silently dropped — a connection that can't keep up is terminated instead.
    void Send(ArraySegment<byte> messageData);

    // Queues an unreliable "latest state" message (the tick snapshot): replaces any
    // not-yet-sent previous one, so a slow client skips stale frames. A keyframe (a full
    // snapshot) is the exception: a pending keyframe is replaced only by a newer keyframe,
    // never by a non-keyframe (that one is dropped instead), so a delta stream that loses
    // frames still delivers every keyframe a slow client can take. Connections without a
    // separate slot (in-process fakes) simply treat it as a normal send.
    void SendLatest(ArraySegment<byte> messageData, bool keyframe = false) => Send(messageData);
    void Terminate();
}