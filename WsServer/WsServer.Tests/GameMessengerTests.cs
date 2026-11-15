using Game.ServerLogic.Chat.Events;
using WsServer.Abstract;
using WsServer.Abstract.Messages;
using WsServer.Rooms;

namespace WsServer.Tests;

public class GameMessengerTests
{
    private sealed class FakeConnection(uint id) : IClientConnection
    {
        public uint Id { get; } = id;
        public int Sent;
        public void Send(ArraySegment<byte> messageData) => Sent++;
        public void Terminate() { }
    }

    private sealed class CountingSerializer(IMessageSerializer inner) : IMessageSerializer
    {
        public int SerializeCalls;

        public ArraySegment<byte> Serialize<T>(T message) where T : IServerEvent
        {
            SerializeCalls++;
            return inner.Serialize(message);
        }

        public ArraySegment<byte> SerializeClientRequest<T>(T request) where T : IClientRequest
            => inner.SerializeClientRequest(request);

        public IClientRequest Deserialize(ref byte[] data, out Type messageType)
            => inner.Deserialize(ref data, out messageType);
    }

    private static (GameMessenger messenger, CountingSerializer serializer, RoomManager rooms, FakeConnection a, FakeConnection b) Setup()
    {
        var provider = new ReflectionServerLogicProvider(typeof(ChatMessageEvent).Assembly, null);
        provider.Initialize();
        var serializer = new CountingSerializer(new MessageSerializer(provider));
        var connections = new ConnectionManager();
        var a = new FakeConnection(1);
        var b = new FakeConnection(2);
        connections.Register(a);
        connections.Register(b);

        var rooms = new RoomManager();
        rooms.CreateRoom("lobby", "Lobby", [RoomCompatibility.TextChat]);
        rooms.CreateRoom("game", "Game", [RoomCompatibility.Spatial, RoomCompatibility.TextChat]);
        rooms.JoinRoom(1, "A", "lobby");
        rooms.JoinRoom(2, "B", "lobby");

        return (new GameMessenger(connections, serializer, rooms), serializer, rooms, a, b);
    }

    [Fact]
    public void BroadcastSpatialUpdates_NoSpatialRecipients_DoesNotSerialize()
    {
        var (messenger, serializer, rooms, a, b) = Setup();

        Assert.False(messenger.HasSpatialRecipients());
        messenger.BroadcastSpatialUpdates(new ChatMessageEvent(1, "x"));

        Assert.Equal(0, serializer.SerializeCalls);
        Assert.Equal(0, a.Sent + b.Sent);
        rooms.Dispose();
    }

    [Fact]
    public void BroadcastSpatialUpdates_OneSpatialRecipient_SerializesOnceAndSendsOnlyToIt()
    {
        var (messenger, serializer, rooms, a, b) = Setup();
        rooms.JoinRoom(2, "B", "game");

        Assert.True(messenger.HasSpatialRecipients());
        messenger.BroadcastSpatialUpdates(new ChatMessageEvent(1, "x"));

        Assert.Equal(1, serializer.SerializeCalls);
        Assert.Equal(0, a.Sent);
        Assert.Equal(1, b.Sent);
        rooms.Dispose();
    }

    [Fact]
    public void BroadcastToRoomOrAll_SenderWithoutRoom_SerializesOnce()
    {
        var (messenger, serializer, rooms, a, b) = Setup();

        messenger.BroadcastToRoomOrAll(99, new ChatMessageEvent(99, "x"));

        Assert.Equal(1, serializer.SerializeCalls);
        Assert.Equal(1, a.Sent);
        Assert.Equal(1, b.Sent);
        rooms.Dispose();
    }
}
