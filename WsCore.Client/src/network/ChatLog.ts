/** A chat message as the client keeps it (live or from history — same shape, same id). */
export interface ChatEntry {
  /** Server-assigned, strictly increasing: the merge key and the history cursor. */
  id: number;
  /** The author's stable user id; 0 for an anonymous connection. */
  userId: number;
  name: string;
  text: string;
  /** Unix ms. */
  sentAtMs: number;
}

/** What happened to a room's log — tells the UI the cheapest way to catch up. */
export type ChatLogChange =
  /** The log was replaced: render it from scratch. */
  | { kind: 'reset' }
  /** Newer messages were added at the end (a catch-up after rejoining / reconnecting). */
  | { kind: 'append'; entries: ChatEntry[] }
  /** An older page was added at the start (may be empty: nothing older / gave up). */
  | { kind: 'prepend'; entries: ChatEntry[] };

/** A history page as the store needs it (the shape of ChatHistoryEvent). */
export interface ChatHistoryPage {
  roomId: string;
  epoch: number;
  beforeId: number;
  reset: boolean;
  hasMore: boolean;
  messages: ChatEntry[];
}

export class ChatRoomLog {
  /** Oldest first; ids strictly increasing, no gaps relative to the server's room log. */
  entries: ChatEntry[] = [];
  /** The server has messages older than `entries[0]`. */
  hasMore = false;
  /** An older page has been requested and not answered yet. */
  loadingOlder = false;

  get firstId(): number {
    return this.entries.length ? this.entries[0].id : 0;
  }

  get lastId(): number {
    return this.entries.length ? this.entries[this.entries.length - 1].id : 0;
  }
}

/**
 * The client's chat cache: one contiguous log per room, kept for the whole page
 * session — across lobby↔game switches, room switches and reconnects. Coming back to a
 * room renders instantly from here, and only what was missed is fetched (`afterId`);
 * scrolling up extends the log one page at a time (`beforeId`).
 *
 * Pure state (no socket, no DOM), so it is unit-tested directly.
 */
export class ChatLogStore {
  /** Messages kept per room; beyond that (+ slack) the oldest are dropped. */
  static readonly MAX_PER_ROOM = 1000;
  private static readonly TRIM_SLACK = 100;

  /** The server's id space our cached ids belong to (0 = nothing cached yet). */
  epoch = 0;
  private readonly rooms = new Map<string, ChatRoomLog>();

  room(roomId: string): ChatRoomLog {
    let log = this.rooms.get(roomId);
    if (!log) {
      log = new ChatRoomLog();
      this.rooms.set(roomId, log);
    }
    return log;
  }

  /**
   * A live message. Returns 'added', 'duplicate' (already known — e.g. it also came in
   * a history page), or 'trimmed' when adding it dropped the oldest cached messages
   * (the UI should re-render rather than keep rows the log no longer has).
   */
  addLive(roomId: string, entry: ChatEntry): 'added' | 'duplicate' | 'trimmed' {
    const log = this.room(roomId);
    if (entry.id <= log.lastId) return 'duplicate';
    log.entries.push(entry);

    if (log.entries.length > ChatLogStore.MAX_PER_ROOM + ChatLogStore.TRIM_SLACK) {
      log.entries.splice(0, log.entries.length - ChatLogStore.MAX_PER_ROOM);
      log.hasMore = true; // the dropped ones can be fetched again
      return 'trimmed';
    }
    return 'added';
  }

  /** Drops a deleted message; false if it was not cached. */
  remove(roomId: string, messageId: number): boolean {
    const log = this.rooms.get(roomId);
    if (!log) return false;
    const index = log.entries.findIndex(e => e.id === messageId);
    if (index < 0) return false;
    log.entries.splice(index, 1);
    return true;
  }

  /** Applies a history page; null when it is stale and changed nothing. */
  applyHistory(page: ChatHistoryPage): ChatLogChange | null {
    // A different id space (the server lost / reset its history): nothing cached is
    // comparable any more — in any room.
    const epochChanged = page.epoch !== this.epoch;
    if (epochChanged) {
      this.rooms.clear();
      this.epoch = page.epoch;
    }

    const log = this.room(page.roomId);

    if (page.reset || epochChanged) {
      log.entries = page.messages.slice();
      log.hasMore = page.hasMore;
      log.loadingOlder = false;
      return { kind: 'reset' };
    }

    if (page.beforeId !== 0) {
      log.loadingOlder = false;
      // Answers the page before our oldest message; if the log was replaced meanwhile
      // the cursor no longer matches and the page would not be contiguous.
      if (log.firstId !== page.beforeId) return null;
      const older = page.messages.filter(m => m.id < page.beforeId);
      log.entries = older.concat(log.entries);
      log.hasMore = page.hasMore;
      return { kind: 'prepend', entries: older };
    }

    // Catch-up: everything after what we had (live messages may have raced ahead).
    const lastId = log.lastId;
    const newer = page.messages.filter(m => m.id > lastId);
    for (const m of newer) log.entries.push(m);
    return { kind: 'append', entries: newer };
  }

  /** A new server session: any in-flight page request died with the old socket. */
  onSessionReset(): void {
    for (const log of this.rooms.values()) log.loadingOlder = false;
  }
}
