using System.Diagnostics;

namespace WsServer.Sessions;

/// <summary>
/// Per-connection identity that exists for the connection's whole lifetime, independent
/// of whether it currently has an avatar (<see cref="Game.Core.Player"/>) in the game
/// world: the display name, the chosen equipment slots (applied to the avatar when one is
/// spawned) and the chat rate limit. Tick thread only, like everything SessionManager owns.
/// </summary>
public sealed class ClientSession(uint id)
{
    public uint Id { get; } = id;
    public string Name { get; set; } = DefaultName(id);

    public int BodyIndex { get; set; }
    public int WeaponIndex { get; set; }
    public int ArmorIndex { get; set; }

    // Stopwatch timestamp before which further chat messages are dropped (audit §2).
    private long _chatAllowedAt;

    public static string DefaultName(uint id) => "Player " + id;

    /// <summary>True (and starts a new cooldown) if a chat message may be sent now.</summary>
    public bool TryConsumeChatCooldown(double cooldownSeconds)
    {
        var now = Stopwatch.GetTimestamp();
        if (now < _chatAllowedAt)
            return false;
        _chatAllowedAt = now + (long)(cooldownSeconds * Stopwatch.Frequency);
        return true;
    }
}
