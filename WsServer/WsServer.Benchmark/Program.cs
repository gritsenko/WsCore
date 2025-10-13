using BenchmarkDotNet.Attributes;
using BenchmarkDotNet.Configs;
using BenchmarkDotNet.Jobs;
using BenchmarkDotNet.Running;
using BenchmarkDotNet.Toolchains.InProcess.Emit;
using MessagePack;
using MemoryPack;
using WsServer;
using WsServer.DataBuffer;
using System.Buffers;
using System.Text.Json;

public class FastIterationConfig : ManualConfig
{
    public FastIterationConfig()
    {
        AddJob(Job.Default
                .WithToolchain(InProcessEmitToolchain.Instance)
                .WithIterationCount(50)
                .WithWarmupCount(10) // Minimal warmup
                .WithInvocationCount(16) // Must be multiple of default UnrollFactor (16)
                .WithUnrollFactor(16) // Explicitly setting the unroll factor
        );
        // Disable overhead calculations for faster results
        WithOptions(ConfigOptions.DisableOptimizationsValidator);
    }
}

//[Config(typeof(FastIterationConfig))]
public class MessageDataBufferBenchmark
{
    private readonly UnsafeDataBuffer _unsafeBuffer = new((_, __) => { });
    private readonly SafeDataBuffer _safeBuffer = new((_, __) => { });

    [Benchmark]
    public void Unsafe_SetInt32()
    {
        _unsafeBuffer.Clear();
        for (int i = 0; i < 10000; i++)
        {
            _unsafeBuffer.SetInt32(12345);
        }
    }

    [Benchmark]
    public void Safe_SetInt32()
    {
        _safeBuffer.Clear();
        for (int i = 0; i < 10000; i++)
        {
            _safeBuffer.SetInt32(12345);
        }
    }
    
    [Benchmark]
    public void Safe_SetInt32_UseMemory()
    {
        _safeBuffer.Clear();
        for (int i = 0; i < 10000; i++)
        {
            _safeBuffer.SetInt32_memory(12345);
        }
    }

    [Benchmark]
    public void Safe_SetInt32_Marshal()
    {
        _safeBuffer.Clear();
        for (int i = 0; i < 10000; i++)
        {
            _safeBuffer.SetInt32_Marshal(12345);
        }
    }

    [Benchmark]
    public void Unsafe_SetString()
    {
        _unsafeBuffer.Clear();
        for (int i = 0; i < 1000; i++)
        {
            _unsafeBuffer.SetString("Hello, World!");
        }
    }

    [Benchmark]
    public void Safe_SetString()
    {
        _safeBuffer.Clear();
        for (int i = 0; i < 1000; i++)
        {
            _safeBuffer.SetString("Hello, World!");
        }
    }
}

// Test data classes representing typical game messages
[MessagePackObject]
[MemoryPackable]
public partial class PlayerUpdateMessage
{
    [Key(0)]
    [MemoryPackOrder(0)]
    public uint PlayerId { get; set; }

    [Key(1)]
    [MemoryPackOrder(1)]
    public float X { get; set; }

    [Key(2)]
    [MemoryPackOrder(2)]
    public float Y { get; set; }

    [Key(3)]
    [MemoryPackOrder(3)]
    public float Rotation { get; set; }

    [Key(4)]
    [MemoryPackOrder(4)]
    public int Health { get; set; }

    [Key(5)]
    [MemoryPackOrder(5)]
    public string PlayerName { get; set; } = string.Empty;

    [Key(6)]
    [MemoryPackOrder(6)]
    public int[] Inventory { get; set; } = Array.Empty<int>();
}

[MessagePackObject]
[MemoryPackable]
public partial class GameStateMessage
{
    [Key(0)]
    [MemoryPackOrder(0)]
    public PlayerUpdateMessage[] Players { get; set; } = Array.Empty<PlayerUpdateMessage>();

    [Key(1)]
    [MemoryPackOrder(1)]
    public long Timestamp { get; set; }

    [Key(2)]
    [MemoryPackOrder(2)]
    public int FrameNumber { get; set; }
}

