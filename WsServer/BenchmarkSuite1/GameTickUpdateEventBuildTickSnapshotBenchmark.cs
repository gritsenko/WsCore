using BenchmarkDotNet.Attributes;
using Game.ServerLogic.GameState.Events;
using Game.Core;
using System;

namespace BenchmarkSuite1
{
    [MemoryDiagnoser]
    public class GameTickUpdateEventBuildTickSnapshotBenchmark
    {
        private GameModel _game;
        private GameTickUpdateEvent _event;

        [GlobalSetup]
        public void Setup()
        {
            // Create a GameModel with a representative number of players
            _game = new GameModel();
            for (int i = 0; i < 100; i++)
            {
                var player = new Player
                {
                    Id = (uint)i,
                    Name = $"Player {i}",
                    MovementState = new PlayerMovementState
                    {
                        Pos = new System.Numerics.Vector2(i, i),
                        AimPos = new System.Numerics.Vector2(i, i),
                        BodyAngle = 0,
                        ControlsState = 0,
                        Velocity = new System.Numerics.Vector2(0, 0)
                    },
                    TargetPos = new System.Numerics.Vector2(i, i),
                    Hp = 100,
                    MaxHp = 100,
                    AnimationState = 0
                };
                _game.AddPlayer(player);
            }
            _event = new GameTickUpdateEvent(_game);
        }

        [Benchmark]
        public void BuildTickSnapshot()
        {
            _event.BuildTickSnapshot();
        }
    }
}