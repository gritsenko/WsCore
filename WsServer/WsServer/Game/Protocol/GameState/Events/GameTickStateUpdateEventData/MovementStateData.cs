using MemoryPack;

namespace Game.ServerLogic.GameState.Events.GameTickStateUpdateEventData;

/// <summary>
/// The replicated per-avatar state: what every client needs to draw a player. Sent in
/// every tick snapshot (for avatars that changed recently, see GameTickUpdateEvent) and
/// inside PlayerStateData (join / full game state). 14 bytes on the wire.
///
/// Deliberately NOT replicated (stage D): aim, move target, body angle, controls and
/// velocity. Aim and controls are client input — the client owns its own copy and the
/// server never changes them; nobody renders a remote player's aim; body angle was a
/// random spawn value never used; velocity and facing are derived by the client from
/// the interpolated positions.
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class MovementStateData
{
    public uint PlayerId;
    public float X;
    public float Y;
    // 0 idle, 1 walk, 2 dead (Player.AnimationState).
    public byte AnimationState;

    [MemoryPackConstructor]
    public MovementStateData() { }

    public MovementStateData(Core.Player player)
    {
        CopyFrom(player);
    }

    // Overwrites every field from `player`; lets the tick snapshot reuse instances.
    public void CopyFrom(Core.Player player)
    {
        PlayerId = player.Id;
        var pos = player.MovementState.Pos;
        X = pos.X;
        Y = pos.Y;
        AnimationState = player.AnimationState;
    }
}