public class SerializerBenchmark
{
    private readonly PlayerUpdateMessage _singlePlayerMessage;
    private readonly GameStateMessage _gameStateMessage;
    private readonly PlayerUpdateMessage[] _playerMessages;
    private readonly byte[] _jsonBuffer;
    private readonly byte[] _messagePackBuffer;
    private readonly byte[] _memoryPackBuffer;

    public SerializerBenchmark()
    {
        // Create test data
        _singlePlayerMessage = new PlayerUpdateMessage
        {
            PlayerId = 12345,
            X = 100.5f,
            Y = 200.7f,
            Rotation = 45.0f,
            Health = 100,
            PlayerName = "TestPlayer",
            Inventory = new[] { 1, 2, 3, 4, 5 }
        };

        _playerMessages = Enumerable.Range(0, 100)
            .Select(i => new PlayerUpdateMessage
            {
                PlayerId = (uint)i,
                X = i * 10.0f,
                Y = i * 15.0f,
                Rotation = i * 5.0f,
                Health = 100 - i,
                PlayerName = $"Player{i}",
                Inventory = Enumerable.Range(0, 5).ToArray()
            }).ToArray();

        _gameStateMessage = new GameStateMessage
        {
            Players = _playerMessages,
            Timestamp = DateTime.UtcNow.Ticks,
            FrameNumber = 12345
        };

        // Pre-serialize for deserialization benchmarks
        _jsonBuffer = JsonSerializer.SerializeToUtf8Bytes(_singlePlayerMessage);
        _messagePackBuffer = MessagePackSerializer.Serialize(_singlePlayerMessage);
        _memoryPackBuffer = MemoryPackSerializer.Serialize(_singlePlayerMessage);
    }

    // Single message serialization benchmarks
    [Benchmark]
    public byte[] Serialize_Single_MessagePack()
    {
        return MessagePackSerializer.Serialize(_singlePlayerMessage);
    }

    [Benchmark]
    public byte[] Serialize_Single_MemoryPack()
    {
        return MemoryPackSerializer.Serialize(_singlePlayerMessage);
    }

    [Benchmark]
    public byte[] Serialize_Single_Json()
    {
        return JsonSerializer.SerializeToUtf8Bytes(_singlePlayerMessage);
    }

    [Benchmark]
    public byte[] Serialize_Single_CustomUnsafe()
    {
        var buffer = new UnsafeDataBuffer((buf, obj) =>
        {
            if (obj is PlayerUpdateMessage msg)
            {
                buf.SetUint32(msg.PlayerId)
                   .SetFloat(msg.X)
                   .SetFloat(msg.Y)
                   .SetFloat(msg.Rotation)
                   .SetInt32(msg.Health)
                   .SetString(msg.PlayerName)
                   .SetCollection(msg.Inventory);
            }
        });

        buffer.SetUint32(_singlePlayerMessage.PlayerId)
              .SetFloat(_singlePlayerMessage.X)
              .SetFloat(_singlePlayerMessage.Y)
              .SetFloat(_singlePlayerMessage.Rotation)
              .SetInt32(_singlePlayerMessage.Health)
              .SetString(_singlePlayerMessage.PlayerName)
              .SetCollection(_singlePlayerMessage.Inventory);

        return buffer.AsArraySegment().ToArray();
    }

    [Benchmark]
    public byte[] Serialize_Single_CustomSafe()
    {
        var buffer = new SafeDataBuffer((buf, obj) =>
        {
            if (obj is PlayerUpdateMessage msg)
            {
                buf.SetUint32(msg.PlayerId)
                   .SetFloat(msg.X)
                   .SetFloat(msg.Y)
                   .SetFloat(msg.Rotation)
                   .SetInt32(msg.Health)
                   .SetString(msg.PlayerName)
                   .SetCollection(msg.Inventory);
            }
        });

        buffer.SetUint32(_singlePlayerMessage.PlayerId)
              .SetFloat(_singlePlayerMessage.X)
              .SetFloat(_singlePlayerMessage.Y)
              .SetFloat(_singlePlayerMessage.Rotation)
              .SetInt32(_singlePlayerMessage.Health)
              .SetString(_singlePlayerMessage.PlayerName)
              .SetCollection(_singlePlayerMessage.Inventory);

        return buffer.AsArraySegment().ToArray();
    }

