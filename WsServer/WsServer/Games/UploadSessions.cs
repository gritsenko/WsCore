using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;

namespace WsServer.Games;

/// <summary>One file being uploaded by an agent, in numbered chunks.</summary>
public sealed class UploadSession
{
    public required string Id { get; init; }
    public required uint UserId { get; init; }
    public required string GameId { get; init; }
    /// <summary><c>build</c> or <c>media</c>.</summary>
    public required string Target { get; init; }
    public required string FileName { get; init; }
    public required long Size { get; init; }
    public required long ChunkSize { get; init; }
    public required string TicketHash { get; init; }
    public required long ExpiresMs { get; init; }
    public required string Directory { get; init; }
    public int Chunks => (int)((Size + ChunkSize - 1) / ChunkSize);
    public long ChunkLength(int index) => index < Chunks - 1 ? ChunkSize : Size - ChunkSize * (Chunks - 1);
}

/// <summary>
/// The agent's uploads — the jam portal's protocol (<c>push_build</c> / <c>push_media</c> →
/// <c>curl -T</c> → <c>complete_build</c> / <c>attach_media</c>), minus the jam's S3 detour:
/// the bytes land on this server. A session is opened by a tool call (as the token's user)
/// and answered with commands that PUT the file — in chunks of exactly
/// <see cref="UploadSession.ChunkSize"/> (by default the whole file: one <c>curl</c>) — to
/// <c>/agent/upload/{session}/{index}?t={ticket}</c>. The ticket is good for this session for
/// an hour and is not a credential (it ends up in shell history). A chunk whose length is not
/// what the session declared is refused, so a dropped connection never assembles into a
/// corrupt file; <c>upload_status</c> says what arrived, so a resume sends only the rest.
/// </summary>
public sealed class UploadSessions
{
    private static readonly TimeSpan Lifetime = TimeSpan.FromHours(1);
    private readonly GameServerOptions _options;
    private readonly ConcurrentDictionary<string, UploadSession> _sessions = new();

    public Func<long> NowMs { get; set; } = () => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    public UploadSessions(GameServerOptions options) => _options = options;

    private string Root => Path.Combine(Path.GetFullPath(_options.GamesDataPath), ".uploads", "sessions");

    public (UploadSession Session, string Ticket) Create(uint userId, string gameId, string target, string fileName, long size)
    {
        Sweep();
        var chunk = _options.AgentUploadChunkMb > 0 ? (long)_options.AgentUploadChunkMb * 1024 * 1024 : size;
        var ticket = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(24));
        var id = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(12));
        var session = new UploadSession
        {
            Id = id, UserId = userId, GameId = gameId, Target = target, FileName = Path.GetFileName(fileName),
            Size = size, ChunkSize = Math.Max(1, chunk), TicketHash = Hash(ticket),
            ExpiresMs = NowMs() + (long)Lifetime.TotalMilliseconds, Directory = Path.Combine(Root, id),
        };
        System.IO.Directory.CreateDirectory(session.Directory);
        _sessions[id] = session;
        return (session, ticket);
    }

    /// <summary>The session of this user (an agent sees only its own), or null.</summary>
    public UploadSession? Get(string id, uint userId)
        => _sessions.TryGetValue(id ?? string.Empty, out var s) && s.UserId == userId && s.ExpiresMs > NowMs() ? s : null;

    /// <summary>
    /// Stores chunk <paramref name="index"/> from <paramref name="body"/>. Refuses a wrong
    /// ticket, an expired session, an index out of range, or a length other than declared.
    /// </summary>
    public async Task<(int Status, string Error)> SaveChunkAsync(string id, int index, string ticket, Stream body,
        CancellationToken ct)
    {
        if (!_sessions.TryGetValue(id, out var s) || s.ExpiresMs <= NowMs()
            || !CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(s.TicketHash),
                Encoding.ASCII.GetBytes(Hash(ticket ?? string.Empty))))
            return (403, "unknown or expired upload");
        if (index < 0 || index >= s.Chunks)
            return (400, $"chunk index must be 0…{s.Chunks - 1}");
        var expected = s.ChunkLength(index);
        var part = Path.Combine(s.Directory, $"{index}.part");
        var temp = part + "." + Guid.NewGuid().ToString("N")[..6];
        long written = 0;
        await using (var file = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, useAsync: true))
        {
            var buffer = new byte[81920];
            int read;
            while ((read = await body.ReadAsync(buffer, ct)) > 0)
            {
                written += read;
                if (written > expected)
                    break;
                await file.WriteAsync(buffer.AsMemory(0, read), ct);
            }
        }
        if (written != expected)
        {
            File.Delete(temp);
            return (400, $"chunk {index} must be exactly {expected} bytes (got {(written > expected ? "more" : written.ToString())})");
        }
        File.Move(temp, part, overwrite: true);
        return (200, string.Empty);
    }

    public IReadOnlyList<int> Received(UploadSession s)
        => Enumerable.Range(0, s.Chunks).Where(i => File.Exists(Path.Combine(s.Directory, $"{i}.part"))).ToList();

    /// <summary>The whole file, assembled into the upload area (the caller deletes it), or null if chunks are missing.</summary>
    public async Task<string?> AssembleAsync(UploadSession s)
    {
        if (Received(s).Count != s.Chunks)
            return null;
        var path = GamesHttp.NewUploadFile(_options, Path.GetExtension(s.FileName));
        await using var output = new FileStream(path, FileMode.CreateNew, FileAccess.Write);
        for (var i = 0; i < s.Chunks; i++)
        {
            await using var input = File.OpenRead(Path.Combine(s.Directory, $"{i}.part"));
            await input.CopyToAsync(output);
        }
        return path;
    }

    /// <summary>Forgets the session and deletes its chunks (after it was used, or given up).</summary>
    public void Discard(UploadSession s)
    {
        _sessions.TryRemove(s.Id, out _);
        try { System.IO.Directory.Delete(s.Directory, recursive: true); } catch (IOException) { }
    }

    private void Sweep()
    {
        var now = NowMs();
        foreach (var s in _sessions.Values.Where(s => s.ExpiresMs <= now).ToList())
            Discard(s);
    }

    private static string Hash(string ticket) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(ticket)));
}
