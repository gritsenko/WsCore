using Game.ServerLogic.Chat.Events;
using Game.ServerLogic.Chat.Requests;
using Game.ServerLogic.Player.Requests;
using WsServer.Abstract;

namespace WsServer.Tests;

public class MessageSerializerTests
{
    // No request handlers needed for pure serialization round-trips.
    private static MessageSerializer NewSerializer()
    {
        var provider = new ReflectionServerLogicProvider(typeof(ChatMessageEvent).Assembly, null);
        provider.Initialize();
        return new MessageSerializer(provider);
    }

    [Fact]
    public void ClientRequest_RoundTrip_PreservesTypeIdAndPayload()
    {
        var serializer = NewSerializer();
        var request = new ChatMessageRequest { Message = "hello world" };

        var bytes = serializer.SerializeClientRequest(request).ToArray();
        Assert.Equal(ChatMessageRequest.TypeId, bytes[0]); // 1-byte header

        var data = bytes; // Deserialize takes `ref byte[]`
        var decoded = serializer.Deserialize(ref data, out var type);

        Assert.Equal(typeof(ChatMessageRequest), type);
        Assert.Equal("hello world", ((ChatMessageRequest)decoded).Message);
    }

    [Fact]
    public void ClientRequest_DifferentTypes_RoundTripIndependently()
    {
        var serializer = NewSerializer();
        var request = new SetPlayerNameRequest { Name = "Igor" };

        var bytes = serializer.SerializeClientRequest(request).ToArray();
        var data = bytes;
        var decoded = serializer.Deserialize(ref data, out var type);

        Assert.Equal(typeof(SetPlayerNameRequest), type);
        Assert.Equal("Igor", ((SetPlayerNameRequest)decoded).Name);
    }

    [Fact]
    public void ServerEvent_Serialize_WritesEventTypeIdHeader()
    {
        var serializer = NewSerializer();
        var evt = new ChatMessageEvent(clientId: 7, message: "hi");

        var bytes = serializer.Serialize(evt).ToArray();

        Assert.Equal(ChatMessageEvent.TypeId, bytes[0]);
        Assert.True(bytes.Length > 1); // header + MemoryPack payload
    }

    [Fact]
    public void Deserialize_UnknownTypeId_Throws()
    {
        var serializer = NewSerializer();
        var data = new byte[] { 254, 0, 0 }; // 254 is not registered by any [GenerateTypeScript] message

        Assert.Throws<ArgumentException>(() => serializer.Deserialize(ref data, out _));
    }

    [Fact]
    public void Deserialize_EmptyBuffer_Throws()
    {
        var serializer = NewSerializer();
        var data = Array.Empty<byte>();

        Assert.Throws<ArgumentException>(() => serializer.Deserialize(ref data, out _));
    }
}
