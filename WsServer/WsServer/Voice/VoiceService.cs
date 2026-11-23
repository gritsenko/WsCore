using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using Game.ServerLogic.Voice.Events;
using WsServer.Abstract;
using WsServer.Moderation;
using WsServer.Rooms;
using WsServer.Sessions;

namespace WsServer.Voice;

/// <summary>
/// Voice channels, Discord-style: voice membership is separate from the text room — a
/// connection is in one text room (<see cref="RoomManager"/>) and, independently, in at
/// most one voice channel (a room supporting <see cref="RoomCompatibility.VoiceChat"/>).
///
/// The audio is a WebRTC mesh: every participant has a peer connection to every other
/// one; the server only relays the signalling (SDP offers / answers, ICE candidates)
/// between participants of the same channel and hands out the ICE servers (STUN, and
/// TURN with time-limited credentials — coturn's <c>use-auth-secret</c>). The joiner
/// calls the participants already there (<see cref="VoiceJoinResultEvent.Peers"/>), so
/// two peers never offer to each other at once.
///
/// Rules: only identified connections (voice shows who is talking); the channel must be
/// visible to the user and they must not be banned from it; at most
/// <see cref="GameServerOptions.VoiceMaxParticipants"/>; a user is in voice on one
/// connection at a time (joining on another moves them). Whoever loses access, is banned
/// or logs out is taken out; a deleted channel empties.
///
/// Who is where goes to every identified connection that may see the channel
/// (<see cref="VoiceRosterEvent"/>). Tick thread only.
/// </summary>
public sealed class VoiceService
{
    private sealed class Participant(uint clientId, string roomId, uint userId)
    {
        public uint ClientId { get; } = clientId;
        public string RoomId { get; } = roomId;
        public uint UserId { get; set; } = userId;
        public bool Muted { get; set; }
        public bool Deafened { get; set; }
    }

    // Signal rate limit per connection (token bucket); kept across voice joins.
    private sealed class SignalBudget
    {
        public double Tokens;
        public long Updated;
    }

    private readonly SessionManager _sessions;
    private readonly RoomManager _rooms;
    private readonly ChannelPermissions _permissions;
    private readonly IGameMessenger _messenger;
    private readonly GameServerOptions _options;
    private readonly ILogger<VoiceService> _logger;

    private readonly Dictionary<uint, Participant> _participants = new();
    // Participants per channel, in joining order.
    private readonly Dictionary<string, List<Participant>> _channels = new();
    private readonly Dictionary<uint, SignalBudget> _budgets = new();
    private readonly Dictionary<uint, long> _requestAllowedAt = new();

    public VoiceService(
        SessionManager sessions,
        RoomManager rooms,
        ChannelPermissions permissions,
        IGameMessenger messenger,
        GameServerOptions options,
        ILogger<VoiceService> logger)
    {
        _sessions = sessions;
        _rooms = rooms;
        _permissions = permissions;
        _messenger = messenger;
        _options = options;
        _logger = logger;

        sessions.VisibilityChanged += OnVisibilityChanged;
        sessions.ChannelChanged += Revalidate;
    }

    /// <summary>Who is in voice (diagnostics: /info).</summary>
    public int ParticipantCount => _participants.Count;

    /// <summary>The voice channel the client talks in, if any.</summary>
    public string? RoomOf(uint clientId) => _participants.GetValueOrDefault(clientId)?.RoomId;

    // ---- requests ---------------------------------------------------------------------

    public void Join(uint clientId, string roomId)
    {
        if (_sessions.Get(clientId) is not { } session)
            return;
        if (!TryConsumeRequestCooldown(clientId))
        {
            Refuse(clientId, roomId, VoiceError.TooFast);
            return;
        }

        var error = CheckCanJoin(session, roomId);
        if (error == null && !(_participants.TryGetValue(clientId, out var current) && current.RoomId == roomId)
            && Count(roomId) >= Math.Max(1, _options.VoiceMaxParticipants))
            error = VoiceError.Full;
        if (error != null)
        {
            Refuse(clientId, roomId, error);
            return;
        }

        var user = session.User!;
        // One voice connection per user: another tab / device of theirs leaves.
        foreach (var other in user.Sessions)
        {
            if (other.Id != clientId && _participants.ContainsKey(other.Id))
                Remove(other.Id, VoiceError.Moved);
        }

        // Rejoining the channel we are in (e.g. after the page lost its peer connections)
        // starts over: the others drop us and we call them again.
        if (_participants.ContainsKey(clientId))
            Remove(clientId, null);

        var participant = new Participant(clientId, roomId, user.Id);
        var peers = Members(roomId).Select(p => p.ClientId).ToList();
        _participants[clientId] = participant;
        if (!_channels.TryGetValue(roomId, out var list))
            _channels[roomId] = list = new List<Participant>();
        list.Add(participant);

        // The roster first: the others know us before our offers reach them.
        BroadcastRoster(roomId);
        _messenger.Send(clientId, new VoiceJoinResultEvent
        {
            RoomId = roomId,
            Success = true,
            Peers = peers,
            IceServers = BuildIceServers(user.Id),
        });
        _logger.LogInformation("Client {ClientId} (user {UserId}) joined voice in {RoomId} ({Count} in it)",
            clientId, user.Id, roomId, list.Count);
    }

