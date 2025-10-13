using Game.ServerLogic;
using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Requests;
[GenerateTypeScript]
[MemoryPackable]
public partial class UpdatePlayerSlotsRequest : IClientRequest
{
    public static byte TypeId => 102;

    public int Body;
    public int Gun;
    public int Armor;
}