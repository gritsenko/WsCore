using BenchmarkDotNet.Attributes;
using BenchmarkDotNet.Configs;
using BenchmarkDotNet.Jobs;
using BenchmarkDotNet.Running;
using BenchmarkDotNet.Toolchains.InProcess.Emit;
using WsServer;
using WsServer.DataBuffer;

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

class Program
{
    static void Main(string[] args)
    {
        BenchmarkRunner.Run<MessageDataBufferBenchmark>();
    }
}