    public void Leave(uint clientId) => Remove(clientId, VoiceError.Left);

    /// <summary>Passes a signal to another participant of the sender's channel.</summary>
    public void Relay(uint clientId, uint targetClientId, byte kind, string data)
    {
        if (!_participants.TryGetValue(clientId, out var from)
            || !_participants.TryGetValue(targetClientId, out var to)
            || from.RoomId != to.RoomId || targetClientId == clientId)
            return; // the target left meanwhile (or never was there)
        // SDP and candidates are ASCII: characters = bytes.
        if (kind is < VoiceSignalKind.Offer or > VoiceSignalKind.Candidate
            || data.Length == 0 || data.Length > _options.VoiceMaxSignalBytes)
            return;
        if (!TryConsumeSignal(clientId))
            return;

        _messenger.Send(targetClientId, new VoiceSignalEvent { FromClientId = clientId, Kind = kind, Data = data });
    }

    public void SetState(uint clientId, bool muted, bool deafened)
    {
        if (!_participants.TryGetValue(clientId, out var p))
            return;
        muted |= deafened; // deafened = not talking either (as Discord does)
        if (p.Muted == muted && p.Deafened == deafened)
            return;
        if (!TryConsumeSignal(clientId))
            return;
        p.Muted = muted;
        p.Deafened = deafened;
        BroadcastRoster(p.RoomId);
    }

    /// <summary>The connection is gone (no VoiceLeftEvent: there is nobody to tell).</summary>
    public void Disconnect(uint clientId)
    {
        Remove(clientId, null);
        _budgets.Remove(clientId);
        _requestAllowedAt.Remove(clientId);
    }

    // ---- access -----------------------------------------------------------------------

    private string? CheckCanJoin(ClientSession session, string roomId)
    {
        if (session.User == null)
            return VoiceError.NotIdentified;
        var room = _rooms.GetRoom(roomId);
        if (room == null)
            return VoiceError.NoChannel;
        if (!room.SupportsMode(RoomCompatibility.VoiceChat))
            return VoiceError.NotVoice;
        if (!_permissions.CanSee(session.User, roomId))
            return VoiceError.NoAccess;
        if (_permissions.IsBanned(session.User, roomId))
            return VoiceError.Banned;
        return null;
    }

    // The connection identified / logged in or out, or what its user may see changed:
    // it may no longer belong in its channel, its user id may be another one now, and the
    // roster it should know is a different one.
    private void OnVisibilityChanged(ClientSession session)
    {
        if (_participants.TryGetValue(session.Id, out var p))
        {
            if (CheckCanJoin(session, p.RoomId) != null)
                Remove(session.Id, VoiceError.Removed);
            else if (p.UserId != session.User!.Id)
            {
                p.UserId = session.User.Id;
                BroadcastRoster(p.RoomId);
            }
        }
        if (session.User != null)
            _messenger.Send(session.Id, BuildRosterReset(session));
    }

    // A channel's permissions / privacy changed or it was deleted: whoever may no longer
    // be in it is taken out, and the roster goes to who may see it now.
    private void Revalidate(string roomId)
    {
        var members = Members(roomId).ToList();
        if (members.Count == 0)
            return;
        foreach (var p in members)
        {
            if (_sessions.Get(p.ClientId) is not { } session || CheckCanJoin(session, roomId) != null)
                Remove(p.ClientId, VoiceError.Removed);
        }
        if (_channels.ContainsKey(roomId))
            BroadcastRoster(roomId);
    }

    // ---- state ------------------------------------------------------------------------

