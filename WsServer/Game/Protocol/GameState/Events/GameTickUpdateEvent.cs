using Game.Core;
using Game.ServerLogic.GameState.Events.GameTickStateUpdateEventData;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.GameState.Events;

public class GameTickUpdateEvent(GameModel game) : IServerEvent
{
    public static byte TypeId => 1;

    //keep structure to client code generator
    public MovementStateData[] MovementStates;
    public uint[] DestroyedBulletsIds;
    public uint[] RespawnedPlayerIds;
    public HitPlayerStateData[] HitPlayersState;
    
    public GameModel Game => game;

}