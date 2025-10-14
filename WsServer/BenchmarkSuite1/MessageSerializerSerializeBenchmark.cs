using System;
using BenchmarkDotNet.Attributes;
using MemoryPack;
using WsServer;
using WsServer.Abstract;
using Game.ServerLogic.GameState.Events;
using Game.Core;
using Microsoft.VSDiagnostics;

namespace WsServer.Shared.Benchmarks
{
    [CPUUsageDiagnoser]
    public class MessageSerializerSerializeBenchmark
    {
        private MessageSerializer _serializer;
        private GameTickUpdateEvent _event;
        [GlobalSetup]
        public void Setup()
        {
            var logicProvider = new ReflectionServerLogicProvider(typeof(GameTickUpdateEvent).Assembly, null);
            logicProvider.Initialize();
            _serializer = new MessageSerializer(logicProvider);
            var gameModel = new GameModel();
            _event = new GameTickUpdateEvent(gameModel);
        }

        [Benchmark]
        public ArraySegment<byte> SerializeGameTickUpdateEvent()
        {
            return _serializer.Serialize(_event);
        }
    }
}