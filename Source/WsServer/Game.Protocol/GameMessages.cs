using Game.ServerLogic.Player.Events;

namespace Game.ServerLogic;

public class GameMessages
{
    static GameMessages()
    {
        MessageRegistry.Register<InitPlayerEvent>();
    }
}