    // Batch serialization benchmarks
    [Benchmark]
    public byte[] Serialize_Batch_MessagePack()
    {
        return MessagePackSerializer.Serialize(_gameStateMessage);
    }

    [Benchmark]
    public byte[] Serialize_Batch_MemoryPack()
    {
        return MemoryPackSerializer.Serialize(_gameStateMessage);
    }

    [Benchmark]
    public byte[] Serialize_Batch_Json()
    {
        return JsonSerializer.SerializeToUtf8Bytes(_gameStateMessage);
    }

    // Deserialization benchmarks
    [Benchmark]
    public PlayerUpdateMessage Deserialize_Single_MessagePack()
    {
        return MessagePackSerializer.Deserialize<PlayerUpdateMessage>(_messagePackBuffer);
    }

    [Benchmark]
    public PlayerUpdateMessage Deserialize_Single_MemoryPack()
    {
        return MemoryPackSerializer.Deserialize<PlayerUpdateMessage>(_memoryPackBuffer);
    }

    [Benchmark]
    public PlayerUpdateMessage Deserialize_Single_Json()
    {
        return JsonSerializer.Deserialize<PlayerUpdateMessage>(_jsonBuffer)!;
    }

    // Memory allocation benchmarks
    [Benchmark]
    public void MemoryAllocation_MessagePack()
    {
        for (int i = 0; i < 1000; i++)
        {
            var buffer = MessagePackSerializer.Serialize(_singlePlayerMessage);
            var obj = MessagePackSerializer.Deserialize<PlayerUpdateMessage>(buffer);
        }
    }

    [Benchmark]
    public void MemoryAllocation_MemoryPack()
    {
        for (int i = 0; i < 1000; i++)
        {
            var buffer = MemoryPackSerializer.Serialize(_singlePlayerMessage);
            var obj = MemoryPackSerializer.Deserialize<PlayerUpdateMessage>(buffer);
        }
    }

    [Benchmark]
    public void MemoryAllocation_CustomUnsafe()
    {
        for (int i = 0; i < 1000; i++)
        {
            var buffer = new UnsafeDataBuffer((buf, obj) =>
            {
                if (obj is PlayerUpdateMessage msg)
                {
                    buf.SetUint32(msg.PlayerId)
                       .SetFloat(msg.X)
                       .SetFloat(msg.Y)
                       .SetFloat(msg.Rotation)
                       .SetInt32(msg.Health)
                       .SetString(msg.PlayerName)
                       .SetCollection(msg.Inventory);
                }
            });

            buffer.SetUint32(_singlePlayerMessage.PlayerId)
                  .SetFloat(_singlePlayerMessage.X)
                  .SetFloat(_singlePlayerMessage.Y)
                  .SetFloat(_singlePlayerMessage.Rotation)
                  .SetInt32(_singlePlayerMessage.Health)
                  .SetString(_singlePlayerMessage.PlayerName)
                  .SetCollection(_singlePlayerMessage.Inventory);

            var data = buffer.AsArraySegment();
            // In real usage, would deserialize here
        }
    }
}

class Program
{
    static void Main(string[] args)
    {
        Console.WriteLine("Running WsCore Serializer Benchmarks...");
        Console.WriteLine("=====================================");

        // Run custom buffer benchmarks
        Console.WriteLine("\n1. Custom Buffer Benchmarks:");
        BenchmarkRunner.Run<MessageDataBufferBenchmark>();

        // Run serializer comparison benchmarks
        Console.WriteLine("\n2. Serializer Comparison Benchmarks:");
        BenchmarkRunner.Run<SerializerBenchmark>();

        Console.WriteLine("\nBenchmarks completed. Check results above.");
    }
}