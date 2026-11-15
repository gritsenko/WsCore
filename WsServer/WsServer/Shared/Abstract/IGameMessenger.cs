using System;
using WsServer.Abstract.Messages;

namespace WsServer.Abstract;

public interface IGameMessenger
{
    void Broadcast<TEventMessage>(TEventMessage @event) where TEventMessage : IServerEvent;

    void Send<TEventMessage>(uint clientId, TEventMessage @event) where TEventMessage : IServerEvent;

    // Sends only to clients that should receive spatial (movement/tick) updates, as an
    // unreliable latest-wins message (a newer one replaces an unsent older one; see
    // IClientConnection.SendLatest for keyframes). Every other method here is reliable and
    // ordered.
    void BroadcastSpatialUpdates<TEventMessage>(TEventMessage @event, bool keyframe = false) where TEventMessage : IServerEvent;

    // True if at least one connected client would receive BroadcastSpatialUpdates — lets
    // the tick skip building/serializing a snapshot nobody will get.
    bool HasSpatialRecipients();

    // Reliable send to every client in a spatial room (game-world events: joins/leaves,
    // shots, slots, respawns, map changes), optionally skipping one client.
    void BroadcastToSpatial<TEventMessage>(TEventMessage @event, uint exceptClientId = 0) where TEventMessage : IServerEvent;

    // Reliable send to every client outside spatial rooms (e.g. the live room list).
    void BroadcastToNonSpatial<TEventMessage>(TEventMessage @event) where TEventMessage : IServerEvent;

    // Reliable send to the members of one room (chat, room user lists).
    void BroadcastToRoom<TEventMessage>(string roomId, TEventMessage @event) where TEventMessage : IServerEvent;

    // Reliable send to every connected client the filter accepts (serialized once, and
    // not at all when nobody matches).
    void BroadcastWhere<TEventMessage>(TEventMessage @event, Func<uint, bool> filter) where TEventMessage : IServerEvent;

    IClientRequest Deserialize(ref byte[] data, out Type messageType);
}