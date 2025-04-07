using WsServer.Abstract;
using WsServer.Abstract.Messages;
using WsServer.Common;
using System.Collections.Concurrent;

namespace WsServer;

public class GameMessenger : IGameMessenger
{
    private readonly IClientConnectionManager _connectionManager;
    private readonly IMessageSerializer _messageSerializer;
    private readonly ConcurrentStack<MyBuffer> _bufferPool;
    private readonly int _maxPoolSize;

    public GameMessenger(
        IClientConnectionManager connectionManager,
        IServerLogicProvider serverLogicProvider,
        int maxPoolSize = 20)
    {
        _connectionManager = connectionManager;
        _messageSerializer = new MessageSerializer(serverLogicProvider);
        _maxPoolSize = maxPoolSize;
        _bufferPool = new ConcurrentStack<MyBuffer>();

        // Pre-warm the pool with some buffers
        for (int i = 0; i < 5; i++)
        {
            _bufferPool.Push(new MyBuffer());
        }
    }

    public void Broadcast<TEventMessage>(TEventMessage @event) where TEventMessage : IServerEvent
    {
        var buffer = RentBuffer();
        try
        {
            _messageSerializer.Serialize(buffer, @event);
            var segment = buffer.AsArraySegment();

            foreach (var connection in _connectionManager.Connections)
            {
                connection.Send(segment);
            }
        }
        finally
        {
            ReturnBuffer(buffer);
        }
    }

    public void Send<TEventMessage>(uint clientId, TEventMessage @event) where TEventMessage : IServerEvent
    {
        var buffer = RentBuffer();
        try
        {
            _messageSerializer.Serialize(buffer, @event);
            var segment = buffer.AsArraySegment();
            _connectionManager.GetConnectionById(clientId)?.Send(segment);
        }
        finally
        {
            ReturnBuffer(buffer);
        }
    }

    public IClientRequest Deserialize(ref byte[] data, out byte messageTypeId)
    {
        return _messageSerializer.Deserialize(ref data, out messageTypeId);
    }

    private MyBuffer RentBuffer()
    {
        if (_bufferPool.TryPop(out var buffer))
        {
            buffer.Clear(); // Ensure the buffer is clean before reuse
            return buffer;
        }

        return new MyBuffer();
    }

    private void ReturnBuffer(MyBuffer buffer)
    {
        if (_bufferPool.Count < _maxPoolSize)
        {
            buffer.Clear(); // Clear before returning to pool
            _bufferPool.Push(buffer);
        }
        // If pool is full, let the buffer be garbage collected
    }
}