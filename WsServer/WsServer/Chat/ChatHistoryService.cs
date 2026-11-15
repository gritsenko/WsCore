using System.Collections.Concurrent;
using Game.ServerLogic.Chat.Events;
using WsServer.Abstract;
using WsServer.Persistence;
using WsServer.Sessions;

namespace WsServer.Chat;

/// <summary>
/// Chat history: assigns message ids, keeps each room's recent messages in memory and
/// hands everything to <see cref="IChatStorage"/> for durability.
///
/// The in-memory window (<c>ChatHistoryCacheSize</c> newest messages per room) is the hot
/// path: joining a room, catching up after a reconnect and the first pages of scroll-back
/// are answered from it without touching the database. Only a request for messages older
/// than the window goes to storage — asynchronously, on the storage thread; the answer is
/// handed back through <see cref="DeliverCompleted"/> and sent on a later tick.
///
/// Threading: tick thread only (like SessionManager), except the storage callbacks, which
/// only enqueue.
/// </summary>
public sealed class ChatHistoryService
{
    private sealed class RoomLog
    {
        // Oldest first; ids strictly increasing.
        public readonly List<ChatMessage> Messages = new();
        // True when storage holds messages older than the first cached one.
        public bool OlderInStorage;
    }

    private readonly IChatStorage _storage;
    private readonly IGameMessenger _messenger;
    private readonly int _cacheSize;
    private readonly int _pageSize;
    private readonly Dictionary<string, RoomLog> _rooms = new();
    private readonly ConcurrentQueue<Action> _completed = new();
    private uint _nextId;

    /// <summary>The id space of this history; see <see cref="ChatHistoryEvent.Epoch"/>.</summary>
    public uint Epoch { get; }

    public ChatHistoryService(IChatStorage storage, StorageSnapshot snapshot, IGameMessenger messenger, GameServerOptions options)
    {
        _storage = storage;
        _messenger = messenger;
        _pageSize = Math.Max(1, options.ChatHistoryPageSize);
        // The window must hold at least one page, or the latest page could not be served.
        _cacheSize = Math.Max(_pageSize, options.ChatHistoryCacheSize);

        Epoch = snapshot.Epoch;
        _nextId = Math.Max(1, snapshot.NextMessageId);
        foreach (var room in snapshot.Rooms)
        {
            var log = new RoomLog { OlderInStorage = room.HasOlder };
            log.Messages.AddRange(room.Recent);
            _rooms[room.RoomId] = log;
        }
    }

    /// <summary>
    /// Records a new message and returns the live event to broadcast to the room.
    /// </summary>
    public ChatMessageEvent Append(string roomId, uint clientId, uint userId, string name, string text)
    {
        var message = new ChatMessage(
            _nextId++, roomId, userId, name, text, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());

        if (!_rooms.TryGetValue(roomId, out var log))
            _rooms[roomId] = log = new RoomLog();
        log.Messages.Add(message);

        // Trim in chunks (amortized O(1) per message rather than a shift on every append).
        var slack = Math.Max(16, _cacheSize / 4);
        if (log.Messages.Count > _cacheSize + slack)
        {
            log.Messages.RemoveRange(0, log.Messages.Count - _cacheSize);
            // What fell out of the window is still in storage — if there is one.
            log.OlderInStorage = _storage.IsPersistent;
        }

        _storage.Append(message);

        return new ChatMessageEvent(clientId, text)
        {
            Id = message.Id,
            UserId = userId,
            Name = name,
            SentAtMs = message.SentAtMs,
        };
    }

    /// <summary>
    /// Catch-up for a client that knows the room up to <paramref name="afterId"/> (0 =
    /// nothing): the messages after it if the window still covers that point and they fit
    /// one page, otherwise the latest page as a reset. Never touches storage.
    /// </summary>
    public void SendLatest(uint clientId, string roomId, uint afterId)
    {
        var evt = new ChatHistoryEvent { RoomId = roomId, Epoch = Epoch };
        var log = _rooms.GetValueOrDefault(roomId);
        var messages = log?.Messages;

        if (messages is { Count: > 0 } && afterId >= messages[0].Id && afterId <= messages[^1].Id)
        {
            var start = LowerBound(messages, afterId + 1);
            if (messages.Count - start <= _pageSize)
            {
                AddRange(evt, messages, start, messages.Count);
                _messenger.Send(clientId, evt);
                return;
            }
        }

        evt.Reset = true;
        if (messages != null && log != null)
        {
            var start = Math.Max(0, messages.Count - _pageSize);
            AddRange(evt, messages, start, messages.Count);
            evt.HasMore = start > 0 || log.OlderInStorage;
        }
        _messenger.Send(clientId, evt);
    }

    /// <summary>
    /// The page right before <paramref name="beforeId"/>. Served from the window when it
    /// reaches far enough back, otherwise from storage (one query per session at a time).
    /// </summary>
    public void SendBefore(ClientSession session, string roomId, uint beforeId)
    {
        var log = _rooms.GetValueOrDefault(roomId);
        var end = log == null ? 0 : LowerBound(log.Messages, beforeId);

        if (log == null || end >= _pageSize || !log.OlderInStorage)
        {
            var evt = new ChatHistoryEvent { RoomId = roomId, Epoch = Epoch, BeforeId = beforeId };
            if (log != null)
            {
                var start = Math.Max(0, end - _pageSize);
                AddRange(evt, log.Messages, start, end);
                evt.HasMore = start > 0 || log.OlderInStorage;
            }
            _messenger.Send(session.Id, evt);
            return;
        }

        // Deep scroll-back. A client asks for one page at a time; anything it sends while
        // a query is still running is dropped rather than queued up against the database.
        if (session.HistoryQueryPending)
            return;
        session.HistoryQueryPending = true;

        var limit = _pageSize;
        _storage.QueryBefore(roomId, beforeId, limit + 1, newestFirst =>
            // Storage thread: only hand the result over to the tick thread.
            _completed.Enqueue(() =>
            {
                session.HistoryQueryPending = false;
                var evt = new ChatHistoryEvent
                {
                    RoomId = roomId,
                    Epoch = Epoch,
                    BeforeId = beforeId,
                    HasMore = newestFirst.Count > limit, // the extra row
                };
                for (var i = Math.Min(newestFirst.Count, limit) - 1; i >= 0; i--)
                    evt.Messages.Add(ToData(newestFirst[i]));
                _messenger.Send(session.Id, evt); // no-op if the client is gone
            }));
    }

    /// <summary>Tick thread: sends the history pages storage has finished loading.</summary>
    public void DeliverCompleted()
    {
        while (_completed.TryDequeue(out var deliver))
            deliver();
    }

    private static void AddRange(ChatHistoryEvent evt, List<ChatMessage> messages, int start, int end)
    {
        for (var i = start; i < end; i++)
            evt.Messages.Add(ToData(messages[i]));
    }

    private static ChatMessageData ToData(ChatMessage m) => new()
    {
        Id = m.Id,
        UserId = m.UserId,
        Name = m.Name,
        Text = m.Text,
        SentAtMs = m.SentAtMs,
    };

    // Index of the first message with Id >= id (Count if none).
    private static int LowerBound(List<ChatMessage> messages, uint id)
    {
        int lo = 0, hi = messages.Count;
        while (lo < hi)
        {
            var mid = (lo + hi) >>> 1;
            if (messages[mid].Id < id) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }
}
