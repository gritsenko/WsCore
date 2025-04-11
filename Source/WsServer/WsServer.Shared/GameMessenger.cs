using System;
using WsServer.Abstract;
using WsServer.Abstract.Messages;
using System.Collections.Concurrent;

namespace WsServer;

public class GameMessenger : IGameMessenger
{
    private readonly IClientConnectionManager _connectionManager;
    private readonly IMessageSerializer _messageSerializer;
    private readonly ConcurrentStack<MessageDataBuffer> _bufferPool;
    private readonly int _maxPoolSize;

    public GameMessenger(
        IClientConnectionManager connectionManager,
        IServerLogicProvider serverLogicProvider,
        int maxPoolSize = 20)
    {
        _connectionManager = connectionManager;
        _messageSerializer = new MessageSerializer(serverLogicProvider);
        _maxPoolSize = maxPoolSize;
        _bufferPool = new ConcurrentStack<MessageDataBuffer>();

        // Pre-warm the pool with some buffers
        for (int i = 0; i < 5; i++)
        {
            _bufferPool.Push(new MessageDataBuffer(_messageSerializer.WriteItem));
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

    public IClientRequest Deserialize(ref byte[] data, out Type messageType) => _messageSerializer.Deserialize(ref data, out messageType);

    private MessageDataBuffer RentBuffer()
    {
        if (_bufferPool.TryPop(out var buffer))
        {
            buffer.Clear(); // Ensure the buffer is clean before reuse
            return buffer;
        }

        return new MessageDataBuffer(_messageSerializer.WriteItem);
    }

    private void ReturnBuffer(MessageDataBuffer dataBuffer)
    {
        if (_bufferPool.Count < _maxPoolSize)
        {
            dataBuffer.Clear(); // Clear before returning to pool
            _bufferPool.Push(dataBuffer);
        }
        // If pool is full, let the buffer be garbage collected
    }
}