    // Takes the client out of voice; tells it why unless reason is null.
    private void Remove(uint clientId, string? reason)
    {
        if (!_participants.Remove(clientId, out var p))
            return;
        var roomId = p.RoomId;
        if (_channels.TryGetValue(roomId, out var list))
        {
            list.Remove(p);
            if (list.Count == 0)
                _channels.Remove(roomId);
        }
        if (reason != null)
            _messenger.Send(clientId, new VoiceLeftEvent { RoomId = roomId, Reason = reason });
        BroadcastRoster(roomId);
        _logger.LogInformation("Client {ClientId} left voice in {RoomId} ({Reason})", clientId, roomId, reason ?? "gone");
    }

    private IEnumerable<Participant> Members(string roomId)
        => _channels.TryGetValue(roomId, out var list) ? list : [];

    private int Count(string roomId) => _channels.TryGetValue(roomId, out var list) ? list.Count : 0;

    private VoiceRoomInfo Describe(string roomId) => new()
    {
        RoomId = roomId,
        Participants = Members(roomId).Select(p => new VoiceParticipantInfo
        {
            ClientId = p.ClientId, UserId = p.UserId, Muted = p.Muted, Deafened = p.Deafened,
        }).ToList(),
    };

    private void BroadcastRoster(string roomId)
        => _sessions.BroadcastToChannelViewers(roomId, new VoiceRosterEvent { Rooms = [Describe(roomId)] });

    private VoiceRosterEvent BuildRosterReset(ClientSession session) => new()
    {
        Reset = true,
        Rooms = _channels.Keys.Where(roomId => _permissions.CanSee(session.User, roomId))
            .OrderBy(roomId => _rooms.GetRoom(roomId)?.Order ?? int.MaxValue)
            .Select(Describe).ToList(),
    };

    private void Refuse(uint clientId, string roomId, string error)
    {
        _logger.LogInformation("Client {ClientId}: voice join of {RoomId} refused ({Error})", clientId, roomId, error);
        _messenger.Send(clientId, new VoiceJoinResultEvent { RoomId = roomId, Success = false, Error = error });
    }

    // ---- ICE servers ------------------------------------------------------------------

    private List<VoiceIceServer> BuildIceServers(uint userId)
    {
        var servers = new List<VoiceIceServer>();
        if (_options.VoiceStunUrls.Length > 0)
            servers.Add(new VoiceIceServer { Urls = [.. _options.VoiceStunUrls] });
        if (_options.VoiceTurnUrls.Length > 0 && _options.VoiceTurnSecret.Length > 0)
        {
            var expires = DateTimeOffset.UtcNow.ToUnixTimeSeconds() + (long)_options.VoiceTurnCredentialTtlSeconds;
            var (username, credential) = TurnCredentials(_options.VoiceTurnSecret, expires, userId);
            servers.Add(new VoiceIceServer { Urls = [.. _options.VoiceTurnUrls], Username = username, Credential = credential });
        }
        return servers;
    }

    /// <summary>
    /// TURN REST API credentials (what coturn checks with <c>use-auth-secret</c>):
    /// username = "expiry:userId", password = base64(HMAC-SHA1(secret, username)).
    /// </summary>
    public static (string Username, string Credential) TurnCredentials(string secret, long expiresUnixSeconds, uint userId)
    {
        var username = $"{expiresUnixSeconds}:{userId}";
        var mac = HMACSHA1.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(username));
        return (username, Convert.ToBase64String(mac));
    }

    // ---- rate limits ------------------------------------------------------------------

    private bool TryConsumeRequestCooldown(uint clientId)
    {
        var now = Stopwatch.GetTimestamp();
        if (_requestAllowedAt.TryGetValue(clientId, out var allowedAt) && now < allowedAt)
            return false;
        _requestAllowedAt[clientId] = now + (long)(_options.VoiceRequestCooldownSeconds * Stopwatch.Frequency);
        return true;
    }

    private bool TryConsumeSignal(uint clientId)
    {
        var now = Stopwatch.GetTimestamp();
        var burst = Math.Max(1, _options.VoiceSignalBurst);
        if (!_budgets.TryGetValue(clientId, out var budget))
            _budgets[clientId] = budget = new SignalBudget { Tokens = burst, Updated = now };

        var elapsed = (now - budget.Updated) / (double)Stopwatch.Frequency;
        budget.Tokens = Math.Min(burst, budget.Tokens + elapsed * _options.VoiceSignalsPerSecond);
        budget.Updated = now;
        if (budget.Tokens < 1)
            return false;
        budget.Tokens -= 1;
        return true;
    }
}
